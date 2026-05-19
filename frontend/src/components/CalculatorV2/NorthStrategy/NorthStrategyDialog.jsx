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
import {
  sendRefreshRangeCommand,
  readExtensionResult,
  clearExtensionResult,
} from '../../../hooks/useExtensionData';

// Параметры запроса к расширению — сколько дней и % страйков парсить.
// Берём с запасом, чтобы пользователь мог менять цели/диапазон без повторных запросов.
const FETCH_DAYS_FROM = 20;
const FETCH_DAYS_TO = 120;
const FETCH_STRIKE_FROM_PCT = -30;
const FETCH_STRIKE_TO_PCT = 30;
const FETCH_TIMEOUT_MS = 60_000;

/**
 * Читает rangeOptions из localStorage расширения.
 */
const readRangeChain = () => {
  try {
    const raw = localStorage.getItem('calculatorState');
    if (!raw) return [];
    const state = JSON.parse(raw);
    const list = state.rangeOptions || [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
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

  // Цепочка опционов, полученная от расширения (refresh_range)
  const [fetchedChain, setFetchedChain] = useState([]);
  const [fetchStatus, setFetchStatus] = useState('idle'); // idle | loading | done | error
  const [fetchProgress, setFetchProgress] = useState(0);
  const [fetchMessage, setFetchMessage] = useState('');
  const fetchStartedAt = useRef(0);

  // Сброс при открытии: запрашиваем свежую цепочку у расширения
  useEffect(() => {
    if (!isOpen) return undefined;

    setStep(initialStep);
    if (initialState?.params) setParams(initialState.params);
    if (initialState?.combinations) setCombinations(initialState.combinations);
    if (initialState?.weights) setWeights(initialState.weights);

    // Если у нас уже есть закэшированные результаты и пользователь открывает
    // экран результатов — цепочку запрашивать не надо.
    if (initialStep === 'results' && initialState?.combinations?.length) {
      setFetchStatus('done');
      return undefined;
    }

    // Триггерим парсинг расширением: TradingView получает команду через
    // localStorage 'tvc_refresh_command', extension парсит выбранные экспирации
    // и пишет результат в calculatorState.rangeOptions + tvc_refresh_result.
    setFetchStatus('loading');
    setFetchProgress(0);
    setFetchMessage('Запрашиваем цепочку у TradingView...');
    setFetchedChain([]);
    clearExtensionResult();
    fetchStartedAt.current = Date.now();
    sendRefreshRangeCommand(FETCH_DAYS_FROM, FETCH_DAYS_TO, FETCH_STRIKE_FROM_PCT, FETCH_STRIKE_TO_PCT);

    const interval = setInterval(() => {
      const result = readExtensionResult();
      if (result) {
        if (result.status === 'collecting') {
          setFetchProgress(result.progress || 0);
          setFetchMessage(result.message || `Сбор данных... ${result.progress || 0}%`);
        } else if (result.status === 'complete') {
          clearInterval(interval);
          const chain = readRangeChain();
          setFetchedChain(chain);
          setFetchStatus('done');
          setFetchMessage('');
        } else if (result.status === 'error' || result.status === 'warning') {
          clearInterval(interval);
          setFetchStatus('error');
          setFetchMessage(result.message || 'Не удалось получить данные от расширения');
        }
      }
      // Таймаут — на случай, если расширение не отвечает (TV закрыт, нет связи)
      if (Date.now() - fetchStartedAt.current > FETCH_TIMEOUT_MS && fetchStatus !== 'done') {
        clearInterval(interval);
        setFetchStatus('error');
        setFetchMessage('Таймаут ожидания ответа от расширения TradingView. Проверь, что страница с опционами открыта.');
      }
    }, 500);

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
    setFetchProgress(0);
    setFetchMessage('Повторно запрашиваем цепочку...');
    setFetchedChain([]);
    clearExtensionResult();
    fetchStartedAt.current = Date.now();
    sendRefreshRangeCommand(FETCH_DAYS_FROM, FETCH_DAYS_TO, FETCH_STRIKE_FROM_PCT, FETCH_STRIKE_TO_PCT);
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
              <>
                <span>{fetchMessage || 'Запрашиваем цепочку у TradingView...'}</span>
                {fetchProgress > 0 && (
                  <span className="text-xs">Прогресс: {fetchProgress}%</span>
                )}
              </>
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
