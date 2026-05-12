/**
 * Content script для beta.optioner.online
 * ЗАЧЕМ: Двусторонняя синхронизация между калькулятором и расширением Binance
 *
 * Калькулятор → Расширение: Слушаем изменения localStorage
 * Расширение → Калькулятор: Инжект через background.js
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
 * Слушаем изменения localStorage от калькулятора
 * ЗАЧЕМ: Когда пользователь удаляет опцион в калькуляторе — синхронизируем в расширение
 */
const originalSetItem = localStorage.setItem.bind(localStorage);
localStorage.setItem = function(key, value) {
  originalSetItem(key, value);

  if (key === 'calculatorState' && value) {
    try {
      const state = JSON.parse(value);
      // Отправляем обновлённое состояние в background для синхронизации
      if (chrome.runtime?.id) {
        chrome.runtime.sendMessage({
          action: 'calculatorStateUpdated',
          state: state
        }, () => {});
      }
    } catch (e) {}
  }
};

console.log('[Optioner-Binance] optioner.js загружен');
