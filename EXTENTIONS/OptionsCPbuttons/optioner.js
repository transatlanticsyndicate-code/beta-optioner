/**
 * Content script для futures.optioner.online
 * ЗАЧЕМ: Двусторонняя синхронизация между калькулятором и расширением
 * 
 * Калькулятор → Расширение: Слушаем изменения localStorage и синхронизируем в chrome.storage
 * Расширение → Калькулятор: Инжект через background.js
 */

// КРИТИЧНО: Создаём постоянное соединение с Service Worker через chrome.runtime.connect()
// ЗАЧЕМ: Service Worker в Manifest V3 "засыпает" после 30 секунд бездействия.
// Постоянное соединение (port) держит SW активным пока страница открыта.
let persistentPort = null;

function establishPersistentConnection() {
  if (!chrome.runtime?.id) return;
  
  try {
    persistentPort = chrome.runtime.connect({ name: 'optioner-keepalive' });
    
    persistentPort.onDisconnect.addListener(() => {
      // Проверяем lastError чтобы избежать ошибки bfcache
      // ЗАЧЕМ: При восстановлении страницы из back/forward cache порт уже закрыт
      const error = chrome.runtime.lastError;
      if (error) { /* bfcache — штатное поведение */ }
      persistentPort = null;
      // Переподключаемся через 1 секунду
      setTimeout(establishPersistentConnection, 1000);
    });
  } catch (e) {
    console.warn('[Optioner] Ошибка подключения:', e.message);
    // Повторяем через 5 секунд
    setTimeout(establishPersistentConnection, 5000);
  }
}

// Обработка восстановления страницы из bfcache
// ЗАЧЕМ: Когда пользователь нажимает "Назад" — страница восстанавливается, нужно переподключиться
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    establishPersistentConnection();
  }
});

// Устанавливаем соединение сразу при загрузке
establishPersistentConnection();

// Показать уведомление о потере связи с расширением
// ЗАЧЕМ: Когда расширение обновилось/перезагрузилось — content scripts теряют связь с Service Worker
function showConnectionLostNotification() {
  // Проверяем, не показано ли уже уведомление
  if (document.getElementById('tvc-connection-lost-notification')) return;
  
  const notification = document.createElement('div');
  notification.id = 'tvc-connection-lost-notification';
  notification.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #ff6b6b, #ee5a5a);
      color: white;
      padding: 16px 20px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 320px;
      animation: slideIn 0.3s ease;
    ">
      <style>
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      </style>
      <div style="font-weight: 600; margin-bottom: 8px; font-size: 14px;">
        ⚠️ Связь с расширением потеряна
      </div>
      <div style="font-size: 12px; opacity: 0.9; margin-bottom: 12px;">
        Расширение было обновлено. Перезагрузите обе страницы.
      </div>
      <button id="tvc-reload-this-page" style="
        background: white;
        color: #ee5a5a;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        font-weight: 600;
        cursor: pointer;
        font-size: 12px;
        width: 100%;
        margin-bottom: 8px;
      ">
        🔄 Перезагрузить эту страницу
      </button>
      <div style="font-size: 11px; opacity: 0.8; text-align: center;">
        ☝️ Также перезагрузите вкладку TradingView
      </div>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Обработчик кнопки — перезагружаем текущую страницу
  document.getElementById('tvc-reload-this-page').onclick = () => {
    location.reload();
  };
}

// ВАЖНО: Перехват setItem ДОЛЖЕН быть ДО IIFE, чтобы сработать до React
// Это позволяет мгновенно реагировать на tvc_refresh_command
(function setupSetItemHook() {
  const originalSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function(key, value) {
    originalSetItem(key, value);
    
    // Мгновенно обрабатываем refresh команду — без проверки chrome.runtime?.id
    // ЗАЧЕМ: Мгновенная реакция как при удалении опционов
    if (key === 'tvc_refresh_command' && value) {
      try {
        const cmd = JSON.parse(value);
        if (!cmd.processed) {
          // Диспатчим кастомное событие для обработки в IIFE
          window.dispatchEvent(new CustomEvent('tvc_refresh_command', { detail: value }));
        }
      } catch (e) {
        // Ошибки в hook игнорируем
      }
    }
  };
})();

(function() {
  'use strict';
  
  let lastOptionsHash = '';
  
  // Вычислить хэш массива опционов для сравнения
  function getOptionsHash(options) {
    if (!options || !Array.isArray(options)) return '';
    return options.map(o => o.id).sort().join(',');
  }
  
  // Конвертировать опцион из формата калькулятора в формат расширения
  // ВАЖНО: action (Buy/Sell) должен сохраняться при обратной синхронизации
  function convertToExtensionFormat(option, ticker) {
    return {
      id: parseInt(option.id) || Date.now(),
      action: option.action || 'Buy',
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
  
  // Флаг для предотвращения зацикливания синхронизации
  let syncInProgress = false;
  
  // Предыдущий список опционов для отслеживания удалений (храним полные данные для поиска по ключу)
  let previousOptions = [];
  
  // Синхронизировать УДАЛЕНИЯ из калькулятора в расширение
  // ВАЖНО: Эта функция НЕ добавляет новые опционы в tvc_positions!
  // Источник правды для добавления — только расширение (кнопки +C/+P).
  // ЗАЧЕМ: Калькулятор React может подтягивать свои данные (из бэкенда, из UI),
  // и если мы будем перезаписывать tvc_positions всем из calculatorState —
  // в панели расширения появятся "фантомные" опционы которые трейдер не добавлял.
  function syncToExtension() {
    // Проверяем валидность контекста расширения
    if (!chrome.runtime?.id) {
      return;
    }

    // Пропускаем если синхронизация инициирована расширением
    if (syncInProgress) return;

    // Пропускаем если загружена сохранённая конфигурация — React не пишет в calculatorState,
    // и пустой calculatorState НЕ означает что пользователь удалил опционы
    const loadedConfigId = localStorage.getItem('universalCalc_loadedConfigId');
    if (loadedConfigId) return;

    try {
      const calcState = localStorage.getItem('calculatorState');

      // Если calculatorState пустой или options пустой — калькулятор очищен
      if (!calcState) {
        if (previousOptions.length > 0) {
          chrome.runtime.sendMessage({ action: 'clearAllFromCalculator' });
          previousOptions = [];
          lastOptionsHash = '';
        }
        return;
      }

      const state = JSON.parse(calcState);
      const options = state.options || [];

      // Если options пустой, но раньше были опционы — тоже очистка
      if (options.length === 0 && previousOptions.length > 0) {
        chrome.runtime.sendMessage({ action: 'clearAllFromCalculator' });
        previousOptions = [];
        lastOptionsHash = '';
        return;
      }
      
      const currentHash = getOptionsHash(options);
      
      // Проверяем, изменились ли опционы
      if (currentHash === lastOptionsHash) return;
      
      // Получаем тикер
      const ticker = state.selectedTicker || 'ESH2026';
      const shortTicker = ticker.includes(':') ? ticker.split(':')[1] : ticker;
      
      // Определяем удалённые опционы по ключу (type + strike + date)
      const currentOptionKeys = new Set(options.map(o => `${o.type}_${o.strike}_${o.date}`));
      const deletedOptions = previousOptions.filter(o => !currentOptionKeys.has(`${o.type}_${o.strike}_${o.date}`));
      
      // Если есть удалённые опционы — отправляем событие расширению
      if (deletedOptions.length > 0) {
        const deletedOptionKeys = deletedOptions.map(o => ({
          type: o.type,
          strike: o.strike,
          expiration: o.date
        }));
        
        chrome.runtime.sendMessage({
          action: 'optionDeletedFromCalculator',
          ticker: shortTicker,
          deletedOptionKeys: deletedOptionKeys
        });
      }
      
      // Обновляем предыдущий список (копируем данные опционов)
      previousOptions = options.map(o => ({ type: o.type, strike: o.strike, date: o.date, id: o.id }));
      lastOptionsHash = currentHash;
      
      // НЕ перезаписываем tvc_positions — источник правды для добавления = расширение
      // Удаления обрабатываются через optionDeletedFromCalculator выше
      
    } catch (e) {
      console.warn('[Optioner Bridge] Ошибка синхронизации:', e);
    }
  }
  
  
  // Слушаем изменения localStorage (от React калькулятора)
  // ВАЖНО: storage event срабатывает только при изменении из ДРУГОЙ вкладки
  window.addEventListener('storage', (e) => {
    if (e.key === 'calculatorState') syncToExtension();
    if (e.key === 'tvc_command' && e.newValue) handleCommand(e.newValue);
    if (e.key === 'tvc_refresh_command' && e.newValue) handleRefreshCommand(e.newValue);
    if (e.key === 'tvc_north_command' && e.newValue) handleNorthCommand(e.newValue);
  });

  // Слушаем кастомное событие от setItem hook
  window.addEventListener('tvc_refresh_command', (e) => handleRefreshCommand(e.detail));
  
  // Обработка команды от калькулятора
  function handleCommand(commandJson) {
    if (!chrome.runtime?.id) return;
    
    try {
      const command = JSON.parse(commandJson);
      
      // Удаляем команду из localStorage (чтобы не обработать повторно)
      localStorage.removeItem('tvc_command');
      
      // Отправляем в background.js
      chrome.runtime.sendMessage(command);
    } catch (e) {
      console.error('[Optioner Bridge] Ошибка обработки команды:', e);
    }
  }
  
  /**
   * Обработка команд стратегии СЕВЕР через приватный ключ tvc_north_command.
   * ЗАЧЕМ: Стороннее расширение twparser слушает tvc_refresh_command, помечает
   * команды processed=true и блокирует их обработку у нас. На отдельном ключе
   * twparser не подсматривает — гонки нет.
   */
  function handleNorthCommand(commandJson) {
    if (!chrome.runtime?.id) {
      showConnectionLostNotification();
      return;
    }
    try {
      const command = JSON.parse(commandJson);
      if (command.processed) return;
      // Крипту обрабатывает расширение Binance. Выходим НЕ помечая processed,
      // чтобы Binance-мост увидел команду необработанной и собрал доску из Binance API.
      if (command.market === 'crypto') return;
      command.processed = true;
      localStorage.setItem('tvc_north_command', JSON.stringify(command));

      let action = null;
      if (command.type === 'north_init') {
        console.log('[Optioner Bridge/north] north_init: ticker:', command.ticker, 'url:', command.tradingViewUrl);
        action = {
          action: 'northInit',
          ticker: command.ticker || null,
          tradingViewUrl: command.tradingViewUrl || null,
        };
      } else if (command.type === 'north_expand_expiration') {
        console.log('[Optioner Bridge/north] north_expand_expiration:', command.date, 'ticker:', command.ticker, 'url:', command.tradingViewUrl);
        action = {
          action: 'northExpandAndDump',
          date: command.date,
          ticker: command.ticker || null,
          tradingViewUrl: command.tradingViewUrl || null,
        };
      } else {
        return;
      }

      console.log('[Optioner Bridge/north] отправляю в background:', action.action);
      chrome.runtime.sendMessage(action, (response) => {
        console.log('[Optioner Bridge/north] ответ background:', response, 'lastError:', chrome.runtime.lastError?.message);
        if (chrome.runtime.lastError) {
          console.error('[Optioner Bridge/north] Ошибка отправки:', chrome.runtime.lastError.message);
        }
      });
    } catch (e) {
      console.error('[Optioner Bridge/north] Ошибка обработки команды:', e);
    }
  }

  // Периодическая проверка приватного ключа на случай, если storage event
  // не сработал (React пишет в той же вкладке — storage event не стреляет).
  function checkAndHandleNorthCommand() {
    const pendingCmd = localStorage.getItem('tvc_north_command');
    if (!pendingCmd) return;
    try {
      const cmd = JSON.parse(pendingCmd);
      if (!cmd.processed) handleNorthCommand(pendingCmd);
    } catch (e) {}
  }

  // Обработка refresh команды (refresh_specific, refresh_range, refresh_single_strike)
  // ЗАЧЕМ: Калькулятор записывает команду в localStorage, мы передаём в background
  function handleRefreshCommand(commandJson) {
    // Если связь с расширением потеряна — показываем уведомление
    if (!chrome.runtime?.id) {
      showConnectionLostNotification();
      return;
    }
    
    try {
      const command = JSON.parse(commandJson);

      // Проверяем что команда не обработана
      if (command.processed) return;

      // ВАЖНО: sendPrIV_tocallc — команда от расширения В калькулятор (доставка свежих
      // котировок для сохранённой сделки). Её обрабатывает React-код калькулятора:
      // в хуке useExtensionRefreshCommand он сам читает tvc_refresh_command по polling,
      // применяет к state и помечает processed=true (см. UniversalOptionsCalculator.jsx).
      // Если бы мы пометили processed здесь — React увидел бы команду уже обработанной
      // и пропустил бы её → автообновление сделок «провисает».
      // Поэтому для sendPrIV_tocallc выходим ДО пометки processed и НЕ шлём её в background.
      if (command.type === 'sendPrIV_tocallc') return;

      // Помечаем как обработанную
      command.processed = true;
      localStorage.setItem('tvc_refresh_command', JSON.stringify(command));
      
      // Определяем action для background
      let action;
      if (command.type === 'refresh_specific') {
        // Группируем опционы по экспирации
        const optionsByDate = {};
        for (const opt of command.options || []) {
          const date = opt.date;
          if (!optionsByDate[date]) {
            optionsByDate[date] = [];
          }
          optionsByDate[date].push(opt);
        }
        
        action = {
          action: 'refreshSpecificOptions',
          optionsByDate,
          refreshUnderlyingPrice: command.refreshUnderlyingPrice
        };
      } else if (command.type === 'refresh_range') {
        // ЗАЧЕМ: Сбор диапазона опционов для Magic кнопки
        // Используем ту же методологию что и refresh_specific
        action = {
          action: 'refreshRangeOptions',
          daysFrom: command.daysFrom,
          daysTo: command.daysTo,
          strikeFrom: command.strikeFrom,
          strikeTo: command.strikeTo
        };
      } else if (command.type === 'refresh_single_strike') {
        // ЗАЧЕМ: Передаём exactStrike если есть — для "Супер подбор по одному страйку"
        // Если exactStrike указан — расширение использует его напрямую вместо вычисления через strikePercent
        action = {
          action: 'refreshSingleStrike',
          filters: {
            daysFrom: command.daysFrom,
            daysTo: command.daysTo,
            strikePercent: command.strikePercent,
            exactStrike: command.exactStrike || null
          }
        };
      } else if (command.type === 'send_slices_to_chart') {
        // ЗАЧЕМ: Отправка срезок плана выхода на график TradingView
        action = {
          action: 'sendSlicesToChart',
          slices: command.slices,
          chartUrl: command.chartUrl
        };
      } else if (command.type === 'clear_slices') {
        // ЗАЧЕМ: Очистка срезок с графика TradingView
        action = {
          action: 'clearSlicesFromChart',
          chartUrl: command.chartUrl
        };
      } else if (command.type === 'north_expand_expiration') {
        // Стратегия СЕВЕР: развернуть указанную экспирацию в таблице опционов
        // TradingView и сдампить полную цепочку. Если подходящего таба нет —
        // background сам откроет по tradingViewUrl, выставит фильтры и раскроет.
        console.log('[Optioner Bridge/north] north_expand_expiration:', command.date, 'ticker:', command.ticker, 'url:', command.tradingViewUrl);
        action = {
          action: 'northExpandAndDump',
          date: command.date,
          ticker: command.ticker || null,
          tradingViewUrl: command.tradingViewUrl || null,
        };
      } else if (command.type === 'north_init') {
        // Стратегия СЕВЕР, инициализация: открыть TV-таб (если нет), поставить
        // фильтры и обновить список экспираций. Без раскрытия групп.
        console.log('[Optioner Bridge/north] north_init: ticker:', command.ticker, 'url:', command.tradingViewUrl);
        action = {
          action: 'northInit',
          ticker: command.ticker || null,
          tradingViewUrl: command.tradingViewUrl || null,
        };
      } else {
        return;
      }
      
      // Записываем статус "в процессе"
      localStorage.setItem('tvc_refresh_result', JSON.stringify({
        status: 'collecting',
        progress: 0,
        message: 'Отправка команды в расширение...',
        timestamp: Date.now()
      }));

      // Отправляем команду в background.js
      // ВАЖНО: Для долгих операций (refresh_range) background сам запишет результат
      // через executeScript в localStorage калькулятора
      if (action.action === 'northInit' || action.action === 'northExpandAndDump') {
        console.log('[Optioner Bridge/north] отправляю в background:', action.action);
      }
      chrome.runtime.sendMessage(action, (response) => {
        if (action.action === 'northInit' || action.action === 'northExpandAndDump') {
          console.log('[Optioner Bridge/north] ответ background:', response, 'lastError:', chrome.runtime.lastError?.message);
        }
        // Проверяем lastError
        if (chrome.runtime.lastError) {
          console.error('[Optioner Bridge] Ошибка отправки:', chrome.runtime.lastError.message);
          localStorage.setItem('tvc_refresh_result', JSON.stringify({
            status: 'error',
            progress: 0,
            message: chrome.runtime.lastError.message || 'Ошибка связи с расширением',
            timestamp: Date.now()
          }));
          return;
        }
        
        // Обрабатываем ответ если есть
        if (response) {
          if (response.success) {
            const count = response.data?.optionsCount || response.updatedCount || 0;
            localStorage.setItem('tvc_refresh_result', JSON.stringify({
              status: 'complete',
              progress: 100,
              message: `Собрано ${count} опционов`,
              data: response.data,
              timestamp: Date.now()
            }));
            
            // Триггерим событие для React
            window.dispatchEvent(new StorageEvent('storage', {
              key: 'tvc_refresh_result',
              newValue: localStorage.getItem('tvc_refresh_result')
            }));
          } else if (response.error) {
            localStorage.setItem('tvc_refresh_result', JSON.stringify({
              status: 'error',
              progress: 0,
              message: response.error,
              timestamp: Date.now()
            }));
          }
        }
      });
      
    } catch (e) {
      console.error('[Optioner Bridge] Ошибка обработки refresh команды:', e);
      localStorage.setItem('tvc_refresh_result', JSON.stringify({
        status: 'error',
        progress: 0,
        message: e.message,
        timestamp: Date.now()
      }));
    }
  }
  
  // Проверяем команду при загрузке
  const pendingCommand = localStorage.getItem('tvc_command');
  if (pendingCommand) handleCommand(pendingCommand);
  
  // Проверяем refresh команду при загрузке
  const pendingRefreshCommand = localStorage.getItem('tvc_refresh_command');
  if (pendingRefreshCommand) {
    try {
      const cmd = JSON.parse(pendingRefreshCommand);
      if (!cmd.processed) handleRefreshCommand(pendingRefreshCommand);
    } catch (e) {}
  }

  // Проверяем north-команду при загрузке (приватный ключ, не пересекается с twparser)
  const pendingNorthCommand = localStorage.getItem('tvc_north_command');
  if (pendingNorthCommand) {
    try {
      const cmd = JSON.parse(pendingNorthCommand);
      if (!cmd.processed) handleNorthCommand(pendingNorthCommand);
    } catch (e) {}
  }
  
  // Слушаем сообщения от background.js (статус сбора и синхронизация)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Запись rangeOptions от refresh_range
    // ЗАЧЕМ: Background отправляет собранные опционы для Magic кнопки
    if (message.action === 'writeRangeOptions') {
      try {
        const calcState = localStorage.getItem('calculatorState');
        const state = calcState ? JSON.parse(calcState) : {};
        
        // Обновляем цену underlying
        if (message.underlyingPrice) {
          state.underlyingPrice = message.underlyingPrice;
        }
        
        // Записываем в rangeOptions (НЕ в options!)
        state.rangeOptions = (message.rangeOptions || []).map(opt => ({
          type: opt.type,
          strike: opt.strike,
          date: opt.expirationISO || opt.date,
          bid: opt.bid,
          ask: opt.ask,
          premium: opt.price || (opt.bid + opt.ask) / 2,
          volume: opt.volume,
          impliedVolatility: opt.iv,
          delta: opt.delta,
          gamma: opt.gamma,
          theta: opt.theta,
          vega: opt.vega,
          rho: opt.rho
        }));
        
        localStorage.setItem('calculatorState', JSON.stringify(state));
        
        // Триггерим событие для React
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'calculatorState',
          newValue: JSON.stringify(state)
        }));
        
        sendResponse({ success: true, count: state.rangeOptions.length });
      } catch (e) {
        console.error('[Optioner] Ошибка writeRangeOptions:', e);
        sendResponse({ success: false, error: e.message });
      }
      return true;
    }
    
    // Обработка статуса сбора данных
    if (message.action === 'updateTVCStatus') {
      const statusData = message.status;
      
      // Записываем в localStorage калькулятора
      localStorage.setItem('tvc_status', JSON.stringify(statusData));
      
      // Триггерим событие для React
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'tvc_status',
        newValue: JSON.stringify(statusData)
      }));
      
      sendResponse({ success: true });
      return true;
    }
    
    // Обработка синхронизации от расширения (удаление опциона)
    if (message.action === 'syncFromExtension') {
      syncInProgress = true;
      
      // Обновляем localStorage калькулятора
      try {
        const calcState = localStorage.getItem('calculatorState');
        if (calcState) {
          const state = JSON.parse(calcState);
          const beforeCount = (state.options || []).length;
          
          // Удаляем опцион по уникальному ключу (type + strike + date)
          // ЗАЧЕМ: ID в расширении и калькуляторе разные, поэтому ищем по бизнес-ключу
          if (message.optionKey) {
            const { type, strike, expiration } = message.optionKey;
            state.options = (state.options || []).filter(o => 
              !(o.type === type && o.strike === strike && o.date === expiration)
            );
          } else if (message.deletedOptionId) {
            // Fallback: удаление по ID (если вдруг ID совпадают)
            state.options = (state.options || []).filter(o => String(o.id) !== String(message.deletedOptionId));
          }
          
          const afterCount = (state.options || []).length;
          const deleted = beforeCount - afterCount;
          
          if (deleted > 0) {
            localStorage.setItem('calculatorState', JSON.stringify(state));
            
            // Обновляем previousOptions чтобы не триггерить обратную синхронизацию
            previousOptions = state.options.map(o => ({ type: o.type, strike: o.strike, date: o.date, id: o.id }));
            lastOptionsHash = getOptionsHash(state.options);
            
            // Триггерим событие для React
            window.dispatchEvent(new StorageEvent('storage', {
              key: 'calculatorState',
              newValue: JSON.stringify(state)
            }));
            
          }
          
          sendResponse({ success: true, deleted });
        } else {
          sendResponse({ success: true, deleted: 0 });
        }
      } catch (e) {
        console.error('[Optioner Bridge] Ошибка syncFromExtension:', e);
        sendResponse({ success: false, error: e.message });
      }
      
      // Снимаем флаг через небольшую задержку
      setTimeout(() => {
        syncInProgress = false;
      }, 100);
      
      return true;
    }
    
    return true;
  });
  
  // Не перезаписываем в localStorage более свежий объект более старым.
  // ЗАЧЕМ: на странице калькулятора может одновременно работать второй мост (Binance,
  // для крипты), который синкает те же ключи. Сравнение по timestamp не даёт устаревшей
  // копии из «чужого» расширения затереть только что собранную свежую цепочку.
  function incomingIsNewer(key, incoming) {
    try {
      const cur = JSON.parse(localStorage.getItem(key) || 'null');
      if (cur && cur.timestamp && incoming && incoming.timestamp) {
        return incoming.timestamp > cur.timestamp;
      }
    } catch (e) {}
    return true;
  }

  // Синхронизировать tvc_full_chain из расширения в localStorage калькулятора
  function syncFullChain() {
    if (!chrome.runtime?.id) return;

    chrome.storage.local.get(['tvc_full_chain'], (result) => {
      const fullChain = result.tvc_full_chain;
      if (!fullChain) return;

      // Сохраняем в localStorage калькулятора
      const currentData = localStorage.getItem('tvc_full_chain');
      const newData = JSON.stringify(fullChain);

      if (currentData !== newData && incomingIsNewer('tvc_full_chain', fullChain)) {
        localStorage.setItem('tvc_full_chain', newData);
        // Триггерим событие для React
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'tvc_full_chain',
          newValue: newData
        }));
      }
    });
  }

  // Синхронизировать tvc_expirations_list (список экспираций по DTE-бейджам)
  // из расширения в localStorage калькулятора. Используется поп-апом СЕВЕР для
  // показа доступных дат сразу при открытии, без парсинга строк.
  function syncExpirationsList() {
    if (!chrome.runtime?.id) return;

    chrome.storage.local.get(['tvc_expirations_list'], (result) => {
      const list = result.tvc_expirations_list;
      if (!list) return;

      const currentData = localStorage.getItem('tvc_expirations_list');
      const newData = JSON.stringify(list);

      if (currentData !== newData && incomingIsNewer('tvc_expirations_list', list)) {
        localStorage.setItem('tvc_expirations_list', newData);
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'tvc_expirations_list',
          newValue: newData,
        }));
      }
    });
  }
  
  // Синхронизировать underlying price из расширения в калькулятор
  function syncUnderlyingPrice() {
    if (!chrome.runtime?.id) return;
    
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
          // Триггерим событие для React
          window.dispatchEvent(new StorageEvent('storage', {
            key: 'calculatorState',
            newValue: JSON.stringify(state)
          }));
        }
      }
    });
  }
  
  // Проверка и обработка tvc_refresh_command
  // ЗАЧЕМ: Аналогично механизму удаления — периодически проверяем и обрабатываем
  function checkAndHandleRefreshCommand() {
    const pendingCmd = localStorage.getItem('tvc_refresh_command');
    if (!pendingCmd) return;
    
    try {
      const cmd = JSON.parse(pendingCmd);
      if (!cmd.processed) handleRefreshCommand(pendingCmd);
    } catch (e) {}
  }
  
  // Также проверяем периодически (React может не триггерить storage event в той же вкладке)
  let checkCount = 0;
  const syncInterval = setInterval(() => {
    // Проверяем валидность контекста расширения
    if (!chrome.runtime?.id) {
      clearInterval(syncInterval);
      return;
    }
    
    checkCount++;
    syncConfigToPositions();
    syncToExtension();
    syncUnderlyingPrice();
    syncFullChain();
    syncExpirationsList();
    checkAndHandleRefreshCommand();
    checkAndHandleNorthCommand();
  }, 2000);
  
  
  // Синхронизировать опционы из сохранённой конфигурации в tvc_positions
  // ЗАЧЕМ: При открытии сохранённой сделки — её опционы попадают в панель ext2,
  // и ext2 знает о них при добавлении новых опционов через кнопки
  let _lastSyncedConfigId = null;
  function syncConfigToPositions() {
    if (!chrome.runtime?.id) return;

    const configId = localStorage.getItem('universalCalc_loadedConfigId');
    if (!configId) return;
    if (configId === _lastSyncedConfigId) return;

    try {
      // Читаем опционы из сохранённой конфигурации напрямую
      // ЗАЧЕМ: React не пишет в calculatorState при загрузке config
      const cfgs = JSON.parse(localStorage.getItem('universalCalculatorConfigurations') || '[]');
      const cfg = cfgs.find(c => c.id === configId);
      if (!cfg || !cfg.state) return;

      const options = cfg.state.options || [];
      const ticker = cfg.state.selectedTicker || cfg.ticker;
      if (!ticker || !options.length) return;

      _lastSyncedConfigId = configId;

      chrome.runtime.sendMessage({
        action: 'ext2_syncConfigPositions',
        ticker: ticker,
        options: options
      }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response?.success) {
          previousOptions = options.map(o => ({ type: o.type, strike: o.strike, date: o.date, id: o.id }));
          lastOptionsHash = getOptionsHash(options);
        }
      });
    } catch (e) {
      console.warn('[Optioner] Ошибка syncConfigToPositions:', e.message);
    }
  }

  // Начальная синхронизация после загрузки
  window.addEventListener('load', () => {
    setTimeout(() => {
      syncConfigToPositions();
      syncToExtension();
      syncFullChain();
    }, 1000);
  });
  
  // ИСПРАВЛЕНИЕ БАГОВ 6-7: Инициализация EventBus для синхронизации с расширением
  if (typeof initCalculatorEventBus === 'function') {
    initCalculatorEventBus();
  }
  
})();
