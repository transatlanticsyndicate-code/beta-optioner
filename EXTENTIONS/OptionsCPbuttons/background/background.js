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
 * развернуть указанную дату экспирации. Если подходящего таба нет — открыть
 * его по URL, переданному калькулятором, дождаться загрузки контент-скрипта,
 * выставить фильтры и только потом раскрыть группу.
 */
function handleNorthExpandAndDump(message, sendResponse) {
  const desiredTicker = (message.ticker || '').toUpperCase();

  // Шаг 1: ищем подходящий таб
  chrome.tabs.query({ url: 'https://*.tradingview.com/options/*' }, (tabs) => {
    // Берём таб с подходящим тикером, если есть. Иначе любой первый, иначе создаём.
    let tab = null;
    if (tabs && tabs.length > 0) {
      if (desiredTicker) {
        tab = tabs.find(t => (t.url || '').toUpperCase().includes(desiredTicker)) || tabs[0];
      } else {
        tab = tabs[0];
      }
    }

    if (tab) {
      runNorthOnTab(tab.id, message, sendResponse, /*needsFilters=*/false);
      return;
    }

    // Шаг 2: подходящего таба нет — создаём, ждём загрузки, ставим фильтры, потом раскрываем
    const url = message.tradingViewUrl;
    if (!url) {
      sendResponse({ ok: false, reason: 'no-tv-tab-and-no-url' });
      return;
    }
    chrome.tabs.create({ url, active: false }, (newTab) => {
      if (!newTab || !newTab.id) {
        sendResponse({ ok: false, reason: 'tab-create-failed' });
        return;
      }
      // Ждём пока контент-скрипт загрузится: пингуем 'getUnderlyingPrice' (там
      // уже есть синхронный sendResponse). Лимит — 20 секунд.
      const deadline = Date.now() + 20_000;
      const ping = () => {
        chrome.tabs.sendMessage(newTab.id, { action: 'getUnderlyingPrice' }, (resp) => {
          if (chrome.runtime.lastError || !resp) {
            if (Date.now() > deadline) {
              sendResponse({ ok: false, reason: 'tv-tab-load-timeout' });
              return;
            }
            setTimeout(ping, 600);
            return;
          }
          // Контент-скрипт жив — теперь фильтры и раскрытие
          runNorthOnTab(newTab.id, message, sendResponse, /*needsFilters=*/true);
        });
      };
      // Даём странице секунду на начальную отрисовку перед первым пингом
      setTimeout(ping, 1500);
    });
  });
}

/**
 * Открыть/найти TV-таб и выставить фильтры + обновить список экспираций.
 */
function handleNorthInit(message, sendResponse) {
  const desiredTicker = (message.ticker || '').toUpperCase();
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
      chrome.tabs.sendMessage(tab.id, { action: 'northEnsureFilters' }, (response) => {
        sendResponse(response || { ok: true });
      });
      return;
    }
    const url = message.tradingViewUrl;
    if (!url) {
      sendResponse({ ok: false, reason: 'no-tv-tab-and-no-url' });
      return;
    }
    chrome.tabs.create({ url, active: false }, (newTab) => {
      if (!newTab || !newTab.id) {
        sendResponse({ ok: false, reason: 'tab-create-failed' });
        return;
      }
      const deadline = Date.now() + 20_000;
      const ping = () => {
        chrome.tabs.sendMessage(newTab.id, { action: 'getUnderlyingPrice' }, (resp) => {
          if (chrome.runtime.lastError || !resp) {
            if (Date.now() > deadline) {
              sendResponse({ ok: false, reason: 'tv-tab-load-timeout' });
              return;
            }
            setTimeout(ping, 600);
            return;
          }
          chrome.tabs.sendMessage(newTab.id, { action: 'northEnsureFilters' }, (response) => {
            sendResponse(response || { ok: true });
          });
        });
      };
      setTimeout(ping, 1500);
    });
  });
}

/**
 * Выполнить northExpandAndDump на конкретном табе. Если needsFilters=true,
 * предварительно запускает northEnsureFilters.
 */
function runNorthOnTab(tabId, message, sendResponse, needsFilters) {
  const expandAndDump = () => {
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

  if (!needsFilters) {
    expandAndDump();
    return;
  }

  chrome.tabs.sendMessage(tabId, { action: 'northEnsureFilters' }, () => {
    // Игнорируем lastError — если фильтры не нашли, расширение всё равно
    // попробует найти заголовок DTE дальше.
    expandAndDump();
  });
}

// Keep-alive: предотвращаем засыпание SW
setInterval(() => {}, 25000);
