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
import { sendNorthExpandExpirationCommand, sendNorthInitCommand } from '../../../hooks/useExtensionData';

// Двухстадийный диалог с TradingView:
//  - Стадия 1 (открытие): читаем СПИСОК экспираций из localStorage tvc_expirations_list,
//    куда расширение пишет даты по DTE-бейджам без парсинга строк.
//  - Стадия 2 ("Подобрать"): шлём команду north_expand_expiration — расширение
//    раскрывает нужную группу в таблице TV и дампит полную цепочку строк в
//    tvc_full_chain. Здесь ждём, пока в нём появятся строки выбранной экспирации.
const EXPIRATIONS_KEY = 'tvc_expirations_list';
const FULL_CHAIN_KEY = 'tvc_full_chain';
const EXPIRATIONS_MAX_AGE_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 600;
const EXPIRATIONS_TIMEOUT_MS = 35_000; // открытие таба + дамп
const CHAIN_TIMEOUT_MS = 35_000;       // URL-навигация на series=YYYYMMDD + перезагрузка + дамп

const readExpirationsList = () => {
  try {
    const raw = localStorage.getItem(EXPIRATIONS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.expirations) || parsed.expirations.length === 0) return null;
    return parsed;
  } catch (e) {
    return null;
  }
};

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

/** Возвращает распарсенный tvc_full_chain как есть (с пустым options если такое). */
const readFullChainRaw = () => {
  try {
    const raw = localStorage.getItem(FULL_CHAIN_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
};

const chainHasDate = (chain, isoDate) => {
  if (!chain || !Array.isArray(chain.options)) return false;
  for (const opt of chain.options) {
    if (opt && opt.date === isoDate) return true;
  }
  return false;
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
  ticker,
  tradingViewUrl,
  initialState,
  onClose,
  onApply,
  onStateChange,
}) {
  const [step, setStep] = useState(initialStep);
  const [params, setParams] = useState(initialState?.params || null);
  const [combinations, setCombinations] = useState(initialState?.combinations || []);
  const [weights, setWeights] = useState(initialState?.weights || DEFAULT_WEIGHTS);

  // Стадия 1: список экспираций (быстро, без парсинга строк)
  const [availableExpirations, setAvailableExpirations] = useState([]);
  const [expirationsStatus, setExpirationsStatus] = useState('idle'); // idle | loading | done | error
  const [expirationsMessage, setExpirationsMessage] = useState('');

  // Стадия 2: полная цепочка для выбранной экспирации (после "Подобрать")
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeMessage, setAnalyzeMessage] = useState('');
  const expirationsStartedAt = useRef(0);

  // --- Стадия 1: подгружаем список экспираций при открытии ---
  useEffect(() => {
    if (!isOpen) return undefined;

    setStep(initialStep);
    if (initialState?.params) setParams(initialState.params);
    if (initialState?.combinations) setCombinations(initialState.combinations);
    if (initialState?.weights) setWeights(initialState.weights);

    // Если открывают экран результатов с готовым кэшем — стадия 1 не нужна.
    if (initialStep === 'results' && initialState?.combinations?.length) {
      setExpirationsStatus('done');
      return undefined;
    }

    // ВАЖНО: даже если в localStorage уже лежит tvc_expirations_list — он мог
    // быть от ДРУГОГО тикера или с другими фильтрами. Считаем валидным только
    // если: (а) ticker совпадает с нашим, (б) timestamp свежее момента открытия
    // диалога (то есть пришёл по нашему свежему north_init).
    const openedAt = Date.now();
    expirationsStartedAt.current = openedAt;
    setAvailableExpirations([]);
    setExpirationsStatus('loading');
    setExpirationsMessage('Открываем TradingView и считываем список экспираций...');

    const normalizedTicker = (ticker || '').toUpperCase();
    const tryConsume = () => {
      const data = readExpirationsList();
      if (!data) return false;
      if (!data.timestamp || data.timestamp < openedAt) return false;
      if (normalizedTicker && (data.ticker || '').toUpperCase() && (data.ticker || '').toUpperCase() !== normalizedTicker) {
        return false;
      }
      setAvailableExpirations((data.expirations || []).map(e => e.date));
      setExpirationsStatus('done');
      setExpirationsMessage('');
      return true;
    };

    // Шлём команду расширению: открыть таб TV (если нет), поставить Next 90 days
    // + All strikes, обновить список экспираций.
    sendNorthInitCommand({ ticker, tradingViewUrl });

    const interval = setInterval(() => {
      if (tryConsume()) {
        clearInterval(interval);
        return;
      }
      if (Date.now() - expirationsStartedAt.current > EXPIRATIONS_TIMEOUT_MS) {
        clearInterval(interval);
        setExpirationsStatus('error');
        setExpirationsMessage(
          'Не получили список экспираций от TradingView. Проверь, что расширение Options CP Buttons обновлено до версии 1.6.10+ и не блокируется браузером.',
        );
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // --- Стадия 2: по "Подобрать" разворачиваем экспирацию и ждём цепочку ---
  const handleAnalyze = (formParams) => {
    setParams(formParams);
    setIsAnalyzing(true);
    setAnalyzeMessage('Разворачиваем экспирацию в TradingView и читаем цепочку...');

    const targetIso = formParams.expirationDate;
    sendNorthExpandExpirationCommand({
      expirationDate: targetIso,
      ticker,
      tradingViewUrl,
    });

    const startedAt = Date.now();
    const interval = setInterval(() => {
      // Распознаём премаркет: свежий дамп пришёл (timestamp > startedAt),
      // но в нём нет нашей даты — значит TV видела строки, но Bid/Ask у них
      // нулевые, и парсер их отфильтровал. Ждём ещё 2 секунды на случай
      // следующего дампа, потом показываем ошибку.
      const raw = readFullChainRaw();
      if (raw && raw.timestamp && raw.timestamp > startedAt) {
        const has = Array.isArray(raw.options) && raw.options.some(o => o && o.date === targetIso);
        if (!has && Date.now() - raw.timestamp > 2000) {
          clearInterval(interval);
          setIsAnalyzing(false);
          setAnalyzeMessage('');
          setExpirationsStatus('error');
          setExpirationsMessage(
            'TradingView сейчас не показывает котировки Bid/Ask по опционам — скорее всего биржа ещё закрыта (премаркет / выходной). Попробуйте после открытия торгов.',
          );
          return;
        }
      }

      const chain = readFullChain();
      if (chain && chainHasDate(chain, targetIso)) {
        clearInterval(interval);

        try {
          const result = analyzeNorthStrategy({
            entry: entryPrice,
            assetQuantity,
            currentPrice,
            topPrice: formParams.topPrice,
            bottomPrice: formParams.bottomPrice,
            midAPrice: formParams.midAPrice,
            midBPrice: formParams.midBPrice,
            expirationDate: targetIso,
            calcDate: formParams.calcDate,
            strikeRangeMin: formParams.strikeRangeMin,
            strikeRangeMax: formParams.strikeRangeMax,
            qty: formParams.qty,
            chain: chain.options,
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
          setAnalyzeMessage('');
        }
        return;
      }

      if (Date.now() - startedAt > CHAIN_TIMEOUT_MS) {
        clearInterval(interval);
        setIsAnalyzing(false);
        setAnalyzeMessage('');
        setExpirationsStatus('error');
        // Распознаём премаркет: список экспираций есть, но в цепочке ни одного
        // опциона с валидным ASK — биржа просто не показывает котировки.
        const list = readExpirationsList();
        const chainData = readFullChain();
        const hasExpList = !!list && Array.isArray(list.expirations) && list.expirations.length > 0;
        const hasChain = !!chainData && Array.isArray(chainData.options) && chainData.options.length > 0;
        if (hasExpList && !hasChain) {
          setExpirationsMessage(
            'TradingView сейчас не показывает котировки Bid/Ask по опционам — скорее всего биржа ещё закрыта (премаркет / выходной). Попробуйте после открытия торгов.',
          );
        } else {
          setExpirationsMessage(
            `Не удалось получить опционы для экспирации ${targetIso}.`,
          );
        }
      }
    }, POLL_INTERVAL_MS);
  };

  const handleRetryFetch = () => {
    const openedAt = Date.now();
    expirationsStartedAt.current = openedAt;
    setAvailableExpirations([]);
    setExpirationsStatus('loading');
    setExpirationsMessage('Перечитываем список экспираций...');
    sendNorthInitCommand({ ticker, tradingViewUrl });

    const normalizedTicker = (ticker || '').toUpperCase();
    const tryConsume = () => {
      const data = readExpirationsList();
      if (!data) return false;
      if (!data.timestamp || data.timestamp < openedAt) return false;
      if (normalizedTicker && (data.ticker || '').toUpperCase() && (data.ticker || '').toUpperCase() !== normalizedTicker) {
        return false;
      }
      setAvailableExpirations((data.expirations || []).map(e => e.date));
      setExpirationsStatus('done');
      setExpirationsMessage('');
      return true;
    };

    const interval = setInterval(() => {
      if (tryConsume()) {
        clearInterval(interval);
        return;
      }
      if (Date.now() - expirationsStartedAt.current > EXPIRATIONS_TIMEOUT_MS) {
        clearInterval(interval);
        setExpirationsStatus('error');
        setExpirationsMessage(
          'Список экспираций так и не пришёл. Открой в TradingView таблицу опционов нужного тикера и обнови расширение до 1.6.10+.',
        );
      }
    }, POLL_INTERVAL_MS);
  };

  const handleBack = () => setStep('params');

  const handlePick = (combination) => {
    onApply({ combination, params, combinations, weights });
  };

  // Стадия 1 нужна только на экране параметров. На экране результатов из кэша — не нужна.
  const needsExpirations = step === 'params';
  const showLoader = isAnalyzing || (needsExpirations && expirationsStatus === 'loading');
  const showFetchError = needsExpirations && expirationsStatus === 'error';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={step === 'results' ? 'sm:max-w-6xl' : 'sm:max-w-3xl'}>
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
              <span>{analyzeMessage || 'Подбираем комбинации…'}</span>
            ) : (
              <span>{expirationsMessage || 'Ожидаем список экспираций от TradingView...'}</span>
            )}
          </div>
        )}

        {showFetchError && (
          <div className="space-y-3 py-4">
            <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">Не удалось получить данные из TradingView</div>
                {expirationsMessage && (
                  <div className="text-xs mt-1">{expirationsMessage}</div>
                )}
                <div className="text-xs mt-2 text-red-700">
                  Проверьте, что расширение установлено, включено и обновлено до последней версии в <code className="text-[11px] bg-red-100 px-1 rounded">chrome://extensions</code>. Если рядом стоят блокировщики рекламы (uBlock, AdGuard) или используется режим инкогнито — временно отключите их и попробуйте снова.
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
            params={params}
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
