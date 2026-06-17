/**
 * Поп-ап стратегии «Север GPT».
 *
 * Каркас как у «Севера»: загрузка списка экспираций и сбор цепочки опционов
 * идут ТЕМ ЖЕ механизмом (расширение TradingView → localStorage). Отличие —
 * вместо локального математического анализа собранная цепочка + промпт
 * уходят на бэкенд (ChatGPT), который возвращает две готовые комбинации.
 *
 * «Подобрать заново» переиспользует уже собранную цепочку (без повторного
 * обращения к расширению) — платим только за ответ ChatGPT.
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
import { Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import NorthGptParamsForm from './NorthGptParamsForm';
import NorthGptResultsView from './NorthGptResultsView';
import { requestNorthGptCombination } from '../../../services/northGptApi';
import { enrichNorthGptCombination, precomputeChainPLs } from '../../../utils/northGptStrategy/enrich';
import { sendNorthExpandExpirationCommand, sendNorthInitCommand } from '../../../hooks/useExtensionData';

const EXPIRATIONS_KEY = 'tvc_expirations_list';
const FULL_CHAIN_KEY = 'tvc_full_chain';
const POLL_INTERVAL_MS = 600;
const EXPIRATIONS_TIMEOUT_MS = 35_000;
// Ответа расширения на ОДИН разворот экспирации ждём до 20с (внутри расширения
// разворот может занимать ~12–18с). Если не получилось — повторяем команду:
// разворот таблицы TradingView идёт DOM-кликами и бывает флэки, особенно когда
// первая группа уже развёрнута (сбор второй даты в двойном режиме).
const EXPAND_ATTEMPT_MS = 20_000;
const MAX_EXPAND_ATTEMPTS = 3;

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

function NorthGptStrategyDialog({
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
  pointValue,
  marginPerContract,
  initialState,
  onClose,
  onApply,
  onStateChange,
}) {
  // Источник данных опционов зависит от режима калькулятора: крипта → Binance
  // (расширение Options Bridge), иначе → TradingView (Options CP Buttons). От этого
  // зависят маршрутизация команды (market) и тексты, которые видит пользователь.
  // Фьючерсы читаются через TradingView, как акции — отличие чисто в математике.
  const isCrypto = calculatorMode === 'crypto';
  const isFutures = calculatorMode === 'futures';
  const market = isCrypto ? 'crypto' : 'equity';

  // Жёсткая блокировка: у фьючерсов расчёт невозможен без «стоимости пункта» и
  // «маржи за контракт» (раздел Настройки → Фьючерсы). Пока они не заданы для
  // тикера — не пускаем в подбор, чтобы не считать по неверной математике.
  const missingPointValue = isFutures && !(Number(pointValue) > 0);
  const missingMargin = isFutures && !(Number(marginPerContract) > 0);
  const futuresBlocked = isFutures && (missingPointValue || missingMargin);
  const sourceLabel = isCrypto ? 'Binance' : 'TradingView';
  const extLabel = isCrypto ? 'Options Bridge' : 'Options CP Buttons';
  // У крипты нет премаркета/выходных — биржа 24/7, поэтому формулировка иная.
  const noQuotesMessage = isCrypto
    ? 'Binance сейчас не отдаёт котировки Bid/Ask по опционам этой экспирации. Попробуйте другую экспирацию или повторите позже.'
    : 'TradingView сейчас не показывает котировки Bid/Ask по опционам — скорее всего биржа ещё закрыта (премаркет / выходной). Попробуйте после открытия торгов.';

  const [step, setStep] = useState(initialStep);
  const [params, setParams] = useState(initialState?.params || null);
  const [result, setResult] = useState(initialState?.result || null);

  const [availableExpirations, setAvailableExpirations] = useState([]);
  const [expirationsStatus, setExpirationsStatus] = useState('idle');
  const [expirationsMessage, setExpirationsMessage] = useState('');

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeMessage, setAnalyzeMessage] = useState('');
  const expirationsStartedAt = useRef(0);

  // Кэш собранной цепочки и параметров — для «Подобрать заново» без расширения.
  const chainRef = useRef(null);
  const lastParamsRef = useRef(initialState?.params || null);

  useEffect(() => {
    if (!isOpen) return undefined;
    // Фьючерс без настроек: не дёргаем расширение, показываем экран-блокировку.
    if (futuresBlocked) return undefined;

    setStep(initialStep);
    if (initialState?.params) {
      setParams(initialState.params);
      lastParamsRef.current = initialState.params;
    }
    if (initialState?.result) setResult(initialState.result);

    const hasCache = initialState?.result
      && (initialState.result.withAsset || initialState.result.optionsOnly
        || initialState.result.dual || initialState.result.error);
    if (initialStep === 'results' && hasCache) {
      setExpirationsStatus('done');
      return undefined;
    }

    const openedAt = Date.now();
    expirationsStartedAt.current = openedAt;
    setAvailableExpirations([]);
    setExpirationsStatus('loading');
    setExpirationsMessage(`Открываем ${sourceLabel} и считываем список экспираций...`);

    const normalizedTicker = (ticker || '').toUpperCase();
    const tryConsume = () => {
      const data = readExpirationsList();
      if (!data) return false;
      if (!data.timestamp || data.timestamp < openedAt) return false;
      if (normalizedTicker && (data.ticker || '').toUpperCase() && (data.ticker || '').toUpperCase() !== normalizedTicker) {
        return false;
      }
      setAvailableExpirations((data.expirations || []).map((e) => e.date));
      setExpirationsStatus('done');
      setExpirationsMessage('');
      return true;
    };

    sendNorthInitCommand({ ticker, tradingViewUrl, market });

    const interval = setInterval(() => {
      if (tryConsume()) {
        clearInterval(interval);
        return;
      }
      if (Date.now() - expirationsStartedAt.current > EXPIRATIONS_TIMEOUT_MS) {
        clearInterval(interval);
        setExpirationsStatus('error');
        setExpirationsMessage(
          `Не получили список экспираций от ${sourceLabel}. Проверь, что расширение ${extLabel} обновлено и не блокируется браузером.`,
        );
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Базовый контекст ценообразования (общий для обеих дат; expirationDate
  // подставляется отдельно для каждой даты — от него зависит P&L опциона).
  const buildBasePlCtx = (numericParams) => ({
    entry: numericParams.entryPrice ?? entryPrice,
    currentPrice,
    topPrice: numericParams.topPrice,
    bottomPrice: numericParams.bottomPrice,
    calcDate: numericParams.calcDate,
    ivSurface,
    calculatorMode,
    dividendYield,
    stockClassification,
    // Стоимость пункта — для P&L опционов и актива по фьючерсам (у остальных режимов
    // движок её игнорирует).
    pointValue: Number(pointValue) > 0 ? Number(pointValue) : 1,
  });

  // Запрос к ChatGPT по уже собранной (и предрасчитанной) цепочке.
  // chainForModel — плоский массив строк; в двойном режиме содержит обе экспирации,
  // у каждой строки уже проставлены plTop/plBottom под её срок.
  const runGptSelect = async (chainForModel, formParams) => {
    setIsAnalyzing(true);
    setAnalyzeMessage('ChatGPT анализирует цепочку и подбирает комбинацию… это может занять 1–3 минуты.');
    const { prompt, promptId, ...numericParams } = formParams;
    const effectiveEntry = numericParams.entryPrice ?? entryPrice;
    const context = {
      entryPrice: effectiveEntry,
      assetQuantity,
      leverage,
      currentPrice,
      calculatorMode,
      dividendYield,
      ticker,
      // Фьючерсы: множитель опционов = стоимость пункта, залог под актив = маржа за контракт.
      pointValue: Number(pointValue) > 0 ? Number(pointValue) : undefined,
      marginPerContract: Number(marginPerContract) > 0 ? Number(marginPerContract) : undefined,
    };
    const basePlCtx = buildBasePlCtx(numericParams);
    try {
      const data = await requestNorthGptCombination({
        params: numericParams,
        prompt,
        chain: chainForModel,
        context,
        promptId,
      });

      let nextResult;
      if (!data || data.status === 'error') {
        nextResult = { error: (data && data.error) || 'ChatGPT не вернул ответ' };
      } else if (data.dual) {
        // Двойной режим: обогащаем каждую группу своим plCtx (своя экспирация).
        const primaryCtx = { ...basePlCtx, expirationDate: numericParams.expirationDate };
        const altCtx = { ...basePlCtx, expirationDate: numericParams.alternativeExpirationDate };
        nextResult = {
          dual: true,
          primary: {
            expirationDate: data.primary?.expirationDate || numericParams.expirationDate,
            withAsset: enrichNorthGptCombination(data.primary?.withAsset, primaryCtx),
            optionsOnly: enrichNorthGptCombination(data.primary?.optionsOnly, primaryCtx),
          },
          alternative: {
            expirationDate: data.alternative?.expirationDate || numericParams.alternativeExpirationDate,
            withAsset: enrichNorthGptCombination(data.alternative?.withAsset, altCtx),
            optionsOnly: enrichNorthGptCombination(data.alternative?.optionsOnly, altCtx),
          },
          debug: data.debug || null,
        };
      } else {
        const plCtx = { ...basePlCtx, expirationDate: numericParams.expirationDate };
        nextResult = {
          withAsset: enrichNorthGptCombination(data.withAsset, plCtx),
          optionsOnly: enrichNorthGptCombination(data.optionsOnly, plCtx),
          debug: data.debug || null,
        };
      }

      setResult(nextResult);
      setStep('results');
      if (onStateChange) onStateChange({ params: formParams, result: nextResult });
    } catch (err) {
      const nextResult = { error: 'Не удалось связаться с сервером. Попробуйте ещё раз.' };
      setResult(nextResult);
      setStep('results');
      if (onStateChange) onStateChange({ params: formParams, result: nextResult });
    } finally {
      setIsAnalyzing(false);
      setAnalyzeMessage('');
    }
  };

  // Сбор цепочки ОДНОЙ экспирации через расширение. Резолвится массивом строк
  // этой даты (только с котировками ask>0). Если разворот не удался — повторяет
  // команду до MAX_EXPAND_ATTEMPTS раз, затем реджектится понятным сообщением.
  const collectChainForExpiration = (targetIso) => new Promise((resolve, reject) => {
    let attempt = 0;
    let attemptStartedAt = 0;

    const sendExpand = () => {
      attempt += 1;
      attemptStartedAt = Date.now();
      sendNorthExpandExpirationCommand({ expirationDate: targetIso, ticker, tradingViewUrl, market });
    };

    sendExpand();

    const interval = setInterval(() => {
      // Успех: в цепочке есть целевая дата (расширение дампит только ask>0).
      const chain = readFullChain();
      if (chain && chainHasDate(chain, targetIso)) {
        clearInterval(interval);
        resolve(chain.options.filter((o) => o && o.date === targetIso));
        return;
      }

      // Свежий дамп без целевой даты (расширение отработало, но не развернуло
      // её / нет котировок) ИЛИ вышло время попытки → повторяем разворот.
      const raw = readFullChainRaw();
      const freshWithoutTarget = raw && raw.timestamp && raw.timestamp > attemptStartedAt
        && Date.now() - raw.timestamp > 2000
        && !(Array.isArray(raw.options) && raw.options.some((o) => o && o.date === targetIso));
      const attemptTimedOut = Date.now() - attemptStartedAt > EXPAND_ATTEMPT_MS;

      if (freshWithoutTarget || attemptTimedOut) {
        if (attempt < MAX_EXPAND_ATTEMPTS) {
          sendExpand();
          return;
        }
        clearInterval(interval);
        const list = readExpirationsList();
        const hasExpList = !!list && Array.isArray(list.expirations) && list.expirations.length > 0;
        reject(new Error(hasExpList
          ? noQuotesMessage
          : `Не удалось получить опционы для экспирации ${targetIso}.`));
      }
    }, POLL_INTERVAL_MS);
  });

  const handleAnalyze = async (formParams) => {
    setParams(formParams);
    lastParamsRef.current = formParams;
    setIsAnalyzing(true);

    const dual = !!formParams.useDoubleExpiration && !!formParams.alternativeExpirationDate
      && formParams.alternativeExpirationDate !== formParams.expirationDate;
    const basePlCtx = buildBasePlCtx(formParams);

    setAnalyzeMessage(dual
      ? `Разворачиваем 2 экспирации в ${sourceLabel} и читаем цепочки...`
      : `Разворачиваем экспирацию в ${sourceLabel} и читаем цепочку...`);

    const showCollectError = (message) => {
      setIsAnalyzing(false);
      setAnalyzeMessage('');
      setExpirationsStatus('error');
      setExpirationsMessage(message);
    };

    // Цепочки собираем ПОСЛЕДОВАТЕЛЬНО: у расширения один слот команды и одна
    // ячейка tvc_full_chain. Каждую дату предрасчитываем под её срок ДО объединения.
    let combined;
    try {
      const primaryRows = await collectChainForExpiration(formParams.expirationDate);
      combined = precomputeChainPLs(primaryRows, { ...basePlCtx, expirationDate: formParams.expirationDate });
    } catch (err) {
      showCollectError(err?.message || 'Не удалось получить опционы.');
      return;
    }

    if (dual) {
      try {
        const altRows = await collectChainForExpiration(formParams.alternativeExpirationDate);
        combined.push(...precomputeChainPLs(altRows, { ...basePlCtx, expirationDate: formParams.alternativeExpirationDate }));
      } catch (err) {
        // Основная собралась, а альтернативная — нет: сообщаем явно про неё.
        showCollectError(
          `Не удалось получить котировки по альтернативной экспирации ${formParams.alternativeExpirationDate}. `
          + 'Выберите другую альтернативную дату или снимите галочку «Посчитать двойную экспирацию».',
        );
        return;
      }
    }

    chainRef.current = combined;
    runGptSelect(combined, formParams);
  };

  // «Подобрать заново» — на уже собранной цепочке, без расширения.
  const handleRequery = () => {
    const fp = lastParamsRef.current;
    const chainOptions = chainRef.current;
    if (!fp) { setStep('params'); return; }
    if (!chainOptions) { handleAnalyze(fp); return; }
    runGptSelect(chainOptions, fp);
  };

  const handleRetryFetch = () => {
    const openedAt = Date.now();
    expirationsStartedAt.current = openedAt;
    setAvailableExpirations([]);
    setExpirationsStatus('loading');
    setExpirationsMessage('Перечитываем список экспираций...');
    sendNorthInitCommand({ ticker, tradingViewUrl, market });

    const normalizedTicker = (ticker || '').toUpperCase();
    const tryConsume = () => {
      const data = readExpirationsList();
      if (!data) return false;
      if (!data.timestamp || data.timestamp < openedAt) return false;
      if (normalizedTicker && (data.ticker || '').toUpperCase() && (data.ticker || '').toUpperCase() !== normalizedTicker) {
        return false;
      }
      setAvailableExpirations((data.expirations || []).map((e) => e.date));
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
          isCrypto
            ? 'Список экспираций так и не пришёл. Проверь, что расширение Options Bridge установлено и включено.'
            : 'Список экспираций так и не пришёл. Открой в TradingView таблицу опционов нужного тикера.',
        );
      }
    }, POLL_INTERVAL_MS);
  };

  const handleBack = () => setStep('params');

  const handlePick = (combination, kind) => {
    onApply({ combination, kind, params });
  };

  const needsExpirations = step === 'params';
  const showLoader = !futuresBlocked && (isAnalyzing || (needsExpirations && expirationsStatus === 'loading'));
  const showFetchError = !futuresBlocked && needsExpirations && expirationsStatus === 'error';

  const levels = { top: Number(params?.topPrice), bottom: Number(params?.bottomPrice) };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={step === 'results' ? 'sm:max-w-7xl' : 'sm:max-w-3xl'}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" style={{ color: '#a855f7' }} />
            Стратегия СЕВЕР GPT
            <span className="text-sm font-normal text-muted-foreground">
              {step === 'params' ? '· параметры' : '· результаты'}
            </span>
          </DialogTitle>
          <DialogDescription>
            ИИ-подбор через ChatGPT. На экране результатов — две комбинации: «актив + опционы» и «только опционы».
          </DialogDescription>
        </DialogHeader>

        {futuresBlocked && (
          <div className="space-y-3 py-4">
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">
                  {`Не заданы настройки фьючерса${ticker ? ` ${String(ticker).toUpperCase()}` : ''}`}
                </div>
                <div className="text-xs mt-1">
                  Для подбора по фьючерсам нужны точные значения, иначе расчёт P&L и залога
                  будет неверным. Не заполнено:
                  <ul className="list-disc ml-5 mt-1 space-y-0.5">
                    {missingPointValue && <li>Стоимость пункта (множитель контракта)</li>}
                    {missingMargin && <li>Маржа за контракт</li>}
                  </ul>
                </div>
                <div className="text-xs mt-2">
                  Откройте <strong>Настройки → Фьючерсы</strong> и заполните эти поля для тикера,
                  затем вернитесь и запустите подбор заново.
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>Закрыть</Button>
              <Button
                size="sm"
                onClick={() => { window.location.href = '/settings?section=futures'; }}
                className="text-white border-0"
                style={{ background: 'linear-gradient(135deg, #c084fc 0%, #a855f7 50%, #7c3aed 100%)' }}
              >
                Открыть настройки фьючерсов
              </Button>
            </div>
          </div>
        )}

        {showLoader && (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: '#a855f7' }} />
            {isAnalyzing ? (
              <span>{analyzeMessage || 'Подбираем комбинации…'}</span>
            ) : (
              <span>{expirationsMessage || `Ожидаем список экспираций от ${sourceLabel}...`}</span>
            )}
          </div>
        )}

        {showFetchError && (
          <div className="space-y-3 py-4">
            <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">{`Не удалось получить данные из ${sourceLabel}`}</div>
                {expirationsMessage && <div className="text-xs mt-1">{expirationsMessage}</div>}
                <div className="text-xs mt-2 text-red-700">
                  Проверьте, что расширение установлено, включено и обновлено в <code className="text-[11px] bg-red-100 px-1 rounded">chrome://extensions</code>. Блокировщики рекламы или режим инкогнито временно отключите.
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>Закрыть</Button>
              <Button
                size="sm"
                onClick={handleRetryFetch}
                className="text-white border-0"
                style={{ background: 'linear-gradient(135deg, #c084fc 0%, #a855f7 50%, #7c3aed 100%)' }}
              >
                Повторить запрос
              </Button>
            </div>
          </div>
        )}

        {!futuresBlocked && !showLoader && !showFetchError && step === 'params' && (
          <NorthGptParamsForm
            currentPrice={currentPrice}
            entryPrice={entryPrice}
            leverage={leverage}
            calculatorMode={calculatorMode}
            availableExpirations={availableExpirations}
            initialValues={params || undefined}
            onAnalyze={handleAnalyze}
            onCancel={onClose}
          />
        )}

        {!futuresBlocked && !showLoader && !showFetchError && step === 'results' && (
          <NorthGptResultsView
            result={result}
            levels={levels}
            onApply={handlePick}
            onRequery={handleRequery}
            onCancel={onClose}
            onBack={handleBack}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export default NorthGptStrategyDialog;
