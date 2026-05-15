/**
 * Утилита для работы с настройками фьючерсов
 * ЗАЧЕМ: Обеспечивает доступ к параметрам фьючерсов (pointValue) для универсального калькулятора
 * Затрагивает: UniversalOptionsCalculator, расчёты P&L для фьючерсов
 */

// Предустановленные фьючерсы по умолчанию
// ЗАЧЕМ: Используются если пользователь не настроил свои параметры
//
// marginPerContract намеренно НЕ задан (null) для всех контрактов: реальный
// initial margin зависит от брокера, типа счёта, текущей волатильности и
// меняется регулярно. Подставлять «ориентировочные» значения опасно —
// калькулятор посчитает риск на этих цифрах, а пользователь может не заметить.
// Поэтому пусть видит явное предупреждение и сам заполнит актуальную цифру со
// своего брокерского счёта в /settings?section=futures.
const DEFAULT_FUTURES = [
  { id: 1, ticker: 'ES', name: 'E-mini S&P 500', pointValue: 50, marginPerContract: null },
  { id: 2, ticker: 'NQ', name: 'E-mini Nasdaq-100', pointValue: 20, marginPerContract: null },
  { id: 3, ticker: 'YM', name: 'E-mini Dow Jones', pointValue: 5, marginPerContract: null },
  { id: 4, ticker: 'GC', name: 'Gold Futures', pointValue: 100, marginPerContract: null },
  { id: 5, ticker: 'CL', name: 'Crude Oil Futures', pointValue: 1000, marginPerContract: null },
  { id: 6, ticker: 'ZC', name: 'Corn Futures', pointValue: 50, marginPerContract: null },
  { id: 7, ticker: 'ZS', name: 'Soybean Futures', pointValue: 50, marginPerContract: null },
  { id: 8, ticker: 'ZW', name: 'Wheat Futures', pointValue: 50, marginPerContract: null },
  { id: 9, ticker: 'ZO', name: 'Oat Futures', pointValue: 50, marginPerContract: null },
  { id: 10, ticker: 'ZR', name: 'Rough Rice Futures', pointValue: 100, marginPerContract: null },
  { id: 11, ticker: 'ZL', name: 'Soybean Oil Futures', pointValue: 100, marginPerContract: null },
  { id: 12, ticker: 'ZM', name: 'Soybean Meal Futures', pointValue: 100, marginPerContract: null },
  { id: 13, ticker: 'LE', name: 'Live Cattle Futures', pointValue: 400, marginPerContract: null },
  { id: 14, ticker: 'GF', name: 'Feeder Cattle Futures', pointValue: 500, marginPerContract: null },
  { id: 15, ticker: 'LH', name: 'Lean Hog Futures', pointValue: 400, marginPerContract: null },
  // Energy
  { id: 16, ticker: 'NG', name: 'Natural Gas (Henry Hub)', pointValue: 10000, marginPerContract: null },
  { id: 17, ticker: 'RB', name: 'RBOB Gasoline', pointValue: 42000, marginPerContract: null },
  { id: 18, ticker: 'HO', name: 'Heating Oil', pointValue: 42000, marginPerContract: null },
  // Metals
  { id: 19, ticker: 'HG', name: 'Copper', pointValue: 25000, marginPerContract: null },
  { id: 20, ticker: 'SI', name: 'Silver', pointValue: 5000, marginPerContract: null },
  { id: 21, ticker: 'PL', name: 'Platinum', pointValue: 50, marginPerContract: null },
  { id: 22, ticker: 'PA', name: 'Palladium', pointValue: 100, marginPerContract: null },
  // Currencies
  { id: 23, ticker: '6E', name: 'Euro FX', pointValue: 125000, marginPerContract: null },
  { id: 24, ticker: '6B', name: 'British Pound', pointValue: 62500, marginPerContract: null },
  { id: 25, ticker: '6A', name: 'Australian Dollar', pointValue: 100000, marginPerContract: null },
  { id: 26, ticker: '6C', name: 'Canadian Dollar', pointValue: 100000, marginPerContract: null },
  { id: 27, ticker: '6J', name: 'Japanese Yen', pointValue: 125000, marginPerContract: null },
  { id: 28, ticker: '6S', name: 'Swiss Franc', pointValue: 125000, marginPerContract: null },
  // Crypto
  { id: 29, ticker: 'BTC', name: 'Bitcoin', pointValue: 5, marginPerContract: null },
  { id: 30, ticker: 'ETH', name: 'Ether', pointValue: 50, marginPerContract: null },
  { id: 31, ticker: 'MBT', name: 'Micro Bitcoin', pointValue: 0.1, marginPerContract: null },
  { id: 32, ticker: 'MET', name: 'Micro Ether', pointValue: 0.50, marginPerContract: null },
  // Micros
  { id: 33, ticker: 'MES', name: 'Micro E-mini S&P 500', pointValue: 5, marginPerContract: null },
  { id: 34, ticker: 'MNQ', name: 'Micro E-mini Nasdaq-100', pointValue: 2, marginPerContract: null },
  { id: 35, ticker: 'MYM', name: 'Micro E-mini Dow', pointValue: 0.5, marginPerContract: null },
  { id: 36, ticker: 'M2K', name: 'Micro E-mini Russell 2000', pointValue: 5, marginPerContract: null },
  { id: 37, ticker: 'MGC', name: 'Micro Gold', pointValue: 10, marginPerContract: null },
  { id: 38, ticker: 'SIL', name: 'Micro Silver', pointValue: 1000, marginPerContract: null },
  { id: 39, ticker: 'MCL', name: 'Micro Crude Oil', pointValue: 100, marginPerContract: null },
];

const STORAGE_KEY = 'futuresSettings';

// Одноразовая чистка: если у пользователя в localStorage остались
// «ориентировочные» значения marginPerContract, проставленные первой
// версией этой колонки, — обнуляем их, чтобы он увидел предупреждение
// и заполнил реальные цифры со своего брокерского счёта. Метка ставится
// после первой чистки, чтобы при повторных открытиях не затирать уже
// введённые пользователем значения.
const MARGIN_WIPE_FLAG_KEY = 'futuresMarginsCleared_v1';

/**
 * Загружает все настройки фьючерсов из localStorage
 * ЗАЧЕМ: Получение полного списка фьючерсов для выбора в калькуляторе
 * @returns {Array} Массив объектов фьючерсов
 */
export const loadFuturesSettings = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Проверяем валидность данных
      if (Array.isArray(parsed) && parsed.length > 0) {
        let working = parsed;

        // Одноразовая чистка: первая версия колонки «Маржин на 1 контракт»
        // подсунула пользователям ориентировочные значения. Они могут быть
        // вводить в заблуждение при расчёте риска, поэтому стираем всё разом
        // и просим пользователя заполнить реальные цифры со своего брокера.
        // Метка MARGIN_WIPE_FLAG_KEY гарантирует, что чистка случится один раз.
        try {
          const alreadyWiped = localStorage.getItem(MARGIN_WIPE_FLAG_KEY);
          if (!alreadyWiped) {
            working = working.map(f => ({ ...f, marginPerContract: null }));
            localStorage.setItem(MARGIN_WIPE_FLAG_KEY, '1');
            console.log('🧹 Маржин на 1 контракт обнулён у всех фьючерсов (одноразовая миграция)');
          }
        } catch (e) {
          // Если localStorage недоступен — пропускаем, не блокируем загрузку
        }

        // ВАЖНО: Объединяем сохранённые настройки с новыми дефолтными
        // Если в дефолтных появились новые тикеры (например NG, HG), добавляем их
        const existingTickers = new Set(working.map(f => f.ticker));
        const missingFutures = DEFAULT_FUTURES.filter(def => !existingTickers.has(def.ticker));

        if (missingFutures.length > 0) {
          console.log('🔄 Добавлены новые фьючерсы в настройки:', missingFutures.map(f => f.ticker));
          return [...working, ...missingFutures];
        }

        return working;
      }
    }
  } catch (error) {
    console.error('❌ Ошибка загрузки настроек фьючерсов:', error);
  }

  // Возвращаем дефолтные значения если нет сохранённых
  return DEFAULT_FUTURES;
};

/**
 * Извлекает базовый тикер из полного тикера фьючерса
 * ЗАЧЕМ: Тикеры фьючерсов приходят с датой (ESH26, NQM25), нужно извлечь базовый тикер (ES, NQ)
 * @param {string} ticker - Полный тикер (например, 'ESH26', 'NQM25')
 * @returns {string} Базовый тикер (например, 'ES', 'NQ')
 */
const extractBaseTicker = (ticker) => {
  if (!ticker) return '';
  
  const upperTicker = ticker.toUpperCase();
  
  // Паттерн: 1-2 буквы базового тикера + 1 буква месяца + 2 цифры года
  // Примеры: ESH26, NQM25, GCZ24, CLF25
  // Месяцы: F(Jan), G(Feb), H(Mar), J(Apr), K(May), M(Jun), N(Jul), Q(Aug), U(Sep), V(Oct), X(Nov), Z(Dec)
  const futuresMonthCodes = 'FGHJKMNQUVXZ';
  
  // Ищем позицию, где начинается код месяца + год
  for (let i = 1; i < upperTicker.length - 2; i++) {
    const char = upperTicker[i];
    const nextTwo = upperTicker.slice(i + 1, i + 3);
    
    // Проверяем: текущий символ - код месяца, следующие 2 - цифры года
    if (futuresMonthCodes.includes(char) && /^\d{2}$/.test(nextTwo)) {
      return upperTicker.slice(0, i);
    }
  }
  
  // Если паттерн не найден, возвращаем исходный тикер
  return upperTicker;
};

/**
 * Получает pointValue для конкретного тикера фьючерса
 * ЗАЧЕМ: Используется в расчётах P&L вместо стандартного множителя 100 для акций
 * @param {string} ticker - Тикер фьючерса (может быть полным: ESH26 или базовым: ES)
 * @returns {number} Цена пункта для данного фьючерса (или 1 если не найден)
 */
export const getPointValue = (ticker) => {
  if (!ticker) return 1;
  
  const baseTicker = extractBaseTicker(ticker);
  const futures = loadFuturesSettings();
  const future = futures.find(f => f.ticker.toUpperCase() === baseTicker);
  
  if (future && future.pointValue) {
    return future.pointValue;
  }
  
  // Если фьючерс не найден, возвращаем 1 (нейтральный множитель)
  console.warn(`⚠️ Фьючерс ${ticker} не найден в настройках, используется pointValue = 1`);
  return 1;
};

/**
 * Получает initial margin (IBKR intraday) для конкретного тикера фьючерса.
 * ЗАЧЕМ: Калькулятор использует это значение в фьючерсном режиме как «маржин
 * на 1 контракт» — заменяет цену актива в позиции БА и используется в расчёте
 * блока «Маржин позиций».
 * @param {string} ticker - Тикер фьючерса (может быть полным: ESH26 или базовым: ES)
 * @returns {number|null} Маржин на 1 контракт в USD, либо null если не задан в настройках
 */
export const getMarginPerContract = (ticker) => {
  if (!ticker) return null;

  const baseTicker = extractBaseTicker(ticker);
  const futures = loadFuturesSettings();
  const future = futures.find(f => f.ticker.toUpperCase() === baseTicker);

  if (future && typeof future.marginPerContract === 'number' && future.marginPerContract > 0) {
    return future.marginPerContract;
  }
  return null;
};

/**
 * Получает полную информацию о фьючерсе по тикеру
 * ЗАЧЕМ: Для отображения названия и параметров в UI калькулятора
 * @param {string} ticker - Тикер фьючерса (может быть полным: ESH26 или базовым: ES)
 * @returns {Object|null} Объект фьючерса или null если не найден
 */
export const getFutureByTicker = (ticker) => {
  if (!ticker) return null;
  
  const baseTicker = extractBaseTicker(ticker);
  const futures = loadFuturesSettings();
  return futures.find(f => f.ticker.toUpperCase() === baseTicker) || null;
};

/**
 * Получает список всех тикеров фьючерсов
 * ЗАЧЕМ: Для автокомплита и валидации ввода тикера
 * @returns {Array<string>} Массив тикеров
 */
export const getAllFuturesTickers = () => {
  const futures = loadFuturesSettings();
  return futures.map(f => f.ticker);
};

/**
 * Проверяет, является ли тикер фьючерсом по паттерну
 * ЗАЧЕМ: Автоматическая детекция типа инструмента БЕЗ проверки настроек
 * @param {string} ticker - Тикер для проверки
 * @returns {boolean} true если тикер соответствует паттерну фьючерса
 * 
 * Паттерн фьючерса: 1-2 буквы + код месяца (FGHJKMNQUVXZ) + 2 цифры года
 * Примеры: ESH26, NQM25, GCZ24, CLF25
 */
export const isFuturesTickerByPattern = (ticker) => {
  if (!ticker || typeof ticker !== 'string') {
    return false;
  }
  
  const upperTicker = ticker.toUpperCase().trim();
  
  // Специальные паттерны для непрерывных контрактов
  // ЗАЧЕМ: Поддержка тикеров типа BTC1!, 6E1!, ES1!, NQ2! и т.д.
  if (/^[A-Z0-9]{2,4}\d!$/.test(upperTicker)) {
    return true;
  }
  
  // Короткие базовые тикеры криптовалютных и валютных фьючерсов (2-3 символа)
  // ЗАЧЕМ: Поддержка тикеров типа BTC, ETH, MBT, 6E, 6B, 6A и т.д.
  const knownShortFutures = [
    'BTC', 'ETH', 'MBT', 'MET', // Криптовалюты
    '6E', '6B', '6A', '6C', '6J', '6M', '6N', '6S', '6Z', // Валюты CME
    'ES', 'NQ', 'YM', 'RTY', 'MES', 'MNQ', 'MYM', 'M2K', // Индексы
    'GC', 'SI', 'HG', 'MGC', 'SIL', // Металлы
    'CL', 'NG', 'RB', 'HO', 'MCL', // Энергия
    'ZB', 'ZN', 'ZF', 'ZT', 'ZQ', // Казначейские облигации
    'ZC', 'ZW', 'ZM', 'ZL', // Зерновые (ZS исключена - это акция Zscaler)
  ];
  
  if (knownShortFutures.includes(upperTicker)) {
    return true;
  }
  
  // Минимальная длина: 4 символа (например, GCG6, 6EH26)
  // Максимальная длина: 9 символов (например, BTCF2026, MESH2026)
  if (upperTicker.length < 4 || upperTicker.length > 9) {
    return false;
  }
  
  // Коды месяцев фьючерсов
  const futuresMonthCodes = 'FGHJKMNQUVXZ';
  
  // Проверяем паттерн: [цифры][буквы] + месяц + год (2 или 4 цифры)
  // ЗАЧЕМ: Поддержка валютных фьючерсов типа 6EH26, 6BM2026
  for (let i = 1; i < upperTicker.length - 2; i++) {
    const char = upperTicker[i];
    const prefix = upperTicker.slice(0, i);
    
    // Проверяем: текущий символ - код месяца
    if (!futuresMonthCodes.includes(char)) continue;
    
    // Проверяем: перед кодом месяца могут быть:
    // - только буквы (1-4 символа): ESH26, BTCH26
    // - цифры + буквы (2-4 символа): 6EH26, 6BM26
    if (!/^[0-9]?[A-Z]{1,4}$/.test(prefix)) continue;
    
    // Проверяем год: может быть 2 цифры (26) или 4 цифры (2026)
    const afterMonth = upperTicker.slice(i + 1);
    
    // Вариант 1: 2 цифры года (например, H26)
    if (/^\d{2}$/.test(afterMonth)) {
      return true;
    }
    
    // Вариант 2: 4 цифры года (например, H2026)
    if (/^\d{4}$/.test(afterMonth)) {
      return true;
    }
  }
  
  return false;
};

/**
 * Определяет тип инструмента по тикеру (акции, фьючерсы или крипто)
 * ЗАЧЕМ: Автоматическое переключение режима калькулятора
 * @param {string} ticker - Тикер для проверки
 * @returns {'stocks'|'futures'|'crypto'} Тип инструмента
 */
export const detectInstrumentTypeByPattern = (ticker) => {
  if (!ticker) return 'stocks';
  
  const upperTicker = ticker.toUpperCase().trim();
  
  // Проверяем на крипто-опционы (заканчиваются на USD, USDT, BUSD и т.д.)
  // ЗАЧЕМ: Крипто-опционы используют множитель 1, а не 100
  if (/(USD|USDT|BUSD|USDC)$/.test(upperTicker)) {
    return 'crypto';
  }
  
  // Сначала проверяем по паттерну фьючерсов
  if (isFuturesTickerByPattern(ticker)) {
    return 'futures';
  }
  
  // Если паттерн не подошёл — считаем акцией
  return 'stocks';
};

/**
 * Проверяет, является ли тикер фьючерсом
 * ЗАЧЕМ: Для автоматического определения типа инструмента
 * @param {string} ticker - Тикер для проверки (может быть полным: ESH26 или базовым: ES)
 * @returns {boolean} true если тикер есть в списке фьючерсов
 */
export const isFuturesTicker = (ticker) => {
  if (!ticker) return false;
  
  const baseTicker = extractBaseTicker(ticker);
  const futures = loadFuturesSettings();
  return futures.some(f => f.ticker.toUpperCase() === baseTicker);
};

/**
 * Сохраняет настройки фьючерсов в localStorage
 * ЗАЧЕМ: Для программного обновления настроек (если потребуется)
 * @param {Array} futures - Массив объектов фьючерсов
 */
export const saveFuturesSettings = (futures) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(futures));
  } catch (error) {
    console.error('❌ Ошибка сохранения настроек фьючерсов:', error);
  }
};

/**
 * Сбрасывает настройки фьючерсов к значениям по умолчанию
 * ЗАЧЕМ: Для восстановления дефолтных параметров
 */
export const resetFuturesSettings = () => {
  saveFuturesSettings(DEFAULT_FUTURES);
  return DEFAULT_FUTURES;
};

// =====================================================
// Серверная синхронизация (источник правды — backend)
// =====================================================
// ЗАЧЕМ: До этого таблица жила только в localStorage каждого пользователя —
// разъезжалась между браузерами и устройствами. Теперь сервер хранит
// единый список, фронт держит локальный кэш для синхронных вызовов
// (getPointValue, getMarginPerContract) и обновляет его при загрузке
// приложения + после каждого сохранения.
//
// На сервер ходим через относительный путь /api/... — он проксируется
// nginx'ом к FastAPI, так что URL одинаков и на проде, и на localhost.

const SERVER_ENDPOINT = '/api/futures-settings/';

/**
 * Подтянуть актуальные настройки с сервера и положить в localStorage.
 * Если на сервере пусто (таблица свежесозданная), пушим туда содержимое
 * текущего localStorage — это «первичный посев» от первого пользователя
 * после деплоя.
 * @returns {Promise<Array|null>} массив фьючерсов или null если сервер
 *   недоступен (в этом случае фронт продолжает работать с localStorage).
 */
export const syncFuturesSettingsFromServer = async () => {
  try {
    const resp = await fetch(SERVER_ENDPOINT, { method: 'GET' });
    if (!resp.ok) return null;
    const json = await resp.json();
    const serverData = Array.isArray(json?.data) ? json.data : [];

    if (serverData.length === 0) {
      // Сервер пуст — посеем своим текущим состоянием. Это сделает только
      // первый пользователь, попавший на страницу после деплоя; остальные
      // увидят непустой ответ и пойдут по верхней ветке.
      const local = loadFuturesSettings();
      const pushed = await pushFuturesSettingsToServer(local);
      return pushed || local;
    }

    // Сервер вернул данные — они выигрывают. Записываем в localStorage
    // как кэш для синхронных getPointValue / getMarginPerContract.
    saveFuturesSettings(serverData);
    return serverData;
  } catch (e) {
    // Сеть недоступна / backend упал — продолжаем жить с локальным кэшем.
    console.warn('⚠️ syncFuturesSettingsFromServer: сервер недоступен,', e.message);
    return null;
  }
};

/**
 * Залить актуальный массив на сервер (PUT, полная замена).
 * Возвращает массив, который сервер прислал в ответ (уже с присвоенными
 * id и updated_at). При успехе записывает его в localStorage.
 * @param {Array} futures
 * @returns {Promise<Array|null>}
 */
export const pushFuturesSettingsToServer = async (futures) => {
  try {
    const resp = await fetch(SERVER_ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ futures: (futures || []).map(f => ({
        ticker: f.ticker,
        name: f.name,
        pointValue: f.pointValue,
        marginPerContract: (typeof f.marginPerContract === 'number' && f.marginPerContract > 0)
          ? f.marginPerContract
          : null,
      })) }),
    });
    if (!resp.ok) {
      console.warn('⚠️ pushFuturesSettingsToServer: сервер ответил', resp.status);
      return null;
    }
    const json = await resp.json();
    const serverData = Array.isArray(json?.data) ? json.data : null;
    if (serverData) saveFuturesSettings(serverData);
    return serverData;
  } catch (e) {
    console.warn('⚠️ pushFuturesSettingsToServer: сервер недоступен,', e.message);
    return null;
  }
};

// Экспорт констант для использования в других модулях
export { DEFAULT_FUTURES, STORAGE_KEY };
