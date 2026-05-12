/**
 * Утилиты для расширения Binance → Optioner Bridge
 * ЗАЧЕМ: Общие вспомогательные функции
 */

/**
 * Парсинг числа из строки (поддержка запятых, пробелов, K/M суффиксов)
 */
function parseNumber(str) {
  if (str === null || str === undefined) return 0;
  if (typeof str === 'number') return str;
  const s = String(str).trim().replace(/,/g, '').replace(/\s/g, '');
  if (!s || s === '-' || s === '--' || s === 'N/A') return 0;
  if (s.endsWith('K')) return parseFloat(s) * 1000;
  if (s.endsWith('M')) return parseFloat(s) * 1000000;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/**
 * Получить тикер базового актива из URL Binance eoptions
 * URL формат: https://www.binance.com/en/eoptions/BTCUSDT
 */
function getUnderlyingFromUrl() {
  const match = window.location.pathname.match(/\/eoptions\/([A-Z]+)/i);
  return match ? match[1].toUpperCase() : 'BTCUSDT';
}

/**
 * Конвертировать дату экспирации в ISO формат (YYYY-MM-DD)
 * Binance использует формат: 250117 (YYMMDD) в символе BTC-250117-95000-C
 */
function convertBinanceExpToISO(dateCode) {
  if (!dateCode) return null;
  // Формат YYMMDD → YYYY-MM-DD
  const match = String(dateCode).match(/^(\d{2})(\d{2})(\d{2})$/);
  if (match) {
    const year = '20' + match[1];
    const month = match[2];
    const day = match[3];
    return `${year}-${month}-${day}`;
  }
  return null;
}

/**
 * Парсинг символа опциона Binance
 * Формат: BTC-250117-95000-C или ETH-250117-3000-P
 * @returns { underlying, expDateCode, expISO, strike, type }
 */
function parseBinanceSymbol(symbol) {
  if (!symbol) return null;
  const match = symbol.match(/^([A-Z]+)-(\d{6})-(\d+(?:\.\d+)?)-([CP])$/);
  if (!match) return null;
  return {
    underlying: match[1],
    expDateCode: match[2],
    expISO: convertBinanceExpToISO(match[2]),
    strike: parseFloat(match[3]),
    type: match[4] === 'C' ? 'CALL' : 'PUT'
  };
}

/**
 * Форматировать дату экспирации для отображения
 * YYMMDD → "17 Jan 2025"
 */
function formatExpiration(dateCode) {
  const iso = convertBinanceExpToISO(dateCode);
  if (!iso) return dateCode;
  const d = new Date(iso + 'T00:00:00Z');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

console.log('[Binance] utils.js загружен');
