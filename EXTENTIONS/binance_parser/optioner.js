/**
 * Content script для beta.optioner.online
 * ЗАЧЕМ: Двусторонняя синхронизация между калькулятором и расширением Binance
 *
 * Калькулятор → Расширение: Слушаем изменения localStorage
 * Расширение → Калькулятор: Инжект через background.js
 *
 * Стратегия «Север GPT» (крипта): слушаем приватный ключ tvc_north_command,
 * шлём команду в background (он собирает доску из Binance API), затем синкаем
 * результат (tvc_expirations_list / tvc_full_chain) из chrome.storage в localStorage.
 */

let persistentPort = null;

function establishPersistentConnection() {
  if (!chrome.runtime?.id) return;
  try {
    persistentPort = chrome.runtime.connect({ name: 'optioner-binance-keepalive' });
    console.log('[Optioner-Binance] ✅ Постоянное соединение установлено');

    persistentPort.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError;
      persistentPort = null;
      if (!error) {
        setTimeout(establishPersistentConnection, 1000);
      }
    });
  } catch (e) {
    setTimeout(establishPersistentConnection, 5000);
  }
}

window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    console.log('[Optioner-Binance] Страница восстановлена из bfcache, переподключаемся...');
    establishPersistentConnection();
  }
});

establishPersistentConnection();

/**
 * Слушаем сообщения от background.js
 * ЗАЧЕМ: Обработка команд удаления опционов из калькулятора
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'deleteOptionFromCalculator') {
    handleDeleteFromCalculator(message.optionKey);
    sendResponse({ success: true });
    return true;
  }
});

/**
 * Удалить опцион из localStorage калькулятора
 * ЗАЧЕМ: Синхронизация удаления из расширения в калькулятор
 */
function handleDeleteFromCalculator(optionKey) {
  try {
    const calcStateRaw = localStorage.getItem('calculatorState');
    if (!calcStateRaw) return;

    const calcState = JSON.parse(calcStateRaw);
    if (!calcState.options) return;

    const before = calcState.options.length;
    calcState.options = calcState.options.filter(opt => {
      const sameType = opt.type === optionKey.type;
      const sameStrike = String(opt.strike) === String(optionKey.strike);
      const sameExp = opt.date === optionKey.expiration;
      return !(sameType && sameStrike && sameExp);
    });

    const after = calcState.options.length;
    console.log(`[Optioner-Binance] Удалено опционов: ${before - after}`);

    localStorage.setItem('calculatorState', JSON.stringify(calcState));

    // Уведомляем React о изменении
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'calculatorState',
      newValue: JSON.stringify(calcState)
    }));
  } catch (e) {
    console.error('[Optioner-Binance] Ошибка удаления:', e);
  }
}

/**
 * Обработка команды стратегии «Север GPT» (приватный ключ tvc_north_command).
 * РЕАГИРУЕМ ТОЛЬКО НА КРИПТУ (command.market === 'crypto'): команды по акциям
 * обрабатывает расширение TradingView. Поле market проставляет фронт по режиму
 * калькулятора — так две установленные одновременно расширения не конфликтуют.
 */
function handleNorthCommand(commandJson) {
  if (!chrome.runtime?.id) return;
  try {
    const command = JSON.parse(commandJson);
    if (command.processed) return;
    if (command.market !== 'crypto') return; // не крипта — пусть обработает TradingView-мост

    command.processed = true;
    localStorage.setItem('tvc_north_command', JSON.stringify(command));

    let action = null;
    if (command.type === 'north_init') {
      action = { action: 'northInit', ticker: command.ticker || null };
    } else if (command.type === 'north_expand_expiration') {
      action = { action: 'northExpandAndDump', ticker: command.ticker || null, date: command.date };
    } else {
      return;
    }

    console.log('[Optioner-Binance/north] отправляю в background:', action.action, command.ticker);
    chrome.runtime.sendMessage(action, (response) => {
      console.log('[Optioner-Binance/north] ответ background:', response, 'lastError:', chrome.runtime.lastError?.message);
      // Сразу подтянем свежий результат, не дожидаясь 2-сек тика
      syncExpirationsList();
      syncFullChain();
    });
  } catch (e) {
    console.error('[Optioner-Binance/north] Ошибка обработки команды:', e);
  }
}

// Периодическая проверка приватного ключа (React пишет в той же вкладке — storage event не стреляет).
function checkAndHandleNorthCommand() {
  const pendingCmd = localStorage.getItem('tvc_north_command');
  if (!pendingCmd) return;
  try {
    const cmd = JSON.parse(pendingCmd);
    if (!cmd.processed && cmd.market === 'crypto') handleNorthCommand(pendingCmd);
  } catch (e) {}
}

/**
 * Не перезаписываем в localStorage более свежий объект более старым.
 * ЗАЧЕМ: на странице калькулятора могут одновременно работать оба моста (Binance и
 * TradingView), и оба синкают ключи tvc_full_chain / tvc_expirations_list. Сравнение
 * по timestamp гарантирует, что устаревшая копия из «чужого» расширения не затрёт свежую.
 */
function incomingIsNewer(key, incoming) {
  try {
    const cur = JSON.parse(localStorage.getItem(key) || 'null');
    if (cur && cur.timestamp && incoming && incoming.timestamp) {
      return incoming.timestamp > cur.timestamp;
    }
  } catch (e) {}
  return true;
}

// Синхронизировать tvc_full_chain из chrome.storage в localStorage калькулятора.
function syncFullChain() {
  if (!chrome.runtime?.id) return;
  chrome.storage.local.get(['tvc_full_chain'], (result) => {
    const fullChain = result.tvc_full_chain;
    if (!fullChain) return;
    if (!incomingIsNewer('tvc_full_chain', fullChain)) return;

    const newData = JSON.stringify(fullChain);
    if (localStorage.getItem('tvc_full_chain') === newData) return;

    localStorage.setItem('tvc_full_chain', newData);
    window.dispatchEvent(new StorageEvent('storage', { key: 'tvc_full_chain', newValue: newData }));
  });
}

// Синхронизировать tvc_expirations_list из chrome.storage в localStorage калькулятора.
function syncExpirationsList() {
  if (!chrome.runtime?.id) return;
  chrome.storage.local.get(['tvc_expirations_list'], (result) => {
    const list = result.tvc_expirations_list;
    if (!list) return;
    if (!incomingIsNewer('tvc_expirations_list', list)) return;

    const newData = JSON.stringify(list);
    if (localStorage.getItem('tvc_expirations_list') === newData) return;

    localStorage.setItem('tvc_expirations_list', newData);
    window.dispatchEvent(new StorageEvent('storage', { key: 'tvc_expirations_list', newValue: newData }));
  });
}

/**
 * Слушаем изменения localStorage от калькулятора
 * ЗАЧЕМ: Когда пользователь удаляет опцион в калькуляторе — синхронизируем в расширение.
 * Плюс перехватываем команду «Север GPT» (tvc_north_command) при записи в той же вкладке.
 */
const originalSetItem = localStorage.setItem.bind(localStorage);
localStorage.setItem = function(key, value) {
  originalSetItem(key, value);

  if (key === 'calculatorState' && value) {
    try {
      const state = JSON.parse(value);
      if (chrome.runtime?.id) {
        chrome.runtime.sendMessage({
          action: 'calculatorStateUpdated',
          state: state
        }, () => {});
      }
    } catch (e) {}
  }

  if (key === 'tvc_north_command' && value) {
    try {
      const cmd = JSON.parse(value);
      if (!cmd.processed && cmd.market === 'crypto') handleNorthCommand(value);
    } catch (e) {}
  }
};

// Storage event — на случай записи команды из другой вкладки того же origin.
window.addEventListener('storage', (e) => {
  if (e.key === 'tvc_north_command' && e.newValue) handleNorthCommand(e.newValue);
});

// Проверяем «зависшую» команду при загрузке.
const pendingNorthCommand = localStorage.getItem('tvc_north_command');
if (pendingNorthCommand) {
  try {
    const cmd = JSON.parse(pendingNorthCommand);
    if (!cmd.processed && cmd.market === 'crypto') handleNorthCommand(pendingNorthCommand);
  } catch (e) {}
}

// Периодический синк (React в той же вкладке не всегда триггерит storage event).
const northSyncInterval = setInterval(() => {
  if (!chrome.runtime?.id) {
    clearInterval(northSyncInterval);
    return;
  }
  checkAndHandleNorthCommand();
  syncFullChain();
  syncExpirationsList();
}, 2000);

console.log('[Optioner-Binance] optioner.js загружен');
