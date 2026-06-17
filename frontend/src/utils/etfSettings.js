/**
 * Утилита для работы с настройками ETF
 * ЗАЧЕМ: Обеспечивает определение типа инструмента ETF по тикеру —
 * если тикер есть в этом списке, калькулятор оформляет позицию как ETF
 * (синий бейдж в шапке и в карточках сохранённых сделок).
 * Математика и логика P&L у ETF идентична акциям, отличия только визуальные.
 *
 * Источник правды — backend (таблица etf_settings, эндпойнт /api/etf-settings/).
 * Локальный кэш в localStorage нужен, чтобы синхронный isEtfTicker работал
 * сразу при инициализации калькулятора, до завершения сетевого запроса.
 */
import { fetchWithTimeout, parseApiError } from './fetchWithTimeout';

// Предустановленный список ETF по умолчанию.
// ЗАЧЕМ: На первом рендере свежего браузера localStorage ещё пуст,
// а syncEtfSettingsFromServer асинхронен. Без DEFAULT_ETFS первая отрисовка
// калькулятора не сможет определить SPY/QQQ/IWM/VOO/DIA как ETF.
// На бэкенде этот же набор сидится при первом старте — если у пользователя
// нет кастомных добавлений, локальный и серверный наборы совпадают.
const DEFAULT_ETFS = [
  { id: 1, ticker: 'SPY', name: 'SPDR S&P 500 ETF Trust' },
  { id: 2, ticker: 'QQQ', name: 'Invesco QQQ Trust' },
  { id: 3, ticker: 'IWM', name: 'iShares Russell 2000 ETF' },
  { id: 4, ticker: 'VOO', name: 'Vanguard S&P 500 ETF' },
  { id: 5, ticker: 'DIA', name: 'SPDR Dow Jones Industrial Average ETF' },
];

const STORAGE_KEY = 'etfSettings';
const SERVER_ENDPOINT = '/api/etf-settings/';

/**
 * Загружает список ETF из localStorage. Если ничего не сохранено или данные
 * некорректны — возвращает DEFAULT_ETFS, чтобы isEtfTicker работал даже до
 * первой синхронизации с сервером.
 */
export const loadEtfSettings = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (error) {
    console.error('❌ Ошибка загрузки настроек ETF:', error);
  }
  return DEFAULT_ETFS;
};

/**
 * Сохраняет список ETF в localStorage.
 */
export const saveEtfSettings = (etfs) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(etfs));
  } catch (error) {
    console.error('❌ Ошибка сохранения настроек ETF:', error);
  }
};

/**
 * Проверяет, является ли тикер ETF.
 * ЗАЧЕМ: Используется детекторами типа инструмента (futuresSettings.js
 * и instrumentTypeDetector.js) — ETF проверяется ПЕРЕД stocks, чтобы
 * SPY/QQQ/... попадали в режим ETF, а не в режим акций.
 */
export const isEtfTicker = (ticker) => {
  if (!ticker || typeof ticker !== 'string') return false;
  const upper = ticker.toUpperCase().trim();
  const etfs = loadEtfSettings();
  return etfs.some(e => (e.ticker || '').toUpperCase() === upper);
};

/**
 * Возвращает список всех тикеров ETF — для автокомплита и валидации.
 */
export const getAllEtfTickers = () => {
  return loadEtfSettings().map(e => e.ticker);
};

/**
 * Подтянуть актуальный список ETF с сервера и положить в localStorage.
 * Если на сервере пусто (таблица свежесозданная) — пушим туда текущий
 * локальный набор (первичный посев от первого пользователя после деплоя).
 * @returns {Promise<Array|null>} серверный массив, либо null при ошибке.
 */
export const syncEtfSettingsFromServer = async () => {
  try {
    const resp = await fetchWithTimeout(SERVER_ENDPOINT, { method: 'GET' });
    if (!resp.ok) return null;
    const json = await resp.json();
    const serverData = Array.isArray(json?.data) ? json.data : [];

    if (serverData.length === 0) {
      const local = loadEtfSettings();
      const pushed = await pushEtfSettingsToServer(local);
      return pushed || local;
    }

    saveEtfSettings(serverData);
    return serverData;
  } catch (e) {
    console.warn('⚠️ syncEtfSettingsFromServer: сервер недоступен,', e.message);
    return null;
  }
};

/**
 * Залить актуальный массив ETF на сервер (PUT, полная замена).
 * При успехе записывает ответ сервера в localStorage.
 */
export const pushEtfSettingsToServer = async (etfs) => {
  try {
    const resp = await fetchWithTimeout(SERVER_ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ etfs: (etfs || []).map(serializeEtf) }),
    });
    if (!resp.ok) {
      console.warn('⚠️ pushEtfSettingsToServer: сервер ответил', resp.status);
      return null;
    }
    const json = await resp.json();
    const serverData = Array.isArray(json?.data) ? json.data : null;
    if (serverData) saveEtfSettings(serverData);
    return serverData;
  } catch (e) {
    console.warn('⚠️ pushEtfSettingsToServer: сервер недоступен,', e.message);
    return null;
  }
};

// =====================================================
// Per-row операции (создать / обновить / удалить ОДИН ETF), ключ — ticker.
// Контракт результата идентичен futuresSettings.js:
//   { ok: true, list } | { ok: false, kind, code, message, list? }
// =====================================================

const serializeEtf = (e) => ({
  ticker: (e.ticker || '').toString().trim().toUpperCase(),
  name: (e.name || '').toString().trim(),
});

const refreshEtfList = async () => {
  try {
    const resp = await fetchWithTimeout(SERVER_ENDPOINT, { method: 'GET' });
    if (!resp.ok) return null;
    const json = await resp.json();
    const list = Array.isArray(json?.data) ? json.data : null;
    if (list) saveEtfSettings(list);
    return list;
  } catch (e) {
    return null;
  }
};

const handleEtfMutationResponse = async (resp) => {
  if (resp.ok) {
    const list = await refreshEtfList();
    return { ok: true, list: list || loadEtfSettings() };
  }
  const { code, message } = await parseApiError(resp);
  if (resp.status === 409) {
    const list = await refreshEtfList();
    return { ok: false, kind: 'conflict', code, message, list };
  }
  return { ok: false, kind: 'error', code, message };
};

export const createEtf = async (row) => {
  try {
    const resp = await fetchWithTimeout(SERVER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(serializeEtf(row)),
    });
    return await handleEtfMutationResponse(resp);
  } catch (e) {
    return { ok: false, kind: 'offline', message: 'Сервер недоступен' };
  }
};

export const updateEtf = async (oldTicker, row) => {
  try {
    const path = SERVER_ENDPOINT + encodeURIComponent((oldTicker || '').toString().trim().toUpperCase());
    const resp = await fetchWithTimeout(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...serializeEtf(row), expectedUpdatedAt: row.updatedAt ?? null }),
    });
    return await handleEtfMutationResponse(resp);
  } catch (e) {
    return { ok: false, kind: 'offline', message: 'Сервер недоступен' };
  }
};

export const deleteEtf = async (ticker) => {
  try {
    const path = SERVER_ENDPOINT + encodeURIComponent((ticker || '').toString().trim().toUpperCase());
    const resp = await fetchWithTimeout(path, { method: 'DELETE' });
    return await handleEtfMutationResponse(resp);
  } catch (e) {
    return { ok: false, kind: 'offline', message: 'Сервер недоступен' };
  }
};

export { DEFAULT_ETFS, STORAGE_KEY };
