/**
 * Работа с хранилищем данных
 * ЗАЧЕМ: Централизованное управление позициями
 */

let bnb_positions = {};  // { 'BTCUSDT': [...] }
let bnb_activeTab = null;
let lastSaveTimestamp = 0;
let syncInProgress = false;

async function loadPositions() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['bnb_positions'], (result) => {
      bnb_positions = result.bnb_positions || {};
      resolve(bnb_positions);
    });
  });
}

async function savePositions() {
  lastSaveTimestamp = Date.now();
  return new Promise((resolve) => {
    chrome.storage.local.set({ bnb_positions: bnb_positions }, resolve);
  });
}

/**
 * Добавить позицию
 * ЗАЧЕМ: action = 'Buy' или 'Sell'
 */
function addPosition(underlying, type, strike, expDateCode, expISO, bid, ask, markPrice, iv, bidIV, askIV, greeks, action = 'Buy') {
  if (!bnb_positions[underlying]) {
    bnb_positions[underlying] = [];
  }

  const entry = markPrice || (bid + ask) / 2;

  const newPosition = {
    id: Date.now(),
    action,
    type,
    strike,
    expiration: formatExpiration(expDateCode),
    expirationISO: expISO,
    expDateCode,
    qty: 1,
    entry,
    bid,
    ask,
    price: markPrice,
    iv,
    bidIV,
    askIV,
    delta: greeks.delta || 0,
    gamma: greeks.gamma || 0,
    theta: greeks.theta || 0,
    vega: greeks.vega || 0,
    rho: 0,
    addedAt: new Date().toISOString(),
    sourceUrl: window.location.href
  };

  bnb_positions[underlying].push(newPosition);
  savePositions();

  bnb_activeTab = underlying;
}

/**
 * Удалить позицию
 */
function removePosition(underlying, id) {
  if (!bnb_positions[underlying]) return;

  const optionToDelete = bnb_positions[underlying].find(p => p.id === id);

  syncInProgress = true;

  bnb_positions[underlying] = bnb_positions[underlying].filter(p => p.id !== id);
  if (bnb_positions[underlying].length === 0) {
    delete bnb_positions[underlying];
    if (bnb_activeTab === underlying) {
      bnb_activeTab = Object.keys(bnb_positions)[0] || null;
    }
  }
  savePositions();

  if (optionToDelete) {
    syncDeleteToCalculator({
      type: optionToDelete.type,
      strike: optionToDelete.strike,
      expiration: optionToDelete.expirationISO || optionToDelete.expiration
    });
  }

  setTimeout(() => { syncInProgress = false; }, 200);

  if (typeof refreshAllButtonStates === 'function') {
    refreshAllButtonStates();
  }
}

/**
 * Синхронизировать удаление в калькулятор
 */
function syncDeleteToCalculator(optionKey) {
  if (!chrome.runtime?.id) return;
  chrome.runtime.sendMessage({
    action: 'syncDeleteToCalculator',
    optionKey: optionKey
  }, () => {});
}

/**
 * Очистить позиции
 */
function clearPositions(underlying) {
  if (underlying) {
    delete bnb_positions[underlying];
    if (bnb_activeTab === underlying) {
      bnb_activeTab = Object.keys(bnb_positions)[0] || null;
    }
  } else {
    bnb_positions = {};
    bnb_activeTab = null;
  }
  savePositions();
}

/**
 * Проверить, есть ли позиция в калькуляторе
 */
function isOptionInCalculator(underlying, type, strike, expISO, action) {
  const positions = bnb_positions[underlying] || [];
  return positions.some(p =>
    p.type === type &&
    p.strike === strike &&
    (p.action || 'Buy') === action &&
    (p.expirationISO === expISO || p.expDateCode === expISO)
  );
}

console.log('[Binance] storage.js загружен');
