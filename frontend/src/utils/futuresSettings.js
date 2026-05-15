/**
 * Утилита для работы с настройками фьючерсов
 * ЗАЧЕМ: Обеспечивает доступ к параметрам фьючерсов (pointValue) для универсального калькулятора
 * Затрагивает: UniversalOptionsCalculator, расчёты P&L для фьючерсов
 */

// Предустановленные фьючерсы по умолчанию
// ЗАЧЕМ: Используются если пользователь не настроил свои параметры
//
// marginPerContract — IBKR intraday initial margin (USD) на 1 контракт.
// Это ориентировочные значения 2025 года, IBKR пересматривает их периодически
// и они зависят от account-tier и волатильности рынка. Пользователь правит под
// своего брокера на странице /settings?section=futures. Если поле = null/0,
// калькулятор покажет предупреждение в позиции БА.
const DEFAULT_FUTURES = [
  { id: 1, ticker: 'ES', name: 'E-mini S&P 500', pointValue: 50, marginPerContract: 2500 },
  { id: 2, ticker: 'NQ', name: 'E-mini Nasdaq-100', pointValue: 20, marginPerContract: 4000 },
  { id: 3, ticker: 'YM', name: 'E-mini Dow Jones', pointValue: 5, marginPerContract: 2000 },
  { id: 4, ticker: 'GC', name: 'Gold Futures', pointValue: 100, marginPerContract: 4000 },
  { id: 5, ticker: 'CL', name: 'Crude Oil Futures', pointValue: 1000, marginPerContract: 2000 },
  { id: 6, ticker: 'ZC', name: 'Corn Futures', pointValue: 50, marginPerContract: 500 },
  { id: 7, ticker: 'ZS', name: 'Soybean Futures', pointValue: 50, marginPerContract: 1000 },
  { id: 8, ticker: 'ZW', name: 'Wheat Futures', pointValue: 50, marginPerContract: 750 },
  { id: 9, ticker: 'ZO', name: 'Oat Futures', pointValue: 50, marginPerContract: 500 },
  { id: 10, ticker: 'ZR', name: 'Rough Rice Futures', pointValue: 100, marginPerContract: 500 },
  { id: 11, ticker: 'ZL', name: 'Soybean Oil Futures', pointValue: 100, marginPerContract: 500 },
  { id: 12, ticker: 'ZM', name: 'Soybean Meal Futures', pointValue: 100, marginPerContract: 750 },
  { id: 13, ticker: 'LE', name: 'Live Cattle Futures', pointValue: 400, marginPerContract: 500 },
  { id: 14, ticker: 'GF', name: 'Feeder Cattle Futures', pointValue: 500, marginPerContract: 750 },
  { id: 15, ticker: 'LH', name: 'Lean Hog Futures', pointValue: 400, marginPerContract: 500 },
  // Energy
  { id: 16, ticker: 'NG', name: 'Natural Gas (Henry Hub)', pointValue: 10000, marginPerContract: 1000 },
  { id: 17, ticker: 'RB', name: 'RBOB Gasoline', pointValue: 42000, marginPerContract: 2500 },
  { id: 18, ticker: 'HO', name: 'Heating Oil', pointValue: 42000, marginPerContract: 2500 },
  // Metals
  { id: 19, ticker: 'HG', name: 'Copper', pointValue: 25000, marginPerContract: 2500 },
  { id: 20, ticker: 'SI', name: 'Silver', pointValue: 5000, marginPerContract: 5000 },
  { id: 21, ticker: 'PL', name: 'Platinum', pointValue: 50, marginPerContract: 2000 },
  { id: 22, ticker: 'PA', name: 'Palladium', pointValue: 100, marginPerContract: 5000 },
  // Currencies
  { id: 23, ticker: '6E', name: 'Euro FX', pointValue: 125000, marginPerContract: 1000 },
  { id: 24, ticker: '6B', name: 'British Pound', pointValue: 62500, marginPerContract: 750 },
  { id: 25, ticker: '6A', name: 'Australian Dollar', pointValue: 100000, marginPerContract: 500 },
  { id: 26, ticker: '6C', name: 'Canadian Dollar', pointValue: 100000, marginPerContract: 500 },
  { id: 27, ticker: '6J', name: 'Japanese Yen', pointValue: 125000, marginPerContract: 1000 },
  { id: 28, ticker: '6S', name: 'Swiss Franc', pointValue: 125000, marginPerContract: 1500 },
  // Crypto
  { id: 29, ticker: 'BTC', name: 'Bitcoin', pointValue: 5, marginPerContract: 30000 },
  { id: 30, ticker: 'ETH', name: 'Ether', pointValue: 50, marginPerContract: 5000 },
  { id: 31, ticker: 'MBT', name: 'Micro Bitcoin', pointValue: 0.1, marginPerContract: 1500 },
  { id: 32, ticker: 'MET', name: 'Micro Ether', pointValue: 0.50, marginPerContract: 500 },
  // Micros
  { id: 33, ticker: 'MES', name: 'Micro E-mini S&P 500', pointValue: 5, marginPerContract: 250 },
  { id: 34, ticker: 'MNQ', name: 'Micro E-mini Nasdaq-100', pointValue: 2, marginPerContract: 400 },
  { id: 35, ticker: 'MYM', name: 'Micro E-mini Dow', pointValue: 0.5, marginPerContract: 200 },
  { id: 36, ticker: 'M2K', name: 'Micro E-mini Russell 2000', pointValue: 5, marginPerContract: 150 },
  { id: 37, ticker: 'MGC', name: 'Micro Gold', pointValue: 10, marginPerContract: 400 },
  { id: 38, ticker: 'SIL', name: 'Micro Silver', pointValue: 1000, marginPerContract: 2500 },
  { id: 39, ticker: 'MCL', name: 'Micro Crude Oil', pointValue: 100, marginPerContract: 200 },
];

const STORAGE_KEY = 'futuresSettings';

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
        // ВАЖНО: Объединяем сохранённые настройки с новыми дефолтными
        // Если в дефолтных появились новые тикеры (например NG, HG), добавляем их
        const existingTickers = new Set(parsed.map(f => f.ticker));
        const missingFutures = DEFAULT_FUTURES.filter(def => !existingTickers.has(def.ticker));

        // Подмердживаем поле marginPerContract в существующие записи у тех,
        // у кого его ещё нет (миграция при появлении новой колонки в настройках).
        // ЗАЧЕМ: Старые версии не сохраняли marginPerContract, и без миграции
        // калькулятор бесконечно показывал бы предупреждение «маржин не задан».
        const defaultsByTicker = new Map(DEFAULT_FUTURES.map(d => [d.ticker.toUpperCase(), d]));
        const migrated = parsed.map(f => {
          if (f.marginPerContract == null) {
            const def = defaultsByTicker.get((f.ticker || '').toUpperCase());
            if (def && def.marginPerContract != null) {
              return { ...f, marginPerContract: def.marginPerContract };
            }
          }
          return f;
        });

        if (missingFutures.length > 0) {
          console.log('🔄 Добавлены новые фьючерсы в настройки:', missingFutures.map(f => f.ticker));
          return [...migrated, ...missingFutures];
        }

        return migrated;
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

// Экспорт констант для использования в других модулях
export { DEFAULT_FUTURES, STORAGE_KEY };
