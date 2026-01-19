/**
 * Утилита для работы с настройками фьючерсов
 * ЗАЧЕМ: Обеспечивает доступ к параметрам фьючерсов (pointValue) для универсального калькулятора
 * Затрагивает: UniversalOptionsCalculator, расчёты P&L для фьючерсов
 */

// Предустановленные фьючерсы по умолчанию
// ЗАЧЕМ: Используются если пользователь не настроил свои параметры
const DEFAULT_FUTURES = [
  { id: 1, ticker: 'ES', name: 'E-mini S&P 500', pointValue: 50 },
  { id: 2, ticker: 'NQ', name: 'E-mini Nasdaq-100', pointValue: 20 },
  { id: 3, ticker: 'YM', name: 'E-mini Dow Jones', pointValue: 5 },
  { id: 4, ticker: 'GC', name: 'Gold Futures', pointValue: 100 },
  { id: 5, ticker: 'CL', name: 'Crude Oil Futures', pointValue: 1000 },
  { id: 6, ticker: 'ZC', name: 'Corn Futures', pointValue: 50 },
  { id: 7, ticker: 'ZS', name: 'Soybean Futures', pointValue: 50 },
  { id: 8, ticker: 'ZW', name: 'Wheat Futures', pointValue: 50 },
  { id: 9, ticker: 'ZO', name: 'Oat Futures', pointValue: 50 },
  { id: 10, ticker: 'ZR', name: 'Rough Rice Futures', pointValue: 100 },
  { id: 11, ticker: 'ZL', name: 'Soybean Oil Futures', pointValue: 100 },
  { id: 12, ticker: 'ZM', name: 'Soybean Meal Futures', pointValue: 100 },
  { id: 13, ticker: 'LE', name: 'Live Cattle Futures', pointValue: 400 },
  { id: 14, ticker: 'GF', name: 'Feeder Cattle Futures', pointValue: 500 },
  { id: 15, ticker: 'LH', name: 'Lean Hog Futures', pointValue: 400 },
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
        return parsed;
      }
    }
  } catch (error) {
    console.error('❌ Ошибка загрузки настроек фьючерсов:', error);
  }
  
  // Возвращаем дефолтные значения если нет сохранённых
  return DEFAULT_FUTURES;
};

/**
 * Получает pointValue для конкретного тикера фьючерса
 * ЗАЧЕМ: Используется в расчётах P&L вместо стандартного множителя 100 для акций
 * @param {string} ticker - Тикер фьючерса (например, 'ES', 'NQ')
 * @returns {number} Цена пункта для данного фьючерса (или 1 если не найден)
 */
export const getPointValue = (ticker) => {
  if (!ticker) return 1;
  
  const futures = loadFuturesSettings();
  const future = futures.find(f => f.ticker.toUpperCase() === ticker.toUpperCase());
  
  if (future && future.pointValue) {
    return future.pointValue;
  }
  
  // Если фьючерс не найден, возвращаем 1 (нейтральный множитель)
  console.warn(`⚠️ Фьючерс ${ticker} не найден в настройках, используется pointValue = 1`);
  return 1;
};

/**
 * Получает полную информацию о фьючерсе по тикеру
 * ЗАЧЕМ: Для отображения названия и параметров в UI калькулятора
 * @param {string} ticker - Тикер фьючерса
 * @returns {Object|null} Объект фьючерса или null если не найден
 */
export const getFutureByTicker = (ticker) => {
  if (!ticker) return null;
  
  const futures = loadFuturesSettings();
  return futures.find(f => f.ticker.toUpperCase() === ticker.toUpperCase()) || null;
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
 * Проверяет, является ли тикер фьючерсом
 * ЗАЧЕМ: Для автоматического определения типа инструмента
 * @param {string} ticker - Тикер для проверки
 * @returns {boolean} true если тикер есть в списке фьючерсов
 */
export const isFuturesTicker = (ticker) => {
  if (!ticker) return false;
  
  const futures = loadFuturesSettings();
  return futures.some(f => f.ticker.toUpperCase() === ticker.toUpperCase());
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
