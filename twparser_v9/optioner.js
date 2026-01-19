/**
 * Content script для futures.optioner.online
 * ЗАЧЕМ: Двусторонняя синхронизация между калькулятором и расширением
 * 
 * Калькулятор → Расширение: Слушаем изменения localStorage и синхронизируем в chrome.storage
 * Расширение → Калькулятор: Инжект через background.js
 */

(function() {
  'use strict';
  
  console.log('[Optioner Bridge] Content script загружен на', window.location.href);
  
  let lastOptionsHash = '';
  
  // Вычислить хэш массива опционов для сравнения
  function getOptionsHash(options) {
    if (!options || !Array.isArray(options)) return '';
    return options.map(o => o.id).sort().join(',');
  }
  
  // Конвертировать опцион из формата калькулятора в формат расширения
  function convertToExtensionFormat(option, ticker) {
    return {
      id: parseInt(option.id) || Date.now(),
      type: option.type,
      strike: option.strike,
      expiration: option.date, // ISO формат
      expirationISO: option.date,
      qty: option.quantity || 1,
      entry: option.premium,
      bid: option.bid || 0,
      ask: option.ask || 0,
      price: option.premium,
      volume: option.volume || 0,
      iv: option.impliedVolatility || 0,
      delta: option.delta || 0,
      gamma: option.gamma || 0,
      theta: option.theta || 0,
      vega: option.vega || 0,
      rho: option.rho || 0,
      addedAt: option.lastUpdated || new Date().toISOString()
    };
  }
  
  // Синхронизировать изменения из калькулятора в расширение
  function syncToExtension() {
    // Проверяем валидность контекста расширения
    if (!chrome.runtime?.id) {
      return;
    }
    
    try {
      const calcState = localStorage.getItem('calculatorState');
      if (!calcState) return;
      
      const state = JSON.parse(calcState);
      const options = state.options || [];
      const currentHash = getOptionsHash(options);
      
      // Проверяем, изменились ли опционы
      if (currentHash === lastOptionsHash) return;
      lastOptionsHash = currentHash;
      
      // Получаем тикер
      const ticker = state.selectedTicker || 'ESH2026';
      // Конвертируем в короткий формат для ключа (CME_MINI:ESH2026 -> ESH2026)
      const shortTicker = ticker.includes(':') ? ticker.split(':')[1] : ticker;
      
      // Конвертируем опционы в формат расширения
      const extensionPositions = options.map(opt => convertToExtensionFormat(opt, shortTicker));
      
      // Сохраняем в chrome.storage
      chrome.storage.local.get(['tvc_positions'], (result) => {
        const positions = result.tvc_positions || {};
        positions[shortTicker] = extensionPositions;
        
        chrome.storage.local.set({ tvc_positions: positions }, () => {
          console.log('[Optioner Bridge] ✅ Синхронизировано в расширение:', extensionPositions.length, 'опционов для', shortTicker);
        });
      });
      
    } catch (e) {
      console.log('[Optioner Bridge] Ошибка синхронизации:', e);
    }
  }
  
  // Слушаем изменения localStorage (от React калькулятора)
  window.addEventListener('storage', (e) => {
    if (e.key === 'calculatorState') {
      console.log('[Optioner Bridge] localStorage изменён');
      syncToExtension();
    }
    
    // Мгновенная реакция на команду от калькулятора
    if (e.key === 'tvc_command' && e.newValue) {
      console.log('[Optioner Bridge] Получена команда от калькулятора');
      handleCommand(e.newValue);
    }
  });
  
  // Обработка команды от калькулятора
  function handleCommand(commandJson) {
    if (!chrome.runtime?.id) {
      console.log('[Optioner Bridge] Extension context invalidated');
      return;
    }
    
    try {
      const command = JSON.parse(commandJson);
      console.log('[Optioner Bridge] Команда:', command);
      
      // Удаляем команду из localStorage (чтобы не обработать повторно)
      localStorage.removeItem('tvc_command');
      
      // Отправляем в background.js
      chrome.runtime.sendMessage(command, (response) => {
        console.log('[Optioner Bridge] Ответ от background:', response);
      });
    } catch (e) {
      console.error('[Optioner Bridge] Ошибка обработки команды:', e);
    }
  }
  
  // Проверяем команду при загрузке (если была записана до загрузки скрипта)
  const pendingCommand = localStorage.getItem('tvc_command');
  if (pendingCommand) {
    console.log('[Optioner Bridge] Найдена ожидающая команда');
    handleCommand(pendingCommand);
  }
  
  // Слушаем сообщения от background.js (статус сбора)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateTVCStatus') {
      const statusData = message.status;
      console.log('[Optioner Bridge] Статус сбора:', statusData);
      
      // Записываем в localStorage калькулятора
      localStorage.setItem('tvc_status', JSON.stringify(statusData));
      
      // Триггерим событие для React
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'tvc_status',
        newValue: JSON.stringify(statusData)
      }));
      
      sendResponse({ success: true });
    }
    return true;
  });
  
  // Синхронизировать tvc_full_chain из расширения в localStorage калькулятора
  function syncFullChain() {
    if (!chrome.runtime?.id) return;
    
    chrome.storage.local.get(['tvc_full_chain'], (result) => {
      const fullChain = result.tvc_full_chain;
      if (!fullChain) return;
      
      // Сохраняем в localStorage калькулятора
      const currentData = localStorage.getItem('tvc_full_chain');
      const newData = JSON.stringify(fullChain);
      
      if (currentData !== newData) {
        localStorage.setItem('tvc_full_chain', newData);
        console.log('[Optioner Bridge] ✅ tvc_full_chain синхронизирован в localStorage:', 
          fullChain.ticker, 
          fullChain.expirations?.length, 'экспираций',
          fullChain.expirations?.reduce((sum, e) => sum + (e.options?.length || 0), 0), 'опционов'
        );
        
        // Триггерим событие для React
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'tvc_full_chain',
          newValue: newData
        }));
      }
    });
  }
  
  // Синхронизировать underlying price из расширения в калькулятор
  function syncUnderlyingPrice() {
    // Проверяем валидность контекста расширения
    if (!chrome.runtime?.id) {
      console.log('[Optioner Bridge] Extension context invalidated, stopping sync');
      return;
    }
    
    chrome.storage.local.get(['tvc_underlying'], (result) => {
      const underlying = result.tvc_underlying || {};
      
      // Получаем тикер из калькулятора
      const calcState = localStorage.getItem('calculatorState');
      if (!calcState) return;
      
      const state = JSON.parse(calcState);
      const ticker = state.selectedTicker || 'ESH2026';
      const shortTicker = ticker.includes(':') ? ticker.split(':')[1] : ticker;
      
      // Проверяем есть ли цена для этого тикера
      if (underlying[shortTicker] && underlying[shortTicker].price) {
        const newPrice = underlying[shortTicker].price;
        
        // Обновляем underlyingPrice в localStorage калькулятора
        if (state.underlyingPrice !== newPrice) {
          state.underlyingPrice = newPrice;
          localStorage.setItem('calculatorState', JSON.stringify(state));
          console.log('[Optioner Bridge] Underlying price обновлён в калькуляторе:', newPrice);
          
          // Триггерим событие для React
          window.dispatchEvent(new StorageEvent('storage', {
            key: 'calculatorState',
            newValue: JSON.stringify(state)
          }));
        }
      }
    });
  }
  
  // Также проверяем периодически (React может не триггерить storage event в той же вкладке)
  let checkCount = 0;
  const syncInterval = setInterval(() => {
    // Проверяем валидность контекста расширения
    if (!chrome.runtime?.id) {
      console.log('[Optioner Bridge] Extension context invalidated, stopping interval');
      clearInterval(syncInterval);
      return;
    }
    
    checkCount++;
    if (checkCount % 5 === 0) {
      // Каждые 10 секунд логируем статус
      const calcState = localStorage.getItem('calculatorState');
      if (calcState) {
        const state = JSON.parse(calcState);
        console.log('[Optioner Bridge] Проверка #' + checkCount + ', опционов:', (state.options || []).length, 'хэш:', lastOptionsHash);
      }
    }
    syncToExtension();
    syncUnderlyingPrice();
    syncFullChain();
  }, 2000);
  
  // Начальная синхронизация после загрузки
  window.addEventListener('load', () => {
    setTimeout(() => {
      syncToExtension();
      syncFullChain();
      console.log('[Optioner Bridge] Начальная синхронизация выполнена');
    }, 1000);
  });
  
})();
