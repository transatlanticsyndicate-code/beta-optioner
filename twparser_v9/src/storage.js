/**
 * Работа с хранилищем данных
 * ЗАЧЕМ: Централизованное управление позициями и состоянием панели
 */

// Глобальное состояние
let tvc_positions = {};  // { 'ESH26': [...], 'NQM26': [...] }
let tvc_activeTab = null;
let tvc_panelCollapsed = false;
let tvc_panelHeight = null;

// Загрузить позиции из chrome.storage
async function loadPositions() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['tvc_positions'], (result) => {
      tvc_positions = result.tvc_positions || {};
      console.log('[TVC] Позиции загружены:', Object.keys(tvc_positions).length, 'инструментов');
      resolve(tvc_positions);
    });
  });
}

// Сохранить позиции в chrome.storage
async function savePositions() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ tvc_positions: tvc_positions }, resolve);
  });
}

// Загрузить состояние панели из localStorage
function loadPanelState() {
  try {
    const saved = localStorage.getItem('tvc_panel_state');
    if (saved) {
      const state = JSON.parse(saved);
      tvc_panelCollapsed = state.collapsed || false;
      tvc_panelHeight = state.height || null;
    }
  } catch (e) {
    console.log('[TVC] Ошибка загрузки состояния панели:', e);
  }
}

// Сохранить состояние панели в localStorage
function savePanelState() {
  try {
    const panel = document.querySelector('.tvc-panel');
    const state = {
      collapsed: tvc_panelCollapsed,
      height: panel ? panel.offsetHeight : tvc_panelHeight
    };
    localStorage.setItem('tvc_panel_state', JSON.stringify(state));
  } catch (e) {
    console.log('[TVC] Ошибка сохранения состояния панели:', e);
  }
}

// Добавить позицию
function addPosition(ticker, type, strike, expiration, bid, ask, price, volume, iv, greeks = {}) {
  if (!tvc_positions[ticker]) {
    tvc_positions[ticker] = [];
  }
  
  const entry = (bid + ask) / 2;
  const expirationISO = convertExpDateToISO(expiration);
  
  tvc_positions[ticker].push({
    id: Date.now(),
    type,
    strike,
    expiration,
    expirationISO,
    qty: 1,
    entry,
    bid,
    ask,
    price,
    volume,
    iv,
    // Греки
    delta: greeks.delta || 0,
    gamma: greeks.gamma || 0,
    theta: greeks.theta || 0,
    vega: greeks.vega || 0,
    rho: greeks.rho || 0,
    addedAt: new Date().toISOString()
  });
  
  savePositions();
  
  if (!tvc_activeTab) {
    tvc_activeTab = ticker;
  }
  
  // showPanel() и openOptionerCalculator() вызываются в buttons.js после addPosition()
}

// Удалить позицию
function removePosition(ticker, id) {
  if (!tvc_positions[ticker]) return;
  tvc_positions[ticker] = tvc_positions[ticker].filter(p => p.id !== id);
  if (tvc_positions[ticker].length === 0) {
    delete tvc_positions[ticker];
    if (tvc_activeTab === ticker) {
      tvc_activeTab = Object.keys(tvc_positions)[0] || null;
    }
  }
  savePositions();
}

// Очистить все позиции для тикера
function clearPositions(ticker) {
  if (ticker) {
    delete tvc_positions[ticker];
    if (tvc_activeTab === ticker) {
      tvc_activeTab = Object.keys(tvc_positions)[0] || null;
    }
  } else {
    tvc_positions = {};
    tvc_activeTab = null;
  }
  savePositions();
}

// Обновить количество позиции
function updatePositionQty(ticker, id, delta) {
  const pos = tvc_positions[ticker]?.find(p => p.id === id);
  if (pos) {
    pos.qty = Math.max(1, pos.qty + delta);
    savePositions();
    const panel = document.querySelector('.tvc-panel');
    if (panel) renderPanel();
  }
}

// Загружаем состояние панели при старте
loadPanelState();

console.log('[TVC] storage.js загружен');
