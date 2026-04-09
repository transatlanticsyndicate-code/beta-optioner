/**
 * ext2 Background — Service Worker (message router)
 */

importScripts('calculator.js', 'sync.js');

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

    default:
      return false;
  }
});

// Keep-alive: предотвращаем засыпание SW
setInterval(() => {}, 25000);
