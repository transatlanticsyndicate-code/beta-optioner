import { calculateOptionPrice } from './blackScholes';
import { getRiskFreeRateSync } from '../hooks/useRiskFreeRate';

// Константы модели
const OPTION_CONTRACT_MULTIPLIER = 100;  // 1 контракт = 100 акций
const DEFAULT_VOLATILITY = 0.30;         // 30% IV по умолчанию (типичная для акций)

/**
 * Получить безрисковую ставку для расчётов Black-Scholes
 * ЗАЧЕМ: Использует актуальную ставку от FRED API (кэшируется на 1 час)
 * 
 * @returns {number} Безрисковая ставка в десятичном формате (0.045 = 4.5%)
 */
const getRiskFreeRate = () => {
  return getRiskFreeRateSync();
};

/**
 * Безопасное преобразование в число
 * ЗАЧЕМ: Защита от некорректных входных данных
 */
const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Получение количества контрактов (всегда положительное)
 */
const getQuantity = (option = {}) => {
  const qty = toNumber(option.quantity);
  return Math.abs(qty);
};

/**
 * Получение множителя контракта (по умолчанию 100)
 */
const getMultiplier = (option = {}) => {
  const customMultiplier = toNumber(option.contractSize, OPTION_CONTRACT_MULTIPLIER);
  return customMultiplier > 0 ? customMultiplier : OPTION_CONTRACT_MULTIPLIER;
};

/**
 * Проверка направления сделки (Buy/Sell)
 */
const isBuyAction = (option = {}) => {
  return (option.action || 'Buy').toLowerCase() === 'buy';
};

/**
 * Получение IV из опциона или использование значения по умолчанию
 * ЗАЧЕМ: IV критически важна для точности Black-Scholes
 * 
 * IV приходит из Polygon API и сохраняется в разных форматах:
 * - implied_volatility (snake_case из API)
 * - impliedVolatility (camelCase после преобразования)
 * - iv (сокращённое)
 * - volatility (общее)
 * 
 * @param {object} option - объект опциона
 * @returns {number} - implied volatility в десятичном формате (0.30 = 30%)
 */
const getImpliedVolatility = (option = {}) => {
  // Проверяем все возможные поля для IV (camelCase и snake_case)
  const iv = option.impliedVolatility || option.implied_volatility || option.iv || option.volatility;

  if (iv !== undefined && iv !== null && iv !== 0) {
    const ivNum = toNumber(iv);
    // Если IV передана в процентах (>1), конвертируем в десятичный формат
    if (ivNum > 1) {
      console.log(`📊 IV for ${option.type} ${option.strike}: ${ivNum}% → ${ivNum / 100}`);
      return ivNum / 100;
    }
    // Разумные границы IV: от 5% до 500%
    if (ivNum >= 0.05 && ivNum <= 5) {
      console.log(`📊 IV for ${option.type} ${option.strike}: ${(ivNum * 100).toFixed(1)}%`);
      return ivNum;
    }
  }

  console.log(`⚠️ No IV for ${option.type} ${option.strike}, using default ${DEFAULT_VOLATILITY * 100}%`);
  return DEFAULT_VOLATILITY;
};

/**
 * Расчёт внутренней стоимости опциона (Intrinsic Value)
 * ЗАЧЕМ: Базовый компонент стоимости опциона - разница между ценой актива и страйком
 * 
 * @param {object} option - объект опциона с полями type, strike
 * @param {number} price - текущая/целевая цена базового актива
 * @returns {number} - внутренняя стоимость (≥0)
 */
export const calculateIntrinsicValue = (option = {}, price = 0) => {
  const strike = toNumber(option.strike);
  if (!option || !option.type) return 0;

  if (option.type === 'CALL') {
    return Math.max(0, price - strike);
  }

  if (option.type === 'PUT') {
    return Math.max(0, strike - price);
  }

  return 0;
};

/**
 * Расчёт теоретической стоимости опциона по Black-Scholes-Merton
 * ЗАЧЕМ: Единая точная модель ценообразования опционов с учётом дивидендов
 * 
 * @param {object} option - объект опциона
 * @param {number} targetPrice - целевая цена базового актива
 * @param {number} daysRemaining - дней до экспирации
 * @param {number} overrideVolatility - переопределение волатильности
 * @param {number} dividendYield - дивидендная доходность (десятичный формат, например 0.02 = 2%)
 * @returns {number} - теоретическая цена опциона
 */
export const calculateOptionTheoreticalPrice = (
  option = {},
  targetPrice = 0,
  daysRemaining = 0,
  overrideVolatility = null, // Если передано, используем это значение вместо IV из опциона
  dividendYield = 0, // Дивидендная доходность для модели BSM
  overrideRiskFreeRate = null // Для крипто (Binance) передаём 0, для акций — null (берём из FRED)
) => {
  const strike = toNumber(option.strike);
  const type = option.type || 'CALL';

  // Используем переданную волатильность или берём из опциона
  let volatility;
  if (overrideVolatility !== null && overrideVolatility > 0) {
    // Если передано в процентах (>1), конвертируем в десятичный формат
    volatility = overrideVolatility > 1 ? overrideVolatility / 100 : overrideVolatility;
  } else {
    volatility = getImpliedVolatility(option);
  }

  // Внутренняя стоимость
  const intrinsicValue = calculateIntrinsicValue(option, targetPrice);

  // Время до экспирации в годах (Black-Scholes требует годы)
  const timeToExpiryYears = Math.max(0, daysRemaining) / 365;

  // На экспирации (T=0) возвращаем только внутреннюю стоимость
  if (timeToExpiryYears <= 0) {
    return intrinsicValue;
  }

  // Расчёт по Black-Scholes-Merton
  // ЗАЧЕМ: Для акций — актуальная ставка ФРС, для крипто (Binance) — 0 (нет безрисковой ставки)
  const riskFreeRate = overrideRiskFreeRate !== null ? overrideRiskFreeRate : getRiskFreeRate();
  const safeQ = Math.max(0, dividendYield); // Дивидендная доходность >= 0

  const bsPrice = calculateOptionPrice(
    targetPrice,      // S - цена базового актива
    strike,           // K - страйк
    timeToExpiryYears,// T - время до экспирации (годы)
    riskFreeRate,     // r - безрисковая ставка (актуальная от FRED)
    volatility,       // σ - implied volatility
    type,             // тип опциона (CALL/PUT)
    safeQ             // q - дивидендная доходность (BSM)
  );

  // Временная стоимость = BS цена - intrinsic value
  // Временная стоимость всегда >= 0 (опцион стоит как минимум intrinsic + time value)
  const timeValue = Math.max(0, bsPrice - intrinsicValue);

  // Итоговая цена = intrinsic + time value
  // Это гарантирует что цена >= intrinsic и линии не пересекутся
  return intrinsicValue + timeValue;
};

/**
 * Получение цены входа в позицию
 * ЗАЧЕМ: Для Buy используем ASK, для Sell используем BID (биржевая логика)
 * Fallback на premium если bid/ask недоступны
 * 
 * @param {object} option - объект опциона
 * @returns {number} - цена входа
 */
const getEntryPrice = (option = {}) => {
  const isBuy = isBuyAction(option);

  if (isBuy) {
    // Покупка: входим по ASK (цена продавца)
    // Учитываем ручную правку, если она есть
    const ask = option.isAskModified && option.customAsk !== undefined ? toNumber(option.customAsk) : toNumber(option.ask);
    if (ask > 0) return ask;
  } else {
    // Продажа: входим по BID (цена покупателя)
    // Учитываем ручную правку, если она есть
    const bid = option.isBidModified && option.customBid !== undefined ? toNumber(option.customBid) : toNumber(option.bid);
    if (bid > 0) return bid;
  }

  // Fallback на premium если bid/ask недоступны
  // Учитываем ручную правку премии, если она есть
  if (option.isPremiumModified && option.customPremium !== undefined) {
    return Math.max(0, toNumber(option.customPremium));
  }
  return Math.max(0, toNumber(option.premium));
};

/**
 * Расчёт P&L опциона с использованием Black-Scholes-Merton
 * ЗАЧЕМ: Основная функция для графика P&L и метрик с учётом дивидендов
 * 
 * Формула:
 * - Buy: P&L = (TheoreticalPrice - EntryPrice) × Quantity × Multiplier
 *   где EntryPrice = ASK (цена покупки)
 * - Sell: P&L = (EntryPrice - TheoreticalPrice) × Quantity × Multiplier
 *   где EntryPrice = BID (цена продажи)
 * 
 * @param {object} option - объект опциона
 * @param {number} targetPrice - целевая цена базового актива
 * @param {number} currentPrice - текущая цена (не используется в BS, для совместимости)
 * @param {number} daysRemaining - дней до экспирации
 * @param {number} overrideVolatility - переопределение волатильности (из переключателя)
 * @param {number} dividendYield - дивидендная доходность (десятичный формат, например 0.02 = 2%)
 * @param {number} customMultiplier - кастомный множитель (опционально, для крипто используется 1)
 * @returns {number} - P&L в долларах
 */
export const calculateOptionPLValue = (
  option = {},
  targetPrice = 0,
  currentPrice = 0,
  daysRemaining = 0,
  overrideVolatility = null,
  dividendYield = 0,
  customMultiplier = null,
  overrideRiskFreeRate = null // Для крипто (Binance) передаём 0
) => {
  const quantity = getQuantity(option);
  if (!quantity) return 0;

  // Цена входа: ASK для Buy, BID для Sell
  const entryPrice = getEntryPrice(option);
  // Используем кастомный множитель если передан, иначе берём из опциона
  const multiplier = customMultiplier !== null ? customMultiplier : getMultiplier(option);

  // Теоретическая цена опциона по Black-Scholes-Merton
  const theoreticalPrice = calculateOptionTheoreticalPrice(
    option,
    targetPrice,
    daysRemaining,
    overrideVolatility,
    dividendYield,
    overrideRiskFreeRate
  );

  // ЛОГИРОВАНИЕ: Диагностика расхождения цены (ОТКЛЮЧЕНО для production)
  // if (overrideVolatility !== null) {
  //   console.log(`[optionPricing] 💰 ${option.action} ${option.type} Strike $${option.strike}: targetPrice=$${targetPrice}, daysRemaining=${daysRemaining}, IV=${overrideVolatility.toFixed(1)}%, theoreticalPrice=$${theoreticalPrice.toFixed(2)}, dividendYield=${dividendYield}`);
  // }

  // P&L зависит от направления сделки
  if (isBuyAction(option)) {
    // Покупка: прибыль если опцион подорожал
    return (theoreticalPrice - entryPrice) * quantity * multiplier;
  }

  // Продажа: прибыль если опцион подешевел
  return (entryPrice - theoreticalPrice) * quantity * multiplier;
};

/**
 * Расчёт P&L опциона на день экспирации (daysRemaining = 0)
 * ЗАЧЕМ: Упрощённый расчёт для линии экспирации на графике
 * 
 * На экспирации временная стоимость = 0, остаётся только intrinsic value
 * Цена входа: ASK для Buy, BID для Sell
 * 
 * @param {object} option - объект опциона
 * @param {number} price - цена базового актива на экспирации
 * @param {number} customMultiplier - кастомный множитель (опционально, для крипто используется 1)
 * @returns {number} - P&L в долларах
 */
export const calculateOptionExpirationPLValue = (option = {}, price = 0, customMultiplier = null) => {
  const quantity = getQuantity(option);
  if (!quantity) return 0;

  const intrinsicValue = calculateIntrinsicValue(option, price);
  // Цена входа: ASK для Buy, BID для Sell
  const entryPrice = getEntryPrice(option);
  // Используем кастомный множитель если передан, иначе берём из опциона
  const multiplier = customMultiplier !== null ? customMultiplier : getMultiplier(option);

  if (isBuyAction(option)) {
    return (intrinsicValue - entryPrice) * quantity * multiplier;
  }

  return (entryPrice - intrinsicValue) * quantity * multiplier;
};

/**
 * Корректировка P&L на основе группы акции
 * ЗАЧЕМ: Разные типы акций требуют разных коэффициентов корректировки прогноза
 * 
 * ЛОГИКА КОЭФФИЦИЕНТОВ:
 * Коэффициент показывает "точность" прогноза. Например:
 * - down_mult = 0.75 означает: реальный убыток = расчётный / 0.75 = расчётный × 1.33
 * - up_mult = 0.9 означает: реальная прибыль = расчётная × 0.9
 * 
 * Группы:
 * - stable: коэфф. 1.0/1.0 (без корректировки)
 * - growth: down=0.75 (убытки ×1.33), up=0.9 (прибыль ×0.9)
 * - illiquid: down=1.0, up=1.2 (прибыль может быть выше)
 * 
 * @param {number} basePL - Базовый P&L до корректировки
 * @param {Object} classification - Объект классификации акции
 * @param {number} classification.down_mult - Коэффициент точности для убытков (< 1 = убытки больше)
 * @param {number} classification.up_mult - Коэффициент для прибыли (< 1 = прибыль меньше)
 * @returns {number} - Скорректированный P&L
 */
export const adjustPLByStockGroup = (basePL, classification) => {
  // Если нет классификации — возвращаем без изменений
  if (!classification || (!classification.down_mult && !classification.up_mult)) {
    return basePL;
  }

  if (basePL < 0) {
    // Для убытков: делим на коэффициент (down_mult=0.75 → убыток × 1.33)
    // ЗАЧЕМ: Реальные убытки обычно больше расчётных для growth акций
    const downMult = classification.down_mult || 1.0;
    return downMult > 0 ? basePL / downMult : basePL;
  } else {
    // Для прибыли: умножаем на коэффициент (up_mult=0.9 → прибыль × 0.9)
    // ЗАЧЕМ: Реальная прибыль обычно меньше расчётной для growth акций
    const upMult = classification.up_mult || 1.0;
    return basePL * upMult;
  }
};

/**
 * Корректировка массива P&L значений на основе группы акции
 * ЗАЧЕМ: Для применения корректировки ко всему графику P&L
 * 
 * @param {Array<number>} plArray - Массив P&L значений
 * @param {Object} classification - Объект классификации акции
 * @returns {Array<number>} - Массив скорректированных P&L значений
 */
export const adjustPLArrayByStockGroup = (plArray, classification) => {
  if (!classification || !Array.isArray(plArray)) {
    return plArray;
  }

  return plArray.map(pl => adjustPLByStockGroup(pl, classification));
};

/**
 * Экспорт констант и функций для использования в других модулях
 */
export const PRICING_CONSTANTS = {
  OPTION_CONTRACT_MULTIPLIER,
  DEFAULT_VOLATILITY,
  getRiskFreeRate // Экспортируем функцию для получения актуальной ставки
};
