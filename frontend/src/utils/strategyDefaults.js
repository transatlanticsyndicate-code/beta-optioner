/**
 * Значения по умолчанию для экрана подбора стратегии «Север GPT».
 *
 * ЗАЧЕМ: пять полей экрана подбора (диапазон P&L, маржин, допуск, мин. доля
 * актива, дни до даты расчёта) раньше были зашиты в форме. Теперь дефолты
 * задаются в настройках сайта (/settings?section=defaults) и хранятся на
 * сервере единым документом — одинаково на всех устройствах.
 *
 * Три независимых набора: для АКЦИЙ, КРИПТЫ и ФЬЮЧЕРСОВ. Нужный набор выбирается
 * по режиму калькулятора при открытии формы «Север GPT».
 *
 * Источник правды — backend. Фронт держит локальный кэш (localStorage) для
 * СИНХРОННОГО чтения при открытии формы (getNorthGptDefaults) и обновляет его
 * при загрузке приложения и после каждого сохранения.
 *
 * Поле даты хранится как «дни» (calcDays): на экране дата считается как
 * «сегодня + N дней», поэтому всегда актуальна.
 */

import { fetchWithTimeout, parseApiError } from './fetchWithTimeout';

// Заводские значения (исторически зашитые в форме «Север GPT»).
const FACTORY_BLOCK = {
  plTolerance: 200,
  margin: 4000,
  marginTolerance: 500,
  minStockMarginPct: 40,
  calcDays: 30,
};

export const FACTORY_STRATEGY_DEFAULTS = {
  stocks: { ...FACTORY_BLOCK },
  crypto: { ...FACTORY_BLOCK },
  futures: { ...FACTORY_BLOCK },
};

const STORAGE_KEY = 'strategyDefaults';
const SERVER_ENDPOINT = '/api/strategy-defaults/';
const FIELDS = ['plTolerance', 'margin', 'marginTolerance', 'minStockMarginPct', 'calcDays'];

// Привести один блок к полному набору из 5 числовых полей: каждое отсутствующее
// или нечисловое значение заменяется заводским. Защищает форму от битых данных.
const normalizeBlock = (block) => {
  const src = block && typeof block === 'object' ? block : {};
  const out = {};
  for (const f of FIELDS) {
    const n = Number(src[f]);
    out[f] = Number.isFinite(n) ? n : FACTORY_BLOCK[f];
  }
  return out;
};

const normalizeAll = (data) => ({
  stocks: normalizeBlock(data?.stocks),
  crypto: normalizeBlock(data?.crypto),
  futures: normalizeBlock(data?.futures),
});

/**
 * Синхронно прочитать значения по умолчанию из localStorage-кэша.
 * Всегда возвращает полный объект { stocks, crypto } (с заводскими полями,
 * если кэш пуст или повреждён).
 */
export const loadStrategyDefaults = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normalizeAll(JSON.parse(saved));
  } catch (e) {
    console.error('❌ Ошибка чтения значений по умолчанию:', e);
  }
  return normalizeAll(null);
};

/**
 * Дефолты «Севера GPT» для текущего режима калькулятора (5 полей).
 * @param {string} calculatorMode - 'crypto' → крипто-набор, 'futures' → фьючерсный набор,
 *   иначе → набор для акций.
 */
export const getNorthGptDefaults = (calculatorMode) => {
  const all = loadStrategyDefaults();
  if (calculatorMode === 'crypto') return all.crypto;
  if (calculatorMode === 'futures') return all.futures;
  return all.stocks;
};

/** Записать значения по умолчанию в localStorage-кэш. */
export const saveStrategyDefaults = (data) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeAll(data)));
  } catch (e) {
    console.error('❌ Ошибка сохранения значений по умолчанию:', e);
  }
};

/**
 * Подтянуть значения с сервера в localStorage. Если на сервере пусто
 * (документ не инициализирован) — посеять текущим набором (первый
 * пользователь после деплоя). Возвращает объект { stocks, crypto } или null,
 * если сервер недоступен (фронт продолжает работать с кэшем).
 */
export const syncStrategyDefaultsFromServer = async () => {
  try {
    const resp = await fetchWithTimeout(SERVER_ENDPOINT, { method: 'GET' });
    if (!resp.ok) return null;
    const json = await resp.json();
    if (!json?.data || !json.data.stocks) {
      // Документ не инициализирован — посеять текущим набором (первичный посев).
      const local = loadStrategyDefaults();
      const pushed = await pushStrategyDefaultsToServer(local, null);
      if (pushed?.ok) return { data: pushed.data, updatedAt: pushed.updatedAt };
      return { data: local, updatedAt: null };
    }
    const data = normalizeAll(json.data);
    saveStrategyDefaults(data);
    return { data, updatedAt: json.updatedAt ?? null };
  } catch (e) {
    console.warn('⚠️ syncStrategyDefaultsFromServer: сервер недоступен,', e.message);
    return null;
  }
};

/**
 * Залить значения на сервер (PUT всего документа) с оптимистичной блокировкой.
 * expectedUpdatedAt — токен версии, полученный при последней загрузке; сервер
 * вернёт 409, если документ успели изменить другим сохранением.
 *
 * Возвращает:
 *   { ok: true, data, updatedAt }
 *   { ok: false, kind: 'conflict'|'error'|'offline', message, data?, updatedAt? }
 * При конфликте data/updatedAt — свежие значения с сервера (для показа на экране).
 */
export const pushStrategyDefaultsToServer = async (data, expectedUpdatedAt = null) => {
  try {
    const body = { ...normalizeAll(data), expectedUpdatedAt };
    const resp = await fetchWithTimeout(SERVER_ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (resp.ok) {
      const json = await resp.json();
      const saved = json?.data ? normalizeAll(json.data) : normalizeAll(data);
      saveStrategyDefaults(saved);
      return { ok: true, data: saved, updatedAt: json.updatedAt ?? null };
    }
    const { code, message } = await parseApiError(resp);
    if (resp.status === 409) {
      // Подтянуть свежее состояние, чтобы экран показал актуальные значения.
      const fresh = await syncStrategyDefaultsFromServer();
      return {
        ok: false, kind: 'conflict', code, message,
        data: fresh?.data, updatedAt: fresh?.updatedAt ?? null,
      };
    }
    return { ok: false, kind: 'error', code, message };
  } catch (e) {
    console.warn('⚠️ pushStrategyDefaultsToServer: сервер недоступен,', e.message);
    return { ok: false, kind: 'offline', message: 'Сервер недоступен' };
  }
};

export { STORAGE_KEY };
