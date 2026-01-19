/**
 * TradingView Options Calculator - Главный модуль
 * ЗАЧЕМ: Инициализация расширения и координация модулей
 * 
 * Порядок загрузки модулей в manifest.json:
 * 1. utils.js - утилиты
 * 2. storage.js - хранилище
 * 3. parser.js - парсинг таблицы
 * 4. optioner.js - интеграция с калькулятором
 * 5. panel.js - UI панели
 * 6. buttons.js - кнопки +C/+P
 * 7. main.js - инициализация (этот файл)
 */

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

async function init() {
  console.log('[TVC] Инициализация v6.0 (live update)');
  
  // Загружаем позиции
  await loadPositions();
  
  // Устанавливаем активный таб
  const tickers = Object.keys(tvc_positions);
  if (tickers.length > 0 && !tvc_activeTab) {
    tvc_activeTab = tickers[0];
  }
  
  // Инжектим кнопки
  injectButtons();
  
  // Инжектим кнопку "Открыть калькулятор" в шапку таблицы
  injectCalculatorButton();
  
  // Устанавливаем наблюдатель за изменениями DOM
  setupObserver();
  
  // Запускаем live-обновление данных
  startLiveUpdate();
  
  // Показываем панель если есть позиции
  if (tickers.length > 0) {
    showPanel();
  }
  
  console.log('[TVC] Инициализация завершена');
}

// ============================================
// ОБРАБОТКА СООБЩЕНИЙ
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'showPanel') {
    showPanel();
    sendResponse({ success: true });
  }
  
  // Получаем данные от pinned вкладки через background
  if (message.action === 'updatePositionData') {
    console.log('[TVC] Получены данные для позиции:', message);
    
    const { posId, ticker, type, newExp, data } = message;
    
    const pos = tvc_positions[ticker]?.find(p => p.id === posId);
    if (pos && data) {
      pos.expiration = newExp;
      
      if (pos.type === 'CALL') {
        pos.bid = data.callBid;
        pos.ask = data.callAsk;
        pos.price = data.callPrice;
        pos.volume = data.callVolume;
        pos.iv = data.callIv;
      } else {
        pos.bid = data.putBid;
        pos.ask = data.putAsk;
        pos.price = data.putPrice;
        pos.volume = data.putVolume;
        pos.iv = data.putIv;
      }
      
      pos.loading = false;
      pos.pendingExp = null;
      
      savePositions();
      renderPanel();
      
      console.log('[TVC] Позиция обновлена:', pos);
    }
    
    sendResponse({ success: true });
  }
  
  return true;
});

// ============================================
// СИНХРОНИЗАЦИЯ С CHROME.STORAGE
// ============================================

// Слушаем изменения в chrome.storage (от калькулятора через optioner.js)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.tvc_positions) {
    console.log('[TVC] chrome.storage изменён, синхронизируем панель');
    const newPositions = changes.tvc_positions.newValue || {};
    
    // Обновляем локальное состояние
    tvc_positions = newPositions;
    
    // Обновляем активный таб если нужно
    const tickers = Object.keys(tvc_positions);
    if (tickers.length > 0 && !tickers.includes(tvc_activeTab)) {
      tvc_activeTab = tickers[0];
    } else if (tickers.length === 0) {
      tvc_activeTab = null;
    }
    
    // Перерисовываем панель
    const panel = document.querySelector('.tvc-panel');
    if (panel) {
      renderPanel();
    }
  }
});

// ============================================
// ЗАПУСК
// ============================================

// Функция ожидания загрузки таблицы
function waitForTable(callback, maxAttempts = 20) {
  let attempts = 0;
  
  function check() {
    attempts++;
    const table = document.querySelector('table, [role="table"], .tv-data-table');
    const rows = document.querySelectorAll('tr, [role="row"]');
    
    if (table && rows.length > 5) {
      console.log('[TVC] Таблица загружена, строк:', rows.length);
      callback();
    } else if (attempts < maxAttempts) {
      console.log('[TVC] Ожидание таблицы, попытка:', attempts);
      setTimeout(check, 500);
    } else {
      console.log('[TVC] Таблица не найдена после', maxAttempts, 'попыток, запускаем init');
      callback();
    }
  }
  
  check();
}

// Всегда инициализируем — ждём загрузки таблицы
waitForTable(init);

console.log('[TVC] main.js загружен');
