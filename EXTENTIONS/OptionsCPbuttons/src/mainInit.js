/**
 * ext2 — Инициализация
 */

(async function ext2Init() {
  // 1. Загрузка позиций из chrome.storage
  await loadPositions();

  // 2. Event delegation для кнопок
  setupButtonDelegation();

  // 3. Инжект кнопок в таблицу
  injectButtons();

  // 4. Кнопка "Калькулятор" в шапке
  injectCalculatorButton();

  // 5. MutationObserver для новых строк
  setupObserver();

  // 5.1 Первичный health-check после того, как таблица отрисована
  // ЗАЧЕМ: Если TradingView поменял вёрстку — пользователь увидит предупреждение ещё до клика
  setTimeout(() => {
    if (typeof ext2RunHealthCheck === 'function') {
      const health = ext2RunHealthCheck();
      if (health.severity !== 'ok') {
        // Показываем панель с плашкой — даже если позиций ещё нет
        const p = document.querySelector('.ext2-panel');
        if (p) p.dataset.userClosed = 'false';
        showPanel();
      }
    }
  }, 2500);

  // 6. Показать панель если есть позиции
  const ticker = getTickerFromUrl();
  if (ticker && tvc_positions[ticker]?.length > 0) {
    tvc_activeTab = ticker;
    showPanel();
  } else if (Object.keys(tvc_positions).length > 0) {
    tvc_activeTab = Object.keys(tvc_positions)[0];
  }

  // 7. Слушатель сообщений от background/popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // ЗАЧЕМ: Фон (pendingRefresh.js / dbConfigRefresh.js) во время автообновления
    // спрашивает у content-script текущую цену базового актива. Здесь мы возвращаем
    // её через ext2GetUnderlyingPriceWithConfidence (healthCheck.js) с валидацией
    // по диапазону страйков чейна и явным отсечением правого сайдбара (watchlist /
    // priceWrapper- / detailsWidget). Без этого обработчика фон отваливается на свой
    // куцый inline-fallback, который путает цену с цифрой из сайдбара.
    if (message.action === 'getUnderlyingPrice') {
      let price = null;
      let confidence = 'none';
      try {
        if (typeof ext2GetUnderlyingPriceWithConfidence === 'function') {
          const r = ext2GetUnderlyingPriceWithConfidence();
          price = r?.price || null;
          confidence = r?.confidence || 'none';
        } else if (typeof getUnderlyingPrice === 'function') {
          price = getUnderlyingPrice();
          confidence = price ? 'low' : 'none';
        }
      } catch (e) {
        // оставляем price=null, фон уйдёт в inline-fallback
      }
      sendResponse({ price, confidence });
      return; // синхронный ответ
    }
    // Стратегия СЕВЕР в калькуляторе: развернуть указанную экспирацию и сдампить
    // полную цепочку в chrome.storage.local. См. src/northSupport.js.
    if (message.action === 'northExpandAndDump') {
      try {
        if (window.ext2North && typeof window.ext2North.handleNorthExpandAndDump === 'function') {
          window.ext2North.handleNorthExpandAndDump(message.date, sendResponse);
        } else {
          sendResponse({ ok: false, reason: 'ext2North not loaded' });
        }
      } catch (e) {
        sendResponse({ ok: false, reason: e.message });
      }
      return true; // async response
    }

    // Установка фильтров "Next 90 days" + "All strikes" и обновление списка экспираций.
    // Используется при открытии нового таба TV из калькулятора.
    if (message.action === 'northEnsureFilters') {
      try {
        if (window.ext2North && typeof window.ext2North.handleNorthEnsureFilters === 'function') {
          window.ext2North.handleNorthEnsureFilters(sendResponse);
        } else {
          sendResponse({ ok: false, reason: 'ext2North not loaded' });
        }
      } catch (e) {
        sendResponse({ ok: false, reason: e.message });
      }
      return true; // async
    }

    // Выставить фильтры доски (даты экспираций + "All strikes") через UI-клики.
    // ЗАЧЕМ: TradingView игнорирует URL-параметры series/strikes после редизайна —
    // единственный надёжный способ показать нужные опционы это кликнуть чипы фильтров
    // (см. northSupport.js ensureChainVisibility). Вызывается фоном (dbConfigRefresh.js /
    // pendingRefresh.js) перед ожиданием таблицы, чтобы нужные строки успели отрисоваться.
    if (message.action === 'ensureChainVisibility') {
      try {
        if (window.ext2North && typeof window.ext2North.ensureChainVisibility === 'function') {
          window.ext2North.ensureChainVisibility(message.payload).then(sendResponse);
        } else {
          sendResponse({ ok: false, reason: 'ext2North not loaded' });
        }
      } catch (e) {
        sendResponse({ ok: false, reason: e.message });
      }
      return true; // async response
    }

    if (message.action === 'refreshPanel') {
      loadPositions().then(() => {
        if (Object.keys(tvc_positions).length > 0) {
          tvc_activeTab = tvc_activeTab || Object.keys(tvc_positions)[0];
          showPanel();
        }
        refreshAllButtonStates();
        sendResponse({ success: true });
      });
      return true; // async response
    }
    if (message.action === 'showPanel') {
      // Сбрасываем флаг userClosed ДО загрузки — пользователь явно хочет открыть
      const p = document.querySelector('.ext2-panel');
      if (p) p.dataset.userClosed = 'false';
      loadPositions().then(() => {
        if (Object.keys(tvc_positions).length > 0) {
          tvc_activeTab = tvc_activeTab || Object.keys(tvc_positions)[0];
        }
        showPanel();
        sendResponse({ success: true });
      });
      return true; // async response — держим канал открытым
    }
  });

  // 8. Слушатель изменений chrome.storage (от другого таба)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEY]) return;
    if (_ext2_savingInProgress) return;

    tvc_positions = changes[STORAGE_KEY].newValue || {};
    if (Object.keys(tvc_positions).length > 0) {
      tvc_activeTab = tvc_activeTab || Object.keys(tvc_positions)[0];
      showPanel();
    } else {
      renderPanel();
    }
    refreshAllButtonStates();
  });

})();
