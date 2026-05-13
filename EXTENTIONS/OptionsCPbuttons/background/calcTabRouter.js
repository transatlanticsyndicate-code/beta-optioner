/**
 * Background Module: Calculator Tab Router
 * ЗАЧЕМ: Лёгкая версия логики из messageHandler.js коллег. Маршрутизирует
 * триггеры обновления сохранённых сделок (pending / standard) на нужный поток.
 *
 * Источник идей: handoff_calc_team_refresh / extension_source / background / messageHandler.js
 * (взяты только pending/standard-маршрутизация и обработчик 'executeDbConfigRefresh';
 * остальная логика messageHandler.js, относящаяся к refresh_specific / send_slices_to_chart
 * и т.п., остаётся у коллег в их расширении и не переносится).
 *
 * Зависит от: dbConfigRefresh.js (autoRefreshDbConfig, executeDbConfigRefresh),
 *             pendingRefresh.js (checkPendingRefreshCommands),
 *             refreshHelpers.js (delay).
 */

// URL-маски вкладок калькулятора, на которые мы реагируем.
const CALC_TAB_URL_MATCHES = [
  'https://beta.optioner.online/*',
  'http://localhost:3000/*'
];

// Имя алярма Chrome
const CALC_ALARM_NAME = 'check-calculator-commands';

// Map<tabId, lastTriggerMs> — анти-дребезг: не запускать повторный onUpdated-триггер
// для той же вкладки в окне 5 секунд (например, при множественных status='complete').
const _lastTriggerByTab = new Map();
const TAB_TRIGGER_DEBOUNCE_MS = 5000;

/**
 * Проверить, относится ли URL к вкладке калькулятора.
 */
function _isCalcUrl(url) {
  if (!url) return false;
  return url.includes('beta.optioner.online') || url.includes('localhost:3000');
}

/**
 * Прочитать статус загруженной сделки из localStorage калькулятора.
 */
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
 * ЗАЧЕМ: используется и из tabs.onUpdated, и из alarm-цикла.
 *
 * @param {number} calcTabId
 * @param {string} calcUrl
 * @param {'onUpdated'|'alarm'} source — откуда пришёл вызов. Pending-обновление
 *   запускается ТОЛЬКО на 'onUpdated' (загрузка вкладки или F5), но НЕ на alarm —
 *   иначе сделка в статусе "в ожидании" обновлялась бы каждые 30 секунд.
 */
async function _routeForCalcTab(calcTabId, calcUrl, source) {
  if (!calcUrl || !calcUrl.includes('dbConfig=')) return;

  const status = await _readLoadedConfigStatus(calcTabId);
  console.log('[CalcTabRouter] tab', calcTabId, 'status =', status, 'url =', calcUrl, 'source =', source);

  if (status === 'pending') {
    // Pending-обновление — один раз при загрузке/F5 вкладки. Из алярма не
    // перезапускаем: пользователь явно сказал, что повторение не нужно.
    if (source === 'onUpdated') {
      checkPendingRefreshCommands(calcTabId);
    }
  } else {
    // Поток standard — оверлей подтверждения «Обновить? Да/Нет».
    // Защита от повторного показа — внутри dbConfigRefresh.js (_processedTabs).
    autoRefreshDbConfig(calcTabId, calcUrl);
  }
}

/**
 * Алярм каждые 30 сек — обходит все открытые вкладки калькулятора и для тех,
 * что с dbConfig= в URL, дёргает _routeForCalcTab. Из алярма мы запускаем
 * только standard-поток (показ оверлея) и подбор отложенных команд оверлея;
 * pending-поток в _routeForCalcTab пропускается по source='alarm'.
 */
chrome.alarms.create(CALC_ALARM_NAME, { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== CALC_ALARM_NAME) return;

  try {
    const tabs = await chrome.tabs.query({ url: CALC_TAB_URL_MATCHES });
    for (const tab of tabs) {
      if (tab.id == null) continue;
      _routeForCalcTab(tab.id, tab.url || '', 'alarm');
      // Fallback для оверлея: при недоступности chrome.runtime.sendMessage в момент
      // клика «Да» showDbConfigOverlay пишет ключ tvc_dbconfig_refresh_<id> в localStorage.
      // Эта функция (из dbConfigRefresh.js) подхватывает такие записи и запускает refresh.
      checkDbConfigOverlayCommands(tab.id);
    }
  } catch (e) {
    console.error('[CalcTabRouter] Ошибка в onAlarm:', e);
  }
});

/**
 * Триггер при полной загрузке вкладки калькулятора.
 * ЗАЧЕМ: после `status === 'complete'` React ещё не успевает положить
 * `universalCalc_loadedConfigStatus` в localStorage — даём 4 секунды.
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!_isCalcUrl(tab?.url)) return;
  if (!tab.url.includes('dbConfig=')) return;

  // Анти-дребезг: при некоторых SPA-навигациях onUpdated может срабатывать несколько раз
  const last = _lastTriggerByTab.get(tabId) || 0;
  const now = Date.now();
  if (now - last < TAB_TRIGGER_DEBOUNCE_MS) return;
  _lastTriggerByTab.set(tabId, now);

  setTimeout(() => {
    _routeForCalcTab(tabId, tab.url, 'onUpdated');
  }, 4000);
});

// Очистка debounce-Map, если вкладку закрыли
chrome.tabs.onRemoved.addListener((tabId) => {
  _lastTriggerByTab.delete(tabId);
});

/**
 * Обработчик клика «Да, обновить» в оверлее (showDbConfigOverlay).
 * Карточка инжектится на вкладку калькулятора в MAIN world; при клике
 * она шлёт сообщение `executeDbConfigRefresh` в наш background.
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

console.log('[Background] calcTabRouter.js загружен');
