/**
 * Background Module: Binance Pending Position Auto-Refresh
 * ЗАЧЕМ: Симметричный пендант OptionsCPbuttons/background/pendingRefresh.js
 * для опционов Binance. Поток pending — без диалога подтверждения,
 * сразу при открытии сохранённой сделки со статусом 'pending'.
 *
 * Ключевое отличие от TV: данные берём напрямую из eapi.binance.com
 * (mark + ticker + index), без открытия фоновой вкладки и без DOM-скрейпа.
 *
 * Зависит от: refreshShared.js (Binance API + калькулятор-сайдовые помощники),
 *             refreshHelpers.js (delay).
 */

// TTL ~3 сек — защита от дублей между тиками alarm в моменте,
// пока запущен поток refresh. Запись удаляется в finally.
const _processedPendingIds = new Map();
const PENDING_TTL_MS = 3000;

// Per-tab мьютекс — на разных вкладках калькулятора потоки независимы.
const _pendingInProgress = new Map();

function _cleanupPendingIds() {
  const now = Date.now();
  for (const [key, ts] of _processedPendingIds) {
    if (now - ts > PENDING_TTL_MS) _processedPendingIds.delete(key);
  }
}

/**
 * Триггер pending — два ключа в localStorage калькулятора.
 */
async function readPendingTrigger(calcTabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: calcTabId },
      func: () => ({
        configId: localStorage.getItem('universalCalc_loadedConfigId'),
        status:   localStorage.getItem('universalCalc_loadedConfigStatus')
      })
    });
    return results?.[0]?.result || { configId: null, status: null };
  } catch (e) {
    return { configId: null, status: null };
  }
}

/**
 * Построить comparisonOptions: сопоставить опционы калькулятора со свежими
 * данными от Binance API (mark + ticker).
 * ЗАЧЕМ: Калькулятор принимает массив с oldIV/newIV/bid/ask/volume/греками
 * и сам решает, что применять согласно loadedConfigStatus.
 */
function _buildComparisonOptions(calcOptions, markByKey, tickerByKey) {
  return calcOptions.map(calcOpt => {
    const key = `${calcOpt.type}|${calcOpt.date}|${calcOpt.strike}`;
    const mark = markByKey[key];
    const tick = tickerByKey[key];

    // IV: Binance отдаёт markIV как долю (0.6 = 60%), калькулятор ждёт проценты.
    let newIV = null;
    if (mark && mark.markIV != null) {
      const iv = parseFloat(mark.markIV);
      if (!isNaN(iv) && iv > 0) newIV = iv * 100;
    }

    const numOrNull = (v) => {
      if (v == null) return null;
      const n = parseFloat(v);
      return isNaN(n) ? null : n;
    };

    return {
      id: calcOpt.id,
      type: calcOpt.type,
      strike: calcOpt.strike,
      date: calcOpt.date,
      oldIV: calcOpt.manualIvOverride || calcOpt.impliedVolatility || null,
      newIV,
      delta:  mark ? numOrNull(mark.delta)  : null,
      gamma:  mark ? numOrNull(mark.gamma)  : null,
      theta:  mark ? numOrNull(mark.theta)  : null,
      vega:   mark ? numOrNull(mark.vega)   : null,
      bid:    tick ? numOrNull(tick.bidPrice) : null,
      ask:    tick ? numOrNull(tick.askPrice) : null,
      // ticker.volume — суточный объём в контрактах; формат совпадает с тем, что
      // показывает Binance в таблице eoptions и что писал DOM-парсер расширения.
      volume: tick ? numOrNull(tick.volume)   : null,
      newIVText: newIV != null ? newIV.toFixed(2) : null
    };
  });
}

/**
 * Главная функция pending-обновления для Binance.
 *
 * @param {number} calcTabId
 * @param {object} configData — { ticker, options: [...], currentPrice }
 * @param {string} dbConfigId
 */
async function executePendingRefresh(calcTabId, configData, dbConfigId) {
  if (_pendingInProgress.get(calcTabId)) {
    console.log(`[Binance Pending] Refresh уже выполняется для вкладки ${calcTabId}, пропускаем`);
    return;
  }
  _pendingInProgress.set(calcTabId, true);

  try {
    const underlying = _resolveBinanceUnderlying(configData.ticker);
    if (!underlying) {
      console.log('[Binance Pending] Тикер не Binance, пропускаем:', configData.ticker);
      return;
    }

    console.log('[Binance Pending] Запуск автообновления pending:', underlying,
      configData.options.length, 'опц.');

    await writeStatusToCalculator(calcTabId, 'collecting', 5,
      `Запрос данных Binance (${underlying})...`);
    showBinanceToast(calcTabId, 'loading', `Обновление с Binance (${underlying})...`);

    // Тянем три API параллельно — это в разы быстрее, чем последовательно
    const [markArr, tickerArr, indexPrice] = await Promise.all([
      fetchBinanceMark(underlying),
      fetchBinanceTicker(underlying),
      fetchBinanceIndexPrice(underlying)
    ]);

    if (!markArr.length) {
      await writeStatusToCalculator(calcTabId, 'error', 0,
        'Не удалось получить котировки с Binance');
      showBinanceToast(calcTabId, 'error',
        'Не удалось получить котировки с Binance', { autoDismissMs: 5000 });
      return;
    }

    await writeStatusToCalculator(calcTabId, 'collecting', 60,
      `Получено ${markArr.length} опционов от Binance, сопоставляем...`);

    // Индексы по ключу type|date|strike — для быстрого поиска
    const markByKey = {};
    for (const m of markArr) {
      const p = parseBinanceSymbol(m.symbol);
      if (!p) continue;
      markByKey[`${p.type}|${p.dateISO}|${p.strike}`] = m;
    }
    const tickerByKey = {};
    for (const t of tickerArr) {
      const p = parseBinanceSymbol(t.symbol);
      if (!p) continue;
      tickerByKey[`${p.type}|${p.dateISO}|${p.strike}`] = t;
    }

    const comparisonOptions = _buildComparisonOptions(configData.options, markByKey, tickerByKey);
    const found = comparisonOptions.filter(o => o.newIV != null).length;
    const total = configData.options.length;

    if (found === 0) {
      await writeStatusToCalculator(calcTabId, 'error', 0,
        'Опционы не найдены в данных Binance (проверьте дату экспирации и страйк)');
      showBinanceToast(calcTabId, 'error',
        'Опционы не найдены в данных Binance', { autoDismissMs: 5000 });
      return;
    }

    await writeStatusToCalculator(calcTabId, 'collecting', 95,
      'Передача данных в калькулятор...');

    await sendPrIVToCalc(calcTabId, {
      ticker: configData.ticker,
      boardUrl: buildBinanceBoardUrl(configData.ticker),
      currentPrice: indexPrice,
      options: comparisonOptions,
      dbConfigId
    });

    const priceText = indexPrice != null ? ` · цена БА $${indexPrice.toFixed(2)}` : '';
    if (found < total) {
      await writeStatusToCalculator(calcTabId, 'warning', 100,
        `Обновлено ${found} из ${total} — для остальных нет данных в API Binance`);
      showBinanceToast(calcTabId, 'warning',
        `Обновлено ${found} из ${total} опц.${priceText}`, { autoDismissMs: 5000 });
    } else {
      await writeStatusToCalculator(calcTabId, 'complete', 100, '');
      showBinanceToast(calcTabId, 'success',
        `Обновлено ${found} опц.${priceText}`, { autoDismissMs: 4000 });
    }

    console.log(`[Binance Pending] Завершено: ${found}/${total} опц., цена=${indexPrice}`);

  } catch (e) {
    console.error('[Binance Pending] Ошибка автообновления:', e);
    try {
      await writeStatusToCalculator(calcTabId, 'error', 0,
        'Ошибка обновления котировок с Binance: ' + (e.message || ''));
      showBinanceToast(calcTabId, 'error',
        'Ошибка обновления с Binance: ' + (e.message || ''), { autoDismissMs: 5000 });
    } catch (_) {}
  } finally {
    _pendingInProgress.delete(calcTabId);
    if (dbConfigId) _processedPendingIds.delete(dbConfigId);
  }
}

/**
 * Точка входа из calcTabRouter (alarm + tabs.onUpdated).
 */
async function checkPendingRefreshCommands(calcTabId) {
  try {
    _cleanupPendingIds();

    const tab = await chrome.tabs.get(calcTabId).catch(() => null);
    if (!tab) return;

    const { configId, status } = await readPendingTrigger(calcTabId);
    if (status !== 'pending' || !configId) return;

    if (_processedPendingIds.has(configId)) {
      return;
    }
    _processedPendingIds.set(configId, Date.now());

    const configData = await readCalcOptionsFromReact(calcTabId);
    if (!configData || !configData.options?.length || !configData.ticker) {
      _processedPendingIds.delete(configId);
      return;
    }

    // Шаг 1: фильтр по тикеру — если не Binance, тихо выходим (за пользователя
    // отвечает другое расширение).
    if (!isBinanceUnderlying(configData.ticker)) {
      _processedPendingIds.delete(configId);
      return;
    }

    console.log('[Binance Pending] Обнаружен pending-конфиг:', configId, configData.ticker);

    // Не await — мьютекс внутри executePendingRefresh защитит от параллели
    executePendingRefresh(calcTabId, configData, configId);

  } catch (e) {
    console.error('[Binance Pending] Ошибка проверки pending-триггера:', e);
  }
}

console.log('[Binance Bridge] pendingRefresh.js загружен');
