/**
 * Background Module: DbConfig Auto-Refresh
 * ЗАЧЕМ: Автоматическое обновление цены и Fact IV при загрузке
 * сохранённой конфигурации калькулятора (?dbConfig=...).
 *
 * Источник: handoff_calc_team_refresh / extension_source / background / dbConfigRefresh.js
 * (перенесено из расширения коллег twparser v38.1.0 без изменений).
 *
 * Экспортирует в общий SW-scope:
 *   buildTvOptionsUrl, waitForTvOptionsTable, escapeHtml,
 *   readCalcOptionsFromReact, updateCurrentPriceViaReact, updateCalcOptionsViaReact,
 *   autoRefreshDbConfig, executeDbConfigRefresh, checkDbConfigOverlayCommands,
 *   showDbConfigOverlay, writeStatusToCalculator, sendPrIVToCalc.
 *
 * Зависит от: refreshHelpers.js (delay, waitForPageLoad, ensureContentScriptLoaded),
 * pendingParser.js (parseTvOptionRow).
 */

// ЗАЧЕМ: Map вместо Set — хранит timestamp, чтобы разрешить повторный refresh
// после reload страницы (при reload tabId не меняется, но пользователь ожидает новый цикл).
// Очистка записей этой мапы происходит в calcTabRouter.js на tabs.onUpdated —
// без неё F5 страницы не показывает оверлей повторно.
const _processedTabs = new Map();

/**
 * Сбросить дедуп оверлея для конкретной вкладки.
 * ЗАЧЕМ: При F5 / навигации на калькуляторе пользователь ждёт, что вопрос
 * «Обновить?» появится снова. tabId при F5 не меняется, поэтому без явного
 * сброса ключ `${tabId}_${dbConfigId}` остаётся в мапе и оверлей пропускается.
 * Вызывается из calcTabRouter.js при tabs.onUpdated (status='complete').
 */
function clearDbConfigOverlayDedupe(calcTabId) {
  const prefix = calcTabId + '_';
  for (const key of _processedTabs.keys()) {
    if (key.startsWith(prefix)) {
      _processedTabs.delete(key);
    }
  }
}

// Маппинг тикеров на exchanges (дублирует panel.js для background контекста)
// ЗАЧЕМ: panel.js — content script, недоступен в background. При добавлении
// новых тикеров в panel.js нужно обновлять и здесь.
const DB_TICKER_EXCHANGE_MAP = {
  'TSLA': 'NASDAQ', 'NVDA': 'NASDAQ', 'QQQ': 'NASDAQ', 'AAPL': 'NASDAQ',
  'MSFT': 'NASDAQ', 'AMZN': 'NASDAQ', 'GOOGL': 'NASDAQ', 'META': 'NASDAQ',
  'AMD': 'NASDAQ', 'INTC': 'NASDAQ', 'NFLX': 'NASDAQ', 'PYPL': 'NASDAQ',
  'SPY': 'AMEX', 'IWM': 'AMEX', 'DIA': 'AMEX',
  'SPOT': 'NYSE', 'HUBS': 'NYSE', 'SAP': 'NYSE',
  'NIFTY': 'NSE', 'BANKNIFTY': 'NSE'
};

// Кэш бирж, определённых через поиск TradingView (тикер → биржа).
// ЗАЧЕМ: не дёргать поиск повторно в течение жизни service worker.
const _resolvedExchangeCache = new Map();

/**
 * Определить биржу для тикера.
 * ЗАЧЕМ: раньше для тикеров не из встроенного списка в адрес уходил «голый»
 * символ (?symbol=SAP). TradingView в нашем регионе (Панама) разрешает голый
 * символ на европейский листинг (напр. XETR:SAP), где опционов нет → пустая
 * доска / страница 404. Мы торгуем только на американских биржах, поэтому для
 * незнакомого тикера спрашиваем у поиска TradingView американский листинг и
 * берём его биржу.
 * @returns {Promise<string|null>} биржа (NYSE/NASDAQ/…) или null, если не нашли
 */
async function resolveTickerExchange(ticker) {
  if (!ticker) return null;

  // 1. Быстрый путь: встроенная таблица известных тикеров
  if (DB_TICKER_EXCHANGE_MAP[ticker]) return DB_TICKER_EXCHANGE_MAP[ticker];

  // 2. Фьючерсные паттерны (тоже американские биржи)
  for (const { pattern, exchange } of DB_TICKER_PATTERNS) {
    if (pattern.test(ticker)) return exchange;
  }

  // 3. Ранее разрешённое в этой сессии
  if (_resolvedExchangeCache.has(ticker)) return _resolvedExchangeCache.get(ticker);

  // 4. Спрашиваем у поиска TradingView американский листинг
  try {
    const url = 'https://symbol-search.tradingview.com/symbol_search/v3/?text='
      + encodeURIComponent(ticker) + '&hl=0&exchange=&lang=en&search_type=undefined&domain=production';
    const resp = await fetch(url);
    if (resp.ok) {
      const data = await resp.json();
      const list = Array.isArray(data.symbols) ? data.symbols : [];
      const cleaned = list.map(s => ({
        sym: String(s.symbol || '').replace(/<[^>]+>/g, '').toUpperCase(),
        // ЗАЧЕМ: код биржи для URL — это prefix/source_id (напр. "AMEX"), а НЕ отображаемое
        // имя exchange (напр. "NYSE Arca" с пробелом — в адресе оно не работает).
        code: s.prefix || s.source_id || s.exchange,
        country: s.country,
        type: s.type
      }));
      // Берём только американский листинг обычной акции / ADR / фонда (ETF).
      // ЗАЧЕМ: индексные и CFD-фиды (напр. SPCFD для SPX) для доски опционов не годятся —
      // если подходящего листинга нет, лучше вернуть null (голый символ), чем открыть не то.
      const preferred = cleaned.find(s =>
        s.sym === ticker.toUpperCase() && s.country === 'US' && s.code
        && ['stock', 'dr', 'fund'].includes(s.type));
      if (preferred && preferred.code) {
        _resolvedExchangeCache.set(ticker, preferred.code);
        console.log('[TVC DbConfig] Биржа для', ticker, '→', preferred.code);
        return preferred.code;
      }
    }
  } catch (e) {
    console.warn('[TVC DbConfig] Не удалось определить биржу для', ticker, e);
  }

  // 5. Не нашли — последний резерв: голый символ (пусть TradingView решает сам)
  return null;
}

const DB_TICKER_PATTERNS = [
  { pattern: /^6[ABCEJMNRS][A-Z]\d+$/, exchange: 'CME' },
  { pattern: /^BTC[A-Z]\d+$/, exchange: 'CME' },
  { pattern: /^ETH[A-Z]\d+$/, exchange: 'CME' },
  { pattern: /^M(ES|NQ|RTY)[A-Z]\d+$/, exchange: 'CME_MINI' },
  { pattern: /^MYM[A-Z]\d+$/, exchange: 'CBOT' },
  { pattern: /^(ES|NQ|RTY)[A-Z]\d+$/, exchange: 'CME_MINI' },
  { pattern: /^YM[A-Z]\d+$/, exchange: 'CBOT' },
  { pattern: /^(GC|SI|HG|PL|PA)[A-Z]\d+$/, exchange: 'COMEX' },
  { pattern: /^(CL|NG|RB|HO)[A-Z]\d+$/, exchange: 'NYMEX' },
  { pattern: /^(ZC|ZS|ZW|ZM|ZL)[A-Z]\d+$/, exchange: 'CBOT' }
];

/**
 * Построить URL TradingView для тикера (background-версия)
 * @returns {Promise<string|null>} URL или null если тикер пустой
 */
async function buildTvOptionsUrl(ticker, options = []) {
  if (!ticker) return null;

  // ЗАЧЕМ: Всегда query-based URL (?symbol=EXCHANGE:TICKER).
  // Path-формат (/chain/EXCHANGE-TICKER/) редиректит и теряет query-параметры.
  // Биржу определяем через resolveTickerExchange: встроенный список → фьючерсные
  // паттерны → поиск американского листинга у TradingView.
  const exchange = await resolveTickerExchange(ticker);

  const symbol = exchange ? `${exchange}%3A${ticker}` : ticker;
  let baseUrl = `https://www.tradingview.com/options/chain/?symbol=${symbol}`;

  // ЗАЧЕМ: TradingView виртуализирует таблицу — рендерит только видимые строки.
  // Передаём точные экспирации (series) и диапазон страйков (strikes),
  // чтобы нужные опционы оказались на экране и были доступны парсеру.
  if (options.length > 0) {
    // Уникальные даты экспираций в формате YYYYMMDD, через запятую
    const uniqueDates = [...new Set(
      options.map(o => o.date).filter(Boolean).map(d => d.replace(/-/g, ''))
    )].sort();
    const seriesParam = encodeURIComponent(uniqueDates.join(','));

    // Точный список страйков через запятую — без лишних строк в таблице
    const uniqueStrikes = [...new Set(
      options.map(o => Number(o.strike)).filter(n => !isNaN(n))
    )].sort((a, b) => a - b);
    const strikesParam = uniqueStrikes.join(',');

    baseUrl += `&series=${seriesParam}&strikes=${strikesParam}`;
  }

  return baseUrl;
}

/**
 * Ждём появления таблицы опционов на TV через polling DOM
 * ЗАЧЕМ: TV — SPA, таблица рендерится позже page load. Polling надёжнее чем delay.
 *
 * @param {string[]} expectedPrefixes - префиксы секций нужных экспираций ("June 20", …).
 *   Если переданы — дополнительно ждём, пока отрисуется хотя бы одна из них, а не
 *   просто «какая-то» таблица. На холодной вкладке без этого парсер уходил по пустым
 *   строкам и в калькулятор не попадало ничего.
 */
async function waitForTvOptionsTable(tabId, timeoutMs = 30000, expectedPrefixes = []) {
  const POLL_INTERVAL = 1000;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (prefixes) => {
          // Ищем маркеры загруженной таблицы опционов TV.
          // ВАЖНО: priceWrap- (с дефисом) — это цена в чейне страницы; priceWrapper- (с -er)
          // — цена в правом виджет-баре (watchlist), которая отрисовывается раньше чейна.
          // Требуем И таблицу опционов, И чейновую цену: без второго условия SPA отдаёт «готово»
          // когда страйки уже есть, а шапка ещё пустая, и парсер уходит с null. Из-за этого
          // первый клик «Да, обновить» после свежего открытия TV не доносил цену до калькулятора.
          const hasTable = document.querySelectorAll('td[class*="td-"]').length > 5;
          const hasPriceWrap = !!document.querySelector('[class*="priceWrap-"]');
          if (!hasTable || !hasPriceWrap) return false;

          // ЗАЧЕМ: убеждаемся, что отрисована хотя бы одна из запрошенных секций-экспираций.
          // Иначе таблица «есть», а нужных строк ещё нет → парсер вернёт null по всем опционам.
          if (prefixes && prefixes.length > 0) {
            const groupCells = document.querySelectorAll('[class*="groupCell"]');
            let sectionReady = false;
            for (const gc of groupCells) {
              const t = (gc.textContent || '').trim();
              if (prefixes.some(p => t.startsWith(p))) { sectionReady = true; break; }
            }
            if (!sectionReady) return false;
          }
          return true;
        },
        args: [expectedPrefixes]
      });
      if (results?.[0]?.result) {
        console.log('[TVC DbConfig] TV таблица загружена');
        return true;
      }
    } catch (e) {
      return false;
    }
    await delay(POLL_INTERVAL);
  }
  console.log('[TVC DbConfig] Timeout ожидания таблицы TV');
  return false;
}

/**
 * Префиксы секций экспираций ("June 20", …) для опционов конфигурации.
 * ЗАЧЕМ: TradingView группирует строки по экспирации с заголовком вида "June 20".
 * Используется и для проверки готовности таблицы, и для скролла к секции.
 */
function _expirationPrefixes(options = []) {
  const monthNames = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
  const set = new Set();
  for (const o of (options || [])) {
    if (!o || !o.date) continue;
    const dc = String(o.date).replace(/-/g, '');
    if (dc.length < 8) continue;
    const m = parseInt(dc.substring(4, 6), 10);
    const d = parseInt(dc.substring(6, 8), 10);
    if (!m || !d) continue;
    set.add(monthNames[m - 1] + ' ' + d);
  }
  return [...set];
}

/**
 * Экранирование строки для безопасной вставки в HTML
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[<>&"']/g, c => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/**
 * Читаем данные опционов из React state калькулятора через fiber tree
 * ЗАЧЕМ: Калькулятор при загрузке dbConfig хранит данные в React state,
 * а не в localStorage. Единственный способ их получить — обойти React fiber.
 *
 * Двухшаговый bridge: MAIN world пишет в localStorage, ISOLATED world читает.
 * ЗАЧЕМ: chrome.scripting.executeScript с world:'MAIN' не возвращает результат
 * обратно в Service Worker (ограничение Chrome MV3).
 */
async function readCalcOptionsFromReact(calcTabId) {
  const BRIDGE_KEY = '_tvc_react_bridge';

  // Шаг 1: MAIN world — читаем React fiber и записываем в localStorage
  await chrome.scripting.executeScript({
    target: { tabId: calcTabId },
    world: 'MAIN',
    func: (bridgeKey) => {
      try {
        const root = document.getElementById('root');
        if (!root) { localStorage.setItem(bridgeKey, 'null'); return; }

        const containerKey = Object.keys(root).find(k => k.startsWith('__reactContainer'));
        if (!containerKey) { localStorage.setItem(bridgeKey, 'null'); return; }

        const container = root[containerKey];
        let found = null;

        function traverse(node, depth) {
          if (!node || depth > 40 || found) return;

          if (node.memoizedProps?.selectedTicker && node.memoizedProps?.options?.length > 0) {
            const props = node.memoizedProps;
            found = {
              ticker: props.selectedTicker,
              currentPrice: props.currentPrice,
              options: props.options.map(o => ({
                id: o.id,
                type: o.type,
                strike: o.strike,
                date: o.date,
                ticker: o.ticker,
                bid: o.bid,
                ask: o.ask,
                impliedVolatility: o.impliedVolatility,
                manualIvOverride: o.manualIvOverride
              }))
            };
            return;
          }

          if (node.child) traverse(node.child, depth + 1);
          if (node.sibling) traverse(node.sibling, depth + 1);
        }

        traverse(container, 0);
        localStorage.setItem(bridgeKey, JSON.stringify(found));
      } catch (e) {
        localStorage.setItem(bridgeKey, 'null');
      }
    },
    args: [BRIDGE_KEY]
  });

  // Небольшая пауза чтобы localStorage успел записаться
  await delay(100);

  // Шаг 2: ISOLATED world — читаем из localStorage и удаляем bridge-ключ
  const results = await chrome.scripting.executeScript({
    target: { tabId: calcTabId },
    func: (bridgeKey) => {
      const data = localStorage.getItem(bridgeKey);
      localStorage.removeItem(bridgeKey);
      if (!data || data === 'null') return null;
      try { return JSON.parse(data); } catch (e) { return null; }
    },
    args: [BRIDGE_KEY]
  });

  return results?.[0]?.result;
}

/**
 * Обновить опционы в калькуляторе через React-функцию onUpdateOption
 * ЗАЧЕМ: Калькулятор принимает обновления только через onUpdateOption(id, field, value),
 * который обновляет React state + записывает в localStorage
 */
/**
 * Обновить currentPrice в калькуляторе через React state dispatch
 * ЗАЧЕМ: currentPrice на панели не обновляется через onUpdateOption —
 * нужен прямой dispatch в React useState hook
 */
async function updateCurrentPriceViaReact(calcTabId, newPrice) {
  const BRIDGE_KEY = '_tvc_price_bridge';

  await chrome.scripting.executeScript({
    target: { tabId: calcTabId },
    world: 'MAIN',
    func: (newPrice, bridgeKey) => {
      try {
        const root = document.getElementById('root');
        if (!root) { localStorage.setItem(bridgeKey, JSON.stringify({ error: 'no root' })); return; }
        const containerKey = Object.keys(root).find(k => k.startsWith('__reactContainer'));
        if (!containerKey) { localStorage.setItem(bridgeKey, JSON.stringify({ error: 'no container' })); return; }
        const container = root[containerKey];
        let dispatched = false;
        let nodesChecked = 0;
        let priceProps = [];

        function traverse(node, depth) {
          if (!node || depth > 50 || dispatched) return;
          nodesChecked++;
          const props = node.memoizedProps;

          // Метод 1: dispatch через useState hook, совпадающий с ценовым props
          if (props && node.memoizedState) {
            const priceVal = props.currentPrice || props.underlyingPrice;
            if (typeof priceVal === 'number' && priceVal > 0) {
              priceProps.push({ depth, priceVal, type: props.currentPrice ? 'currentPrice' : 'underlyingPrice' });
              let state = node.memoizedState;
              let idx = 0;
              while (state && idx < 30) {
                const val = state.queue?.lastRenderedState ?? state.memoizedState;
                if (typeof val === 'number' && val > 0 && state.queue?.dispatch) {
                  if (Math.abs(val - priceVal) < 0.01) {
                    state.queue.dispatch(newPrice);
                    dispatched = true;
                    return;
                  }
                }
                state = state.next;
                idx++;
              }
            }
          }

          // Метод 2: callback setCurrentPrice / onPriceChange в props
          if (!dispatched && props) {
            const setter = props.setCurrentPrice || props.onPriceChange || props.setUnderlyingPrice;
            if (typeof setter === 'function') {
              setter(newPrice);
              dispatched = true;
              return;
            }
          }

          // Метод 3: поиск по паттерну hooks — узел без props, но с ticker-строкой
          // и числовым currentPrice в useState. Калькулятор хранит state в hooks:
          // hook ~14 = ticker (строка 2-10 символов), hook ~19 = currentPrice (число > 0)
          if (!dispatched && node.memoizedState) {
            let state = node.memoizedState;
            let idx = 0;
            let foundTicker = false;
            let priceState = null;
            let priceIdx = -1;
            while (state && idx < 40) {
              const val = state.queue?.lastRenderedState ?? state.memoizedState;
              // Ищем ticker-строку (2-10 символов, заглавные буквы)
              if (typeof val === 'string' && val.length >= 2 && val.length <= 10 && /^[A-Z]+$/.test(val) && state.queue?.dispatch) {
                foundTicker = true;
              }
              // Ищем числовой price после ticker (не слишком далеко)
              if (foundTicker && typeof val === 'number' && val > 1 && val < 1000000 && state.queue?.dispatch && !priceState) {
                priceState = state;
                priceIdx = idx;
              }
              state = state.next;
              idx++;
            }
            if (foundTicker && priceState) {
              priceProps.push({ depth, method: 3, hookIdx: priceIdx });
              priceState.queue.dispatch(newPrice);
              dispatched = true;
              return;
            }
          }

          if (node.child) traverse(node.child, depth + 1);
          if (node.sibling) traverse(node.sibling, depth + 1);
        }

        traverse(container, 0);
        localStorage.setItem(bridgeKey, JSON.stringify({
          success: dispatched, newPrice, nodesChecked,
          priceProps: priceProps.slice(0, 5)
        }));
      } catch (e) {
        localStorage.setItem(bridgeKey, JSON.stringify({ error: e.message }));
      }
    },
    args: [newPrice, BRIDGE_KEY]
  });

  await delay(200);

  const results = await chrome.scripting.executeScript({
    target: { tabId: calcTabId },
    func: (bridgeKey) => {
      const data = localStorage.getItem(bridgeKey);
      localStorage.removeItem(bridgeKey);
      if (!data) return { error: 'no bridge' };
      try { return JSON.parse(data); } catch (e) { return { error: 'parse error' }; }
    },
    args: [BRIDGE_KEY]
  });

  return results?.[0]?.result;
}

/**
 * Обновить опционы в калькуляторе через React-функцию onUpdateOption
 * Двухшаговый bridge: MAIN world вызывает React, пишет результат в localStorage
 */
async function updateCalcOptionsViaReact(calcTabId, updates) {
  const BRIDGE_KEY = '_tvc_update_bridge';

  // MAIN world — вызываем onUpdateOption и записываем результат в localStorage
  await chrome.scripting.executeScript({
    target: { tabId: calcTabId },
    world: 'MAIN',
    func: (updates, bridgeKey) => {
      try {
        const root = document.getElementById('root');
        if (!root) { localStorage.setItem(bridgeKey, JSON.stringify({ error: 'no root' })); return; }

        const containerKey = Object.keys(root).find(k => k.startsWith('__reactContainer'));
        if (!containerKey) { localStorage.setItem(bridgeKey, JSON.stringify({ error: 'no container' })); return; }

        const container = root[containerKey];
        let updateFn = null;

        function traverse(node, depth) {
          if (!node || depth > 40 || updateFn) return;
          if (node.memoizedProps?.onUpdateOption) {
            updateFn = node.memoizedProps.onUpdateOption;
            return;
          }
          if (node.child) traverse(node.child, depth + 1);
          if (node.sibling) traverse(node.sibling, depth + 1);
        }

        traverse(container, 0);

        if (!updateFn) {
          localStorage.setItem(bridgeKey, JSON.stringify({ error: 'onUpdateOption not found' }));
          return;
        }

        let updatedCount = 0;
        for (const upd of updates) {
          for (const [field, value] of Object.entries(upd.fields)) {
            updateFn(upd.id, field, value);
          }
          updatedCount++;
        }

        localStorage.setItem(bridgeKey, JSON.stringify({ success: true, updatedCount }));
      } catch (e) {
        localStorage.setItem(bridgeKey, JSON.stringify({ error: e.message }));
      }
    },
    args: [updates, BRIDGE_KEY]
  });

  await delay(200);

  // ISOLATED world — читаем результат
  const results = await chrome.scripting.executeScript({
    target: { tabId: calcTabId },
    func: (bridgeKey) => {
      const data = localStorage.getItem(bridgeKey);
      localStorage.removeItem(bridgeKey);
      if (!data) return { error: 'no bridge data' };
      try { return JSON.parse(data); } catch (e) { return { error: 'parse error' }; }
    },
    args: [BRIDGE_KEY]
  });

  return results?.[0]?.result;
}

/**
 * Передать данные из оверлея сравнения в калькулятор
 * ЗАЧЕМ: Вызывается из content script TV по кнопке «Передать в калькулятор».
 * Обновляет manualIvOverride и цену через React fiber.
 */
async function handleTransferToCalc(data) {
  try {
    // Валидация входных данных
    if (!data || !Array.isArray(data.options)) {
      return { success: false, error: 'Некорректные данные' };
    }
    if (data.currentPrice != null && (typeof data.currentPrice !== 'number' || data.currentPrice <= 0)) {
      return { success: false, error: 'Некорректная цена' };
    }

    // Находим вкладку калькулятора с dbConfig
    const calcTabs = await chrome.tabs.query({
      url: ['https://beta.optioner.online/*', 'http://localhost:3000/*']
    });
    const calcTab = calcTabs.find(t => t.url?.includes('dbConfig='));
    if (!calcTab) {
      return { success: false, error: 'Вкладка калькулятора не найдена' };
    }

    const calcTabId = calcTab.id;

    // ЗАЧЕМ: Валидация — только опционы с числовым IV в разумном диапазоне
    const ivUpdates = (data.options || [])
      .filter(opt => typeof opt.newIV === 'number' && !isNaN(opt.newIV) && opt.newIV > 0 && opt.newIV < 500)
      .map(opt => ({ strike: opt.strike, type: opt.type, date: opt.date, newIV: opt.newIV }));

    // ЗАЧЕМ: Записываем IV в input Fact IV + цену через симуляцию ввода.
    // world:'MAIN' не возвращает результат в SW (ограничение Chrome MV3),
    // поэтому используем bridge через localStorage.
    const BRIDGE_KEY = '_tvc_transfer_bridge';

    await chrome.scripting.executeScript({
      target: { tabId: calcTabId },
      world: 'MAIN',
      func: (ivUpdates, newPrice, bridgeKey) => {
        try {
          const FACT_IV_COL = 9;
          let updatedCount = 0;

          const allDivs = document.querySelectorAll('div');
          const dataRows = [];
          for (const div of allDivs) {
            if (div.children.length >= 12) {
              const text = div.children[1]?.textContent?.trim() || '';
              if (/^(Buy|Sell)(CALL|PUT)/.test(text)) {
                dataRows.push(div);
              }
            }
          }

          for (const row of dataRows) {
            const typeText = row.children[1]?.textContent?.trim() || '';
            const type = typeText.includes('CALL') ? 'CALL' : 'PUT';
            const strikeEl = row.children[3];
            const strikeText = strikeEl?.value || strikeEl?.querySelector('input')?.value || strikeEl?.textContent?.trim() || '';
            const strike = parseFloat(strikeText.replace(/[^0-9.]/g, ''));
            if (!strike || isNaN(strike)) continue;

            const update = ivUpdates.find(u => u.type === type && Math.abs(u.strike - strike) < 0.5);
            if (!update) continue;

            const factIvCell = row.children[FACT_IV_COL];
            const input = factIvCell?.tagName === 'INPUT' ? factIvCell : factIvCell?.querySelector('input');
            if (!input) continue;

            // ЗАЧЕМ: React controlled inputs игнорируют нативные events.
            // Вызываем onChange напрямую через __reactProps.
            const rpKey = Object.keys(input).find(k => k.startsWith('__reactProps'));
            const rp = rpKey ? input[rpKey] : null;
            if (rp?.onChange) {
              rp.onChange({ target: { value: String(update.newIV) } });
            } else {
              // Fallback: нативный setter + event
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
              setter.call(input, String(update.newIV));
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
            updatedCount++;
          }

          let priceUpdated = false;
          if (newPrice) {
            const inputs = document.querySelectorAll('input[type="number"]');
            for (const inp of inputs) {
              const val = parseFloat(inp.value);
              if (val > 10 && val < 1000000) {
                const rpKey = Object.keys(inp).find(k => k.startsWith('__reactProps'));
                const rp = rpKey ? inp[rpKey] : null;
                if (rp?.onChange) {
                  rp.onChange({ target: { value: String(newPrice) } });
                } else {
                  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                  setter.call(inp, String(newPrice));
                  inp.dispatchEvent(new Event('input', { bubbles: true }));
                  inp.dispatchEvent(new Event('change', { bubbles: true }));
                }
                priceUpdated = true;
                break;
              }
            }
          }

          localStorage.setItem(bridgeKey, JSON.stringify({ updatedCount, priceUpdated }));
        } catch (e) {
          localStorage.setItem(bridgeKey, JSON.stringify({ error: e.message }));
        }
      },
      args: [ivUpdates, data.currentPrice || null, BRIDGE_KEY]
    });

    await delay(200);

    // ISOLATED world — читаем результат из localStorage
    const bridgeResults = await chrome.scripting.executeScript({
      target: { tabId: calcTabId },
      func: (bridgeKey) => {
        const data = localStorage.getItem(bridgeKey);
        localStorage.removeItem(bridgeKey);
        if (!data) return { error: 'no bridge data' };
        try { return JSON.parse(data); } catch (e) { return { error: 'parse error' }; }
      },
      args: [BRIDGE_KEY]
    });

    const result = bridgeResults?.[0]?.result || {};
    console.log('[TVC Transfer] Результат:', result);

    return {
      success: !result.error,
      updatedCount: result.updatedCount || 0,
      priceUpdated: result.priceUpdated || false,
      error: result.error
    };
  } catch (e) {
    console.error('[TVC Transfer] Ошибка:', e);
    return { success: false, error: 'Ошибка передачи данных' };
  }
}

/**
 * Главная функция: автообновление при загрузке dbConfig
 */
async function autoRefreshDbConfig(calcTabId, url, attempt = 1) {
  // ЗАЧЕМ: Сначала проверяем команды от оверлеев — каждый alarm даёт шанс
  // запустить refresh по подтверждению пользователя (без блокирующего polling)
  await checkDbConfigOverlayCommands(calcTabId);

  const dbConfigMatch = url.match(/dbConfig=([^&]+)/);
  const dbConfigId = dbConfigMatch ? dbConfigMatch[1] : 'unknown';

  // ЗАЧЕМ: Один dbConfig = один оверлей. Повторно не показываем.
  const tabKey = `${calcTabId}_${dbConfigId}`;
  if (_processedTabs.has(tabKey)) {
    return;
  }

  await _autoRefreshDbConfigInner(calcTabId, url, dbConfigId, tabKey, attempt);
}

/**
 * Внутренняя логика: показать оверлей пользователю (без блокирующего ожидания)
 */
async function _autoRefreshDbConfigInner(calcTabId, url, dbConfigId, tabKey, attempt) {
  const MAX_ATTEMPTS = 3;
  const RETRY_WAIT_MS = [0, 3000, 4000];

  console.log(`[TVC DbConfig] Попытка ${attempt}/${MAX_ATTEMPTS} для конфига:`, dbConfigId);

  try {
    // Проверяем вкладку
    const tab = await chrome.tabs.get(calcTabId).catch(() => null);
    if (!tab || !tab.url?.includes('dbConfig=')) {
      console.log('[TVC DbConfig] Вкладка закрыта или URL изменился');
      return;
    }

    // Читаем данные из React state калькулятора
    const configData = await readCalcOptionsFromReact(calcTabId);

    if (!configData || !configData.options?.length) {
      if (attempt < MAX_ATTEMPTS) {
        const nextDelay = RETRY_WAIT_MS[attempt];
        console.log(`[TVC DbConfig] Данные ещё не загружены, повтор через ${nextDelay}мс`);
        await delay(nextDelay);
        return _autoRefreshDbConfigInner(calcTabId, url, dbConfigId, tabKey, attempt + 1);
      }
      console.log('[TVC DbConfig] Данные не загружены после всех попыток');
      return;
    }

    if (!configData.ticker) {
      console.log('[TVC DbConfig] Тикер не определён');
      return;
    }

    // ЗАЧЕМ: Крипто-USDT-пары (BTCUSDT, ETHUSDT, …) обрабатывает Binance-расширение.
    // Без этой проверки TV покажет свой оверлей на BTCUSDT и при подтверждении
    // откроет TradingView с 404. _processedTabs НЕ помечаем — иначе при следующем
    // alarm-цикле состояние залипнет, если конфиг внезапно сменится на TV-тикер.
    if (_isCryptoUsdtTicker(configData.ticker)) {
      return;
    }

    console.log('[TVC DbConfig] Данные загружены:', configData.ticker, configData.options.length, 'опционов');

    // Помечаем вкладку ДО показа оверлея — чтобы повторный alarm не создал дубль,
    // пока пользователь не закрыл/подтвердил оверлей
    _processedTabs.set(tabKey, Date.now());

    // Показываем оверлей и сразу возвращаемся — ответ придёт через localStorage при следующем alarm
    await showDbConfigOverlay(calcTabId, configData.ticker, configData.options.length, dbConfigId, configData);
    return;

  } catch (e) {
    console.error('[TVC DbConfig] Ошибка показа оверлея:', e);
    try {
      await writeStatusToCalculator(calcTabId, 'error', 0, e.message);
    } catch (_) {}
  }
}

/**
 * Выполнить обновление данных с TradingView после подтверждения пользователем
 * ЗАЧЕМ: Вынесено из _autoRefreshDbConfigInner — вызывается асинхронно по команде
 * из localStorage (оверлей записывает tvc_dbconfig_refresh_<id> при клике «Да»)
 */
async function executeDbConfigRefresh(calcTabId, configData) {
  // ЗАЧЕМ: Мьютекс — только один refresh за раз, иначе два калькулятора
  // конкурируют за одну TV-вкладку и данные перемешиваются
  if (executeDbConfigRefresh._inProgress) {
    console.log('[TVC DbConfig] Refresh уже выполняется, пропускаем');
    return;
  }
  executeDbConfigRefresh._inProgress = true;

  try {
    console.log('[TVC DbConfig] Пользователь подтвердил обновление:', configData.ticker);

    // ЗАЧЕМ: dbConfigId привязывает команду sendPrIV_tocallc к конкретной вкладке,
    // чтобы другие вкладки калькулятора не применили чужую цену
    const calcTab = await chrome.tabs.get(calcTabId).catch(() => null);
    const dbConfigMatch = calcTab?.url?.match(/dbConfig=([^&]+)/);
    const dbConfigId = dbConfigMatch ? dbConfigMatch[1] : null;

    // ЗАЧЕМ: Передаём полный массив опционов, чтобы вычислить точные экспирации
    // и диапазон страйков — TradingView виртуализирует таблицу, нужны точные параметры.
    const tvUrl = await buildTvOptionsUrl(configData.ticker, configData.options);
    if (!tvUrl) {
      await writeStatusToCalculator(calcTabId, 'error', 0, 'Не удалось определить URL TradingView');
      return;
    }

    let tvTabs = await chrome.tabs.query({ url: '*://*.tradingview.com/options/*' });

    if (tvTabs.length === 0) {
      console.log('[TVC DbConfig] Открываем TradingView:', tvUrl);
      await writeStatusToCalculator(calcTabId, 'collecting', 0, 'Открытие TradingView...');
      const newTab = await chrome.tabs.create({ url: tvUrl, active: true });
      await waitForPageLoad(newTab.id, 30000);
    } else {
      // ЗАЧЕМ: Всегда навигируем на правильный URL — старая вкладка может показывать
      // другой тикер или не покрывать нужные экспирации (series_date_to).
      const existingUrl = tvTabs[0].url || '';
      if (existingUrl !== tvUrl) {
        console.log('[TVC DbConfig] Навигируем TV на правильный URL:', tvUrl);
        await chrome.tabs.update(tvTabs[0].id, { url: tvUrl, active: true });
        await waitForPageLoad(tvTabs[0].id, 30000);
      } else {
        console.log('[TVC DbConfig] TV вкладка уже на правильном URL');
      }
    }

    // Обновляем список вкладок после возможной навигации
    tvTabs = await chrome.tabs.query({ url: '*://*.tradingview.com/options/*' });
    if (tvTabs.length === 0) {
      await writeStatusToCalculator(calcTabId, 'error', 0, 'Вкладка TradingView не открылась');
      return;
    }

    // === АВТО-ПОВТОР СБОРА ДАННЫХ ===========================================
    // ЗАЧЕМ: «второй клик» пользователя превращаем в автоматический повтор.
    // Холодная (только что открытая) вкладка TradingView часто не успевает
    // отрисовать таблицу/цену/строки за одну попытку — раньше тут срабатывал ранний
    // return ДО sendPrIVToCalc, и в калькулятор не уходило НИЧЕГО (даже цена). Помогал
    // только повторный заход на уже прогретую вкладку. Теперь повтор делаем сами.

    // Скролл к секции нужной экспирации (инжектится в страницу TradingView).
    const scrollToSectionFn = (optDate) => {
      const monthNames = ['January','February','March','April','May','June',
                           'July','August','September','October','November','December'];
      const dc = optDate.replace(/-/g, '');
      const prefix = monthNames[parseInt(dc.substring(4, 6), 10) - 1] + ' ' + parseInt(dc.substring(6, 8), 10);
      for (const tr of document.querySelectorAll('tr')) {
        const gc = tr.querySelector('[class*="groupCell"]');
        if (gc && gc.textContent?.trim().startsWith(prefix)) {
          tr.scrollIntoView({ block: 'start', behavior: 'instant' });
          break;
        }
      }
    };

    // Парсер одной строки опциона (инжектится в страницу TradingView).
    // ЗАЧЕМ: вынесен в const, чтобы переиспользовать при повторных тиках ожидания строки.
    const parseRowFn = (optDate, optStrike, optType) => {
          const monthNames = ['January','February','March','April','May','June',
                               'July','August','September','October','November','December'];
          const dc = optDate.replace(/-/g, '');
          const prefix = monthNames[parseInt(dc.substring(4, 6), 10) - 1] + ' ' + parseInt(dc.substring(6, 8), 10);

          // ЗАЧЕМ: innerText, а не textContent.
          // TradingView прячет внутри кнопок два вложенных span с одинаковым
          // текстом (visible + overflow tooltip) — textContent склеивает их
          // ("245" + "245" = "245245"), innerText возвращает видимое значение.
          const cellText = (cell) => {
            if (!cell) return '';
            const t = (cell.innerText || '').trim();
            if (t) return t;
            return (cell.textContent || '').trim();
          };

          // ЗАЧЕМ: один хелпер для чтения числа из ячейки (страйк/IV/греки).
          // Возвращает ОБА: число (для калькулятора) и строку-как-на-доске
          // (для оверлея — без округлений, trailing zeros сохраняются).
          // TradingView использует юникодный минус U+2212 ("−"), а не ASCII "-":
          // заменяем перед парсингом, чтобы знак не терялся.
          const readCell = (idx, cellsArr) => {
            if (idx == null || idx < 0 || idx >= cellsArr.length) return { num: null, text: null };
            const raw = cellText(cellsArr[idx]);
            if (!raw || raw === '—' || raw === '-' || raw === '\u2212') return { num: null, text: null };
            const normalized = raw.replace(/\u2212/g, '-');
            const cleaned = normalized.replace(/[^\d.+\-eE]/g, '');
            if (!cleaned || cleaned === '-' || cleaned === '+') return { num: null, text: null };
            const n = parseFloat(cleaned);
            if (typeof n !== 'number' || isNaN(n)) return { num: null, text: null };
            return { num: n, text: normalized };
          };
          const parseNumCell = (idx, cellsArr) => readCell(idx, cellsArr).num;

          // ЗАЧЕМ: один раз для таблицы находим шапку и индексы ВСЕХ нужных
          // колонок — Strike, IV, Delta, Gamma, Theta, Vega — отдельно для
          // Call (слева от Strike) и Put (справа). Надёжность > скорости:
          // у пользователя может быть 50 колонок, индексы от "стандартной"
          // раскладки отличаются.
          const findColumnMap = (table) => {
            if (!table) return null;
            let maxTh = 0, bestRow = null;
            for (const r of table.querySelectorAll('tr')) {
              const tc = r.querySelectorAll('th').length;
              if (tc > maxTh) { maxTh = tc; bestRow = r; }
            }
            if (!bestRow) return null;
            const ths = bestRow.querySelectorAll('th');
            const map = { call: {}, put: {}, strikeIndex: -1, ivIndex: -1 };
            let afterStrike = false;
            for (let i = 0; i < ths.length; i++) {
              const t = (ths[i].textContent || '').trim().toLowerCase();
              if (t === 'strike') { map.strikeIndex = i; afterStrike = true; continue; }
              const side = afterStrike ? 'put' : 'call';
              // IV — первая колонка после Strike, на ней общий IV (Call=Put)
              if (t === 'iv' && afterStrike && map.ivIndex === -1) map.ivIndex = i;
              if (t === 'delta') map[side].delta = i;
              else if (t === 'gamma') map[side].gamma = i;
              else if (t === 'theta') map[side].theta = i;
              else if (t === 'vega')  map[side].vega = i;
              // ЗАЧЕМ: bid/ask/volume нужны для pending-позиций (черновики сделок),
              // где трейдер ещё не зафиксировал цену и видит пустые поля
              else if (t === 'bid')    map[side].bid = i;
              else if (t === 'ask')    map[side].ask = i;
              else if (t === 'volume') map[side].volume = i;
            }
            return (map.strikeIndex >= 0) ? map : null;
          };

          // Fallback: жёсткие смещения (старая 28-колоночная раскладка TV).
          // Используем ТОЛЬКО если карту заголовков построить не удалось.
          const fallbackGreekIdx = (sIdx, side, greek) => {
            if (side === 'call') {
              if (greek === 'delta') return sIdx - 5;
              if (greek === 'gamma') return sIdx - 6;
              if (greek === 'theta') return sIdx - 7;
              if (greek === 'vega')  return sIdx - 8;
            } else {
              if (greek === 'delta') return sIdx + 6;
              if (greek === 'gamma') return sIdx + 7;
              if (greek === 'theta') return sIdx + 8;
              if (greek === 'vega')  return sIdx + 9;
            }
            return null;
          };

          // ЗАЧЕМ: карту строим один раз на первую попавшуюся таблицу с данными,
          // а не для каждой строки — ощутимая экономия на 50-колоночных досках.
          let columnMap = null;
          const allTrs = document.querySelectorAll('tr');
          let inSection = false;
          for (const tr of allTrs) {
            const gc = tr.querySelector('[class*="groupCell"]');
            if (gc) {
              if (gc.textContent?.trim().startsWith(prefix)) { inSection = true; continue; }
              if (inSection) break;
              continue;
            }
            if (!inSection) continue;
            const cells = tr.querySelectorAll('td');
            if (cells.length < 30) continue;

            // Карта колонок — один раз на таблицу
            if (columnMap === null) {
              columnMap = findColumnMap(cells[0]?.closest('table')) || false;
            }

            // 1) ищем страйк строго по карте заголовков (основной путь)
            let sVal = null, sIdx = -1;
            if (columnMap && columnMap.strikeIndex >= 0) {
              sIdx = columnMap.strikeIndex;
              sVal = parseNumCell(sIdx, cells);
              if (sVal !== null && !(sVal >= 1 && sVal < 100000)) sVal = null;
            }

            // 2) fallback: если карты нет — перебор маркеров +P/-C
            if (sVal === null) {
              for (let i = 0; i < cells.length; i++) {
                const t = cellText(cells[i]);
                if (t.includes('+P') || t.includes('-C')) {
                  const m = t.match(/([\d,]+\.?\d*)/);
                  if (m) { sVal = parseFloat(m[1].replace(/,/g, '')); sIdx = i; break; }
                }
              }
            }
            // 3) fallback: перебор кнопок
            if (sVal === null) {
              for (let i = 0; i < cells.length; i++) {
                const btn = cells[i].querySelector('button');
                if (btn) {
                  const raw = (btn.innerText || '').trim();
                  const num = parseFloat(raw.replace(/,/g, ''));
                  if (num >= 1 && num < 100000) { sVal = num; sIdx = i; break; }
                }
              }
            }
            if (sVal === null || Math.abs(sVal - optStrike) >= 1) continue;

            // IV: индекс из карты, иначе sIdx+1 (как в старой 28-колоночной)
            const ivIdx = (columnMap && columnMap.ivIndex >= 0) ? columnMap.ivIndex : (sIdx + 1);
            const ivCell = readCell(ivIdx, cells);
            if (ivCell.num === null) return null;

            const side = (optType === 'C' || optType === 'CALL') ? 'call' : 'put';
            const sideMap = columnMap ? columnMap[side] : null;

            const pickIdx = (greek) => {
              if (sideMap && typeof sideMap[greek] === 'number') return sideMap[greek];
              return fallbackGreekIdx(sIdx, side, greek);
            };

            const deltaCell  = readCell(pickIdx('delta'),  cells);
            const gammaCell  = readCell(pickIdx('gamma'),  cells);
            const thetaCell  = readCell(pickIdx('theta'),  cells);
            const vegaCell   = readCell(pickIdx('vega'),   cells);
            // ЗАЧЕМ: bid/ask/volume берём только из карты заголовков — fallback
            // не вводим (см. план задачи UpdatePending), null в команде допустим
            const bidCell    = readCell(pickIdx('bid'),    cells);
            const askCell    = readCell(pickIdx('ask'),    cells);
            const volumeCell = readCell(pickIdx('volume'), cells);

            // ЗАЧЕМ: возвращаем и число (для калькулятора), и текст-как-на-доске
            // (для оверлея — точный показ без округлений)
            return {
              strike: sVal,
              iv: ivCell.num,
              ivText: ivCell.text,
              expirationISO: optDate,
              delta: deltaCell.num,  deltaText: deltaCell.text,
              gamma: gammaCell.num,  gammaText: gammaCell.text,
              theta: thetaCell.num,  thetaText: thetaCell.text,
              vega:  vegaCell.num,   vegaText:  vegaCell.text,
              bid:   bidCell.num,
              ask:   askCell.num,
              volume: volumeCell.num
            };
          }
          return null;
    };

    // Параметры повторов и аккумуляторы результата сбора.
    const COLLECT_MAX_ATTEMPTS = 3;
    const expectedPrefixes = _expirationPrefixes(configData.options);
    let underlyingPrice = null;
    let tvOptions = [];

    for (let attempt = 1; attempt <= COLLECT_MAX_ATTEMPTS; attempt++) {
      await writeStatusToCalculator(calcTabId, 'collecting', 5,
        attempt > 1 ? `TradingView ещё догружается — повтор ${attempt}…` : 'Ожидание загрузки TradingView...');

      // Заново находим вкладку TV (могла быть только что создана/перенавигирована).
      const tvNow = await chrome.tabs.query({ url: '*://*.tradingview.com/options/*' });
      if (tvNow.length === 0) {
        if (attempt < COLLECT_MAX_ATTEMPTS) { await delay(3000); continue; }
        await writeStatusToCalculator(calcTabId, 'error', 0, 'Вкладка TradingView закрыта');
        return;
      }
      const tvTabId = tvNow[0].id;

      // Ждём И таблицу, И хотя бы одну из запрошенных секций-экспираций.
      // На холодной вкладке (attempt 1) даём больше времени, на прогретой — меньше.
      const tableReady = await waitForTvOptionsTable(tvTabId, attempt === 1 ? 30000 : 15000, expectedPrefixes);
      if (!tableReady) {
        if (attempt < COLLECT_MAX_ATTEMPTS) { await delay(3000); continue; }
        await writeStatusToCalculator(calcTabId, 'error', 0, 'TradingView не загрузил таблицу опционов');
        return;
      }

      // Content script на TV декларирован в manifest; вызов — no-op заглушка (см. refreshHelpers.js).
      await ensureContentScriptLoaded(tvTabId);
      await writeStatusToCalculator(calcTabId, 'collecting', 10,
        `Обновление ${configData.options.length} опционов из TradingView...`);

      // --- Цена базового актива (10×1с) ---
      // priceWrap- (с дефисом) — чейновая цена в шапке; сайдбар (priceWrapper-/watchlist) отсекаем.
      let price = null;
      for (let pa = 0; pa < 10 && !price; pa++) {
        if (pa > 0) await delay(1000);
        const priceResult = await chrome.tabs.sendMessage(tvTabId, { action: 'getUnderlyingPrice' }).catch(() => null);
        price = priceResult?.price;
        if (!price) {
          const fb = await chrome.scripting.executeScript({
            target: { tabId: tvTabId },
            func: () => {
              const SKIP = [
                '[class*="widgetbar-widget"]',
                '[class*="widgetbar-page"]',
                '[class*="watchlist"]',
                '[class*="watch-list"]',
                '[class*="detailsWidget"]',
                '[data-name="right-toolbar"]',
                '[data-name="watchlist"]'
              ].join(',');
              const wraps = document.querySelectorAll('[class*="priceWrap-"]');
              for (const el of wraps) {
                if (el.closest(SKIP)) continue;
                const text = el.textContent.replace(/[^0-9.,]/g, '');
                const p = parseFloat(text.replace(/,/g, ''));
                if (p > 0) return p;
              }
              return null;
            }
          }).catch(() => []);
          price = fb?.[0]?.result;
        }
      }
      if (price) underlyingPrice = price;
      console.log('[TVC DbConfig] Underlying price:', underlyingPrice, '· попытка', attempt);

      // --- Парсинг строк опционов с условным ожиданием рендера ---
      // ЗАЧЕМ: вместо одной слепой паузы delay(1500) — до ~8 коротких тиков:
      // скролл к секции → подождать → распарсить. Поздний рендер строки больше не даёт null.
      const collected = [];
      for (const opt of configData.options) {
        let parsed = null;
        for (let t = 0; t < 8 && !parsed; t++) {
          await chrome.scripting.executeScript({
            target: { tabId: tvTabId },
            func: scrollToSectionFn,
            args: [opt.date]
          }).catch(() => {});
          await delay(500);
          const parseResult = await chrome.scripting.executeScript({
            target: { tabId: tvTabId },
            func: parseRowFn,
            args: [opt.date, opt.strike, opt.type]
          }).catch(() => []);
          parsed = parseResult?.[0]?.result;
        }
        if (parsed) {
          collected.push({ ...parsed, type: opt.type });
          console.log('[TVC DbConfig] Parsed:', opt.date, opt.strike,
            'IV:', parsed.iv, 'Δ:', parsed.delta, 'Γ:', parsed.gamma,
            'Θ:', parsed.theta, 'V:', parsed.vega);
        }
      }
      if (collected.length > 0) tvOptions = collected;

      // Успех: получены и цена БА, и хотя бы один распарсенный опцион.
      if (underlyingPrice && tvOptions.length > 0) break;

      if (attempt < COLLECT_MAX_ATTEMPTS) {
        console.log(`[TVC DbConfig] Неполный сбор (цена=${underlyingPrice}, опц.=${tvOptions.length}) — повтор`);
        await delay(3000);
      }
    }

    // ЗАЩИТА: цена БА так и не получена за все попытки — не отправляем команду
    // молча с null, а сообщаем пользователю об ошибке.
    if (!underlyingPrice) {
      await writeStatusToCalculator(calcTabId, 'error', 0,
        'Не удалось снять цену базового актива с TradingView — попробуйте ещё раз через пару секунд');
      return;
    }

    // ЗАЧЕМ: Собираем данные для оверлея сравнения — старые из калькулятора, новые с TV
    const comparisonOptions = configData.options.map(calcOpt => {
      // ЗАЧЕМ: TV может вернуть страйк с десятичными (50.05 вместо 50) — нечёткое сравнение
      const tvOpt = tvOptions.find(tv =>
        tv.type === calcOpt.type &&
        Math.abs(tv.strike - calcOpt.strike) < 1 &&
        tv.expirationISO === calcOpt.date
      );
      return {
        id: calcOpt.id,
        type: calcOpt.type,
        strike: calcOpt.strike,
        date: calcOpt.date,
        // ЗАЧЕМ: manualIvOverride — актуальный IV который видит трейдер в калькуляторе
        oldIV: calcOpt.manualIvOverride || calcOpt.impliedVolatility || null,
        newIV: tvOpt?.iv || null,
        // ЗАЧЕМ: Греки приходят из inline-парсера; null допустим (см. SendGreeks/1_spec.md)
        delta: (tvOpt && typeof tvOpt.delta === 'number') ? tvOpt.delta : null,
        gamma: (tvOpt && typeof tvOpt.gamma === 'number') ? tvOpt.gamma : null,
        theta: (tvOpt && typeof tvOpt.theta === 'number') ? tvOpt.theta : null,
        vega:  (tvOpt && typeof tvOpt.vega  === 'number') ? tvOpt.vega  : null,
        // ЗАЧЕМ: bid/ask/volume для pending-позиций; null если заголовок не распознан
        bid:    (tvOpt && typeof tvOpt.bid    === 'number') ? tvOpt.bid    : null,
        ask:    (tvOpt && typeof tvOpt.ask    === 'number') ? tvOpt.ask    : null,
        volume: (tvOpt && typeof tvOpt.volume === 'number') ? tvOpt.volume : null,
        // ЗАЧЕМ: текстовые варианты — для оверлея, показываются точно как на доске TV
        // (без округлений, с trailing zeros). В команду калькулятора НЕ попадают.
        newIVText: tvOpt?.ivText || null,
        deltaText: tvOpt?.deltaText || null,
        gammaText: tvOpt?.gammaText || null,
        thetaText: tvOpt?.thetaText || null,
        vegaText:  tvOpt?.vegaText  || null
      };
    });

    // Показываем оверлей сравнения на TV
    const tvTabForOverlay = (await chrome.tabs.query({ url: '*://*.tradingview.com/options/*' }))[0];
    if (tvTabForOverlay) {
      await sendPrIVToCalc(calcTabId, { ticker: configData.ticker, boardUrl: tvUrl, currentPrice: underlyingPrice, options: comparisonOptions, dbConfigId });
      await chrome.tabs.sendMessage(tvTabForOverlay.id, {
        action: 'showComparisonOverlay',
        data: {
          ticker: configData.ticker,
          oldPrice: configData.currentPrice,
          currentPrice: underlyingPrice,
          options: comparisonOptions
        }
      }).catch(e => console.error('[TVC DbConfig] Ошибка показа оверлея:', e));
    }

    const withData = tvOptions.length;
    await writeStatusToCalculator(calcTabId, 'complete', 100,
      `Собрано: ${withData} из ${configData.options.length} опц. Оверлей на TV.`);

  } catch (e) {
    console.error('[TVC DbConfig] Ошибка обновления:', e);
    try {
      await writeStatusToCalculator(calcTabId, 'error', 0, e.message);
    } catch (_) {}
  } finally {
    executeDbConfigRefresh._inProgress = false;
  }
}
executeDbConfigRefresh._inProgress = false;

/**
 * Проверить команды от оверлеев (записанные пользователем через «Да, обновить»)
 * ЗАЧЕМ: Вызывается при каждом alarm — читает localStorage на вкладке калькулятора,
 * ищет ключи tvc_dbconfig_refresh_<id> и запускает refresh для каждого.
 * Это заменяет блокирующий waitForUserAction — поток alarm не останавливается.
 */
async function checkDbConfigOverlayCommands(calcTabId) {
  try {
    const tab = await chrome.tabs.get(calcTabId).catch(() => null);
    if (!tab) return;

    const results = await chrome.scripting.executeScript({
      target: { tabId: calcTabId },
      func: () => {
        // Собираем все ключи tvc_dbconfig_refresh_* и сразу удаляем их
        const commands = [];
        const prefix = 'tvc_dbconfig_refresh_';
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && key.startsWith(prefix)) {
            const raw = localStorage.getItem(key);
            localStorage.removeItem(key);
            try {
              commands.push({ dbConfigId: key.slice(prefix.length), configData: JSON.parse(raw) });
            } catch (_) {}
          }
        }
        return commands;
      }
    });

    const commands = results?.[0]?.result || [];
    for (const { dbConfigId, configData } of commands) {
      console.log('[TVC DbConfig] Команда от оверлея:', dbConfigId);
      // ЗАЧЕМ: Не await — каждый refresh запускается независимо,
      // мьютекс внутри executeDbConfigRefresh защитит от параллельного выполнения
      executeDbConfigRefresh(calcTabId, configData);
    }
  } catch (e) {
    console.error('[TVC DbConfig] Ошибка проверки команд оверлея:', e);
  }
}

/**
 * Показать плавающую карточку-оверлей с вопросом об обновлении
 * ЗАЧЕМ: Карточки независимы — несколько конфигов могут показываться одновременно,
 * каждая со своим id. Ответ пользователя пишется в localStorage для асинхронной обработки.
 */
async function showDbConfigOverlay(calcTabId, ticker, optionsCount, dbConfigId, configData) {
  const safeTicker = escapeHtml(ticker);
  const safeId = String(dbConfigId).replace(/[^a-zA-Z0-9_-]/g, '_');

  await chrome.scripting.executeScript({
    target: { tabId: calcTabId },
    func: (safeTicker, count, overlayId, configDataStr, tabId) => {
      // ЗАЧЕМ: Не создаём дубль для той же сделки — если карточка уже висит, пропускаем
      if (document.getElementById('tvc-dbconfig-overlay-' + overlayId)) return;

      const optWord = count === 1 ? 'опцион' : count < 5 ? 'опциона' : 'опционов';

      // ЗАЧЕМ: Высчитываем позицию стопкой — каждая следующая карточка на 120px выше
      const existing = document.querySelectorAll('[id^="tvc-dbconfig-overlay-"]');
      const bottomOffset = 20 + existing.length * 120;

      // Инжектим стили один раз
      if (!document.getElementById('tvc-dbconfig-styles')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'tvc-dbconfig-styles';
        styleEl.textContent = `
          @keyframes tvcSlideIn {
            from { transform: translateX(40px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
          .tvc-dbconfig-btn {
            border: none;
            padding: 8px 18px;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            font-size: 13px;
            transition: transform 0.1s, box-shadow 0.1s;
          }
          .tvc-dbconfig-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          }
          .tvc-dbconfig-btn:active { transform: translateY(0); }
        `;
        document.head.appendChild(styleEl);
      }

      const card = document.createElement('div');
      card.id = 'tvc-dbconfig-overlay-' + overlayId;
      card.style.cssText = `
        position: fixed;
        bottom: ${bottomOffset}px;
        right: 20px;
        z-index: 999998;
        background: white;
        border-radius: 14px;
        padding: 18px 20px;
        width: 280px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1);
        animation: tvcSlideIn 0.3s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        border: 1px solid rgba(0,0,0,0.06);
      `;

      card.innerHTML = `
        <div style="font-size: 13px; font-weight: 700; color: #1a1a2e; margin-bottom: 4px;">
          Конфигурация загружена
        </div>
        <div style="font-size: 12px; color: #888; margin-bottom: 14px; line-height: 1.4;">
          Обновить цены и IV с TradingView?<br>
          <span style="color: #aaa;">${safeTicker} · ${count} ${optWord}</span>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="tvc-dbconfig-btn tvc-dbconfig-yes-${overlayId}" style="
            background: linear-gradient(135deg, #4CAF50, #45a049);
            color: white;
            flex: 1;
          ">
            Да, обновить
          </button>
          <button class="tvc-dbconfig-btn tvc-dbconfig-no-${overlayId}" style="
            background: #f0f0f0;
            color: #666;
            flex: 0 0 auto;
            padding: 8px 14px;
          ">
            Нет
          </button>
        </div>
      `;

      document.body.appendChild(card);

      // ЗАЧЕМ: Шлём сообщение напрямую в background — мгновенная реакция без ожидания alarm
      card.querySelector('.tvc-dbconfig-yes-' + overlayId).onclick = () => {
        try {
          chrome.runtime.sendMessage({
            action: 'executeDbConfigRefresh',
            calcTabId: tabId,
            configData: JSON.parse(configDataStr)
          });
        } catch (e) {
          // Fallback: если sendMessage недоступен — через localStorage (подхватит alarm)
          localStorage.setItem('tvc_dbconfig_refresh_' + overlayId, configDataStr);
        }
        card.remove();
      };

      card.querySelector('.tvc-dbconfig-no-' + overlayId).onclick = () => {
        card.remove();
      };
    },
    args: [safeTicker, optionsCount, safeId, JSON.stringify(configData), calcTabId]
  });
}


/**
 * Записать статус обновления в localStorage калькулятора
 */
async function writeStatusToCalculator(calcTabId, status, progress, message) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: calcTabId },
      func: (status, progress, message) => {
        localStorage.setItem('tvc_refresh_result', JSON.stringify({
          status, progress, message, timestamp: Date.now()
        }));
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'tvc_refresh_result',
          newValue: localStorage.getItem('tvc_refresh_result')
        }));
      },
      args: [status, progress, message]
    });
  } catch (e) {
    console.error('[TVC DbConfig] Ошибка записи статуса:', e);
  }
}

/**
 * Записать команду sendPrIV_tocallc в localStorage калькулятора
 * ЗАЧЕМ: Калькулятор читает команду по polling — автоматическая передача без кнопки
 */
async function sendPrIVToCalc(calcTabId, { ticker, boardUrl, currentPrice, options, dbConfigId }) {
  // ЗАЧЕМ: нормализуем грек — число или null; строки, NaN, undefined → null
  const numOrNull = (v) => (typeof v === 'number' && !isNaN(v)) ? v : null;

  // Только опционы с реальным IV (не null, не NaN)
  const validOptions = (options || [])
    .filter(o => o.newIV != null && !isNaN(o.newIV))
    .map(o => ({
      type: o.type === 'CALL' ? 'C' : (o.type === 'PUT' ? 'P' : o.type),
      strike: o.strike,
      date: o.date,
      newIV: o.newIV,
      // ЗАЧЕМ: греки передаются всегда (см. SendGreeks/1_spec.md, Сценарий 4).
      // null означает «парсер не смог достать» — калькулятор сам решает, что делать.
      delta: numOrNull(o.delta),
      gamma: numOrNull(o.gamma),
      theta: numOrNull(o.theta),
      vega:  numOrNull(o.vega),
      // ЗАЧЕМ: bid/ask/volume для pending-позиций (см. UpdatePending/1_spec.md)
      bid:    numOrNull(o.bid),
      ask:    numOrNull(o.ask),
      volume: numOrNull(o.volume)
    }));

  const command = {
    type: 'sendPrIV_tocallc',
    ticker: ticker || '',
    boardUrl: boardUrl || '',
    currentPrice: currentPrice || null,
    // ЗАЧЕМ: dbConfigId привязывает команду к конкретной вкладке калькулятора.
    // optioner.js на другой вкладке блокирует запись чужой команды в localStorage.
    dbConfigId: dbConfigId || null,
    options: validOptions,
    timestamp: Date.now(),
    processed: false
  };

  try {
    await chrome.scripting.executeScript({
      target: { tabId: calcTabId },
      func: (cmd) => {
        localStorage.setItem('tvc_refresh_command', JSON.stringify(cmd));
      },
      args: [command]
    });
    console.log(`[TVC SendPrIV] Записано в localStorage: ${ticker}, ${validOptions.length} опц., цена=${currentPrice}`);
  } catch (e) {
    console.error('[TVC SendPrIV] Ошибка записи в localStorage калькулятора:', e.message);
  }
}

console.log('[Background] dbConfigRefresh.js загружен');
