/**
 * Значения по умолчанию для экрана подбора стратегии «Север GPT».
 *
 * ЗАЧЕМ: пять полей экрана подбора (диапазон P&L, маржин, допуск, мин. доля
 * актива, дни до даты расчёта) раньше были зашиты в форме. Теперь дефолты
 * задаются в настройках сайта (/settings?section=defaults) и хранятся на
 * сервере единым документом — одинаково на всех устройствах.
 *
 * Два независимых набора: для АКЦИЙ и для КРИПТЫ. Нужный набор выбирается по
 * режиму калькулятора при открытии формы «Север GPT».
 *
 * Источник правды — backend. Фронт держит локальный кэш (localStorage) для
 * СИНХРОННОГО чтения при открытии формы (getNorthGptDefaults) и обновляет его
 * при загрузке приложения и после каждого сохранения.
 *
 * Поле даты хранится как «дни» (calcDays): на экране дата считается как
 * «сегодня + N дней», поэтому всегда актуальна.
 */

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
 * @param {string} calculatorMode - 'crypto' → крипто-набор, иначе → набор для акций.
 */
export const getNorthGptDefaults = (calculatorMode) => {
  const all = loadStrategyDefaults();
  return calculatorMode === 'crypto' ? all.crypto : all.stocks;
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
    const resp = await fetch(SERVER_ENDPOINT, { method: 'GET' });
    if (!resp.ok) return null;
    const json = await resp.json();
    if (!json?.data || !json.data.stocks) {
      const local = loadStrategyDefaults();
      const pushed = await pushStrategyDefaultsToServer(local);
      return pushed || local;
    }
    const data = normalizeAll(json.data);
    saveStrategyDefaults(data);
    return data;
  } catch (e) {
    console.warn('⚠️ syncStrategyDefaultsFromServer: сервер недоступен,', e.message);
    return null;
  }
};

/**
 * Залить значения на сервер (PUT, полная замена). При успехе кладёт ответ
 * сервера в localStorage. Возвращает сохранённый объект или null.
 */
export const pushStrategyDefaultsToServer = async (data) => {
  try {
    const body = normalizeAll(data);
    const resp = await fetch(SERVER_ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      console.warn('⚠️ pushStrategyDefaultsToServer: сервер ответил', resp.status);
      return null;
    }
    const json = await resp.json();
    const data2 = json?.data ? normalizeAll(json.data) : body;
    saveStrategyDefaults(data2);
    return data2;
  } catch (e) {
    console.warn('⚠️ pushStrategyDefaultsToServer: сервер недоступен,', e.message);
    return null;
  }
};

export { STORAGE_KEY };
