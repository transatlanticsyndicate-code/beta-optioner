/**
 * Universal Option Pricing Module — Единая точка входа для всех расчётов P&L
 * ЗАЧЕМ: Автоматический выбор модели (BSM для акций, Black-76 для фьючерсов)
 * Затрагивает: PLChart, OptionsTableV3, ExitCalculator, OptionsMetrics, ExitTimeDecayChart
 * 
 * ВАЖНО: Все компоненты должны использовать функции из этого модуля вместо
 * прямого импорта из optionPricing.js или futuresPricing.js
 * 
 * Режимы:
 * - 'stocks' (по умолчанию): Black-Scholes-Merton с дивидендами
 * - 'futures': Black-76 без дивидендов, с pointValue
 */

// Импорт функций для режима "Акции" (Black-Scholes-Merton)
import {
  calculateOptionPLValue as calculateStockOptionPLValue,
  calculateOptionExpirationPLValue as calculateStockOptionExpirationPLValue,
  calculateOptionTheoreticalPrice as calculateStockOptionTheoreticalPrice,
  calculateIntrinsicValue as calculateStockIntrinsicValue,
  PRICING_CONSTANTS
} from './optionPricing';

// Импорт функций для режима "Фьючерсы" (Black-76)
import {
  calculateFuturesOptionPLValue,
  calculateFuturesOptionExpirationPLValue,
  calculateFuturesOptionTheoreticalPrice,
  calculateFuturesGreeks,
  calculateFuturesPortfolioPL,
  calculateFuturesPortfolioExpirationPL,
  calculateFuturesPortfolioGreeks,
  getFuturesPointValue
} from './futuresPricing';

import { calculateIntrinsicValueBlack76 } from './black76';

// Режимы калькулятора
export const CALCULATOR_MODES = {
  STOCKS: 'stocks',
  FUTURES: 'futures'
};

/**
 * Расчёт теоретической цены опциона (универсальный)
 * ЗАЧЕМ: Единая функция для обоих режимов
 * 
 * @param {object} option - объект опциона
 * @param {number} targetPrice - целевая цена базового актива
 * @param {number} daysRemaining - дней до экспирации
 * @param {object} params - дополнительные параметры
 * @param {string} params.mode - режим калькулятора ('stocks' | 'futures')
 * @param {number} params.overrideVolatility - переопределение IV (опционально)
 * @param {number} params.dividendYield - дивидендная доходность (только для stocks)
 * @param {number} params.pointValue - цена пункта (только для futures)
 * @returns {number} - теоретическая цена опциона
 */
export const calculateOptionTheoreticalPrice = (
  option,
  targetPrice,
  daysRemaining,
  params = {}
) => {
  const {
    mode = CALCULATOR_MODES.STOCKS,
    overrideVolatility = null,
    dividendYield = 0
  } = params;

  if (mode === CALCULATOR_MODES.FUTURES) {
    return calculateFuturesOptionTheoreticalPrice(
      option,
      targetPrice,
      daysRemaining,
      overrideVolatility
    );
  }

  // Режим "Акции" — Black-Scholes-Merton
  return calculateStockOptionTheoreticalPrice(
    option,
    targetPrice,
    daysRemaining,
    overrideVolatility,
    dividendYield
  );
};

/**
 * Расчёт P&L опциона (универсальный)
 * ЗАЧЕМ: Основная функция для графика P&L и метрик
 * 
 * @param {object} option - объект опциона
 * @param {number} targetPrice - целевая цена базового актива
 * @param {number} currentPrice - текущая цена (для совместимости)
 * @param {number} daysRemaining - дней до экспирации
 * @param {object} params - дополнительные параметры
 * @param {string} params.mode - режим калькулятора ('stocks' | 'futures')
 * @param {number} params.overrideVolatility - переопределение IV
 * @param {number} params.dividendYield - дивидендная доходность (только для stocks)
 * @param {number} params.pointValue - цена пункта (только для futures)
 * @returns {number} - P&L в долларах
 */
export const calculateOptionPLValue = (
  option,
  targetPrice,
  currentPrice,
  daysRemaining,
  params = {}
) => {
  const {
    mode = CALCULATOR_MODES.STOCKS,
    overrideVolatility = null,
    dividendYield = 0,
    pointValue = 1
  } = params;

  if (mode === CALCULATOR_MODES.FUTURES) {
    return calculateFuturesOptionPLValue(
      option,
      targetPrice,
      daysRemaining,
      pointValue,
      overrideVolatility
    );
  }

  // Режим "Акции" — Black-Scholes-Merton
  return calculateStockOptionPLValue(
    option,
    targetPrice,
    currentPrice,
    daysRemaining,
    overrideVolatility,
    dividendYield
  );
};

/**
 * Расчёт P&L опциона на экспирации (универсальный)
 * ЗАЧЕМ: Для линии экспирации на графике
 * 
 * @param {object} option - объект опциона
 * @param {number} price - цена базового актива на экспирации
 * @param {object} params - дополнительные параметры
 * @param {string} params.mode - режим калькулятора
 * @param {number} params.pointValue - цена пункта (только для futures)
 * @returns {number} - P&L в долларах
 */
export const calculateOptionExpirationPLValue = (
  option,
  price,
  params = {}
) => {
  const {
    mode = CALCULATOR_MODES.STOCKS,
    pointValue = 1
  } = params;

  if (mode === CALCULATOR_MODES.FUTURES) {
    return calculateFuturesOptionExpirationPLValue(option, price, pointValue);
  }

  // Режим "Акции"
  return calculateStockOptionExpirationPLValue(option, price);
};

/**
 * Расчёт внутренней стоимости опциона (универсальный)
 * ЗАЧЕМ: Базовый компонент стоимости
 * 
 * @param {object} option - объект опциона
 * @param {number} price - цена базового актива
 * @param {object} params - дополнительные параметры
 * @param {string} params.mode - режим калькулятора
 * @returns {number} - внутренняя стоимость
 */
export const calculateIntrinsicValue = (
  option,
  price,
  params = {}
) => {
  const { mode = CALCULATOR_MODES.STOCKS } = params;

  if (mode === CALCULATOR_MODES.FUTURES) {
    return calculateIntrinsicValueBlack76(option.type, price, option.strike);
  }

  return calculateStockIntrinsicValue(option, price);
};

/**
 * Расчёт суммарного P&L портфеля (универсальный)
 * ЗАЧЕМ: Для графика и метрик — сумма P&L всех видимых опционов
 * 
 * @param {Array} options - массив опционов
 * @param {number} targetPrice - целевая цена
 * @param {number} currentPrice - текущая цена
 * @param {number} daysRemaining - дней до экспирации
 * @param {object} params - дополнительные параметры
 * @returns {number} - суммарный P&L
 */
export const calculatePortfolioPL = (
  options,
  targetPrice,
  currentPrice,
  daysRemaining,
  params = {}
) => {
  const {
    mode = CALCULATOR_MODES.STOCKS,
    overrideVolatility = null,
    dividendYield = 0,
    pointValue = 1
  } = params;

  if (!options || options.length === 0) return 0;

  if (mode === CALCULATOR_MODES.FUTURES) {
    return calculateFuturesPortfolioPL(
      options,
      targetPrice,
      daysRemaining,
      pointValue,
      overrideVolatility
    );
  }

  // Режим "Акции" — суммируем P&L каждого опциона
  return options
    .filter(opt => opt.visible !== false)
    .reduce((total, option) => {
      const pl = calculateStockOptionPLValue(
        option,
        targetPrice,
        currentPrice,
        daysRemaining,
        overrideVolatility,
        dividendYield
      );
      return total + pl;
    }, 0);
};

/**
 * Расчёт суммарного P&L портфеля на экспирации (универсальный)
 * 
 * @param {Array} options - массив опционов
 * @param {number} price - цена на экспирации
 * @param {object} params - дополнительные параметры
 * @returns {number} - суммарный P&L
 */
export const calculatePortfolioExpirationPL = (
  options,
  price,
  params = {}
) => {
  const {
    mode = CALCULATOR_MODES.STOCKS,
    pointValue = 1
  } = params;

  if (!options || options.length === 0) return 0;

  if (mode === CALCULATOR_MODES.FUTURES) {
    return calculateFuturesPortfolioExpirationPL(options, price, pointValue);
  }

  // Режим "Акции"
  return options
    .filter(opt => opt.visible !== false)
    .reduce((total, option) => {
      const pl = calculateStockOptionExpirationPLValue(option, price);
      return total + pl;
    }, 0);
};

/**
 * Расчёт греков опциона (универсальный)
 * ЗАЧЕМ: Анализ чувствительности
 * 
 * @param {object} option - объект опциона
 * @param {number} price - цена базового актива
 * @param {number} daysRemaining - дней до экспирации
 * @param {object} params - дополнительные параметры
 * @returns {Object} - { delta, gamma, theta, vega, rho }
 */
export const calculateGreeks = (
  option,
  price,
  daysRemaining,
  params = {}
) => {
  const {
    mode = CALCULATOR_MODES.STOCKS,
    overrideVolatility = null
  } = params;

  if (mode === CALCULATOR_MODES.FUTURES) {
    return calculateFuturesGreeks(option, price, daysRemaining, overrideVolatility);
  }

  // Для режима "Акции" используем греки из blackScholes.js
  // Импортируем напрямую чтобы избежать циклических зависимостей
  const { calculateGreeks: calculateBSMGreeks } = require('./blackScholes');
  const { getRiskFreeRateSync } = require('../hooks/useRiskFreeRate');
  
  const strike = parseFloat(option.strike) || 0;
  const type = option.type || 'CALL';
  const iv = overrideVolatility || option.impliedVolatility || option.iv || 0.3;
  const volatility = iv > 1 ? iv / 100 : iv;
  const timeToExpiryYears = Math.max(0, daysRemaining) / 365;
  const riskFreeRate = getRiskFreeRateSync();
  
  return calculateBSMGreeks(price, strike, timeToExpiryYears, riskFreeRate, volatility, type);
};

/**
 * Расчёт суммарных греков портфеля (универсальный)
 * 
 * @param {Array} options - массив опционов
 * @param {number} price - цена базового актива
 * @param {number} daysRemaining - дней до экспирации
 * @param {object} params - дополнительные параметры
 * @returns {Object} - { delta, gamma, theta, vega }
 */
export const calculatePortfolioGreeks = (
  options,
  price,
  daysRemaining,
  params = {}
) => {
  const {
    mode = CALCULATOR_MODES.STOCKS,
    pointValue = 1
  } = params;

  if (!options || options.length === 0) {
    return { delta: 0, gamma: 0, theta: 0, vega: 0 };
  }

  if (mode === CALCULATOR_MODES.FUTURES) {
    return calculateFuturesPortfolioGreeks(options, price, daysRemaining, pointValue);
  }

  // Режим "Акции" — суммируем греки
  const multiplier = 100; // Стандартный множитель для акций
  
  return options
    .filter(opt => opt.visible !== false)
    .reduce((total, option) => {
      const quantity = Math.abs(parseFloat(option.quantity)) || 1;
      const direction = (option.action || 'Buy').toLowerCase() === 'buy' ? 1 : -1;
      const greeks = calculateGreeks(option, price, daysRemaining, params);
      
      return {
        delta: total.delta + (greeks.delta * quantity * direction * multiplier),
        gamma: total.gamma + (greeks.gamma * quantity * direction * multiplier),
        theta: total.theta + (greeks.theta * quantity * direction * multiplier),
        vega: total.vega + (greeks.vega * quantity * direction * multiplier)
      };
    }, { delta: 0, gamma: 0, theta: 0, vega: 0 });
};

/**
 * Получение множителя контракта в зависимости от режима
 * ЗАЧЕМ: Для акций = 100, для фьючерсов = pointValue
 * 
 * @param {string} mode - режим калькулятора
 * @param {string} ticker - тикер (для фьючерсов)
 * @param {number} customPointValue - кастомный pointValue (опционально)
 * @returns {number} - множитель контракта
 */
export const getContractMultiplier = (mode, ticker = '', customPointValue = null) => {
  if (mode === CALCULATOR_MODES.FUTURES) {
    if (customPointValue && customPointValue > 0) {
      return customPointValue;
    }
    return getFuturesPointValue(ticker);
  }
  
  return PRICING_CONSTANTS.OPTION_CONTRACT_MULTIPLIER; // 100 для акций
};

/**
 * Проверка, нужны ли дивиденды для данного режима
 * ЗАЧЕМ: Для фьючерсов дивиденды не используются
 * 
 * @param {string} mode - режим калькулятора
 * @returns {boolean} - true если дивиденды используются
 */
export const useDividendsForMode = (mode) => {
  return mode !== CALCULATOR_MODES.FUTURES;
};

/**
 * Проверка, нужна ли IV Surface для данного режима
 * ЗАЧЕМ: Для фьючерсов IV приходит от TradingView Extension
 * 
 * @param {string} mode - режим калькулятора
 * @returns {boolean} - true если IV Surface используется
 */
export const useIVSurfaceForMode = (mode) => {
  return mode !== CALCULATOR_MODES.FUTURES;
};

// Экспорт констант для совместимости
export { PRICING_CONSTANTS };
