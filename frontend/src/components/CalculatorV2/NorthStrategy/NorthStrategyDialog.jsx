/**
 * Поп-ап стратегии СЕВЕР v2-corrected.
 *
 * Управляет тремя экранами (загрузка цепочки → параметры → результаты) и держит
 * кэш результатов между переключениями экранов, чтобы не перезапускать анализ
 * при возврате к выбору.
 *
 * Анализатор за один запуск возвращает СРАЗУ ДВЕ выборки на одной и той же
 * позиции — `withStock` (актив + опционы) и `optionsOnly` (только опционы).
 * Для каждой выборки в диалоге хранится свой набор состояний бегунков
 * (`weights` и `marginCenter`), которые пробрасываются в `ResultsView`.
 */

import React, { useEffect, useRef, useState } from 'react';
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
import { analyzeNorthStrategy } from '../../../utils/northStrategy/analyzer';
import { DEFAULT_WEIGHTS } from '../../../utils/northStrategy/scoring';
import { sendNorthExpandExpirationCommand, sendNorthInitCommand } from '../../../hooks/useExtensionData';

const EXPIRATIONS_KEY = 'tvc_expirations_list';
const FULL_CHAIN_KEY = 'tvc_full_chain';
const POLL_INTERVAL_MS = 600;
const EXPIRATIONS_TIMEOUT_MS = 35_000;
const CHAIN_TIMEOUT_MS = 35_000;

// Диапазон бегунка маржина = ±25 % от введённой базы. Пред-расчёт идёт по этим
// границам — потом бегунок на экране результатов фильтрует подмножество.
const MARGIN_PRECALC_LO_FACTOR = 0.75;
const MARGIN_PRECALC_HI_FACTOR = 1.25;

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

const makeDefaultBucketState = (marginCenter) => ({
  weights: { ...DEFAULT_WEIGHTS },
  marginCenter,
});

function NorthStrategyDialog({
  isOpen,
  initialStep = 'params',
  currentPrice,
  entryPrice,
  assetQuantity,
  leverage,
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
  const [result, setResult] = useState(
    initialState?.result || { withStock: [], optionsOnly: [], levels: { a: null, b: null } },
  );
  const [withStockState, setWithStockState] = useState(
    initialState?.withStockState || makeDefaultBucketState(6000),
  );
  const [optionsOnlyState, setOptionsOnlyState] = useState(
    initialState?.optionsOnlyState || makeDefaultBucketState(6000),
  );

  const [availableExpirations, setAvailableExpirations] = useState([]);
  const [expirationsStatus, setExpirationsStatus] = useState('idle');
  const [expirationsMessage, setExpirationsMessage] = useState('');

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeMessage, setAnalyzeMessage] = useState('');
  const expirationsStartedAt = useRef(0);

  useEffect(() => {
    if (!isOpen) return undefined;

    setStep(initialStep);
    if (initialState?.params) setParams(initialState.params);
    if (initialState?.result) setResult(initialState.result);
    if (initialState?.withStockState) setWithStockState(initialState.withStockState);
    if (initialState?.optionsOnlyState) setOptionsOnlyState(initialState.optionsOnlyState);

    const hasCache = initialState?.result
      && (initialState.result.withStock?.length || initialState.result.optionsOnly?.length);
    if (initialStep === 'results' && hasCache) {
      setExpirationsStatus('done');
      return undefined;
    }

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
          const baseMargin = Number(formParams.margin) || 6000;
          const analysis = analyzeNorthStrategy({
            entry: entryPrice,
            assetQuantity,
            leverage,
            currentPrice,
            topPrice: formParams.topPrice,
            bottomPrice: formParams.bottomPrice,
            expirationDate: targetIso,
            calcDate: formParams.calcDate,
            strikeRangeMin: formParams.strikeRangeMin,
            strikeRangeMax: formParams.strikeRangeMax,
            plTolerance: formParams.plTolerance,
            marginPreCalcMin: baseMargin * MARGIN_PRECALC_LO_FACTOR,
            marginPreCalcMax: baseMargin * MARGIN_PRECALC_HI_FACTOR,
            chain: chain.options,
            ivSurface,
            calculatorMode,
            dividendYield,
            stockClassification,
          });
          setResult(analysis);
          const freshWith = makeDefaultBucketState(baseMargin);
          const freshOnly = makeDefaultBucketState(baseMargin);
          setWithStockState(freshWith);
          setOptionsOnlyState(freshOnly);
          setStep('results');
          if (onStateChange) {
            onStateChange({
              params: formParams,
              result: analysis,
              withStockState: freshWith,
              optionsOnlyState: freshOnly,
            });
          }
        } catch (err) {
          console.error('[NorthStrategy] Ошибка анализа:', err);
          setResult({ withStock: [], optionsOnly: [], levels: { a: null, b: null } });
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

  const handlePick = (combination, kind) => {
    onApply({
      combination,
      kind,
      params,
      result,
      withStockState,
      optionsOnlyState,
    });
  };

  const updateBucket = (kind, next) => {
    if (kind === 'withStock') {
      const merged = { ...withStockState, ...next };
      setWithStockState(merged);
      if (onStateChange) {
        onStateChange({ params, result, withStockState: merged, optionsOnlyState });
      }
    } else {
      const merged = { ...optionsOnlyState, ...next };
      setOptionsOnlyState(merged);
      if (onStateChange) {
        onStateChange({ params, result, withStockState, optionsOnlyState: merged });
      }
    }
  };

  const needsExpirations = step === 'params';
  const showLoader = isAnalyzing || (needsExpirations && expirationsStatus === 'loading');
  const showFetchError = needsExpirations && expirationsStatus === 'error';

  const marginBase = Number(params?.margin) || 6000;
  const marginTolerance = Number(params?.marginTolerance) || 500;
  const marginRangeLo = marginBase * MARGIN_PRECALC_LO_FACTOR;
  const marginRangeHi = marginBase * MARGIN_PRECALC_HI_FACTOR;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={step === 'results' ? 'sm:max-w-7xl' : 'sm:max-w-3xl'}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Snowflake className="h-5 w-5 text-sky-500" />
            Стратегия СЕВЕР
            <span className="text-sm font-normal text-muted-foreground">
              {step === 'params' ? '· параметры' : '· результаты'}
            </span>
          </DialogTitle>
          <DialogDescription>
            Подбор защитной пары Buy Call + Buy Put. На экране результатов — лучшие варианты для двух видов сделки: актив + опционы и только опционы.
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
            leverage={leverage}
            availableExpirations={availableExpirations}
            initialValues={params || undefined}
            onAnalyze={handleAnalyze}
            onCancel={onClose}
          />
        )}

        {!showLoader && !showFetchError && step === 'results' && (
          <ResultsView
            result={result}
            params={params}
            withStockState={withStockState}
            optionsOnlyState={optionsOnlyState}
            marginTolerance={marginTolerance}
            marginRangeLo={marginRangeLo}
            marginRangeHi={marginRangeHi}
            onPick={handlePick}
            onBack={handleBack}
            onCancel={onClose}
            onBucketUpdate={updateBucket}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export default NorthStrategyDialog;
