/**
 * Background Module: Message Handler
 * ЗАЧЕМ: Обработка всех сообщений от content scripts и popup
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Binance Bridge] Extension установлен');
});

// Keep-alive соединения
chrome.runtime.onConnect.addListener((port) => {
  console.log('[Binance Bridge] Соединение установлено:', port.name);
  port.onDisconnect.addListener(() => {
    console.log('[Binance Bridge] Соединение разорвано:', port.name);
  });
});

// Главный обработчик сообщений
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Ping
  if (message.action === 'ping') {
    sendResponse({ success: true, timestamp: Date.now() });
    return true;
  }

  // Прокси для Binance API — content script не может делать fetch из-за CSP
  if (message.action === 'fetchBinanceAPI') {
    console.log('[BG] fetchBinanceAPI:', message.url);
    fetch(message.url)
      .then(r => {
        console.log('[BG] HTTP status:', r.status, r.ok);
        return r.json();
      })
      .then(data => {
        console.log('[BG] data type:', typeof data, Array.isArray(data), 'length:', Array.isArray(data) ? data.length : JSON.stringify(data).slice(0, 100));
        sendResponse({ success: true, data });
      })
      .catch(e => {
        console.error('[BG] fetch error:', e.message);
        sendResponse({ success: false, error: e.message });
      });
    return true;
  }

  // Открыть калькулятор с данными позиций
  if (message.action === 'openOptionerTab') {
    handleOpenOptionerTab(message, sendResponse);
    return true;
  }

  // Стратегия «Север GPT» (крипта): собрать список экспираций из Binance API.
  // ЗАЧЕМ: поп-ап ждёт tvc_expirations_list. Данные публичные — берём в фоне, без вкладки Binance.
  if (message.action === 'northInit') {
    if (self.northChain && typeof self.northChain.buildNorthExpirationsList === 'function') {
      self.northChain.buildNorthExpirationsList(message.ticker)
        .then((r) => sendResponse(r))
        .catch((e) => sendResponse({ ok: false, reason: e.message }));
    } else {
      sendResponse({ ok: false, reason: 'northChain module not loaded' });
    }
    return true;
  }

  // Стратегия «Север GPT» (крипта): собрать полную цепочку выбранной экспирации.
  if (message.action === 'northExpandAndDump') {
    if (self.northChain && typeof self.northChain.buildNorthFullChain === 'function') {
      self.northChain.buildNorthFullChain(message.ticker, message.date)
        .then((r) => sendResponse(r))
        .catch((e) => sendResponse({ ok: false, reason: e.message }));
    } else {
      sendResponse({ ok: false, reason: 'northChain module not loaded' });
    }
    return true;
  }

  // Синхронизировать удаление опциона в калькулятор
  if (message.action === 'syncDeleteToCalculator') {
    handleSyncDeleteToCalculator(message, sendResponse);
    return true;
  }

  // Опцион удалён в калькуляторе — синхронизируем в расширение
  if (message.action === 'optionDeletedFromCalculator') {
    handleOptionDeletedFromCalculator(message, sendResponse);
    return true;
  }

  // Состояние калькулятора обновилось — диффим с bnb_positions и удаляем
  // из расширения те опционы, которых больше нет в калькуляторе.
  // ЗАЧЕМ: калькулятор — главный источник истины. Без этого удалённые
  // в калькуляторе опционы возвращаются обратно при следующем инжекте.
  if (message.action === 'calculatorStateUpdated') {
    handleCalculatorStateUpdated(message);
    return false;
  }

  // Получить позиции из storage
  if (message.type === 'GET_POSITIONS') {
    chrome.storage.local.get(['bnb_positions'], (result) => {
      sendResponse(result.bnb_positions || {});
    });
    return true;
  }

  // Обновить иконку
  if (message.action === 'updateIcon') {
    sendResponse({ success: true });
    return true;
  }

  return true;
});

/**
 * Синхронизировать удаление опциона в калькулятор
 * ЗАЧЕМ: Когда пользователь удаляет опцион в расширении — удаляем в калькуляторе
 */
function handleSyncDeleteToCalculator(message, sendResponse) {
  const { optionKey } = message;

  chrome.tabs.query({
    url: [
      'https://beta.optioner.online/tools/universal-calculator*',
      'http://localhost:3000/tools/universal-calculator*'
    ]
  }, (tabs) => {
    if (tabs.length === 0) {
      sendResponse({ success: false, error: 'Калькулятор не открыт' });
      return;
    }

    const tabId = tabs[0].id;
    chrome.tabs.sendMessage(tabId, {
      action: 'deleteOptionFromCalculator',
      optionKey: optionKey
    }, (response) => {
      sendResponse({ success: true });
    });
  });
}

/**
 * Обработка удаления опциона из калькулятора
 * ЗАЧЕМ: Синхронизируем удаление из калькулятора в расширение
 */
function handleOptionDeletedFromCalculator(message, sendResponse) {
  const { optionKey } = message;

  // Находим вкладку Binance и отправляем команду удаления
  chrome.tabs.query({
    url: [
      'https://www.binance.com/*/eoptions*'
    ]
  }, (tabs) => {
    if (tabs.length === 0) {
      sendResponse({ success: false });
      return;
    }

    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'syncDeleteFromCalculator',
        optionKey: optionKey
      }, () => {});
    }

    sendResponse({ success: true });
  });
}

// Обновление иконки при смене активной вкладки
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    updateIconForTab(tab.id, tab.url);
  } catch (e) {}
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    updateIconForTab(tabId, tab.url);
  }
});

/**
 * Обновить иконку расширения
 */
function updateIconForTab(tabId, url) {
  if (!url) return;
  const isBinance = url.includes('binance.com') && url.includes('eoptions');
  const isCalculator = url.includes('beta.optioner.online') || url.includes('localhost:3000');

  // Можно добавить разные иконки для разных состояний
  // Пока используем одну иконку
}

/**
 * Обработка обновления calculatorState из вкладки калькулятора.
 * Сравниваем текущие options калькулятора с bnb_positions[underlying]
 * и удаляем из расширения те, чего больше нет в калькуляторе.
 */
function handleCalculatorStateUpdated(message) {
  const state = message && message.state ? message.state : null;
  if (!state) return;

  const underlying = state.selectedTicker;
  if (!underlying) return;

  const options = Array.isArray(state.options) ? state.options : null;
  if (!options) return;

  const keyOf = (t, s, d) => {
    const date = (d || '').toString().slice(0, 10);
    return `${(t || '').toUpperCase()}|${parseFloat(s)}|${date}`;
  };

  const calcKeys = new Set(options.map(o => keyOf(o.type, o.strike, o.date)));

  chrome.storage.local.get(['bnb_positions'], (res) => {
    const all = res && res.bnb_positions ? res.bnb_positions : {};
    const arr = all[underlying];
    if (!Array.isArray(arr) || arr.length === 0) return;

    const filtered = arr.filter(p => {
      const dateField = p.expirationISO || p.expiration;
      return calcKeys.has(keyOf(p.type, p.strike, dateField));
    });

    if (filtered.length === arr.length) return; // ничего не удалили

    if (filtered.length === 0) {
      delete all[underlying];
    } else {
      all[underlying] = filtered;
    }

    chrome.storage.local.set({ bnb_positions: all }, () => {
      console.log('[Background] bnb_positions[' + underlying + '] синхронизирован из калькулятора: было', arr.length, ', стало', filtered.length);
      // Триггер перерисовки кнопок +/− на вкладках Binance.
      chrome.tabs.query({ url: 'https://www.binance.com/*/eoptions*' }, (tabs) => {
        if (!tabs || tabs.length === 0) return;
        for (const t of tabs) {
          chrome.tabs.sendMessage(t.id, { action: 'refreshButtons' }, () => {
            // намеренно игнорируем lastError — вкладка могла закрыться
            void chrome.runtime.lastError;
          });
        }
      });
    });
  });
}

console.log('[Background] messageHandler.js загружен');
