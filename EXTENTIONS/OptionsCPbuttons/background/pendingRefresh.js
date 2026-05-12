/**
 * Background Module: Pending Position Auto-Refresh
 * ЗАЧЕМ: Автоматическое обновление котировок (bid/ask/volume/IV) для позиций
 * со статусом «В ожидании» — без диалога подтверждения, сразу при открытии позиции.
 * Поток отделён от dbConfigRefresh (стандартный поток) — разные мьютексы и триггеры.
 * Парсер строки TV вынесен в pendingParser.js.
 *
 * Источник: handoff_calc_team_refresh / extension_source / background / pendingRefresh.js.
 * Адаптации: helpers (delay, waitForPageLoad, ensureContentScriptLoaded) подгружаются из
 * refreshHelpers.js; функции sendPrIVToCalc / writeStatusToCalculator / readCalcOptionsFromReact /
 * buildTvOptionsUrl / waitForTvOptionsTable — из dbConfigRefresh.js (общий SW-scope).
 */

// Map с TTL ~3 сек — защита от дублей между тиками alarm в моменте,
// пока запущен поток refresh. Ключ удаляется в finally — повторное открытие
// той же позиции сразу после завершения снова запускает свежий запрос.
const _processedPendingIds = new Map();
const PENDING_TTL_MS = 3000;

// Per-tab мьютекс — открытие pending-позиций на разных вкладках калькулятора
// одновременно не должно блокироваться (регрессия из FixPriceLeaking коллег).
const _pendingInProgress = new Map();

function _cleanupPendingIds() {
  const now = Date.now();
  for (const [key, ts] of _processedPendingIds) {
    if (now - ts > PENDING_TTL_MS) _processedPendingIds.delete(key);
  }
}

/**
 * Триггер pending — пара ключей в localStorage калькулятора.
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
 * Скролл к секции экспирации на TV.
 * ЗАЧЕМ: TV виртуализирует строки — без скролла нужные данные не попадают в DOM.
 */
async function _scrollToPendingSection(tvTabId, optDate) {
  await chrome.scripting.executeScript({
    target: { tabId: tvTabId },
    func: (optDate) => {
      const months = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
      const dc = optDate.replace(/-/g, '');
      const prefix = months[parseInt(dc.substring(4, 6), 10) - 1] + ' ' + parseInt(dc.substring(6, 8), 10);
      for (const tr of document.querySelectorAll('tr')) {
        const gc = tr.querySelector('[class*="groupCell"]');
        if (gc && gc.textContent?.trim().startsWith(prefix)) {
          tr.scrollIntoView({ block: 'start', behavior: 'instant' });
          break;
        }
      }
    },
    args: [optDate]
  }).catch(() => {});
}

/**
 * Underlying price — пробуем через sendMessage в content-script TV (если есть),
 * затем fallback через executeScript по DOM.
 */
async function _readUnderlyingPrice(tvTabId) {
  let price = null;
  for (let attempt = 0; attempt < 3 && !price; attempt++) {
    if (attempt > 0) await delay(1000);
    try {
      const pr = await chrome.tabs.sendMessage(tvTabId, { action: 'getUnderlyingPrice' }).catch(() => null);
      if (pr?.price) { price = pr.price; break; }
    } catch (_) {}
    const fb = await chrome.scripting.executeScript({
      target: { tabId: tvTabId },
      func: () => {
        const wraps = document.querySelectorAll('[class*="priceWrap"]');
        for (const el of wraps) {
          if (el.closest('[class*="widgetbar"]')) continue;
          const p = parseFloat(el.textContent.replace(/[^0-9.]/g, ''));
          if (p > 0) return p;
        }
        return null;
      }
    }).catch(() => []);
    price = fb?.[0]?.result || null;
  }
  return price;
}

/**
 * Главная функция pending-обновления.
 *
 * @param {number} calcTabId
 * @param {object} configData — { ticker, options: [...], currentPrice }
 * @param {string} dbConfigId
 */
async function executePendingRefresh(calcTabId, configData, dbConfigId) {
  if (_pendingInProgress.get(calcTabId)) {
    console.log(`[TVC Pending] Refresh уже выполняется для вкладки ${calcTabId}, пропускаем`);
    return;
  }
  _pendingInProgress.set(calcTabId, true);

  try {
    console.log('[TVC Pending] Запуск автообновления pending:', configData.ticker,
      configData.options.length, 'опц.');

    const tvUrl = buildTvOptionsUrl(configData.ticker, configData.options);
    if (!tvUrl) {
      await writeStatusToCalculator(calcTabId, 'error', 0,
        'Не удалось обновить котировки с TradingView');
      return;
    }

    await writeStatusToCalculator(calcTabId, 'collecting', 0, 'Открытие TradingView...');

    // Открываем или навигируем вкладку TV
    let tvTabs = await chrome.tabs.query({ url: '*://*.tradingview.com/options/*' });
    if (tvTabs.length === 0) {
      console.log('[TVC Pending] Открываем TradingView:', tvUrl);
      const newTab = await chrome.tabs.create({ url: tvUrl, active: false });
      await waitForPageLoad(newTab.id, 30000);
    } else {
      const existingUrl = tvTabs[0].url || '';
      if (existingUrl !== tvUrl) {
        console.log('[TVC Pending] Навигируем TV на URL:', tvUrl);
        await chrome.tabs.update(tvTabs[0].id, { url: tvUrl, active: false });
        await waitForPageLoad(tvTabs[0].id, 30000);
      }
    }

    tvTabs = await chrome.tabs.query({ url: '*://*.tradingview.com/options/*' });
    if (tvTabs.length === 0) {
      await writeStatusToCalculator(calcTabId, 'error', 0,
        'Не удалось обновить котировки с TradingView');
      return;
    }

    const tvTabId = tvTabs[0].id;

    await writeStatusToCalculator(calcTabId, 'collecting', 5, 'Ожидание загрузки TradingView...');

    const tableReady = await waitForTvOptionsTable(tvTabId, 30000);
    if (!tableReady) {
      await writeStatusToCalculator(calcTabId, 'error', 0,
        'Не удалось обновить котировки с TradingView');
      return;
    }

    await ensureContentScriptLoaded(tvTabId);

    await writeStatusToCalculator(calcTabId, 'collecting', 10,
      `Обновление ${configData.options.length} опционов из TradingView...`);

    const underlyingPrice = await _readUnderlyingPrice(tvTabId);

    // Парсим по каждому опциону через pendingParser.js
    const tvOptions = [];
    const totalOpts = configData.options.length;
    for (let i = 0; i < totalOpts; i++) {
      const opt = configData.options[i];
      await _scrollToPendingSection(tvTabId, opt.date);
      await delay(1500);

      const parseResult = await chrome.scripting.executeScript({
        target: { tabId: tvTabId },
        // parseTvOptionRow подгружен из pendingParser.js (общий SW-scope)
        func: parseTvOptionRow,
        args: [opt.date, opt.strike, opt.type]
      }).catch(() => []);

      const parsed = parseResult?.[0]?.result;
      if (parsed) {
        tvOptions.push({ ...parsed, type: opt.type });
        console.log('[TVC Pending] Parsed:', opt.date, opt.strike,
          'IV:', parsed.iv, 'bid:', parsed.bid, 'ask:', parsed.ask, 'vol:', parsed.volume);
      }

      const progress = 10 + Math.round(((i + 1) / totalOpts) * 80);
      await writeStatusToCalculator(calcTabId, 'collecting', progress,
        `Сбор данных: ${i + 1} из ${totalOpts}...`);
    }

    // Формируем comparisonOptions — передаём в калькулятор через sendPrIV_tocallc.
    // Греки/bid/ask/volume — числа или null; калькулятор сам решает, что применять
    // согласно loadedConfigStatus (pending vs standard).
    const comparisonOptions = configData.options.map(calcOpt => {
      const tvOpt = tvOptions.find(tv =>
        tv.type === calcOpt.type &&
        Math.abs(tv.strike - calcOpt.strike) < 1 &&
        tv.expirationISO === calcOpt.date
      );
      return {
        id: calcOpt.id,
        type: calcOpt.type,
        strike: calcOpt.strike,
        date: calcOpt.date,
        oldIV: calcOpt.manualIvOverride || calcOpt.impliedVolatility || null,
        newIV:  tvOpt?.iv  || null,
        delta:  (tvOpt && typeof tvOpt.delta  === 'number') ? tvOpt.delta  : null,
        gamma:  (tvOpt && typeof tvOpt.gamma  === 'number') ? tvOpt.gamma  : null,
        theta:  (tvOpt && typeof tvOpt.theta  === 'number') ? tvOpt.theta  : null,
        vega:   (tvOpt && typeof tvOpt.vega   === 'number') ? tvOpt.vega   : null,
        bid:    (tvOpt && typeof tvOpt.bid    === 'number') ? tvOpt.bid    : null,
        ask:    (tvOpt && typeof tvOpt.ask    === 'number') ? tvOpt.ask    : null,
        volume: (tvOpt && typeof tvOpt.volume === 'number') ? tvOpt.volume : null,
        newIVText: tvOpt?.ivText || null
      };
    });

    const found = tvOptions.length;
    const total = configData.options.length;

    if (found === 0) {
      await writeStatusToCalculator(calcTabId, 'error', 0,
        'Не удалось обновить котировки с TradingView');
      return;
    }

    await writeStatusToCalculator(calcTabId, 'collecting', 95,
      'Передача данных в калькулятор...');

    await sendPrIVToCalc(calcTabId, {
      ticker: configData.ticker,
      boardUrl: tvUrl,
      currentPrice: underlyingPrice,
      options: comparisonOptions,
      dbConfigId
    });

    // Оверлей сравнения «было/стало» на TV — у нас нет content-script с обработчиком
    // showComparisonOverlay, поэтому вызов пропускаем (для pending он не критичен —
    // пользователь и так видит изменения в самом калькуляторе).

    if (found < total) {
      await writeStatusToCalculator(calcTabId, 'warning', 100,
        'Не все котировки удалось обновить');
    } else {
      await writeStatusToCalculator(calcTabId, 'complete', 100, '');
    }

    console.log(`[TVC Pending] Завершено: ${found}/${total} опционов`);

  } catch (e) {
    console.error('[TVC Pending] Ошибка автообновления:', e);
    try {
      await writeStatusToCalculator(calcTabId, 'error', 0,
        'Не удалось обновить котировки с TradingView');
    } catch (_) {}
  } finally {
    _pendingInProgress.delete(calcTabId);
    if (dbConfigId) _processedPendingIds.delete(dbConfigId);
  }
}

/**
 * Точка входа, вызывается из calcTabRouter (tabs.onUpdated).
 */
async function checkPendingRefreshCommands(calcTabId) {
  try {
    _cleanupPendingIds();

    const tab = await chrome.tabs.get(calcTabId).catch(() => null);
    if (!tab) return;

    const { configId, status } = await readPendingTrigger(calcTabId);

    if (status !== 'pending' || !configId) return;

    if (_processedPendingIds.has(configId)) {
      console.log('[TVC Pending] configId уже обрабатывается (TTL):', configId);
      return;
    }
    _processedPendingIds.set(configId, Date.now());

    console.log('[TVC Pending] Обнаружен pending-конфиг:', configId);

    const configData = await readCalcOptionsFromReact(calcTabId);
    if (!configData || !configData.options?.length || !configData.ticker) {
      console.log('[TVC Pending] Данные ещё не загружены, ждём следующего alarm');
      _processedPendingIds.delete(configId);
      return;
    }

    // не await — мьютекс внутри защитит от параллельного запуска
    executePendingRefresh(calcTabId, configData, configId);

  } catch (e) {
    console.error('[TVC Pending] Ошибка проверки pending-триггера:', e);
  }
}

console.log('[Background] pendingRefresh.js загружен');
