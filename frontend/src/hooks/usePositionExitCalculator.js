import { useMemo } from 'react';
import {
  calculateIntrinsicValue,
  calculateOptionPLValue,
  calculateOptionValueWithTimeDecay,
  calculateOptionExpirationPLValue,
} from '../utils/optionPricing';

/**
 * Хук для расчета P&L при выходе из позиции
 * 
 * @param {Object} params
 * @param {number} params.underlyingPrice - Цена базового актива для расчета
 * @param {number} params.daysToExpiration - Количество дней до экспирации
 * @param {Array} params.options - Массив опционов
 * @param {Array} params.positions - Массив позиций базового актива
 * @param {number} params.currentPrice - Текущая цена базового актива
 * 
 * @returns {Object} - Объект с расчетами для трех сценариев
 */
export const usePositionExitCalculator = ({
  underlyingPrice,
  daysToExpiration,
  options = [],
  positions = [],
  currentPrice = 0,
  volatility = 25 // Волатильность в процентах
}) => {
  return useMemo(() => {
    // Фильтруем видимые опционы и позиции
    const visibleOptions = options.filter(opt => opt.visible !== false);
    const visiblePositions = positions.filter(pos => pos.visible !== false);

    // Если нет ни опционов, ни позиций - возвращаем нули
    if (visibleOptions.length === 0 && visiblePositions.length === 0) {
      return {
        plExercise: 0,
        plCloseOptions: 0,
        plCloseAll: 0,
        details: {
          exercise: [],
          closeOptions: [],
          closeAll: []
        }
      };
    }

    // Сценарий 1: Исполнить опционы (Exercise all options)
    const exerciseCalculation = calculateExerciseScenario({
      options: visibleOptions,
      positions: visiblePositions,
      underlyingPrice,
      daysToExpiration,
      currentPrice
    });

    // Сценарий 2: Закрыть опционы, оставить акции (Close options only)
    const closeOptionsCalculation = calculateCloseOptionsScenario({
      options: visibleOptions,
      positions: visiblePositions,
      underlyingPrice,
      daysToExpiration,
      currentPrice,
      volatility
    });

    // Сценарий 3: Закрыть всё (Close everything)
    const closeAllCalculation = calculateCloseAllScenario({
      options: visibleOptions,
      positions: visiblePositions,
      underlyingPrice,
      daysToExpiration,
      currentPrice,
      volatility
    });

    return {
      plExercise: exerciseCalculation.totalPL,
      plCloseOptions: closeOptionsCalculation.totalPL,
      plCloseAll: closeAllCalculation.totalPL,
      details: {
        exercise: exerciseCalculation.details,
        closeOptions: closeOptionsCalculation.details,
        closeAll: closeAllCalculation.details
      }
    };
  }, [underlyingPrice, daysToExpiration, options, positions, currentPrice, volatility]);
};

/**
 * Сценарий 1: Исполнить опционы
 * - Buy CALL: покупаем акции по страйку
 * - Buy PUT: продаем акции по страйку
 * - Sell CALL: продаем акции по страйку
 * - Sell PUT: покупаем акции по страйку
 * - Затем P&L от изменения цены акций
 */
const calculateExerciseScenario = ({ options, positions, underlyingPrice, currentPrice }) => {
  const details = [];
  let totalPL = 0;

  // Стоимость покупки акций учитывается в totalPL, но не отображается отдельной строкой
  positions.forEach(position => {
    const quantity = Number(position.quantity) || 0;
    const entryPrice = Number(position.price) || 0;
    const cost = -entryPrice * quantity;
    totalPL += cost;
  });

  // P&L от исполнения опционов (только ITM опционы исполняются)
  options.forEach(option => {
    const pl = calculateOptionExpirationPLValue(option, underlyingPrice);
    const strike = Number(option.strike) || 0;
    const intrinsicValue = calculateIntrinsicValue(option, underlyingPrice);
    const isITM = intrinsicValue > 0;
    const premium = Number(option.premium) || 0;

    let description = '';
    if (isITM) {
      const actionVerb = option.type === 'CALL' ? 'Куплено' : 'Продано';
      description = `ITM: ${actionVerb} по ${strike}, цена ${underlyingPrice.toFixed(2)}`;
    } else {
      description = `OTM: Опцион истёк, ${option.action === 'Buy' ? `потеря премии ${premium.toFixed(2)}` : `прибыль = премия ${premium.toFixed(2)}`}`;
    }

    details.push({
      label: `${option.action} ${option.type} ${strike}`,
      value: pl,
      description,
      type: 'option'
    });

    totalPL += pl;
  });

  // P&L от продажи акций (показываем разницу, но в totalPL учитываем полную сумму)
  positions.forEach(position => {
    const quantity = Number(position.quantity) || 0;
    const entryPrice = Number(position.price) || 0;
    
    let displayPL = 0; // Для отображения (разница)
    let actualPL = 0;   // Для totalPL (полная сумма продажи)
    let description = '';
    
    if (position.type === 'LONG') {
      displayPL = (underlyingPrice - entryPrice) * quantity;
      actualPL = underlyingPrice * quantity;
      description = `Продаём ${quantity} акций: ${entryPrice.toFixed(2)} → ${underlyingPrice.toFixed(2)}`;
    } else if (position.type === 'SHORT') {
      displayPL = (entryPrice - underlyingPrice) * quantity;
      actualPL = -underlyingPrice * quantity;
      description = `Выкупаем ${quantity} акций: ${entryPrice.toFixed(2)} → ${underlyingPrice.toFixed(2)}`;
    }
    
    details.push({
      label: `${position.type} ${quantity} акций - P&L`,
      value: displayPL,
      description,
      type: 'stock-pl'
    });
    
    totalPL += actualPL;
  });

  return { totalPL, details };
};

/**
 * Сценарий 2: Закрыть опционы, оставить акции
 * - Закрываем опционы по текущей цене (intrinsic + time value)
 * - P&L от изменения цены акций
 */
const calculateCloseOptionsScenario = ({ options, positions, underlyingPrice, daysToExpiration, currentPrice, volatility = 25 }) => {
  const details = [];
  let totalPL = 0;

  // Стоимость покупки акций учитывается в totalPL, но не отображается отдельной строкой
  positions.forEach(position => {
    const quantity = Number(position.quantity) || 0;
    const entryPrice = Number(position.price) || 0;
    const cost = -entryPrice * quantity;
    totalPL += cost;
  });

  // P&L от закрытия опционов
  options.forEach(option => {
    const premium = Number(option.premium) || 0;
    const currentValue = calculateOptionValueWithTimeDecay(
      option,
      underlyingPrice,
      currentPrice,
      daysToExpiration
    );
    const pl = calculateOptionPLValue(option, underlyingPrice, currentPrice, daysToExpiration);

    const description = option.action === 'Buy'
      ? `Премия: ${premium.toFixed(2)}, закрываем по ${currentValue.toFixed(2)}`
      : `Премия: ${premium.toFixed(2)}, выкупаем по ${currentValue.toFixed(2)}`;

    details.push({
      label: `${option.action} ${option.type} ${option.strike}`,
      value: pl,
      description,
      type: 'option'
    });

    totalPL += pl;
  });

  // P&L от продажи акций (показываем разницу, но в totalPL учитываем полную сумму)
  positions.forEach(position => {
    const quantity = Number(position.quantity) || 0;
    const entryPrice = Number(position.price) || 0;
    
    let displayPL = 0; // Для отображения (разница)
    let actualPL = 0;   // Для totalPL (полная сумма продажи)
    let description = '';
    
    if (position.type === 'LONG') {
      displayPL = (underlyingPrice - entryPrice) * quantity;
      actualPL = underlyingPrice * quantity;
      description = `Продаём ${quantity} акций: ${entryPrice.toFixed(2)} → ${underlyingPrice.toFixed(2)}`;
    } else if (position.type === 'SHORT') {
      displayPL = (entryPrice - underlyingPrice) * quantity;
      actualPL = -underlyingPrice * quantity;
      description = `Выкупаем ${quantity} акций: ${entryPrice.toFixed(2)} → ${underlyingPrice.toFixed(2)}`;
    }
    
    details.push({
      label: `${position.type} ${quantity} акций - P&L`,
      value: displayPL,
      description,
      type: 'stock-pl'
    });
    
    totalPL += actualPL;
  });

  return { totalPL, details };
};

/**
 * Сценарий 3: Закрыть всё
 * - Закрываем опционы по текущей цене (intrinsic + time value)
 * - Продаем акции по текущей цене
 */
const calculateCloseAllScenario = ({ options, positions, underlyingPrice, daysToExpiration, currentPrice, volatility = 25 }) => {
  const details = [];
  let totalPL = 0;

  // Стоимость покупки акций учитывается в totalPL, но не отображается отдельной строкой
  positions.forEach(position => {
    const quantity = Number(position.quantity) || 0;
    const entryPrice = Number(position.price) || 0;
    const cost = -entryPrice * quantity;
    totalPL += cost;
  });

  // P&L от закрытия опционов
  options.forEach(option => {
    const premium = Number(option.premium) || 0;
    const currentValue = calculateOptionValueWithTimeDecay(
      option,
      underlyingPrice,
      currentPrice,
      daysToExpiration
    );
    const pl = calculateOptionPLValue(option, underlyingPrice, currentPrice, daysToExpiration);

    const description = option.action === 'Buy'
      ? `Премия: ${premium.toFixed(2)}, закрываем по ${currentValue.toFixed(2)}`
      : `Премия: ${premium.toFixed(2)}, выкупаем по ${currentValue.toFixed(2)}`;

    details.push({
      label: `${option.action} ${option.type} ${option.strike}`,
      value: pl,
      description,
      type: 'option'
    });

    totalPL += pl;
  });

  // P&L от продажи акций (показываем разницу, но в totalPL учитываем полную сумму)
  positions.forEach(position => {
    const quantity = Number(position.quantity) || 0;
    const entryPrice = Number(position.price) || 0;
    
    let displayPL = 0; // Для отображения (разница)
    let actualPL = 0;   // Для totalPL (полная сумма продажи)
    let description = '';
    
    if (position.type === 'LONG') {
      displayPL = (underlyingPrice - entryPrice) * quantity;
      actualPL = underlyingPrice * quantity;
      description = `Продаём ${quantity} акций: ${entryPrice.toFixed(2)} → ${underlyingPrice.toFixed(2)}`;
    } else if (position.type === 'SHORT') {
      displayPL = (entryPrice - underlyingPrice) * quantity;
      actualPL = -underlyingPrice * quantity;
      description = `Выкупаем ${quantity} акций: ${entryPrice.toFixed(2)} → ${underlyingPrice.toFixed(2)}`;
    }
    
    details.push({
      label: `${position.type} ${quantity} акций - P&L`,
      value: displayPL,
      description,
      type: 'stock-pl'
    });
    
    totalPL += actualPL;
  });

  return { totalPL, details };
};

/**
 * Форматирование валюты
 */
const formatCurrency = (value) => {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '+';
  
  if (absValue >= 1000000) {
    return `${sign}$${(absValue / 1000000).toFixed(2)}M`;
  } else if (absValue >= 1000) {
    return `${sign}$${(absValue / 1000).toFixed(2)}K`;
  } else {
    return `${sign}$${absValue.toFixed(2)}`;
  }
};
