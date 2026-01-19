/**
 * Утилиты для парсинга и работы с данными
 * ЗАЧЕМ: Общие функции используемые в разных модулях
 */

// Мультипликаторы для разных инструментов
const TVC_MULTIPLIERS = {
  'ES': 50,
  'NQ': 20,
  'GC': 100,
  'CL': 1000,
  'SI': 5000
};

// Парсинг числа из строки TradingView
function parseNumber(str) {
  if (!str || str === '—' || str === '-') return null;
  const cleaned = str.replace(/\s/g, '').replace(/,/g, '').replace('−', '-');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Получить тикер из URL
function getTickerFromUrl() {
  const match = window.location.pathname.match(/options\/chain\/[^-]+-([A-Z0-9]+)/);
  return match ? match[1] : null;
}

// Алиас для совместимости
function getTicker() {
  return getTickerFromUrl();
}

// Получить базовый символ (ES, NQ, GC...)
function getBaseSymbol(ticker) {
  if (!ticker) return 'ES';
  const match = ticker.match(/^([A-Z]+)/);
  return match ? match[1] : 'ES';
}

// Получить мультипликатор для инструмента
function getMultiplier(ticker) {
  const base = getBaseSymbol(ticker);
  return TVC_MULTIPLIERS[base] || 50;
}

// Конвертировать дату "Feb 18" в ISO формат "2026-02-18"
function convertExpDateToISO(expDate) {
  if (!expDate || expDate === 'N/A') return null;
  
  const months = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
    'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
    'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
  };
  
  const parts = expDate.split(' ');
  if (parts.length !== 2) return null;
  
  const month = months[parts[0]];
  const day = parts[1].padStart(2, '0');
  
  // Определяем год — если месяц меньше текущего, значит следующий год
  const currentMonth = new Date().getMonth() + 1;
  const targetMonth = parseInt(month);
  const year = targetMonth < currentMonth ? new Date().getFullYear() + 1 : new Date().getFullYear();
  
  return `${year}-${month}-${day}`;
}

// Получить цену underlying из бейджа на странице TradingView
function getUnderlyingPrice() {
  const badge = document.querySelector('[class*="underlyingBadge"]');
  if (!badge) {
    console.log('[TVC] underlyingBadge не найден');
    return null;
  }
  
  const text = badge.textContent.trim();
  // Формат: "TSLA 437.50" или "ESH2026 6,910.75"
  // Ищем число с точкой (цена) в любом месте строки
  const match = text.match(/([\d,]+\.\d+)/);
  if (match) {
    const price = parseFloat(match[1].replace(/,/g, ''));
    console.log('[TVC] Underlying price:', price, 'из:', text);
    return price;
  }
  
  console.log('[TVC] Не удалось распарсить цену из:', text);
  return null;
}

console.log('[TVC] utils.js загружен');
