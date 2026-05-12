/**
 * Background shared: Binance API + калькулятор-сайдовые помощники.
 * ЗАЧЕМ: Общая часть для pendingRefresh.js и dbConfigRefresh.js — функции,
 * которые либо ходят в eapi.binance.com за свежими данными, либо инжектят
 * скрипты на вкладку калькулятора (status / sendPrIV_tocallc / React fiber read).
 *
 * Калькулятор-сайдовые функции скопированы из OptionsCPbuttons/background/dbConfigRefresh.js
 * почти без изменений — формат команды sendPrIV_tocallc и протокол React-чтения
 * одинаковы для обоих расширений.
 *
 * Зависит от: refreshHelpers.js (delay).
 */

// ===== Binance API =====
// ЗАЧЕМ: Background SW не подчиняется CSP страниц — может ходить напрямую в eapi.binance.com.
// API возвращает все опционы по underlying'у одним массивом — никаких DOM-скрейпов не нужно.

// Список поддерживаемых underlying'ов Binance Options (расширяется без боли).
const BNB_KNOWN_UNDERLYINGS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT'];

/**
 * Нормализация тикера из калькулятора в underlying Binance.
 * Допускает 'BTCUSDT', 'BTC', 'BINANCE:BTCUSDT'. Возвращает 'BTCUSDT' / null.
 */
function _resolveBinanceUnderlying(ticker) {
  if (!ticker || typeof ticker !== 'string') return null;
  let t = ticker.trim().toUpperCase();
  // Срезаем префикс биржи "BINANCE:..."
  if (t.includes(':')) t = t.split(':').pop();
  // Если уже с USDT — берём как есть
  if (t.endsWith('USDT') && BNB_KNOWN_UNDERLYINGS.includes(t)) return t;
  // Если только база ("BTC") — добавляем USDT и проверяем
  if (BNB_KNOWN_UNDERLYINGS.includes(t + 'USDT')) return t + 'USDT';
  return null;
}

/**
 * Является ли тикер калькулятора «нашим» (т.е. Binance Options).
 * ЗАЧЕМ: Шаг 1 — Binance активируется только для известных USDT-пар.
 * Остальное (акции, фьючерсы) пропускаем — за это отвечает TV-расширение.
 */
function isBinanceUnderlying(ticker) {
  return _resolveBinanceUnderlying(ticker) !== null;
}

/**
 * Универсальный fetch JSON с обработкой ошибок и IP-бана Binance.
 */
async function _fetchBinanceJson(url) {
  try {
    const resp = await fetch(url);
    const data = await resp.json();
    // Binance возвращает { code, msg } при ошибке
    if (data && data.code != null && data.code < 0) {
      console.warn('[Binance Refresh] API error:', data.code, data.msg);
      return null;
    }
    return data;
  } catch (e) {
    console.warn('[Binance Refresh] fetch failed:', url, e.message);
    return null;
  }
}

/**
 * eapi/v1/mark — IV + греки по всем опционам underlying'а.
 * @returns {Array<{symbol, markIV, delta, gamma, theta, vega, ...}>} | []
 */
async function fetchBinanceMark(underlying) {
  const url = `https://eapi.binance.com/eapi/v1/mark?underlying=${encodeURIComponent(underlying)}`;
  const data = await _fetchBinanceJson(url);
  return Array.isArray(data) ? data : [];
}

/**
 * eapi/v1/ticker — bid/ask/volume по всем опционам underlying'а.
 * @returns {Array<{symbol, bidPrice, askPrice, volume, ...}>} | []
 */
async function fetchBinanceTicker(underlying) {
  const url = `https://eapi.binance.com/eapi/v1/ticker?underlying=${encodeURIComponent(underlying)}`;
  const data = await _fetchBinanceJson(url);
  return Array.isArray(data) ? data : [];
}

/**
 * eapi/v1/index — индексная цена базового актива.
 * @returns {number | null}
 */
async function fetchBinanceIndexPrice(underlying) {
  const url = `https://eapi.binance.com/eapi/v1/index?underlying=${encodeURIComponent(underlying)}`;
  const data = await _fetchBinanceJson(url);
  if (data && data.indexPrice) {
    const p = parseFloat(data.indexPrice);
    return isNaN(p) ? null : p;
  }
  return null;
}

/**
 * Разбор Binance-символа опциона: 'BTC-250117-95000-C' →
 * { base, dateISO: '2025-01-17', strike: 95000, type: 'CALL' }
 */
function parseBinanceSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') return null;
  const parts = symbol.split('-');
  if (parts.length !== 4) return null;
  const [base, dateRaw, strikeRaw, typeChar] = parts;
  // dateRaw = YYMMDD → 20YY-MM-DD
  if (!/^\d{6}$/.test(dateRaw)) return null;
  const dateISO = `20${dateRaw.slice(0, 2)}-${dateRaw.slice(2, 4)}-${dateRaw.slice(4, 6)}`;
  const strike = parseFloat(strikeRaw);
  if (isNaN(strike)) return null;
  const type = typeChar === 'C' ? 'CALL' : (typeChar === 'P' ? 'PUT' : null);
  if (!type) return null;
  return { base, dateISO, strike, type };
}

/**
 * URL Binance eoptions для underlying'а — пишется в boardUrl команды
 * (только для отображения пользователю; функционально не используется).
 */
function buildBinanceBoardUrl(ticker) {
  const underlying = _resolveBinanceUnderlying(ticker) || ticker;
  return `https://www.binance.com/en/eoptions/${underlying}`;
}

// ===== Калькулятор-сайдовые помощники =====
// ЗАЧЕМ: Эти функции работают с DOM/React/localStorage страницы калькулятора,
// и они одинаковы для TV и Binance (источник правды — UniversalOptionsCalculator).

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[<>&"']/g, c => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/**
 * Прочитать ticker + options + currentPrice из React state калькулятора.
 * ЗАЧЕМ: При загрузке dbConfig калькулятор хранит данные в React fiber,
 * а не в calculatorState (localStorage). Единственный способ — обойти fiber.
 *
 * Двухшаговый bridge: MAIN-world пишет результат в localStorage по ключу
 * _tvc_react_bridge, ISOLATED-world читает (executeScript из SW в MAIN-world
 * не возвращает значение обратно).
 *
 * Источник: OptionsCPbuttons/background/dbConfigRefresh.js (без изменений).
 */
async function readCalcOptionsFromReact(calcTabId) {
  const BRIDGE_KEY = '_tvc_react_bridge';

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

  await delay(100);

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
 * Записать статус обновления (collecting/complete/error) в localStorage калькулятора.
 * ЗАЧЕМ: Калькулятор слушает tvc_refresh_result через storage event и показывает плашку.
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
    console.error('[Binance Refresh] Ошибка записи статуса:', e.message);
  }
}

/**
 * Записать команду sendPrIV_tocallc в localStorage калькулятора.
 * ЗАЧЕМ: React-хук useExtensionRefreshCommand читает её по polling
 * и применяет к state согласно loadedConfigStatus (pending vs standard).
 *
 * Совместимо с TV-расширением — одинаковый формат команды, одинаковая
 * фильтрация по dbConfigId (calcStorageGuard.js на стороне калькулятора).
 */
async function sendPrIVToCalc(calcTabId, { ticker, boardUrl, currentPrice, options, dbConfigId }) {
  const numOrNull = (v) => (typeof v === 'number' && !isNaN(v)) ? v : null;

  // Только опционы с реальным IV (не null, не NaN) — без IV команда бессмысленна
  const validOptions = (options || [])
    .filter(o => o.newIV != null && !isNaN(o.newIV))
    .map(o => ({
      type: o.type === 'CALL' ? 'C' : (o.type === 'PUT' ? 'P' : o.type),
      strike: o.strike,
      date: o.date,
      newIV: o.newIV,
      delta:  numOrNull(o.delta),
      gamma:  numOrNull(o.gamma),
      theta:  numOrNull(o.theta),
      vega:   numOrNull(o.vega),
      bid:    numOrNull(o.bid),
      ask:    numOrNull(o.ask),
      volume: numOrNull(o.volume)
    }));

  const command = {
    type: 'sendPrIV_tocallc',
    ticker: ticker || '',
    boardUrl: boardUrl || '',
    currentPrice: currentPrice || null,
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
    console.log(`[Binance Refresh] sendPrIV_tocallc записан: ${ticker}, ${validOptions.length} опц., цена=${currentPrice}`);
  } catch (e) {
    console.error('[Binance Refresh] Ошибка записи команды:', e.message);
  }
}

/**
 * Проверить команды от оверлеев (записанные пользователем через «Да, обновить»).
 * ЗАЧЕМ: Вызывается из каждого alarm — читает ключи tvc_dbconfig_refresh_<id>
 * и запускает refresh для каждого. Это заменяет блокирующий waitForUserAction.
 */
async function checkDbConfigOverlayCommands(calcTabId) {
  try {
    const tab = await chrome.tabs.get(calcTabId).catch(() => null);
    if (!tab) return;

    const results = await chrome.scripting.executeScript({
      target: { tabId: calcTabId },
      func: () => {
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
      console.log('[Binance Refresh] Команда от оверлея:', dbConfigId);
      // ЗАЧЕМ: Не await — мьютекс внутри executeDbConfigRefresh защищает от параллели.
      // executeDbConfigRefresh определён в dbConfigRefresh.js (общий SW-scope).
      executeDbConfigRefresh(calcTabId, configData);
    }
  } catch (e) {
    console.error('[Binance Refresh] Ошибка проверки команд оверлея:', e.message);
  }
}

/**
 * Показать плавающую карточку «Обновить с Binance? Да/Нет».
 * ЗАЧЕМ: При загрузке сохранённой сделки калькулятор спрашивает пользователя
 * перед сетевым обновлением. Карточка пишет ответ в localStorage —
 * следующий alarm в calcTabRouter подхватит и запустит executeDbConfigRefresh.
 *
 * Адаптировано из OptionsCPbuttons: текст «с TradingView» → «с Binance».
 */
async function showDbConfigOverlay(calcTabId, ticker, optionsCount, dbConfigId, configData) {
  const safeTicker = escapeHtml(ticker);
  const safeId = String(dbConfigId).replace(/[^a-zA-Z0-9_-]/g, '_');

  await chrome.scripting.executeScript({
    target: { tabId: calcTabId },
    func: (safeTicker, count, overlayId, configDataStr, tabId) => {
      if (document.getElementById('bnb-dbconfig-overlay-' + overlayId)) return;
      const optWord = count === 1 ? 'опцион' : count < 5 ? 'опциона' : 'опционов';
      const existing = document.querySelectorAll('[id^="bnb-dbconfig-overlay-"]');
      const bottomOffset = 20 + existing.length * 120;

      if (!document.getElementById('bnb-dbconfig-styles')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'bnb-dbconfig-styles';
        styleEl.textContent = `
          @keyframes bnbSlideIn {
            from { transform: translateX(40px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
          .bnb-dbconfig-btn {
            border: none;
            padding: 8px 18px;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            font-size: 13px;
            transition: transform 0.1s, box-shadow 0.1s;
          }
          .bnb-dbconfig-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
          .bnb-dbconfig-btn:active { transform: translateY(0); }
        `;
        document.head.appendChild(styleEl);
      }

      const card = document.createElement('div');
      card.id = 'bnb-dbconfig-overlay-' + overlayId;
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
        animation: bnbSlideIn 0.3s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        border: 1px solid rgba(0,0,0,0.06);
      `;
      card.innerHTML = `
        <div style="font-size: 13px; font-weight: 700; color: #1a1a2e; margin-bottom: 4px;">
          Конфигурация загружена
        </div>
        <div style="font-size: 12px; color: #888; margin-bottom: 14px; line-height: 1.4;">
          Обновить цены и IV с Binance?<br>
          <span style="color: #aaa;">${safeTicker} · ${count} ${optWord}</span>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="bnb-dbconfig-btn bnb-dbconfig-yes-${overlayId}" style="
            background: linear-gradient(135deg, #F0B90B, #D89F0A);
            color: white;
            flex: 1;
          ">Да, обновить</button>
          <button class="bnb-dbconfig-btn bnb-dbconfig-no-${overlayId}" style="
            background: #f0f0f0;
            color: #666;
            flex: 0 0 auto;
            padding: 8px 14px;
          ">Нет</button>
        </div>
      `;
      document.body.appendChild(card);

      card.querySelector('.bnb-dbconfig-yes-' + overlayId).onclick = () => {
        try {
          chrome.runtime.sendMessage({
            action: 'executeDbConfigRefresh',
            calcTabId: tabId,
            configData: JSON.parse(configDataStr)
          });
        } catch (e) {
          // Fallback через localStorage — alarm подхватит через checkDbConfigOverlayCommands
          localStorage.setItem('tvc_dbconfig_refresh_' + overlayId, configDataStr);
        }
        card.remove();
      };
      card.querySelector('.bnb-dbconfig-no-' + overlayId).onclick = () => card.remove();
    },
    args: [safeTicker, optionsCount, safeId, JSON.stringify(configData), calcTabId]
  });
}

console.log('[Binance Bridge] refreshShared.js загружен');
