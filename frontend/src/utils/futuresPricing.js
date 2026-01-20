/**
 * Unified Futures Option Pricing Module
 * ЗАЧЕМ: Единый модуль для всех расчётов P&L опционов на фьючерсы
 * Затрагивает: UniversalOptionsCalculator (режим "Фьючерсы")
 * 
 * Этот модуль является ЕДИНСТВЕННОЙ точкой входа для расчётов фьючерсов.
 * Все компоненты (PLChart, OptionsTableV3, ExitCalculator, OptionsMetrics)
 * должны использовать функции из этого модуля для режима "Фьючерсы".
 * 
 * Ключевые отличия от режима "Акции":
 * - Модель: Black-76 (не Black-Scholes-Merton)
 * - Множитель: pointValue из настроек фьючерса (не 100)
 * - Дивиденды: НЕ используются
 * - IV Surface: НЕ используется (IV приходит от TradingView Extension)
 */

import {
  calculateOptionPriceBlack76,
  calculateGreeksBlack76,
  calculateIntrinsicValueBlack76
} from './black76';
import { getRiskFreeRateSync } from '../hooks/useRiskFreeRate';
import { getPointValue } from './futuresSettings';

// Константы
const DEFAULT_VOLATILITY = 0.30; // 30% IV по умолчанию

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
 * Проверка направления сделки (Buy/Sell)
 */
const isBuyAction = (option = {}) => {
  return (option.action || 'Buy').toLowerCase() === 'buy';
};

/**
 * Получение IV из опциона
 * ЗАЧЕМ: IV для фьючерсов приходит от TradingView Extension (askIV/bidIV)
 * 
 * @param {object} option - объект опциона
 * @returns {number} - implied volatility в десятичном формате (0.30 = 30%)
 */
const getImpliedVolatility = (option = {}) => {
  // Проверяем все возможные поля для IV
  const iv = option.impliedVolatility || option.implied_volatility || 
             option.iv || option.askIV || option.bidIV || option.volatility;
  
  if (iv !== undefined && iv !== null && iv !== 0) {
    const ivNum = toNumber(iv);
    // Если IV передана в процентах (>1), конвертируем в десятичный формат
    if (ivNum > 1) {
      return ivNum / 100;
    }
    // Разумные границы IV: от 5% до 500%
    if (ivNum >= 0.05 && ivNum <= 5) {
      return ivNum;
    }
  }
  
  return DEFAULT_VOLATILITY;
};

/**
 * Получение цены входа в позицию для фьючерсного опциона
 * ЗАЧЕМ: Для Buy используем ASK, для Sell используем BID
 * 
 * @param {object} option - объект опциона
 * @returns {number} - цена входа
 */
const getEntryPrice = (option = {}) => {
  const isBuy = isBuyAction(option);
  
  if (isBuy) {
    // Покупка: входим по ASK
    const ask = toNumber(option.ask);
    if (ask > 0) return ask;
  } else {
    // Продажа: входим по BID
    const bid = toNumber(option.bid);
    if (bid > 0) return bid;
  }
  
  // Fallback на premium
  return Math.max(0, toNumber(option.premium));
};

/**
 * Расчёт теоретической цены опциона на фьючерс по Black-76
 * ЗАЧЕМ: Единая функция для расчёта цены опциона в режиме "Фьючерсы"
 * 
 * @param {object} option - объект опциона
 * @param {number} futuresPrice - текущая/целевая цена фьючерса
 * @param {number} daysRemaining - дней до экспирации
 * @param {number} overrideVolatility - переопределение волатильности (опционально)
 * @returns {number} - теоретическая цена опциона
 */
export const calculateFuturesOptionTheoreticalPrice = (
  option = {},
  futuresPrice = 0,
  daysRemaining = 0,
  overrideVolatility = null
) => {
  const strike = toNumber(option.strike);
  const type = option.type || 'CALL';
  
  // Используем переданную волатильность или берём из опциона
  let volatility;
  if (overrideVolatility !== null && overrideVolatility > 0) {
    volatility = overrideVolatility > 1 ? overrideVolatility / 100 : overrideVolatility;
  } else {
    volatility = getImpliedVolatility(option);
  }
  
  // Внутренняя стоимость
  const intrinsicValue = calculateIntrinsicValueBlack76(type, futuresPrice, strike);
  
  // Время до экспирации в годах
  const timeToExpiryYears = Math.max(0, daysRemaining) / 365;
  
  // На экспирации (T=0) возвращаем только внутреннюю стоимость
  if (timeToExpiryYears <= 0) {
    return intrinsicValue;
  }
  
  // Безрисковая ставка (используется только для дисконтирования в Black-76)
  const riskFreeRate = getRiskFreeRateSync();
  
  // Расчёт по Black-76
  const black76Price = calculateOptionPriceBlack76(
    futuresPrice,     // F - цена фьючерса
    strike,           // K - страйк
    timeToExpiryYears,// T - время до экспирации (годы)
    riskFreeRate,     // r - безрисковая ставка (для дисконтирования)
    volatility,       // σ - implied volatility
    type              // тип опциона (CALL/PUT)
  );
  
  // Гарантируем что цена >= intrinsic value
  const timeValue = Math.max(0, black76Price - intrinsicValue);
  return intrinsicValue + timeValue;
};

/**
 * Расчёт P&L опциона на фьючерс
 * ЗАЧЕМ: Основная функция для графика P&L и метрик в режиме "Фьючерсы"
 * 
 * Формула:
 * - Buy: P&L = (TheoreticalPrice - EntryPrice) × Quantity × pointValue
 * - Sell: P&L = (EntryPrice - TheoreticalPrice) × Quantity × pointValue
 * 
 * @param {object} option - объект опциона
 * @param {number} futuresPrice - целевая цена фьючерса
 * @param {number} daysRemaining - дней до экспирации
 * @param {number} pointValue - цена пункта фьючерса (из настроек)
 * @param {number} overrideVolatility - переопределение волатильности (опционально)
 * @returns {number} - P&L в долларах
 */
export const calculateFuturesOptionPLValue = (
  option = {},
  futuresPrice = 0,
  daysRemaining = 0,
  pointValue = 1,
  overrideVolatility = null
) => {
  const quantity = getQuantity(option);
  if (!quantity) return 0;

  // Цена входа: ASK для Buy, BID для Sell
  const entryPrice = getEntryPrice(option);
  
  // Теоретическая цена опциона по Black-76
  const theoreticalPrice = calculateFuturesOptionTheoreticalPrice(
    option,
    futuresPrice,
    daysRemaining,
    overrideVolatility
  );

  // P&L зависит от направления сделки
  // ВАЖНО: Используем pointValue вместо 100 (как для акций)
  if (isBuyAction(option)) {
    // Покупка: прибыль если опцион подорожал
    return (theoreticalPrice - entryPrice) * quantity * pointValue;
  }

  // Продажа: прибыль если опцион подешевел
  return (entryPrice - theoreticalPrice) * quantity * pointValue;
};

/**
 * Расчёт P&L опциона на фьючерс на день экспирации
 * ЗАЧЕМ: Упрощённый расчёт для линии экспирации на графике
 * 
 * @param {object} option - объект опциона
 * @param {number} futuresPrice - цена фьючерса на экспирации
 * @param {number} pointValue - цена пункта фьючерса
 * @returns {number} - P&L в долларах
 */
export const calculateFuturesOptionExpirationPLValue = (
  option = {},
  futuresPrice = 0,
  pointValue = 1
) => {
  const quantity = getQuantity(option);
  if (!quantity) return 0;

  const strike = toNumber(option.strike);
  const type = option.type || 'CALL';
  
  // Внутренняя стоимость на экспирации
  const intrinsicValue = calculateIntrinsicValueBlack76(type, futuresPrice, strike);
  
  // Цена входа
  const entryPrice = getEntryPrice(option);

  // P&L с учётом pointValue
  if (isBuyAction(option)) {
    return (intrinsicValue - entryPrice) * quantity * pointValue;
  }

  return (entryPrice - intrinsicValue) * quantity * pointValue;
};

/**
 * Расчёт греков для опциона на фьючерс
 * ЗАЧЕМ: Анализ чувствительности в режиме "Фьючерсы"
 * 
 * @param {object} option - объект опциона
 * @param {number} futuresPrice - цена фьючерса
 * @param {number} daysRemaining - дней до экспирации
 * @param {number} overrideVolatility - переопределение волатильности (опционально)
 * @returns {Object} - { delta, gamma, theta, vega, rho }
 */
export const calculateFuturesGreeks = (
  option = {},
  futuresPrice = 0,
  daysRemaining = 0,
  overrideVolatility = null
) => {
  const strike = toNumber(option.strike);
  const type = option.type || 'CALL';
  
  // Волатильность
  let volatility;
  if (overrideVolatility !== null && overrideVolatility > 0) {
    volatility = overrideVolatility > 1 ? overrideVolatility / 100 : overrideVolatility;
  } else {
    volatility = getImpliedVolatility(option);
  }
  
  // Время до экспирации в годах
  const timeToExpiryYears = Math.max(0, daysRemaining) / 365;
  
  // Безрисковая ставка
  const riskFreeRate = getRiskFreeRateSync();
  
  return calculateGreeksBlack76(
    futuresPrice,
    strike,
    timeToExpiryYears,
    riskFreeRate,
    volatility,
    type
  );
};

/**
 * Расчёт суммарного P&L портфеля опционов на фьючерсы
 * ЗАЧЕМ: Для графика и метрик — сумма P&L всех видимых опционов
 * 
 * @param {Array} options - массив опционов
 * @param {number} futuresPrice - целевая цена фьючерса
 * @param {number} daysRemaining - дней до экспирации
 * @param {number} pointValue - цена пункта фьючерса
 * @param {number} overrideVolatility - переопределение волатильности (опционально)
 * @returns {number} - суммарный P&L в долларах
 */
export const calculateFuturesPortfolioPL = (
  options = [],
  futuresPrice = 0,
  daysRemaining = 0,
  pointValue = 1,
  overrideVolatility = null
) => {
  if (!options || options.length === 0) return 0;
  
  return options
    .filter(opt => opt.visible !== false)
    .reduce((total, option) => {
      const pl = calculateFuturesOptionPLValue(
        option,
        futuresPrice,
        daysRemaining,
        pointValue,
        overrideVolatility
      );
      return total + pl;
    }, 0);
};

/**
 * Расчёт суммарного P&L портфеля на экспирации
 * ЗАЧЕМ: Для линии экспирации на графике
 * 
 * @param {Array} options - массив опционов
 * @param {number} futuresPrice - цена фьючерса на экспирации
 * @param {number} pointValue - цена пункта фьючерса
 * @returns {number} - суммарный P&L в долларах
 */
export const calculateFuturesPortfolioExpirationPL = (
  options = [],
  futuresPrice = 0,
  pointValue = 1
) => {
  if (!options || options.length === 0) return 0;
  
  return options
    .filter(opt => opt.visible !== false)
    .reduce((total, option) => {
      const pl = calculateFuturesOptionExpirationPLValue(option, futuresPrice, pointValue);
      return total + pl;
    }, 0);
};

/**
 * Расчёт суммарных греков портфеля опционов на фьючерсы
 * ЗАЧЕМ: Для блока метрик — агрегированные греки
 * 
 * @param {Array} options - массив опционов
 * @param {number} futuresPrice - цена фьючерса
 * @param {number} daysRemaining - дней до экспирации
 * @param {number} pointValue - цена пункта фьючерса
 * @returns {Object} - { delta, gamma, theta, vega }
 */
export const calculateFuturesPortfolioGreeks = (
  options = [],
  futuresPrice = 0,
  daysRemaining = 0,
  pointValue = 1
) => {
  if (!options || options.length === 0) {
    return { delta: 0, gamma: 0, theta: 0, vega: 0 };
  }
  
  return options
    .filter(opt => opt.visible !== false)
    .reduce((total, option) => {
      const quantity = Math.abs(toNumber(option.quantity)) || 1;
      const multiplier = isBuyAction(option) ? 1 : -1;
      const greeks = calculateFuturesGreeks(option, futuresPrice, daysRemaining);
      
      // Греки умножаются на quantity и pointValue
      return {
        delta: total.delta + (greeks.delta * quantity * multiplier * pointValue),
        gamma: total.gamma + (greeks.gamma * quantity * multiplier * pointValue),
        theta: total.theta + (greeks.theta * quantity * multiplier * pointValue),
        vega: total.vega + (greeks.vega * quantity * multiplier * pointValue)
      };
    }, { delta: 0, gamma: 0, theta: 0, vega: 0 });
};

/**
 * Получение pointValue для тикера фьючерса
 * ЗАЧЕМ: Удобная обёртка для получения множителя контракта
 * 
 * @param {string} ticker - тикер фьючерса (например, 'ES', 'NQ')
 * @returns {number} - цена пункта
 */
export const getFuturesPointValue = (ticker) => {
  return getPointValue(ticker);
};

/**
 * Экспорт констант для использования в других модулях
 */
export const FUTURES_PRICING_CONSTANTS = {
  DEFAULT_VOLATILITY
};
