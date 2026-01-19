/**
 * TradingView Options Calculator - Live Update модуль
 * ЗАЧЕМ: Автоматическое обновление данных опционов при изменении цен на TradingView
 * 
 * Логика:
 * 1. Отслеживаем изменения в DOM таблицы через MutationObserver
 * 2. При изменении находим позиции в storage по strike
 * 3. Обновляем bid/ask/price/greeks в chrome.storage
 * 4. Калькулятор получает обновления через синхронизацию
 */

// Интервал обновления (мс) — не чаще чем раз в секунду
const UPDATE_INTERVAL = 1000;
let lastUpdateTime = 0;
let updateScheduled = false;

// Хранение текущей цены базового контракта
let currentUnderlyingPrice = 0;

// ============================================
// ОБНОВЛЕНИЕ ЦЕНЫ БАЗОВОГО КОНТРАКТА
// ============================================

/**
 * Получает текущую цену базового контракта из DOM
 */
function getUnderlyingPriceFromDOM() {
  // Ищем цену в разных местах TradingView
  // 1. В заголовке страницы рядом с тикером (например "ESH2026 6,984.50")
  const priceElements = document.querySelectorAll('[class*="price"], [class*="last"]');
  for (const el of priceElements) {
    const text = el.textContent?.trim().replace(/,/g, '');
    const match = text?.match(/^[\d,]+\.?\d*$/);
    if (match) {
      const price = parseFloat(text);
      if (price > 1000 && price < 100000) { // Разумный диапазон для ES
        return price;
      }
    }
  }
  
  // 2. Ищем в строке с тикером (ESH2026 + пробел + цена)
  const tickerRow = document.querySelector('[class*="symbolTitle"], [class*="ticker"]');
  if (tickerRow) {
    const parent = tickerRow.parentElement;
    if (parent) {
      const text = parent.textContent?.replace(/,/g, '');
      const match = text?.match(/(\d{4,5}\.\d{2})/);
      if (match) {
        return parseFloat(match[1]);
      }
    }
  }
  
  // 3. Парсим из таблицы — строка с тикером содержит цену
  const rows = document.querySelectorAll('tr, [role="row"]');
  for (const row of rows) {
    const text = row.textContent;
    if (text?.includes('ESH') || text?.includes('ES ')) {
      const match = text.replace(/,/g, '').match(/(\d{4,5}\.\d{2})/);
      if (match) {
        return parseFloat(match[1]);
      }
    }
  }
  
  return 0;
}

/**
 * Обновляет цену базового контракта в storage
 */
function updateUnderlyingPrice() {
  // Проверяем валидность контекста расширения
  if (!chrome.runtime?.id) {
    stopLiveUpdate();
    return;
  }
  
  const newPrice = getUnderlyingPriceFromDOM();
  
  if (newPrice > 0 && newPrice !== currentUnderlyingPrice) {
    currentUnderlyingPrice = newPrice;
    
    // Сохраняем в chrome.storage
    chrome.storage.local.get(['tvc_underlying'], (result) => {
      const underlying = result.tvc_underlying || {};
      // Используем getTickerFromUrl напрямую (определена в utils.js)
      const ticker = getTickerFromUrl();
      
      if (ticker) {
        underlying[ticker] = {
          price: newPrice,
          updatedAt: Date.now()
        };
        
        chrome.storage.local.set({ tvc_underlying: underlying }, () => {
          console.log('[TVC] Underlying price обновлён:', ticker, newPrice);
        });
      }
    });
  }
}

// ============================================
// ОБНОВЛЕНИЕ ДАННЫХ ПОЗИЦИЙ
// ============================================

/**
 * Обновляет данные всех сохранённых позиций из текущей таблицы TradingView
 */
function updatePositionsFromTable() {
  // Проверяем валидность контекста расширения
  if (!chrome.runtime?.id) {
    stopLiveUpdate();
    return;
  }
  
  const now = Date.now();
  
  // Throttle — не чаще чем раз в секунду
  if (now - lastUpdateTime < UPDATE_INTERVAL) {
    if (!updateScheduled) {
      updateScheduled = true;
      setTimeout(() => {
        updateScheduled = false;
        updatePositionsFromTable();
      }, UPDATE_INTERVAL - (now - lastUpdateTime));
    }
    return;
  }
  
  lastUpdateTime = now;
  
  // Обновляем цену базового контракта
  updateUnderlyingPrice();
  
  // Получаем текущий тикер из URL или DOM
  const ticker = getTickerFromUrl();
  if (!ticker) return;
  
  // Проверяем есть ли позиции для этого тикера
  if (!tvc_positions[ticker] || tvc_positions[ticker].length === 0) {
    return;
  }
  
  // Получаем карту колонок
  const columnMap = parseTableHeaders();
  if (!columnMap) return;
  
  // Находим все строки таблицы
  const rows = document.querySelectorAll('tr, [role="row"]');
  let updatedCount = 0;
  
  for (const row of rows) {
    const cells = row.querySelectorAll('td, [role="cell"]');
    if (cells.length < 10) continue;
    
    // Ищем ячейку со страйком
    const strikeCell = Array.from(cells).find(cell => {
      const text = cell.textContent?.trim().replace(/,/g, '');
      return text && /^\d{3,5}$/.test(text);
    });
    
    if (!strikeCell) continue;
    
    const strike = parseInt(strikeCell.textContent.trim().replace(/,/g, ''));
    const strikeIndex = Array.from(cells).indexOf(strikeCell);
    
    // Проверяем есть ли позиции с этим страйком
    const positionsWithStrike = tvc_positions[ticker].filter(p => p.strike === strike);
    if (positionsWithStrike.length === 0) continue;
    
    // Парсим данные строки
    const { callData, callGreeks, putData, putGreeks } = parseOptionRow(cells, strikeIndex, columnMap);
    
    // Обновляем каждую позицию с этим страйком
    for (const position of positionsWithStrike) {
      let updated = false;
      
      if (position.type === 'CALL') {
        // Обновляем данные CALL
        if (position.bid !== callData.bid || position.ask !== callData.ask) {
          position.bid = callData.bid;
          position.ask = callData.ask;
          position.price = callData.price;
          position.volume = callData.volume;
          position.iv = callData.iv;
          position.delta = callGreeks.delta;
          position.gamma = callGreeks.gamma;
          position.theta = callGreeks.theta;
          position.vega = callGreeks.vega;
          position.rho = callGreeks.rho;
          updated = true;
        }
      } else if (position.type === 'PUT') {
        // Обновляем данные PUT
        if (position.bid !== putData.bid || position.ask !== putData.ask) {
          position.bid = putData.bid;
          position.ask = putData.ask;
          position.price = putData.price;
          position.volume = putData.volume;
          position.iv = putData.iv;
          position.delta = putGreeks.delta;
          position.gamma = putGreeks.gamma;
          position.theta = putGreeks.theta;
          position.vega = putGreeks.vega;
          position.rho = putGreeks.rho;
          updated = true;
        }
      }
      
      if (updated) {
        updatedCount++;
      }
    }
  }
  
  // Если были обновления — сохраняем в storage
  if (updatedCount > 0) {
    console.log('[TVC] Live update: обновлено позиций:', updatedCount);
    savePositions();
  }
}

// ============================================
// НАБЛЮДАТЕЛЬ ЗА ИЗМЕНЕНИЯМИ
// ============================================

let liveUpdateObserver = null;

/**
 * Запускает отслеживание изменений в таблице
 */
function startLiveUpdate() {
  if (liveUpdateObserver) {
    console.log('[TVC] Live update уже запущен');
    return;
  }
  
  // Находим таблицу
  const table = document.querySelector('table, [role="table"], .tv-data-table');
  if (!table) {
    console.log('[TVC] Таблица не найдена для live update');
    return;
  }
  
  // Создаём observer
  liveUpdateObserver = new MutationObserver((mutations) => {
    // Проверяем что изменились данные в ячейках (не структура)
    const hasDataChanges = mutations.some(m => 
      m.type === 'characterData' || 
      (m.type === 'childList' && m.target.closest('td, [role="cell"]'))
    );
    
    if (hasDataChanges) {
      updatePositionsFromTable();
    }
  });
  
  // Запускаем наблюдение
  liveUpdateObserver.observe(table, {
    childList: true,
    subtree: true,
    characterData: true
  });
  
  console.log('[TVC] Live update запущен');
}

/**
 * Останавливает отслеживание изменений
 */
function stopLiveUpdate() {
  if (liveUpdateObserver) {
    liveUpdateObserver.disconnect();
    liveUpdateObserver = null;
    console.log('[TVC] Live update остановлен');
  }
}

console.log('[TVC] liveUpdate.js загружен');
