/**
 * ext2 — Утилиты
 */

// Парсинг числа из текста TradingView (поддержка запятых, пробелов, минуса)
function parseNumber(text) {
  if (!text) return 0;
  const cleaned = String(text).replace(/[,\s]/g, '').replace(/−/g, '-');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// Тикер из URL: ?symbol=CME_MINI:ESU2026 → ESU2026
function getTickerFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const symbol = params.get('symbol');
  if (symbol) {
    // CME_MINI:ESU2026 → ESU2026
    return symbol.includes(':') ? symbol.split(':')[1] : symbol;
  }
  // Fallback: /options/chain/NASDAQ-AAPL/ → AAPL
  const match = window.location.pathname.match(/chain\/[^/]+-([^/]+)/);
  return match ? match[1] : null;
}

// Полный символ из URL: CME_MINI:ESU2026
function getFullSymbolFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('symbol') || null;
}

// Биржа из URL: ?symbol=NYSE:SE → NYSE
// ЗАЧЕМ: Передаём в калькулятор для генерации правильных ссылок на TradingView
function getExchangeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const symbol = params.get('symbol');
  if (symbol && symbol.includes(':')) {
    return symbol.split(':')[0];
  }
  // Fallback: /options/chain/NASDAQ-AAPL → NASDAQ
  const match = window.location.pathname.match(/chain\/([A-Z_]+)-[^/]+/);
  return match ? match[1] : null;
}

// Экспирация из data-cell-id: CME_MINI:E3D260618C6625 → 2026-06-18
function getExpirationFromCellId(cellId) {
  if (!cellId) return null;
  // Ищем 6 цифр перед C или P: ...260618C... или ...260618P...
  const match = cellId.match(/(\d{6})[CP]/);
  if (!match) return null;
  const d = match[1]; // "260618"
  return `20${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}`;
}

// Тип опциона из data-cell-id: ...C6625 → CALL, ...P6625 → PUT
function getOptionTypeFromCellId(cellId) {
  if (!cellId) return null;
  const match = cellId.match(/\d{6}([CP])/);
  if (!match) return null;
  return match[1] === 'C' ? 'CALL' : 'PUT';
}

// Цена underlying со страницы
// ЗАЧЕМ: пропускаем правый сайдбар TradingView (watchlist + блок деталей тикера) —
// если он открыт и в нём выбран другой тикер, его цена иногда оказывается первой
// в DOM-порядке и подменяет цену базового актива страницы опционов.
const TV_SIDEBAR_SKIP_SELECTOR = [
  '[class*="widgetbar"]',
  '[class*="watchlist"]',
  '[class*="watch-list"]',
  '[class*="detailsWidget"]',
  '[data-name="right-toolbar"]',
  '[data-name="watchlist"]'
].join(',');

function isInTvSidebar(el) {
  return !!el.closest(TV_SIDEBAR_SKIP_SELECTOR);
}

function getUnderlyingPrice() {
  // Метод 1а: первый priceWrap, который НЕ в сайдбаре
  const priceWraps = document.querySelectorAll('[class*="priceWrap"]');
  for (const el of priceWraps) {
    if (isInTvSidebar(el)) continue;
    const num = parseNumber(el.textContent);
    if (num > 0) return num;
  }
  // Метод 2а: любой [class*="price"] с числом, но мимо сайдбара
  const priceEls = document.querySelectorAll('[class*="price"]');
  for (const el of priceEls) {
    if (isInTvSidebar(el)) continue;
    const text = el.textContent.trim();
    const match = text.match(/([\d,]+\.\d+)/);
    if (match) {
      const num = parseNumber(match[1]);
      if (num > 0) return num;
    }
  }
  // Метод 1б (fallback): если скип-лист отфильтровал ВСЁ — берём первый priceWrap
  // как раньше. Лучше редкий неверный matching, чем «без цены вообще».
  for (const el of priceWraps) {
    const num = parseNumber(el.textContent);
    if (num > 0) {
      console.warn('[Optioner] underlyingPrice: все priceWrap-элементы попали в скип-лист — взяли первый как fallback:', num);
      return num;
    }
  }
  // Метод 2б (fallback): любой [class*="price"] с числом
  for (const el of priceEls) {
    const text = el.textContent.trim();
    const match = text.match(/([\d,]+\.\d+)/);
    if (match) {
      const num = parseNumber(match[1]);
      if (num > 0) return num;
    }
  }
  // Метод 3: title документа
  const titleMatch = document.title.match(/([\d,]+\.\d+)/);
  if (titleMatch) return parseNumber(titleMatch[1]);
  return null;
}

// Экспирации из URL-параметра series: 20260618,20260630 → ["2026-06-18", "2026-06-30"]
function getExpirationsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const series = params.get('series');
  if (!series) return [];
  return series.split(',').map(s => {
    if (s.length === 8) {
      return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    }
    return s;
  });
}

// Текущая экспирация — первая ячейка call в первой data-row
function getCurrentExpiration() {
  const firstCell = document.querySelector('td[data-cell-id][data-cell-part="call"]');
  if (firstCell) {
    return getExpirationFromCellId(firstCell.dataset.cellId);
  }
  // Fallback: из URL
  const exps = getExpirationsFromUrl();
  return exps.length > 0 ? exps[0] : null;
}

