/**
 * Главный модуль расширения Binance → Optioner Bridge
 * ЗАЧЕМ: Инициализация, MutationObserver, keep-alive соединение
 */

/**
 * Проверить, является ли текущая страница страницей eoptions
 */
function isEoptionsPage() {
  return window.location.href.includes('eoptions');
}

// Постоянное соединение с Service Worker (keep-alive)
let persistentPort = null;

function establishPersistentConnection() {
  if (!chrome.runtime?.id) return;
  try {
    persistentPort = chrome.runtime.connect({ name: 'binance-keepalive' });
    console.log('[Binance] ✅ Постоянное соединение установлено');

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

// Дебаунс и защита от параллельных вызовов
let injectTimer = null;
let isInjecting = false;

// Счётчик retry-попыток инжекта (сбрасывается при успехе)
let injectRetryCount = 0;
const INJECT_MAX_RETRIES = 5;
const INJECT_RETRY_DELAY = 1500;

/**
 * Дебаунс инжекта кнопок
 * ЗАЧЕМ: Binance активно перерисовывает DOM — не вызываем injectButtons слишком часто
 */
function scheduleInject(delay = 300) {
  if (injectTimer) clearTimeout(injectTimer);
  injectTimer = setTimeout(async () => {
    injectTimer = null;
    if (isInjecting) return;
    isInjecting = true;
    try {
      const injected = await injectButtons();
      if (injected === 0 && injectRetryCount < INJECT_MAX_RETRIES) {
        injectRetryCount++;
        console.log(`[Binance] injectButtons нашёл 0 ячеек, retry ${injectRetryCount}/${INJECT_MAX_RETRIES} через ${INJECT_RETRY_DELAY}мс`);
        scheduleInject(INJECT_RETRY_DELAY);
      } else if (injected > 0) {
        injectRetryCount = 0;
      }
    } finally {
      isInjecting = false;
    }
  }, delay);
}

/**
 * MutationObserver для отслеживания изменений DOM
 * ЗАЧЕМ: Binance — SPA с виртуализированным списком, DOM перерисовывается при скролле
 */
function setupMutationObserver() {
  let lastMutationTime = 0;

  const observer = new MutationObserver((mutations) => {
    const now = Date.now();

    if (isInjecting) return;

    // Игнорируем мутации от собственных кнопок
    const hasExternalChange = mutations.some(m => {
      if (m.type !== 'childList') return false;
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        // Игнорируем наши кнопки и изменения стилей ячеек страйка
        if (node.classList?.contains('bnb-add-btn')) continue;
        // Игнорируем если добавленный узел — потомок нашей кнопки
        if (node.closest?.('.bnb-add-btn')) continue;
        return true;
      }
      return false;
    });

    if (!hasExternalChange) return;

    // Дебаунс 2000мс — Binance обновляет цены каждую секунду, не нужно реагировать чаще
    if (now - lastMutationTime < 2000) return;
    lastMutationTime = now;

    // Не реагируем если API кэш пустой (нечего инжектировать)
    if (getAvailableExpirations().length === 0) return;

    scheduleInject(500);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Слушатель скролла — виртуализированный список перерисовывает DOM при скролле
  setupScrollListener();

  console.log('[Binance] MutationObserver запущен');
  return observer;
}

/**
 * Слушатель скролла для виртуализированного списка Binance
 * ЗАЧЕМ: При скролле Binance удаляет старые строки и добавляет новые — нужно реинжектировать кнопки
 */
function setupScrollListener() {
  let scrollTimer = null;

  const onScroll = () => {
    scheduleInject(200);
  };

  // Подписываемся на скролл на всех скроллабльных элементах страницы
  document.addEventListener('scroll', onScroll, { passive: true, capture: true });

  // Дополнительно ищем скроллабльный контейнер таблицы и подписываемся на него
  setTimeout(() => {
    const scrollable = findScrollableContainer();
    if (scrollable && scrollable !== document) {
      scrollable.addEventListener('scroll', onScroll, { passive: true });
      console.log('[Binance] Scroll listener на контейнер:', scrollable.className?.slice(0, 60));
    }
  }, 2000);
}

/**
 * Найти скроллабльный контейнер таблицы опционов
 */
function findScrollableContainer() {
  // Ищем элемент со страйком и идём вверх по дереву
  const strikeCells = document.querySelectorAll('.bnb-add-btn');
  if (strikeCells.length === 0) return null;

  let el = strikeCells[0].parentElement;
  while (el && el !== document.body) {
    const style = window.getComputedStyle(el);
    const overflow = style.overflow + style.overflowY;
    if (overflow.includes('scroll') || overflow.includes('auto')) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * Слушатель изменений chrome.storage
 * ЗАЧЕМ: Синхронизация состояния кнопок при изменении позиций из другой вкладки
 */
function setupStorageListener() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.bnb_positions) {
      // Проверяем timestamp чтобы не реагировать на собственные изменения
      if (Date.now() - lastSaveTimestamp > 500) {
        bnb_positions = changes.bnb_positions.newValue || {};
        refreshAllButtonStates();
      }
    }
  });
}

/**
 * Инициализация расширения
 */
async function init() {
  console.log('[Binance] 🚀 Инициализация Binance → Optioner Bridge');

  // Сбрасываем флаги предыдущего цикла (SPA-навигация может вызвать init() повторно)
  if (injectTimer) clearTimeout(injectTimer);
  injectTimer = null;
  isInjecting = false;
  injectRetryCount = 0;

  await loadPositions();
  console.log('[Binance] Позиции загружены:', Object.keys(bnb_positions).length, 'underlying');

  establishPersistentConnection();
  setupStorageListener();

  const underlying = getCurrentUnderlying();
  console.log('[Binance] Underlying из URL:', underlying);

  // Загружаем API кэш Greeks
  console.log('[Binance] Загружаем Greeks API...');
  try {
    const cache = await refreshGreeksCache(underlying);
    const exps = getAvailableExpirations();
    console.log('[Binance] Greeks API загружен:', Object.keys(cache).length, 'контрактов,', exps.length, 'экспираций:', exps.slice(0,3));
  } catch (e) {
    console.error('[Binance] ОШИБКА Greeks API:', e.message, e.stack);
  }

  setupMutationObserver();

  // Инжект только если API загрузился
  if (getAvailableExpirations().length > 0) {
    scheduleInject(500);
  }

  setInterval(() => refreshAllButtonStates(), 30000);

  setTimeout(() => {
    if (typeof diagnoseBinanceDom === 'function') diagnoseBinanceDom();
  }, 3000);

  console.log('[Binance] ✅ Инициализация завершена');
}

// Запускаем инициализацию только на странице eoptions
if (isEoptionsPage()) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
} else {
  console.log('[Binance] Не страница eoptions, пропускаем. URL:', window.location.href);
}

// Обработка SPA-навигации (Binance меняет URL через history.pushState без перезагрузки)
// ЗАЧЕМ: Когда пользователь переходит на eoptions из другой страницы Binance
let lastUrl = window.location.href;
const urlObserver = new MutationObserver(() => {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    console.log('[Binance] URL изменился:', currentUrl);
    if (isEoptionsPage()) {
      console.log('[Binance] Переход на eoptions — инициализируем');
      setTimeout(() => init(), 1000);
    }
  }
});
urlObserver.observe(document.body, { childList: true, subtree: true });

// Обработка восстановления страницы из bfcache
window.addEventListener('pageshow', (event) => {
  if (event.persisted && isEoptionsPage()) {
    console.log('[Binance] Страница восстановлена из bfcache, переподключаемся...');
    establishPersistentConnection();
    scheduleInject(500);
  }
});

console.log('[Binance] main.js загружен, URL:', window.location.href);
