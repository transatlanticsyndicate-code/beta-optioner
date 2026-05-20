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
      handleNorthExpandAndDump(message, sendResponse);
      return true;

    case 'northInit':
      // Открыть/найти TV-таб для тикера, выставить фильтры, обновить список
      // экспираций. Без раскрытия групп.
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
      if (needNav) {
        chrome.tabs.update(tab.id, { url: targetUrl, active: true }, () => {
          waitForTabReady(
            tab.id,
            () => runNorthOnTab(tab.id, message, sendResponse, /*needsFilters=*/false),
            () => sendResponse({ ok: false, reason: 'tv-tab-reload-timeout' }),
          );
        });
        return;
      }
      try { chrome.tabs.update(tab.id, { active: true }); } catch (e) {}
      runNorthOnTab(tab.id, message, sendResponse, /*needsFilters=*/false);
      return;
    }

    if (!targetUrl) {
      sendResponse({ ok: false, reason: 'no-tv-tab-and-no-url' });
      return;
    }
    chrome.tabs.create({ url: targetUrl, active: false }, (newTab) => {
      if (!newTab || !newTab.id) {
        sendResponse({ ok: false, reason: 'tab-create-failed' });
        return;
      }
      waitForTabReady(
        newTab.id,
        () => runNorthOnTab(newTab.id, message, sendResponse, /*needsFilters=*/false),
        () => sendResponse({ ok: false, reason: 'tv-tab-load-timeout' }),
      );
    });
  });
}

/**
 * Проверяет, есть ли в URL правильные фильтры (series_period=next-90-days +
 * strikes_filter_condition=all).
 */
// Допустимые series_period — фильтры, которые TV использует для широкого
// набора дат. Мы предпочитаем next-6-months (даёт больше серий вокруг +60 дней),
// но next-90-days тоже принимаем как валидный, чтобы не перетягивать таб лишний раз.
const ACCEPTABLE_SERIES_PERIODS = new Set(['next-6-months', 'next-90-days', 'next-1-year']);

function urlHasNorthFilters(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    const period = u.searchParams.get('series_period');
    const strikes = u.searchParams.get('strikes_filter_condition');
    return ACCEPTABLE_SERIES_PERIODS.has(period) && strikes === 'all';
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
  const tryPing = () => {
    chrome.tabs.sendMessage(tabId, { action: 'getUnderlyingPrice' }, (resp) => {
      if (chrome.runtime.lastError || !resp) {
        if (Date.now() > deadline) { onTimeout(); return; }
        setTimeout(tryPing, 600);
        return;
      }
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
      if (needNav) {
        // URL без фильтров — навигируем таб на URL с правильными параметрами.
        // После навигации TV сам применит фильтры — никаких DOM-кликов не нужно.
        chrome.tabs.update(tab.id, { url: targetUrl, active: true }, () => {
          waitForTabReady(
            tab.id,
            () => {
              chrome.tabs.sendMessage(tab.id, { action: 'northEnsureFilters' }, (response) => {
                sendResponse(response || { ok: true });
              });
            },
            () => sendResponse({ ok: false, reason: 'tv-tab-reload-timeout' }),
          );
        });
        return;
      }
      // URL уже правильный — просто активируем и просим content script дампить
      try { chrome.tabs.update(tab.id, { active: true }); } catch (e) {}
      chrome.tabs.sendMessage(tab.id, { action: 'northEnsureFilters' }, (response) => {
        sendResponse(response || { ok: true });
      });
      return;
    }

    // Случай 2: таба нет — создаём по URL с фильтрами
    if (!targetUrl) {
      sendResponse({ ok: false, reason: 'no-tv-tab-and-no-url' });
      return;
    }
    chrome.tabs.create({ url: targetUrl, active: false }, (newTab) => {
      if (!newTab || !newTab.id) {
        sendResponse({ ok: false, reason: 'tab-create-failed' });
        return;
      }
      waitForTabReady(
        newTab.id,
        () => {
          chrome.tabs.sendMessage(newTab.id, { action: 'northEnsureFilters' }, (response) => {
            sendResponse(response || { ok: true });
          });
        },
        () => sendResponse({ ok: false, reason: 'tv-tab-load-timeout' }),
      );
    });
  });
}

/**
 * Построить URL с добавленной экспирацией в параметр series.
 * 2026-07-17 → 20260717. Если уже есть другие series — сохраняем, добавляем новую.
 */
function buildUrlWithSeries(currentUrl, targetIso) {
  if (!currentUrl || !targetIso) return null;
  const ymd = targetIso.replace(/-/g, '');
  try {
    const u = new URL(currentUrl);
    const existing = u.searchParams.get('series');
    const list = existing ? existing.split(',').filter(Boolean) : [];
    if (!list.includes(ymd)) list.push(ymd);
    u.searchParams.set('series', list.join(','));
    // Гарантируем, что фильтры остаются на месте
    if (!u.searchParams.get('series_period')) u.searchParams.set('series_period', 'next-6-months');
    if (!u.searchParams.get('strikes_filter_condition')) u.searchParams.set('strikes_filter_condition', 'all');
    return u.toString();
  } catch (e) {
    return null;
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

  // Получаем текущий URL таба и добавляем нужную series
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) {
      sendResponse({ ok: false, reason: 'tab-get-failed' });
      return;
    }
    const newUrl = buildUrlWithSeries(tab.url, message.date);
    if (!newUrl) {
      // Не смогли построить URL — fallback на DOM-клики
      if (needsFilters) {
        chrome.tabs.sendMessage(tabId, { action: 'northEnsureFilters' }, () => askDump());
      } else {
        askDump();
      }
      return;
    }
    if (newUrl === tab.url) {
      // URL уже с этой series — строки должны быть в DOM, просто дампим
      askDump();
      return;
    }
    // Навигируем таб на URL с нужной series — TV отрисует строки нативно
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
