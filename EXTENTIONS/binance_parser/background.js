/**
 * Background Service Worker — точка входа
 * ЗАЧЕМ: Импортирует все background модули
 */

importScripts(
  'background/calculator.js',
  'background/messageHandler.js',
  'background/refreshHelpers.js',
  'background/refreshShared.js',
  'background/pendingRefresh.js',
  'background/dbConfigRefresh.js',
  'background/calcTabRouter.js'
);

console.log('[Binance Bridge] Background Service Worker запущен');
