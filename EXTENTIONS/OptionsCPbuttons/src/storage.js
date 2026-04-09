/**
 * ext2 — Хранилище позиций
 * Используем tvc_positions для совместимости с калькулятором optioner.online
 */

let tvc_positions = {};
let tvc_exchanges = {};  // { 'SE': 'NYSE', 'ESH26': 'CME_MINI' } — биржа для каждого тикера
let tvc_activeTab = null;
let tvc_panelCollapsed = false;
let _ext2_savingInProgress = false;

async function loadPositions() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY, EXCHANGES_KEY], (result) => {
      tvc_positions = result[STORAGE_KEY] || {};
      tvc_exchanges = result[EXCHANGES_KEY] || {};
      resolve(tvc_positions);
    });
  });
}

async function savePositions() {
  _ext2_savingInProgress = true;
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: tvc_positions, [EXCHANGES_KEY]: tvc_exchanges }, () => {
      _ext2_savingInProgress = false;
      resolve();
    });
  });
}

function loadPanelState() {
  try {
    const saved = localStorage.getItem('tvc_panel_state');
    if (saved) {
      const state = JSON.parse(saved);
      tvc_panelCollapsed = state.collapsed || false;
    }
  } catch (e) {}
}

function savePanelState() {
  try {
    localStorage.setItem('tvc_panel_state', JSON.stringify({
      collapsed: tvc_panelCollapsed
    }));
  } catch (e) {}
}

// Добавить позицию
// ИСПРАВЛЕНО: проверка дубликатов включает action (Buy/Sell)
function addPosition(ticker, type, strike, expiration, bid, ask, price, volume, iv, greeks = {}, extraData = {}, action = 'Buy') {
  if (!tvc_positions[ticker]) {
    tvc_positions[ticker] = [];
  }

  // Проверка дубликатов по (type, strike, expiration, action)
  const isDuplicate = tvc_positions[ticker].some(p =>
    p.type === type &&
    p.strike === strike &&
    p.expiration === expiration &&
    (p.action || 'Buy') === action
  );

  if (isDuplicate) {
    console.warn(LOG_TAG, 'Дубликат предотвращён:', { ticker, type, strike, expiration, action });
    return false;
  }

  const entry = (bid + ask) / 2;

  tvc_positions[ticker].push({
    id: Date.now() + Math.random(),
    action,
    type,
    strike,
    expiration,       // уже ISO из data-cell-id: "2026-06-18"
    expirationISO: expiration,  // совместимость с калькулятором
    qty: 1,
    entry,
    bid,
    ask,
    price: price || entry,
    volume,
    iv,
    delta: greeks.delta || 0,
    gamma: greeks.gamma || 0,
    theta: greeks.theta || 0,
    vega: greeks.vega || 0,
    rho: greeks.rho || 0,
    bidIV: extraData.bidIV || 0,
    askIV: extraData.askIV || 0,
    intrinsicValue: extraData.intrinsicValue || 0,
    timeValue: extraData.timeValue || 0,
    underlyingPrice: typeof getUnderlyingPrice === 'function' ? getUnderlyingPrice() : 0,
    addedAt: new Date().toISOString(),
    sourceUrl: window.location.href
  });

  // Сохраняем биржу для тикера из URL страницы TradingView
  // ЗАЧЕМ: Калькулятору нужна биржа для генерации правильных ссылок
  if (typeof getExchangeFromUrl === 'function') {
    const exchange = getExchangeFromUrl();
    if (exchange) {
      tvc_exchanges[ticker] = exchange;
    }
  }

  savePositions();
  tvc_activeTab = ticker;
  return true;
}

// Удалить позицию + синхронизировать в калькулятор
async function removePosition(ticker, id) {
  if (!tvc_positions[ticker]) return;

  const optionToDelete = tvc_positions[ticker].find(p => p.id === id);

  tvc_positions[ticker] = tvc_positions[ticker].filter(p => p.id !== id);
  if (tvc_positions[ticker].length === 0) {
    delete tvc_positions[ticker];
    if (tvc_activeTab === ticker) {
      tvc_activeTab = Object.keys(tvc_positions)[0] || null;
    }
  }

  await savePositions();

  // Синхронизация удаления в калькулятор
  if (optionToDelete && chrome.runtime?.id) {
    const optionKey = {
      type: optionToDelete.type,
      strike: optionToDelete.strike,
      expiration: optionToDelete.expiration
    };
    chrome.runtime.sendMessage({
      action: 'ext2_syncDeleteToCalculator',
      optionKey
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(LOG_TAG, 'syncDelete error:', chrome.runtime.lastError.message);
      } else {
      }
    });
  } else {
    console.warn(LOG_TAG, 'Cannot sync delete:', { hasOption: !!optionToDelete, runtimeId: chrome.runtime?.id });
  }

  if (typeof refreshAllButtonStates === 'function') {
    refreshAllButtonStates();
  }
}

// Очистить позиции (тикер или все)
async function clearPositions(ticker) {
  if (ticker) {
    delete tvc_positions[ticker];
    if (tvc_activeTab === ticker) {
      tvc_activeTab = Object.keys(tvc_positions)[0] || null;
    }
    // Синхронизация в калькулятор
    if (chrome.runtime?.id) {
      chrome.runtime.sendMessage({
        action: 'ext2_clearTickerFromCalculator',
        ticker: ticker
      });
    }
  } else {
    tvc_positions = {};
    tvc_activeTab = null;
    tvc_panelCollapsed = false;
    await new Promise(resolve => {
      chrome.storage.local.remove([STORAGE_KEY], resolve);
    });
    try { localStorage.removeItem('tvc_panel_state'); } catch (e) {}
  }
  await savePositions();
}

// Проверка: опцион уже в калькуляторе?
// Совместимость: старые позиции могут иметь expiration в другом формате + expirationISO
function isOptionInCalculator(ticker, type, strike, expiration, action) {
  const positions = tvc_positions[ticker] || [];
  return positions.some(p =>
    p.type === type &&
    p.strike === strike &&
    (p.action || 'Buy') === action &&
    (p.expiration === expiration || p.expirationISO === expiration)
  );
}

loadPanelState();
