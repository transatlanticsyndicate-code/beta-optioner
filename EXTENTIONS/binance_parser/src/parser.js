/**
 * Парсинг данных опционов из DOM Binance eoptions
 * ЗАЧЕМ: Извлечение strike, expiration, bid/ask, IV, Greeks из таблицы Binance
 *
 * Структура страницы Binance eoptions:
 * - URL: https://www.binance.com/en/eoptions/BTCUSDT
 * - Таблица опционов содержит строки с данными Call и Put
 * - Данные Greeks и IV берутся из Binance API: eapi/v1/mark
 * - Данные bid/ask берутся из DOM таблицы или eapi/v1/ticker
 *
 * Структура символа: BTC-250117-95000-C
 * Колонки таблицы (примерная структура Binance eoptions):
 * Call side: IV | Delta | Gamma | Theta | Vega | Bid | Ask | [Strike] | Bid | Ask | IV | Delta | Gamma | Theta | Vega
 */

// Кэш Greeks/IV от API
let greeksCache = {};
let greeksCacheTime = 0;
const GREEKS_CACHE_TTL = 30000;

// Цена базового актива из API (обновляется вместе с greeksCache)
let cachedUnderlyingPrice = 0;
let cachedUnderlyingPriceAsset = '';

// Защита от IP-бана Binance API
let apiBannedUntil = 0;

// Карта страйков по экспирациям (строится из API данных)
let apiStrikesMap = {};
let apiExpirations = [];

/**
 * Выполнить fetch через background service worker
 * ЗАЧЕМ: Content script не может делать fetch к eapi.binance.com из-за CSP страницы
 */
function fetchViaBackground(url) {
  return new Promise((resolve, reject) => {
    if (!chrome.runtime?.id) {
      // Fallback: прямой fetch если extension context недоступен
      fetch(url).then(r => r.json()).then(resolve).catch(reject);
      return;
    }
    chrome.runtime.sendMessage({ action: 'fetchBinanceAPI', url }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[Binance] Background недоступен, пробуем прямой fetch:', chrome.runtime.lastError.message);
        // Fallback: прямой fetch если SW не отвечает
        fetch(url).then(r => r.json()).then(resolve).catch(reject);
        return;
      }
      if (!response || !response.success) {
        console.warn('[Binance] Background вернул ошибку:', response?.error, '| пробуем прямой fetch');
        fetch(url).then(r => r.json()).then(resolve).catch(reject);
        return;
      }
      resolve(response.data);
    });
  });
}

/**
 * Получить данные Greeks/IV от Binance API для текущего underlying
 * ЗАЧЕМ: DOM таблицы Binance не всегда содержит Greeks — берём из API
 */
async function fetchGreeksFromAPI(underlying) {
  if (Date.now() < apiBannedUntil) {
    const secsLeft = Math.ceil((apiBannedUntil - Date.now()) / 1000);
    console.warn(`[Binance] IP забанен, осталось: ${secsLeft}с`);
    return {};
  }
  try {
    const url = `https://eapi.binance.com/eapi/v1/mark?underlying=${underlying}`;
    const data = await fetchViaBackground(url);
    // Обнаруживаем IP-бан
    if (data && data.code === -1003) {
      const tsMatch = data.msg?.match(/banned until (\d+)/);
      apiBannedUntil = tsMatch ? parseInt(tsMatch[1]) : (Date.now() + 120000);
      console.error('[Binance] IP забанен Binance API! Бан до:', new Date(apiBannedUntil).toLocaleTimeString(), '|', data.msg);
      return {};
    }
    if (!Array.isArray(data)) return {};
    const cache = {};
    for (const item of data) {
      // Binance API возвращает IV как десятичную дробь (0.4526 = 45.26%, 4.4526 = 445.26%)
      // Умножаем на 100 чтобы получить проценты
      const bidIV = parseFloat(item.bidIV);
      const askIV = parseFloat(item.askIV);
      const markIV = parseFloat(item.markIV);
      cache[item.symbol] = {
        markPrice: parseFloat(item.markPrice) || 0,
        bidIV: bidIV > 0 ? bidIV * 100 : 0,
        askIV: askIV > 0 ? askIV * 100 : 0,
        markIV: markIV > 0 ? markIV * 100 : 0,
        delta: parseFloat(item.delta) || 0,
        theta: parseFloat(item.theta) || 0,
        gamma: parseFloat(item.gamma) || 0,
        vega: parseFloat(item.vega) || 0
      };
    }
    return cache;
  } catch (e) {
    console.warn('[Binance] Ошибка Greeks API:', e.message);
    return {};
  }
}

/**
 * Получить данные Ticker (bid/ask) от Binance API
 */
async function fetchTickerFromAPI(underlying) {
  if (Date.now() < apiBannedUntil) return {};
  try {
    const url = `https://eapi.binance.com/eapi/v1/ticker?underlying=${underlying}`;
    const data = await fetchViaBackground(url);
    if (data && data.code === -1003) {
      apiBannedUntil = data.bannedUntil || (Date.now() + 60000);
      return {};
    }
    if (!Array.isArray(data)) return {};
    const cache = {};
    for (const item of data) {
      cache[item.symbol] = {
        bid: parseFloat(item.bidPrice) || 0,
        ask: parseFloat(item.askPrice) || 0,
        lastPrice: parseFloat(item.lastPrice) || 0,
        volume: parseFloat(item.volume) || 0,
        strikePrice: parseFloat(item.strikePrice) || 0
      };
    }
    return cache;
  } catch (e) {
    console.warn('[Binance] Ошибка Ticker API:', e.message);
    return {};
  }
}

/**
 * Получить текущую цену базового актива через eapi/v1/index
 */
async function fetchUnderlyingPriceFromAPI(underlying) {
  if (Date.now() < apiBannedUntil) return 0;
  try {
    const url = `https://eapi.binance.com/eapi/v1/index?underlying=${underlying}`;
    const data = await fetchViaBackground(url);
    if (!data || data.code) return 0;
    const price = parseFloat(data.indexPrice);
    if (price > 0) {
      cachedUnderlyingPrice = price;
      cachedUnderlyingPriceAsset = underlying;
    }
    return price || 0;
  } catch (e) {
    console.warn('[Binance] Ошибка Index API:', e.message);
    return 0;
  }
}

/**
 * Обновить кэш Greeks (если TTL истёк)
 */
async function refreshGreeksCache(underlying) {
  const now = Date.now();
  if (now - greeksCacheTime < GREEKS_CACHE_TTL) {
    return greeksCache;
  }
  greeksCache = await fetchGreeksFromAPI(underlying);
  if (Object.keys(greeksCache).length > 0) {
    greeksCacheTime = now;
    buildStrikesMapFromCache(underlying);
    console.log('[Binance] Greeks кэш обновлён, контрактов:', Object.keys(greeksCache).length);
  }
  return greeksCache;
}

/**
 * Найти таблицу опционов на странице Binance
 * ЗАЧЕМ: Точка входа для инжекта кнопок
 *
 * Binance eoptions — React SPA. Пробуем множество стратегий.
 */
function findOptionsTable() {
  // Стратегия 1: HTML table
  const tables = document.querySelectorAll('table');
  for (const t of tables) {
    if (t.querySelectorAll('tr').length > 3) return t;
  }

  // Стратегия 2: role="table"
  const ariaTable = document.querySelector('[role="table"]');
  if (ariaTable) return ariaTable;

  // Стратегия 3: Binance-специфичные классы
  const specificSelectors = [
    '[class*="optionChain"]', '[class*="option-chain"]',
    '[class*="OptionChain"]', '[class*="chainTable"]',
    '[class*="optionTable"]', '[class*="strikeTable"]',
    '[class*="chain"][class*="wrap"]', '[class*="Chain"][class*="Wrap"]'
  ];
  for (const sel of specificSelectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }

  // Стратегия 4: Виртуализированный список
  const virtualSelectors = [
    '[class*="ReactVirtualized"]', '[class*="react-virtualized"]',
    '[class*="virtual-list"]', '[class*="VirtualList"]'
  ];
  for (const sel of virtualSelectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }

  // Стратегия 5: Ищем div-контейнер с несколькими числами-страйками среди дочерних
  const candidates = document.querySelectorAll('div');
  for (const div of candidates) {
    const children = Array.from(div.children);
    if (children.length < 5 || children.length > 200) continue;
    let strikeCount = 0;
    for (const child of children) {
      const text = child.textContent?.trim().replace(/,/g, '');
      const num = parseFloat(text);
      if (num > 1000 && num < 500000 && /^\d+(\.\d+)?$/.test(text)) strikeCount++;
    }
    if (strikeCount >= 3) return div;
  }

  return null;
}

/**
 * Получить строки таблицы опционов
 */
function getOptionRows(table) {
  if (!table) return [];

  // HTML tr строки (пропускаем заголовок)
  const trRows = table.querySelectorAll('tr');
  if (trRows.length > 0) {
    return Array.from(trRows).filter(row => row.querySelectorAll('td').length >= 3);
  }

  // ARIA rows
  const ariaRows = table.querySelectorAll('[role="row"]');
  if (ariaRows.length > 0) {
    return Array.from(ariaRows).filter(row =>
      row.querySelectorAll('[role="cell"], [role="gridcell"]').length >= 3
    );
  }

  // Дочерние div-строки (виртуализированный список Binance)
  return Array.from(table.children).filter(child => {
    if (child.tagName !== 'DIV') return false;
    const text = child.textContent?.trim();
    return text && /\d+\.\d+|\d{4,}/.test(text);
  });
}

/**
 * Получить страйк из строки таблицы
 * ЗАЧЕМ: Находим ячейку со страйком для инжекта кнопок
 *
 * Страйки Binance: BTC 10000–500000, ETH 500–10000, SOL 10–1000
 * Страйк — целое число (без дробной части) в центре строки
 */
function getStrikeFromRow(row) {
  let cells = Array.from(row.querySelectorAll('td, [role="cell"], [role="gridcell"]'));

  // Fallback: прямые дочерние div/span
  if (cells.length === 0) {
    cells = Array.from(row.children);
  }

  if (cells.length === 0) return null;

  // Проходим все ячейки, ищем целое число > 10 без дробной части
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    // Берём текст только прямых текстовых узлов (не дочерних элементов)
    let text = '';
    for (const node of cell.childNodes) {
      if (node.nodeType === 3) text += node.textContent;
    }
    text = text.trim();
    // Если прямого текста нет — берём весь textContent
    if (!text) text = cell.textContent?.trim() || '';

    const cleaned = text.replace(/,/g, '').replace(/\s/g, '');
    const num = parseFloat(cleaned);

    // Страйк: целое число > 10, без дробной части (или .0)
    if (num > 10 && Number.isInteger(num) && /^\d+(\.0+)?$/.test(cleaned)) {
      return { strike: num, cellIndex: i, cell };
    }
  }
  return null;
}

/**
 * Получить данные опциона из строки таблицы по символу
 * ЗАЧЕМ: Основная функция парсинга — берёт данные из DOM + API кэша
 *
 * @param {string} symbol - символ опциона (BTC-250117-95000-C)
 * @returns {object} - данные опциона { bid, ask, markPrice, iv, bidIV, askIV, greeks }
 */
function getOptionDataBySymbol(symbol) {
  const apiData = greeksCache[symbol] || {};

  return {
    bid: apiData.bid || 0,
    ask: apiData.ask || 0,
    markPrice: apiData.markPrice || 0,
    iv: apiData.markIV || 0,
    bidIV: apiData.bidIV || 0,
    askIV: apiData.askIV || 0,
    greeks: {
      delta: apiData.delta || 0,
      gamma: apiData.gamma || 0,
      theta: apiData.theta || 0,
      vega: apiData.vega || 0
    }
  };
}

/**
 * Получить текущую выбранную экспирацию на странице Binance
 * ЗАЧЕМ: Определить dateCode для формирования символа опциона
 *
 * Приоритеты:
 * 1. Активная кнопка/таб с датой в DOM
 * 2. Дата из URL
 * 3. Первая экспирация из API кэша (самая ближайшая)
 */
function getCurrentExpiration() {
  // Стратегия 1: Активный элемент с датой
  const activeSelectors = [
    '[class*="active"][class*="expir"]',
    '[class*="selected"][class*="expir"]',
    '[class*="expir"][aria-selected="true"]',
    '[class*="Expir"][aria-selected="true"]',
    'button[aria-selected="true"]',
    '[class*="tab"][class*="active"]',
    '[class*="Tab"][class*="active"]',
    '[class*="tab"][class*="Active"]',
    '[class*="item"][class*="active"]',
    '[class*="Item"][class*="active"]'
  ];

  for (const sel of activeSelectors) {
    const els = document.querySelectorAll(sel);
    for (const el of els) {
      const text = el.textContent?.trim();
      const dateCode = extractDateCode(text);
      if (dateCode) {
        console.log('[Binance] Экспирация из DOM:', dateCode, '| selector:', sel);
        return dateCode;
      }
    }
  }

  // Стратегия 2: Дата в URL
  const urlMatch = window.location.href.match(/expiry[=\/](\d{6,8})/i);
  if (urlMatch) {
    const code = normalizeExpDateCode(urlMatch[1]);
    if (code) {
      console.log('[Binance] Экспирация из URL:', code);
      return code;
    }
  }

  // Стратегия 3: Любая кнопка с датой (берём первую активную)
  const allButtons = document.querySelectorAll('button, [role="tab"], [role="option"]');
  for (const btn of allButtons) {
    const text = btn.textContent?.trim();
    const dateCode = extractDateCode(text);
    if (!dateCode) continue;
    const isActive =
      btn.getAttribute('aria-selected') === 'true' ||
      btn.getAttribute('aria-current') === 'true' ||
      btn.className.includes('active') ||
      btn.className.includes('Active') ||
      btn.className.includes('selected') ||
      btn.className.includes('Selected');
    if (isActive) {
      console.log('[Binance] Экспирация из активной кнопки:', dateCode);
      return dateCode;
    }
  }

  // Стратегия 4: Первая экспирация из API кэша (ближайшая)
  if (apiExpirations.length > 0) {
    console.log('[Binance] Экспирация из API кэша (первая):', apiExpirations[0]);
    return apiExpirations[0];
  }

  console.warn('[Binance] Экспирация не найдена');
  return null;
}

/**
 * Извлечь dateCode (YYMMDD) из текста
 */
function extractDateCode(text) {
  if (!text) return null;

  // Формат YYMMDD (6 цифр): 250117
  const m1 = text.match(/\b(\d{6})\b/);
  if (m1) return m1[1];

  // Формат YYYY-MM-DD: 2025-01-17
  const m2 = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return m2[1].slice(2) + m2[2] + m2[3];

  // Формат DD MMM YYYY: 17 Jan 2025
  const months = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
                   jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };
  const m3 = text.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (m3) {
    const mo = months[m3[2].toLowerCase()];
    if (mo) {
      const yy = m3[3].slice(2);
      const dd = m3[1].padStart(2, '0');
      return yy + mo + dd;
    }
  }

  return null;
}

/**
 * Нормализовать dateCode к формату YYMMDD
 */
function normalizeExpDateCode(code) {
  if (!code) return null;
  const s = String(code);
  if (s.length === 6) return s;  // уже YYMMDD
  if (s.length === 8) return s.slice(2);  // YYYYMMDD → YYMMDD
  return null;
}

/**
 * Получить underlying из текущей страницы
 */
function getCurrentUnderlying() {
  return getUnderlyingFromUrl();
}

/**
 * Получить цену базового актива из API кэша
 * Возвращает 0 если цена закэширована для другого актива
 */
function getCachedUnderlyingPrice() {
  const current = getCurrentUnderlying();
  if (cachedUnderlyingPriceAsset && cachedUnderlyingPriceAsset !== current) {
    return 0;
  }
  return cachedUnderlyingPrice;
}

/**
 * Получить список доступных экспираций из API кэша
 */
function getAvailableExpirations() {
  return apiExpirations;
}

/**
 * Дождаться определения экспирации из DOM (с retry)
 * ЗАЧЕМ: getCurrentExpiration() читает DOM — при быстрой загрузке страницы
 * таб с экспирацией может ещё не отрендериться, и мы получим неверную экспирацию
 *
 * @param {number} maxAttempts - максимум попыток (по умолчанию 10)
 * @param {number} intervalMs - интервал между попытками (по умолчанию 400мс)
 * @returns {Promise<string|null>} - dateCode или null если не нашли
 */
async function waitForExpiration(maxAttempts, intervalMs) {
  maxAttempts = maxAttempts || 10;
  intervalMs = intervalMs || 400;

  for (let i = 0; i < maxAttempts; i++) {
    // Пробуем найти экспирацию только из DOM (Стратегии 1-3), без API-фоллбека
    const domExp = getExpirationFromDomOnly();
    if (domExp) {
      if (i > 0) console.log(`[Binance] Экспирация из DOM найдена с попытки ${i + 1}:`, domExp);
      return domExp;
    }
    if (i < maxAttempts - 1) {
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }

  // Если DOM так и не дал экспирацию — используем API кэш
  const apiExp = apiExpirations.length > 0 ? apiExpirations[0] : null;
  console.warn('[Binance] waitForExpiration: DOM не дал результат, используем API:', apiExp);
  return apiExp;
}

/**
 * Получить экспирацию только из DOM (без фоллбека на API кэш)
 * ЗАЧЕМ: Используется в waitForExpiration чтобы отличить «DOM не готов» от «реально нет»
 */
function getExpirationFromDomOnly() {
  const activeSelectors = [
    '[class*="active"][class*="expir"]',
    '[class*="selected"][class*="expir"]',
    '[class*="expir"][aria-selected="true"]',
    '[class*="Expir"][aria-selected="true"]',
    'button[aria-selected="true"]',
    '[class*="tab"][class*="active"]',
    '[class*="Tab"][class*="active"]',
    '[class*="tab"][class*="Active"]',
    '[class*="item"][class*="active"]',
    '[class*="Item"][class*="active"]'
  ];

  for (const sel of activeSelectors) {
    const els = document.querySelectorAll(sel);
    for (const el of els) {
      const text = el.textContent?.trim();
      const dateCode = extractDateCode(text);
      if (dateCode) return dateCode;
    }
  }

  const urlMatch = window.location.href.match(/expiry[=\/](\d{6,8})/i);
  if (urlMatch) {
    const code = normalizeExpDateCode(urlMatch[1]);
    if (code) return code;
  }

  const allButtons = document.querySelectorAll('button, [role="tab"], [role="option"]');
  for (const btn of allButtons) {
    const text = btn.textContent?.trim();
    const dateCode = extractDateCode(text);
    if (!dateCode) continue;
    const isActive =
      btn.getAttribute('aria-selected') === 'true' ||
      btn.getAttribute('aria-current') === 'true' ||
      btn.className.includes('active') ||
      btn.className.includes('Active') ||
      btn.className.includes('selected') ||
      btn.className.includes('Selected');
    if (isActive) return dateCode;
  }

  return null;
}

/**
 * Получить список страйков для экспирации из API кэша
 */
function getStrikesForExpiration(expDateCode) {
  const strikes = apiStrikesMap[expDateCode];
  if (!strikes) return [];
  return Array.from(strikes).sort((a, b) => a - b);
}

/**
 * Построить карту страйков по экспирациям из кэша Greeks
 * ЗАЧЕМ: Знаем все доступные страйки для каждой экспирации без DOM
 */
function buildStrikesMapFromCache(underlying) {
  const base = underlying.replace('USDT', '').replace('BUSD', '');
  const strikesMap = {};
  const expirations = new Set();

  for (const symbol of Object.keys(greeksCache)) {
    const parsed = parseBinanceSymbol(symbol);
    if (!parsed || parsed.underlying !== base) continue;
    const exp = parsed.expDateCode;
    expirations.add(exp);
    if (!strikesMap[exp]) strikesMap[exp] = new Set();
    strikesMap[exp].add(parsed.strike);
  }

  apiStrikesMap = strikesMap;
  apiExpirations = Array.from(expirations).sort();
  console.log('[Binance] Экспираций из API:', apiExpirations.length, '| Первая:', apiExpirations[0]);
}

/**
 * ДИАГНОСТИКА: Вывести структуру DOM страницы для отладки
 * ЗАЧЕМ: Binance использует динамические классы — нужно найти реальные селекторы
 * Вызови в консоли: diagnoseBinanceDom()
 */
function diagnoseBinanceDom() {
  console.log('=== [Binance DOM Диагностика] ===');
  console.log('URL:', window.location.href);

  // --- API кэш ---
  console.log('--- API кэш ---');
  console.log('greeksCache контрактов:', Object.keys(greeksCache).length);
  console.log('apiExpirations:', apiExpirations);
  if (apiExpirations.length > 0) {
    console.log('Страйков для первой экспирации:', getStrikesForExpiration(apiExpirations[0]).length);
  }

  // --- findOptionsTable ---
  console.log('--- findOptionsTable ---');
  const table = findOptionsTable();
  if (table) {
    console.log('Таблица найдена:', table.tagName, '| class:', table.className.slice(0, 100));
    const rows = getOptionRows(table);
    console.log('Строк:', rows.length);
    if (rows.length > 0) {
      const strike = getStrikeFromRow(rows[0]);
      console.log('Страйк из первой строки:', strike);
    }
  } else {
    console.log('Таблица НЕ найдена');
  }

  // --- Экспирация ---
  console.log('--- Экспирация ---');
  console.log('getCurrentExpiration():', getCurrentExpiration());

  // --- HTML таблицы ---
  const tables = document.querySelectorAll('table');
  console.log('table тегов:', tables.length);
  tables.forEach((t, i) => {
    const rows = t.querySelectorAll('tr');
    console.log(`  table[${i}]: tr=${rows.length}, class="${t.className.slice(0,80)}"`);
  });

  // --- ARIA ---
  console.log('role="table":', document.querySelectorAll('[role="table"]').length);
  console.log('role="row":', document.querySelectorAll('[role="row"]').length);
  console.log('role="cell":', document.querySelectorAll('[role="cell"],[role="gridcell"]').length);

  // --- Классы с "option/chain" ---
  const optionEls = document.querySelectorAll('[class*="option"],[class*="Option"],[class*="chain"],[class*="Chain"]');
  const classSet = new Set();
  optionEls.forEach(el => {
    if (typeof el.className === 'string') {
      el.className.split(' ').forEach(c => {
        if (c.toLowerCase().includes('option') || c.toLowerCase().includes('chain')) classSet.add(c);
      });
    }
  });
  console.log('option/chain классы:', [...classSet].slice(0, 30));

  // --- Страйки в td ---
  const allCells = document.querySelectorAll('td, [role="cell"], [role="gridcell"]');
  let tdStrikeCount = 0;
  allCells.forEach(cell => {
    const text = cell.textContent?.trim().replace(/,/g, '');
    const num = parseFloat(text);
    if (num > 1000 && num < 500000 && /^\d+(\.\d+)?$/.test(text) && Number.isInteger(num)) {
      tdStrikeCount++;
      if (tdStrikeCount <= 3) {
        console.log(`  td страйк: ${num} | class: "${cell.className?.slice(0,60)}" | parent: "${cell.parentElement?.className?.slice(0,60)}"`);
      }
    }
  });
  console.log('td страйков:', tdStrikeCount);

  // --- Страйки в div (виртуализированный список) ---
  let divStrikeCount = 0;
  document.querySelectorAll('div').forEach(div => {
    if (div.children.length > 0) return;
    const text = div.textContent?.trim().replace(/,/g, '');
    const num = parseFloat(text);
    if (num > 1000 && num < 500000 && /^\d+$/.test(text)) {
      divStrikeCount++;
      if (divStrikeCount <= 5) {
        console.log(`  div страйк: ${num} | class: "${div.className?.slice(0,60)}" | parent: "${div.parentElement?.className?.slice(0,60)}" | grandparent: "${div.parentElement?.parentElement?.className?.slice(0,60)}"`);
      }
    }
  });
  console.log('div страйков:', divStrikeCount);

  // --- Кнопки с датами (экспирации) ---
  let dateButtonCount = 0;
  document.querySelectorAll('button, [role="tab"], [role="option"]').forEach(btn => {
    const code = extractDateCode(btn.textContent?.trim());
    if (code) {
      dateButtonCount++;
      if (dateButtonCount <= 5) {
        const active = btn.getAttribute('aria-selected') === 'true' || btn.className.includes('active') || btn.className.includes('Active');
        console.log(`  Кнопка даты: ${code} | active:${active} | class: "${btn.className?.slice(0,60)}"`);
      }
    }
  });
  console.log('Кнопок с датами:', dateButtonCount);

  console.log('=== Конец диагностики ===');
}

// Делаем функцию доступной глобально для вызова из консоли
window.diagnoseBinanceDom = diagnoseBinanceDom;

console.log('[Binance] parser.js загружен. Для диагностики DOM вызови: diagnoseBinanceDom()');
