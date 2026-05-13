/**
 * Background Module: Calculator Tab Router (Binance)
 * ЗАЧЕМ: Симметричный пендант OptionsCPbuttons/background/calcTabRouter.js
 * для Binance. Маршрутизирует триггеры обновления pending/standard-сделок
 * на нужный поток (pendingRefresh / dbConfigRefresh).
 *
 * Архитектурно идентичен TV-роутеру: один и тот же alarm + tabs.onUpdated,
 * один и тот же ключ loadedConfigStatus, одно и то же сообщение
 * executeDbConfigRefresh от оверлея.
 *
 * Зависит от: pendingRefresh.js (checkPendingRefreshCommands),
 *             dbConfigRefresh.js (autoRefreshDbConfig, executeDbConfigRefresh),
 *             refreshShared.js (checkDbConfigOverlayCommands).
 */

const CALC_TAB_URL_MATCHES = [
  'https://beta.optioner.online/*',
  'http://localhost:3000/*'
];

const CALC_ALARM_NAME = 'check-calculator-commands-binance';

// Анти-дребезг для tabs.onUpdated: SPA-навигации иногда выстреливают complete многократно.
const _lastTriggerByTab = new Map();
const TAB_TRIGGER_DEBOUNCE_MS = 5000;

function _isCalcUrl(url) {
  if (!url) return false;
  return url.includes('beta.optioner.online') || url.includes('localhost:3000');
}

async function _readLoadedConfigStatus(calcTabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: calcTabId },
      func: () => localStorage.getItem('universalCalc_loadedConfigStatus')
    });
    return results?.[0]?.result || null;
  } catch (e) {
    return null;
  }
}

/**
 * Главный диспетчер для одной вкладки калькулятора с открытой сделкой.
 * Используется и из alarm, и из tabs.onUpdated.
 *
 * @param {'onUpdated'|'alarm'} source — pending-обновление запускается только
 *   на 'onUpdated' (загрузка вкладки или F5), но не на 'alarm', чтобы сделка
 *   "в ожидании" не обновлялась каждые 30 секунд.
 */
async function _routeForCalcTab(calcTabId, calcUrl, source) {
  if (!calcUrl || !calcUrl.includes('dbConfig=')) return;

  const status = await _readLoadedConfigStatus(calcTabId);

  if (status === 'pending') {
    // Pending — один раз при загрузке/F5 вкладки. Из алярма не перезапускаем.
    if (source === 'onUpdated') {
      checkPendingRefreshCommands(calcTabId);
    }
  } else {
    // Standard — оверлей. Защита от повторного показа — _processedTabs внутри dbConfigRefresh.
    autoRefreshDbConfig(calcTabId, calcUrl);
  }
}

// Алярм каждые 30 секунд — нужен для standard-потока (подбор отложенных
// команд оверлея). Для pending алярм ничего не делает — обновление
// выполняется ровно один раз через tabs.onUpdated.
chrome.alarms.create(CALC_ALARM_NAME, { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== CALC_ALARM_NAME) return;
  try {
    const tabs = await chrome.tabs.query({ url: CALC_TAB_URL_MATCHES });
    for (const tab of tabs) {
      if (tab.id == null) continue;
      _routeForCalcTab(tab.id, tab.url || '', 'alarm');
      // Параллельно тянем накопленные ответы оверлеев (fallback-канал через localStorage).
      checkDbConfigOverlayCommands(tab.id);
    }
  } catch (e) {
    console.error('[Binance CalcTabRouter] Ошибка в onAlarm:', e);
  }
});

// Триггер при полной загрузке вкладки калькулятора с dbConfig.
// После status='complete' React ещё не успевает положить loadedConfigStatus —
// даём 4 секунды на инициализацию.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!_isCalcUrl(tab?.url)) return;
  if (!tab.url.includes('dbConfig=')) return;

  const last = _lastTriggerByTab.get(tabId) || 0;
  const now = Date.now();
  if (now - last < TAB_TRIGGER_DEBOUNCE_MS) return;
  _lastTriggerByTab.set(tabId, now);

  setTimeout(() => _routeForCalcTab(tabId, tab.url, 'onUpdated'), 4000);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  _lastTriggerByTab.delete(tabId);
});

/**
 * Обработчик клика «Да, обновить» в оверлее (showDbConfigOverlay).
 * Карточка инжектится на вкладку калькулятора и при клике шлёт executeDbConfigRefresh.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === 'executeDbConfigRefresh') {
    const calcTabId = message.calcTabId || sender?.tab?.id;
    const configData = message.configData;
    if (calcTabId && configData) {
      executeDbConfigRefresh(calcTabId, configData);
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, error: 'no calcTabId/configData' });
    }
    return true;
  }
  return false;
});

console.log('[Binance Bridge] calcTabRouter.js загружен');
