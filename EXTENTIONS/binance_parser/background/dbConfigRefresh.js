/**
 * Background Module: Binance DbConfig Auto-Refresh (standard flow)
 * ЗАЧЕМ: Симметричный пендант OptionsCPbuttons/background/dbConfigRefresh.js
 * для опционов Binance. Поток standard — с оверлеем подтверждения
 * «Обновить? Да/Нет», при согласии обновляются только IV + цена БА
 * (bid/ask/volume и цена входа не трогаются — это правила standard).
 *
 * Калькулятор сам различает pending/standard по loadedConfigStatus и решает,
 * какие поля применить из команды sendPrIV_tocallc.
 *
 * Зависит от: refreshShared.js (Binance API + калькулятор-сайдовые помощники),
 *             refreshHelpers.js (delay).
 */

// Map<tabKey, ts> — один оверлей на один dbConfig, повторно не показываем.
// Запись «протухает» через 30 сек — это позволяет повторить вручную через reload.
const _processedTabs = new Map();

async function autoRefreshDbConfig(calcTabId, url, attempt = 1) {
  // Сначала проверяем команды от ранее показанных оверлеев — каждый alarm
  // даёт шанс запустить refresh по подтверждению пользователя.
  await checkDbConfigOverlayCommands(calcTabId);

  const dbConfigMatch = url.match(/dbConfig=([^&]+)/);
  const dbConfigId = dbConfigMatch ? dbConfigMatch[1] : 'unknown';
  const tabKey = `${calcTabId}_${dbConfigId}`;
  if (_processedTabs.has(tabKey)) return;

  await _autoRefreshDbConfigInner(calcTabId, url, dbConfigId, tabKey, attempt);
}

async function _autoRefreshDbConfigInner(calcTabId, url, dbConfigId, tabKey, attempt) {
  const MAX_ATTEMPTS = 3;
  const RETRY_WAIT_MS = [0, 3000, 4000];

  try {
    const tab = await chrome.tabs.get(calcTabId).catch(() => null);
    if (!tab || !tab.url?.includes('dbConfig=')) return;

    const configData = await readCalcOptionsFromReact(calcTabId);
    if (!configData || !configData.options?.length) {
      if (attempt < MAX_ATTEMPTS) {
        await delay(RETRY_WAIT_MS[attempt]);
        return _autoRefreshDbConfigInner(calcTabId, url, dbConfigId, tabKey, attempt + 1);
      }
      return;
    }

    if (!configData.ticker) return;

    // Шаг 1: Binance показывает оверлей только для своих тикеров.
    if (!isBinanceUnderlying(configData.ticker)) return;

    console.log('[Binance DbConfig] Данные загружены:', configData.ticker,
      configData.options.length, 'опц.');

    // Помечаем ДО показа оверлея — чтобы повторный alarm не создал дубль.
    _processedTabs.set(tabKey, Date.now());

    await showDbConfigOverlay(calcTabId, configData.ticker,
      configData.options.length, dbConfigId, configData);

  } catch (e) {
    console.error('[Binance DbConfig] Ошибка показа оверлея:', e);
    try {
      await writeStatusToCalculator(calcTabId, 'error', 0, e.message);
    } catch (_) {}
  }
}

/**
 * Выполнить обновление данных с Binance после подтверждения пользователем.
 * ЗАЧЕМ: Вызывается асинхронно по сообщению executeDbConfigRefresh от оверлея
 * (см. calcTabRouter.js) или через checkDbConfigOverlayCommands.
 *
 * Поток standard: калькулятор применит ТОЛЬКО IV + цену БА, bid/ask/volume
 * и assetPriceAtEntry не тронет (правило различает UniversalOptionsCalculator).
 */
async function executeDbConfigRefresh(calcTabId, configData) {
  if (executeDbConfigRefresh._inProgress) {
    console.log('[Binance DbConfig] Refresh уже выполняется, пропускаем');
    return;
  }
  executeDbConfigRefresh._inProgress = true;

  try {
    console.log('[Binance DbConfig] Пользователь подтвердил обновление:', configData.ticker);

    const underlying = _resolveBinanceUnderlying(configData.ticker);
    if (!underlying) {
      await writeStatusToCalculator(calcTabId, 'error', 0,
        `Тикер ${configData.ticker} не поддерживается Binance Options`);
      return;
    }

    // dbConfigId привязывает команду к конкретной вкладке (см. calcStorageGuard.js).
    const calcTab = await chrome.tabs.get(calcTabId).catch(() => null);
    const dbConfigMatch = calcTab?.url?.match(/dbConfig=([^&]+)/);
    const dbConfigId = dbConfigMatch ? dbConfigMatch[1] : null;

    await writeStatusToCalculator(calcTabId, 'collecting', 5,
      `Запрос данных Binance (${underlying})...`);

    const [markArr, tickerArr, indexPrice] = await Promise.all([
      fetchBinanceMark(underlying),
      fetchBinanceTicker(underlying),
      fetchBinanceIndexPrice(underlying)
    ]);

    if (!markArr.length) {
      await writeStatusToCalculator(calcTabId, 'error', 0,
        'Не удалось получить котировки с Binance');
      return;
    }

    await writeStatusToCalculator(calcTabId, 'collecting', 60,
      `Получено ${markArr.length} опционов, сопоставляем...`);

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

    const numOrNull = (v) => {
      if (v == null) return null;
      const n = parseFloat(v);
      return isNaN(n) ? null : n;
    };

    // Для standard передаём IV + греки + цену БА; bid/ask/volume тоже шлём —
    // калькулятор сам решит, применять или нет (для standard их не трогает).
    const comparisonOptions = configData.options.map(calcOpt => {
      const key = `${calcOpt.type}|${calcOpt.date}|${calcOpt.strike}`;
      const mark = markByKey[key];
      const tick = tickerByKey[key];

      let newIV = null;
      if (mark && mark.markIV != null) {
        const iv = parseFloat(mark.markIV);
        if (!isNaN(iv) && iv > 0) newIV = iv * 100;
      }

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
        volume: tick ? numOrNull(tick.volume)   : null,
        newIVText: newIV != null ? newIV.toFixed(2) : null
      };
    });

    const found = comparisonOptions.filter(o => o.newIV != null).length;
    const total = configData.options.length;

    await sendPrIVToCalc(calcTabId, {
      ticker: configData.ticker,
      boardUrl: buildBinanceBoardUrl(configData.ticker),
      currentPrice: indexPrice,
      options: comparisonOptions,
      dbConfigId
    });

    await writeStatusToCalculator(calcTabId, 'complete', 100,
      `Обновлено: ${found} из ${total} опц.`);

    console.log(`[Binance DbConfig] Завершено: ${found}/${total} опц., цена=${indexPrice}`);

  } catch (e) {
    console.error('[Binance DbConfig] Ошибка обновления:', e);
    try {
      await writeStatusToCalculator(calcTabId, 'error', 0, e.message);
    } catch (_) {}
  } finally {
    executeDbConfigRefresh._inProgress = false;
  }
}
executeDbConfigRefresh._inProgress = false;

console.log('[Binance Bridge] dbConfigRefresh.js загружен');
