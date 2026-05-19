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

    default:
      return false;
  }
});

/**
 * Найти таб TradingView со страницей опционов и попросить content script
 * развернуть указанную дату экспирации.
 */
function handleNorthExpandAndDump(message, sendResponse) {
  chrome.tabs.query({ url: 'https://*.tradingview.com/options/*' }, (tabs) => {
    if (!tabs || tabs.length === 0) {
      sendResponse({ ok: false, reason: 'no-tv-options-tab' });
      return;
    }
    // Берём первый подходящий таб
    const tab = tabs[0];
    chrome.tabs.sendMessage(tab.id, {
      action: 'northExpandAndDump',
      date: message.date,
    }, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, reason: chrome.runtime.lastError.message });
        return;
      }
      sendResponse(response || { ok: false, reason: 'no-response-from-tv' });
    });
  });
}

// Keep-alive: предотвращаем засыпание SW
setInterval(() => {}, 25000);
