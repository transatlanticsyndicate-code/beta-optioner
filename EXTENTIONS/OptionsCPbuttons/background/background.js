/**
 * ext2 Background — Service Worker (message router)
 */

// Базовые модули + автообновление сохранённых сделок (перенесено из twparser коллег).
// Порядок важен: refreshHelpers / pendingParser → dbConfigRefresh → pendingRefresh → calcTabRouter.
importScripts(
  'calculator.js',
  'sync.js',
  'refreshHelpers.js',
  'pendingParser.js',
  'dbConfigRefresh.js',
  'pendingRefresh.js',
  'calcTabRouter.js'
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action } = message;

  switch (action) {
    case 'ext2_openOptionerTab':
    case 'openOptionerTab':
      handleOpenOptionerTab(message, sendResponse);
      return true;

    case 'ext2_openOptionerTabNew':
    case 'openOptionerTabNew':
      handleOpenOptionerTabNew(message, sendResponse);
      return true;

    case 'ext2_syncDeleteToCalculator':
    case 'syncDeleteToCalculator':
      handleSyncDeleteToCalculator(message, sendResponse);
      return true;

    case 'ext2_clearTickerFromCalculator':
    case 'clearTickerFromCalculator':
      handleClearTickerFromCalculator(message, sendResponse);
      return true;

    case 'ext2_optionDeletedFromCalculator':
    case 'optionDeletedFromCalculator':
      handleOptionDeletedFromCalculator(message, sendResponse);
      return true;

    case 'ext2_clearAllFromCalculator':
    case 'clearAllFromCalculator':
      handleClearAllFromCalculator(message, sendResponse);
      return true;

    case 'ext2_syncConfigPositions':
    case 'syncConfigPositions':
      handleSyncConfigPositions(message, sendResponse);
      return true;

    case 'ext2_clearCalculator':
      chrome.tabs.query({ url: ['https://beta.optioner.online/*', 'http://localhost:3000/*'] }, (tabs) => {
        if (tabs.length > 0) {
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: () => {
              localStorage.removeItem('calculatorState');
              localStorage.removeItem('tvc_refresh_command');
              localStorage.removeItem('tvc_refresh_result');
              localStorage.removeItem('tvc_command');
              localStorage.removeItem('tvc_full_chain');
              localStorage.removeItem('tvc_status');
              setTimeout(() => location.reload(), 100);
            }
          }).catch(() => {});
        }
      });
      return true;

    case 'northExpandAndDump':
      // Команда от bridge на странице калькулятора: найти TV-таб с опционами,
      // развернуть указанную экспирацию и дампить полную цепочку.
      console.log('[ext2/north/bg] northExpandAndDump:', message.date, 'ticker:', message.ticker, 'url:', message.tradingViewUrl);
      handleNorthExpandAndDump(message, sendResponse);
      return true;

    case 'northInit':
      // Открыть/найти TV-таб для тикера, выставить фильтры, обновить список
      // экспираций. Без раскрытия групп.
      console.log('[ext2/north/bg] northInit: ticker:', message.ticker, 'url:', message.tradingViewUrl);
      handleNorthInit(message, sendResponse);
      return true;

    default:
      return false;
  }
});

/**
 * Найти таб TradingView со страницей опционов и попросить content script
 * развернуть указанную дату экспирации. Если у таба URL без правильных
 * фильтров — навигируем его на URL с series_period=next-90-days +
 * strikes_filter_condition=all. Если таба нет — создаём.
 */
function handleNorthExpandAndDump(message, sendResponse) {
  const desiredTicker = (message.ticker || '').toUpperCase();
  const targetUrl = message.tradingViewUrl;

  chrome.tabs.query({ url: 'https://*.tradingview.com/options/*' }, (tabs) => {
    console.log('[ext2/north/bg] expand → tabs.query: найдено', tabs?.length || 0, tabs?.map(t => ({ id: t.id, url: t.url })));
    let tab = null;
    if (tabs && tabs.length > 0) {
      if (desiredTicker) {
        tab = tabs.find(t => (t.url || '').toUpperCase().includes(desiredTicker)) || tabs[0];
      } else {
        tab = tabs[0];
      }
    }

    if (tab) {
      const needNav = !urlHasNorthFilters(tab.url) && !!targetUrl;
      console.log('[ext2/north/bg] expand → existing tab', tab.id, 'needNav:', needNav);
      if (needNav) {
        chrome.tabs.update(tab.id, { url: targetUrl, active: true }, () => {
          if (chrome.runtime.lastError) console.warn('[ext2/north/bg] expand → tabs.update error:', chrome.runtime.lastError.message);
          waitForTabReady(
            tab.id,
            () => runNorthOnTab(tab.id, message, sendResponse, /*needsFilters=*/false),
            () => { console.warn('[ext2/north/bg] expand → reload-timeout'); sendResponse({ ok: false, reason: 'tv-tab-reload-timeout' }); },
          );
        });
        return;
      }
      try { chrome.tabs.update(tab.id, { active: true }); } catch (e) {}
      runNorthOnTab(tab.id, message, sendResponse, /*needsFilters=*/false);
      return;
    }

    if (!targetUrl) {
      console.warn('[ext2/north/bg] expand → нет таба и нет URL');
      sendResponse({ ok: false, reason: 'no-tv-tab-and-no-url' });
      return;
    }
    console.log('[ext2/north/bg] expand → создаю новый таб:', targetUrl);
    chrome.tabs.create({ url: targetUrl, active: false }, (newTab) => {
      if (chrome.runtime.lastError) console.warn('[ext2/north/bg] expand → tabs.create error:', chrome.runtime.lastError.message);
      if (!newTab || !newTab.id) {
        sendResponse({ ok: false, reason: 'tab-create-failed' });
        return;
      }
      console.log('[ext2/north/bg] expand → новый таб id:', newTab.id);
      waitForTabReady(
        newTab.id,
        () => runNorthOnTab(newTab.id, message, sendResponse, /*needsFilters=*/false),
        () => { console.warn('[ext2/north/bg] expand → load-timeout'); sendResponse({ ok: false, reason: 'tv-tab-load-timeout' }); },
      );
    });
  });
}

/**
 * Проверяет, есть ли в URL правильные фильтры (series_period=next-90-days +
 * strikes_filter_condition=all).
 */
/**
 * Проверяет, что у таба URL содержит нужные параметры для СЕВЕР:
 * либо series_period (в список допустимых), либо явное окно
 * series_date_from + series_date_to (что мы и пишем по умолчанию),
 * плюс strikes_filter_condition=all.
 */
const ACCEPTABLE_SERIES_PERIODS = new Set(['next-6-months', 'next-90-days', 'next-1-year']);

function urlHasNorthFilters(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    const strikes = u.searchParams.get('strikes_filter_condition');
    if (strikes !== 'all') return false;
    const period = u.searchParams.get('series_period');
    if (period && ACCEPTABLE_SERIES_PERIODS.has(period)) return true;
    const from = u.searchParams.get('series_date_from');
    const to = u.searchParams.get('series_date_to');
    return !!(from && to);
  } catch (e) {
    return false;
  }
}

/**
 * Подождать загрузки страницы в табе (status=complete) + 1500мс на финальную
 * отрисовку TV. Затем дёрнуть getUnderlyingPrice как пинг — это гарантирует,
 * что контент-скрипт ожил.
 */
function waitForTabReady(tabId, onReady, onTimeout) {
  const deadline = Date.now() + 25_000;
  let attempt = 0;
  const tryPing = () => {
    attempt++;
    chrome.tabs.sendMessage(tabId, { action: 'getUnderlyingPrice' }, (resp) => {
      if (chrome.runtime.lastError || !resp) {
        if (Date.now() > deadline) {
          console.warn('[ext2/north/bg] waitForTabReady timeout, tabId:', tabId, 'после', attempt, 'попыток. Последняя ошибка:', chrome.runtime.lastError?.message);
          onTimeout();
          return;
        }
        setTimeout(tryPing, 600);
        return;
      }
      console.log('[ext2/north/bg] контент-скрипт ожил на табе', tabId, 'после', attempt, 'попыток');
      // Контент-скрипт жив. Дополнительная пауза на отрисовку.
      setTimeout(onReady, 1500);
    });
  };
  setTimeout(tryPing, 1500);
}

/**
 * Открыть/найти TV-таб и выставить фильтры через URL-параметры
 * (series_period=next-90-days + strikes_filter_condition=all). Если у уже
 * открытого таба этих параметров нет — навигируем его на правильный URL.
 */
function handleNorthInit(message, sendResponse) {
  const desiredTicker = (message.ticker || '').toUpperCase();
  const targetUrl = message.tradingViewUrl;

  chrome.tabs.query({ url: 'https://*.tradingview.com/options/*' }, (tabs) => {
    console.log('[ext2/north/bg] init → tabs.query: найдено', tabs?.length || 0, tabs?.map(t => ({ id: t.id, url: t.url })));
    let tab = null;
    if (tabs && tabs.length > 0) {
      if (desiredTicker) {
        tab = tabs.find(t => (t.url || '').toUpperCase().includes(desiredTicker)) || tabs[0];
      } else {
        tab = tabs[0];
      }
    }

    // Случай 1: подходящий таб уже есть
    if (tab) {
      const needNav = !urlHasNorthFilters(tab.url) && !!targetUrl;
      console.log('[ext2/north/bg] init → existing tab', tab.id, 'needNav:', needNav, 'currentUrl:', tab.url);
      if (needNav) {
        // URL без фильтров — навигируем таб на URL с правильными параметрами.
        // После навигации TV сам применит фильтры — никаких DOM-кликов не нужно.
        chrome.tabs.update(tab.id, { url: targetUrl, active: true }, () => {
          if (chrome.runtime.lastError) console.warn('[ext2/north/bg] init → tabs.update error:', chrome.runtime.lastError.message);
          waitForTabReady(
            tab.id,
            () => {
              chrome.tabs.sendMessage(tab.id, { action: 'northEnsureFilters' }, (response) => {
                sendResponse(response || { ok: true });
              });
            },
            () => { console.warn('[ext2/north/bg] init → reload-timeout'); sendResponse({ ok: false, reason: 'tv-tab-reload-timeout' }); },
          );
        });
        return;
      }
      // URL уже правильный — просто активируем и просим content script дампить
      try { chrome.tabs.update(tab.id, { active: true }); } catch (e) {}
      chrome.tabs.sendMessage(tab.id, { action: 'northEnsureFilters' }, (response) => {
        console.log('[ext2/north/bg] init → northEnsureFilters response:', response);
        sendResponse(response || { ok: true });
      });
      return;
    }

    // Случай 2: таба нет — создаём по URL с фильтрами
    if (!targetUrl) {
      console.warn('[ext2/north/bg] init → нет таба и нет URL');
      sendResponse({ ok: false, reason: 'no-tv-tab-and-no-url' });
      return;
    }
    console.log('[ext2/north/bg] init → создаю новый таб:', targetUrl);
    chrome.tabs.create({ url: targetUrl, active: false }, (newTab) => {
      if (chrome.runtime.lastError) console.warn('[ext2/north/bg] init → tabs.create error:', chrome.runtime.lastError.message);
      if (!newTab || !newTab.id) {
        console.warn('[ext2/north/bg] init → tabs.create вернул пустоту');
        sendResponse({ ok: false, reason: 'tab-create-failed' });
        return;
      }
      console.log('[ext2/north/bg] init → новый таб id:', newTab.id);
      waitForTabReady(
        newTab.id,
        () => {
          chrome.tabs.sendMessage(newTab.id, { action: 'northEnsureFilters' }, (response) => {
            console.log('[ext2/north/bg] init → northEnsureFilters response (new tab):', response);
            sendResponse(response || { ok: true });
          });
        },
        () => sendResponse({ ok: false, reason: 'tv-tab-load-timeout' }),
      );
    });
  });
}

/**
 * Построить URL для раскрытия ОДНОЙ конкретной экспирации.
 * Сбрасываем series_period / series_date_from / series_date_to и оставляем
 * только series=YYYYMMDD — TV отрисует таблицу опционов только для этой даты,
 * без растягивания на весь диапазон. Это в разы быстрее.
 */
function buildUrlWithSeries(currentUrl, targetIso) {
  if (!currentUrl || !targetIso) return null;
  const ymd = targetIso.replace(/-/g, '');
  try {
    const u = new URL(currentUrl);
    u.searchParams.delete('series_period');
    u.searchParams.delete('series_date_from');
    u.searchParams.delete('series_date_to');
    u.searchParams.set('series', ymd);
    if (!u.searchParams.get('strikes_filter_condition')) {
      u.searchParams.set('strikes_filter_condition', 'all');
    }
    return u.toString();
  } catch (e) {
    return null;
  }
}

/**
 * Проверка, что URL уже сфокусирован на нужной экспирации (series=YYYYMMDD
 * совпадает) и не загружает лишний диапазон.
 */
function urlHasTargetSeries(url, targetIso) {
  if (!url || !targetIso) return false;
  try {
    const u = new URL(url);
    const series = u.searchParams.get('series');
    if (!series) return false;
    const ymd = targetIso.replace(/-/g, '');
    return series.split(',').includes(ymd);
  } catch (e) {
    return false;
  }
}

/**
 * Выполнить northExpandAndDump на конкретном табе. Раскрытие группы делается
 * через URL-навигацию (series=YYYYMMDD) — TradingView сам отрисует строки.
 */
function runNorthOnTab(tabId, message, sendResponse, needsFilters) {
  const askDump = () => {
    chrome.tabs.sendMessage(tabId, {
      action: 'northExpandAndDump',
      date: message.date,
    }, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, reason: chrome.runtime.lastError.message });
        return;
      }
      sendResponse(response || { ok: false, reason: 'no-response-from-tv' });
    });
  };

  // Если таб уже сфокусирован на нужной экспирации — просто дампим.
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) {
      sendResponse({ ok: false, reason: 'tab-get-failed' });
      return;
    }
    if (urlHasTargetSeries(tab.url, message.date)) {
      askDump();
      return;
    }
    const newUrl = buildUrlWithSeries(tab.url, message.date);
    if (!newUrl) {
      if (needsFilters) {
        chrome.tabs.sendMessage(tabId, { action: 'northEnsureFilters' }, () => askDump());
      } else {
        askDump();
      }
      return;
    }
    // Навигируем таб строго на одну экспирацию — TV не будет тянуть весь
    // 150-дневный диапазон, и анализ запустится быстро.
    chrome.tabs.update(tabId, { url: newUrl }, () => {
      waitForTabReady(
        tabId,
        () => askDump(),
        () => sendResponse({ ok: false, reason: 'tv-tab-reload-timeout' }),
      );
    });
  });
}

// Keep-alive: предотвращаем засыпание SW
setInterval(() => {}, 25000);
