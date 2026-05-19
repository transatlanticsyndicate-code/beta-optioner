/**
 * Основной поп-ап стратегии СЕВЕР.
 * Управляет тремя экранами (загрузка цепочки → параметры → результаты) и держит
 * кэш результатов между переключениями экранов, чтобы не перезапускать анализ
 * при возврате к выбору.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Snowflake, Loader2, AlertTriangle } from 'lucide-react';
import ParamsForm from './ParamsForm';
import ResultsView from './ResultsView';
import { analyzeNorthStrategy, findClosestExpiration } from '../../../utils/northStrategy/analyzer';
import { DEFAULT_WEIGHTS } from '../../../utils/northStrategy/scoring';
// Цепочка опционов лежит в localStorage tvc_full_chain — расширение TradingView
// дампит её туда каждый раз, когда инжектит кнопки в таблицу опционов (то есть
// при появлении/обновлении строк). Bridge на странице калькулятора каждые ~2 сек
// синкает её из chrome.storage в localStorage. См. EXTENTIONS/OptionsCPbuttons/src/parser.js
// (функция dumpFullChain) и EXTENTIONS/OptionsCPbuttons/optioner.js (syncFullChain).
const FULL_CHAIN_KEY = 'tvc_full_chain';
const FULL_CHAIN_MAX_AGE_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 800;
const WAIT_TIMEOUT_MS = 15_000;

const readFullChain = () => {
  try {
    const raw = localStorage.getItem(FULL_CHAIN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.options) || parsed.options.length === 0) return null;
    return parsed;
  } catch (e) {
    return null;
  }
};

function NorthStrategyDialog({
  isOpen,
  initialStep = 'params',
  currentPrice,
  entryPrice,
  assetQuantity,
  ivSurface,
  calculatorMode,
  dividendYield,
  stockClassification,
  initialState,
  onClose,
  onApply,
  onStateChange,
}) {
  const [step, setStep] = useState(initialStep);
  const [params, setParams] = useState(initialState?.params || null);
  const [combinations, setCombinations] = useState(initialState?.combinations || []);
  const [weights, setWeights] = useState(initialState?.weights || DEFAULT_WEIGHTS);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Цепочка опционов читается из localStorage 'tvc_full_chain', куда её дампит
  // расширение TradingView. Мы не отправляем никаких команд — просто читаем
  // готовую цепочку и при необходимости коротко ждём, пока расширение её обновит.
  const [fetchedChain, setFetchedChain] = useState([]);
  const [fetchStatus, setFetchStatus] = useState('idle'); // idle | loading | done | error
  const [fetchMessage, setFetchMessage] = useState('');
  const fetchStartedAt = useRef(0);

  useEffect(() => {
    if (!isOpen) return undefined;

    setStep(initialStep);
    if (initialState?.params) setParams(initialState.params);
    if (initialState?.combinations) setCombinations(initialState.combinations);
    if (initialState?.weights) setWeights(initialState.weights);

    // Если открывают экран результатов с готовым кэшем — цепочка не нужна.
    if (initialStep === 'results' && initialState?.combinations?.length) {
      setFetchStatus('done');
      return undefined;
    }

    const tryConsume = () => {
      const data = readFullChain();
      if (!data) return false;
      const age = Date.now() - (data.timestamp || 0);
      if (age > FULL_CHAIN_MAX_AGE_MS) {
        // Слишком старая — ждём свежий дамп
        return false;
      }
      setFetchedChain(data.options);
      setFetchStatus('done');
      setFetchMessage('');
      return true;
    };

    // Шанс 1: уже есть свежий дамп — берём сразу
    if (tryConsume()) return undefined;

    // Шанс 2: ждём, пока bridge (раз в 2 сек) подтянет данные из chrome.storage
    setFetchStatus('loading');
    setFetchMessage('Ожидаем цепочку опционов от TradingView...');
    setFetchedChain([]);
    fetchStartedAt.current = Date.now();

    const interval = setInterval(() => {
      if (tryConsume()) {
        clearInterval(interval);
        return;
      }
      if (Date.now() - fetchStartedAt.current > WAIT_TIMEOUT_MS) {
        clearInterval(interval);
        setFetchStatus('error');
        setFetchMessage(
          'Цепочка опционов не пришла из TradingView. Открой в браузере страницу с таблицей опционов нужного тикера (ссылка есть на тикере в шапке калькулятора) и убедись, что расширение Options CP Buttons включено и обновлено до версии 1.6.7+.',
        );
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Список доступных экспираций — строго из того, что расширение прислало
  const availableExpirations = useMemo(() => {
    const set = new Set();
    for (const opt of fetchedChain) {
      if (opt && opt.date) set.add(opt.date);
    }
    return Array.from(set).sort();
  }, [fetchedChain]);

  const handleAnalyze = (formParams) => {
    setIsAnalyzing(true);
    setParams(formParams);
    setTimeout(() => {
      try {
        const expiration = findClosestExpiration(fetchedChain, formParams.expirationDate) || formParams.expirationDate;
        const result = analyzeNorthStrategy({
          entry: entryPrice,
          assetQuantity,
          currentPrice,
          topPrice: formParams.topPrice,
          bottomPrice: formParams.bottomPrice,
          midAPrice: formParams.midAPrice,
          midBPrice: formParams.midBPrice,
          expirationDate: expiration,
          calcDate: formParams.calcDate,
          strikeRangeMin: formParams.strikeRangeMin,
          strikeRangeMax: formParams.strikeRangeMax,
          qty: formParams.qty,
          chain: fetchedChain,
          ivSurface,
          calculatorMode,
          dividendYield,
          stockClassification,
        });
        setCombinations(result);
        setStep('results');
        if (onStateChange) {
          onStateChange({ params: formParams, combinations: result, weights });
        }
      } catch (err) {
        console.error('[NorthStrategy] Ошибка анализа:', err);
        setCombinations([]);
        setStep('results');
      } finally {
        setIsAnalyzing(false);
      }
    }, 50);
  };

  const handleRetryFetch = () => {
    setFetchStatus('loading');
    setFetchMessage('Перечитываем цепочку...');
    setFetchedChain([]);
    fetchStartedAt.current = Date.now();

    const data = readFullChain();
    if (data && Date.now() - (data.timestamp || 0) <= FULL_CHAIN_MAX_AGE_MS) {
      setFetchedChain(data.options);
      setFetchStatus('done');
      setFetchMessage('');
      return;
    }

    // Те же 15 секунд ожидания, что и при первом открытии
    const interval = setInterval(() => {
      const d = readFullChain();
      if (d && Date.now() - (d.timestamp || 0) <= FULL_CHAIN_MAX_AGE_MS) {
        clearInterval(interval);
        setFetchedChain(d.options);
        setFetchStatus('done');
        setFetchMessage('');
        return;
      }
      if (Date.now() - fetchStartedAt.current > WAIT_TIMEOUT_MS) {
        clearInterval(interval);
        setFetchStatus('error');
        setFetchMessage(
          'Цепочка опционов не пришла из TradingView. Открой страницу с таблицей опционов и обнови расширение Options CP Buttons до версии 1.6.7+.',
        );
      }
    }, POLL_INTERVAL_MS);
  };

  const handleBack = () => setStep('params');

  const handlePick = (combination) => {
    onApply({ combination, params, combinations, weights });
  };

  // Когда экран — params, требуется загруженная цепочка. На экране результатов
  // (повторное открытие) она уже есть в кэше комбинаций — fetch не блокирует.
  const needsChain = step === 'params';
  const showLoader = isAnalyzing || (needsChain && fetchStatus === 'loading');
  const showFetchError = needsChain && fetchStatus === 'error';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Snowflake className="h-5 w-5 text-sky-500" />
            Стратегия СЕВЕР
            <span className="text-sm font-normal text-muted-foreground">
              {step === 'params' ? '· параметры' : '· результаты'}
            </span>
          </DialogTitle>
          <DialogDescription>
            Подбор защитной пары Buy Call + Buy Put к лонг-позиции по базовому активу.
          </DialogDescription>
        </DialogHeader>

        {showLoader && (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            {isAnalyzing ? (
              <span>Подбираем комбинации…</span>
            ) : (
              <span>{fetchMessage || 'Ожидаем цепочку опционов от TradingView...'}</span>
            )}
          </div>
        )}

        {showFetchError && (
          <div className="space-y-3 py-4">
            <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">Не удалось получить данные из TradingView</div>
                <div className="text-xs mt-1">{fetchMessage}</div>
                <div className="text-xs mt-2 text-red-700">
                  Проверь, что: расширение установлено и подключено, вкладка с опционами тикера открыта в TradingView, и попробуй ещё раз.
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>Закрыть</Button>
              <Button
                size="sm"
                onClick={handleRetryFetch}
                className="text-white border-0"
                style={{ background: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 50%, #0369a1 100%)' }}
              >
                Повторить запрос
              </Button>
            </div>
          </div>
        )}

        {!showLoader && !showFetchError && step === 'params' && (
          <ParamsForm
            currentPrice={currentPrice}
            entryPrice={entryPrice}
            availableExpirations={availableExpirations}
            initialValues={params || undefined}
            onAnalyze={handleAnalyze}
            onCancel={onClose}
          />
        )}

        {!showLoader && !showFetchError && step === 'results' && (
          <ResultsView
            combinations={combinations}
            initialWeights={weights}
            onPick={handlePick}
            onBack={handleBack}
            onCancel={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export default NorthStrategyDialog;
