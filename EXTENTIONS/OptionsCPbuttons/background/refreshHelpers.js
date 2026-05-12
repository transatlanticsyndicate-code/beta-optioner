/**
 * Background helpers: общие утилиты для pendingRefresh.js / dbConfigRefresh.js / calcTabRouter.js
 * ЗАЧЕМ: вынесены из messageHandler.js / refreshSpecific.js коллег с упрощениями
 * под наше расширение (у нас нет полного TV content-script'а коллег с `getCurrentExpiration`,
 * `getUnderlyingPrice` через sendMessage и т.п.).
 */

/**
 * Простая задержка.
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Ожидание полной загрузки вкладки (status === 'complete').
 * ЗАЧЕМ: после chrome.tabs.create/update нужно дождаться загрузки страницы
 * перед инжекцией скриптов или чтением DOM.
 *
 * @param {number} tabId
 * @param {number} timeoutMs
 * @returns {Promise<boolean>} true если страница загрузилась, false по таймауту
 */
async function waitForPageLoad(tabId, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab && tab.status === 'complete') return true;
    } catch (e) {
      return false;
    }
    await delay(200);
  }
  return false;
}

/**
 * Заглушка `ensureContentScriptLoaded` — в нашем расширении content-script на TradingView
 * декларирован в manifest (matches: `*://*.tradingview.com/options/*`) и подгружается
 * автоматически. Парсер строки (`parseTvOptionRow` из pendingParser.js) инжектится
 * напрямую через `chrome.scripting.executeScript({ func: ... })` и не зависит от
 * content-script'а, поэтому отдельная проверка готовности не нужна.
 *
 * Возвращает true, чтобы вызывающий код (pendingRefresh.js) шёл по «happy path».
 */
async function ensureContentScriptLoaded(_tabId) {
  return true;
}

/**
 * Является ли тикер крипто-USDT-парой (BTCUSDT, ETHUSDT, …).
 * ЗАЧЕМ: На TradingView нет опционных досок для крипто-USDT-пар, и за такие
 * сделки в калькуляторе отвечает Binance-расширение. Если этой проверки нет,
 * TV-фон попытается открыть `tradingview.com/options/chain/?symbol=BTCUSDT`
 * → 404 → плашка «изменилась вёрстка», и пользователь видит чужой оверлей.
 *
 * Шаблон намеренно широкий: суффикс `USDT` после возможного префикса биржи
 * (`BINANCE:ETHUSDT`). Это покрывает и будущие underlying'ы Binance Options
 * без необходимости синхронизировать списки между расширениями.
 */
function _isCryptoUsdtTicker(ticker) {
  if (!ticker || typeof ticker !== 'string') return false;
  let t = ticker.trim().toUpperCase();
  if (t.includes(':')) t = t.split(':').pop();
  return /USDT$/.test(t);
}

console.log('[Background] refreshHelpers.js загружен');
