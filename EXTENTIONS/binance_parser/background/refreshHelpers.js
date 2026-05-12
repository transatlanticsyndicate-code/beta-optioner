/**
 * Background helpers: общие утилиты для refresh-потоков Binance.
 * ЗАЧЕМ: Симметрично TV-расширению (OptionsCPbuttons/background/refreshHelpers.js),
 * чтобы при будущем слиянии расширений было что унифицировать одной утилитой.
 * Для Binance не нужны waitForPageLoad / ensureContentScriptLoaded, т.к. свежие
 * данные берутся напрямую из eapi.binance.com без открытия вкладок.
 */

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('[Binance Bridge] refreshHelpers.js загружен');
