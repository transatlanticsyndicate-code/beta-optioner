import { useMemo } from 'react';
import {
  calculateIntrinsicValue,
  calculateOptionPLValue,
  calculateOptionTheoreticalPrice,
  calculateOptionExpirationPLValue,
} from '../utils/optionPricing';
import { getOptionVolatility } from '../utils/volatilitySurface';
import { assessLiquidity, LIQUIDITY_LEVELS } from '../utils/liquidityCheck';
import { calculateDaysRemainingUTC } from '../utils/dateUtils';

/**
 * Форматирует дату экспирации опциона в формат DD.MM.YY
 * ЗАЧЕМ: Для отображения даты в label опциона в блоках сценариев
 */
const formatOptionDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}.${month}.${year}`;
  } catch {
    return '';
  }
};

/**
 * Вычисляет количество дней до экспирации для конкретного опциона
 * ЗАЧЕМ: Каждый опцион имеет свою дату экспирации
 * 
 * IMPORTANT: Используем UTC для консистентности между часовыми поясами
 * actualDaysRemaining = max(0, initialDaysToExpiration - daysPassed)
 * 
 * @param {Object} option - опцион с полем date
 * @param {number} daysPassed - прошедшие дни от сегодня
 * @returns {number} - оставшиеся дни до экспирации для этого опциона
 */
const calculateDaysToExpirationForOption = (option, daysPassed) => {
  // Используем UTC-функцию для единообразного расчёта во всех часовых поясах
  return calculateDaysRemainingUTC(option, daysPassed, 30);
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
  // Если премия изменена вручную, используем её
  if (option.isPremiumModified && option.customPremium !== undefined) {
    return parseFloat(option.customPremium) || 0;
  }
  
  const isBuy = (option.action || 'Buy').toLowerCase() === 'buy';
  
  if (isBuy) {
    // Покупка: входим по ASK (цена продавца)
    const ask = parseFloat(option.ask);
    if (ask > 0) return ask;
  } else {
    // Продажа: входим по BID (цена покупателя)
    const bid = parseFloat(option.bid);
    if (bid > 0) return bid;
  }
  
  // Fallback на premium если bid/ask недоступны
  return parseFloat(option.premium) || 0;
};


/**
 * Хук для расчета P&L при выходе из позиции
 * 
 * IMPORTANT: Используем daysPassed (прошедшие дни) вместо daysToExpiration
 * 
 * @param {Object} params
 * @param {number} params.underlyingPrice - Цена базового актива для расчета
 * @param {number} params.daysPassed - Прошедшие дни от сегодня
 * @param {Array} params.options - Массив опционов
 * @param {Array} params.positions - Массив позиций базового актива
 * @param {number} params.currentPrice - Текущая цена базового актива
 * @param {Object} params.ivSurface - IV Surface для точной интерполяции волатильности
 * 
 * @returns {Object} - Объект с расчетами для трех сценариев
 */
export const usePositionExitCalculator = ({
  underlyingPrice,
  daysPassed = 0,
  options = [],
  positions = [],
  currentPrice = 0,
  ivSurface = null,
  dividendYield = 0
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
      daysPassed,
      currentPrice,
      ivSurface,
      dividendYield
    });

    // Сценарий 2: Закрыть опционы, оставить акции (Close options only)
    const closeOptionsCalculation = calculateCloseOptionsScenario({
      options: visibleOptions,
      positions: visiblePositions,
      underlyingPrice,
      daysPassed,
      currentPrice,
      ivSurface,
      dividendYield
    });

    // Сценарий 3: Закрыть всё (Close everything)
    const closeAllCalculation = calculateCloseAllScenario({
      options: visibleOptions,
      positions: visiblePositions,
      underlyingPrice,
      daysPassed,
      currentPrice,
      ivSurface,
      dividendYield
    });

    // Проверяем ликвидность всех опционов
    // ЗАЧЕМ: Предупреждаем пользователя о рисках торговли неликвидными опционами
    const liquidityWarnings = visibleOptions
      .map(option => {
        const assessment = assessLiquidity(option);
        if (assessment.level === LIQUIDITY_LEVELS.LOW || assessment.level === LIQUIDITY_LEVELS.VERY_LOW) {
          return {
            option: `${option.action} ${option.type} ${option.strike}`,
            level: assessment.level,
            warnings: assessment.warnings,
            score: assessment.score
          };
        }
        return null;
      })
      .filter(Boolean);

    return {
      plExercise: exerciseCalculation.totalPL,
      plCloseOptions: closeOptionsCalculation.totalPL,
      plCloseAll: closeAllCalculation.totalPL,
      details: {
        exercise: exerciseCalculation.details,
        closeOptions: closeOptionsCalculation.details,
        closeAll: closeAllCalculation.details
      },
      liquidityWarnings // Предупреждения о низкой ликвидности
    };
  }, [underlyingPrice, daysPassed, options, positions, currentPrice, ivSurface, dividendYield]);
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

  // Стоимость входа в позицию учитывается в totalPL, но не отображается отдельной строкой
  // LONG: покупаем акции (тратим деньги) = -entryPrice * quantity
  // SHORT: продаём акции (получаем деньги) = +entryPrice * quantity
  positions.forEach(position => {
    const quantity = Number(position.quantity) || 0;
    const entryPrice = Number(position.price) || 0;
    const cost = position.type === 'LONG' 
      ? -entryPrice * quantity  // LONG: тратим на покупку
      : +entryPrice * quantity; // SHORT: получаем от продажи
    totalPL += cost;
  });

  // P&L от исполнения опционов (только ITM опционы исполняются)
  options.forEach(option => {
    // ВАЖНО: При ручной премии обнуляем ask/bid, чтобы getEntryPrice() использовал premium
    const tempOption = { 
      ...option, 
      premium: option.isPremiumModified ? option.customPremium : option.premium,
      ask: option.isPremiumModified ? 0 : option.ask,
      bid: option.isPremiumModified ? 0 : option.bid
    };
    const pl = calculateOptionExpirationPLValue(tempOption, underlyingPrice);
    const strike = Number(option.strike) || 0;
    const intrinsicValue = calculateIntrinsicValue(option, underlyingPrice);
    const isITM = intrinsicValue > 0;
    // Цена входа: ASK для Buy, BID для Sell
    const entryPrice = getEntryPrice(option);

    let description = '';
    if (isITM) {
      const actionVerb = option.type === 'CALL' ? 'Куплено' : 'Продано';
      description = `ITM: ${actionVerb} по ${strike}, цена ${underlyingPrice.toFixed(2)}`;
    } else {
      // Определяем тип цены входа: ASK для Buy, BID для Sell
      const priceType = option.action === 'Buy' ? 'ASK' : 'BID';
      description = `OTM: Опцион истёк, ${option.action === 'Buy' ? `потеря по ${priceType} ${entryPrice.toFixed(2)}` : `прибыль по ${priceType} ${entryPrice.toFixed(2)}`}`;
    }

    // Формируем label с датой экспирации
    const dateLabel = option.date ? ` (${formatOptionDate(option.date)})` : '';
    
    details.push({
      label: `${option.action} ${option.type} ${strike}${dateLabel}`,
      value: pl,
      description,
      type: 'option',
      bestExitDay: option.bestExitDay || null // Индивидуальный лучший день выхода для этого опциона
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
const calculateCloseOptionsScenario = ({ options, positions, underlyingPrice, daysPassed, currentPrice, ivSurface = null, dividendYield = 0 }) => {
  const details = [];
  let totalPL = 0;

  // Стоимость входа в позицию учитывается в totalPL, но не отображается отдельной строкой
  // LONG: покупаем акции (тратим деньги) = -entryPrice * quantity
  // SHORT: продаём акции (получаем деньги) = +entryPrice * quantity
  positions.forEach(position => {
    const quantity = Number(position.quantity) || 0;
    const entryPrice = Number(position.price) || 0;
    const cost = position.type === 'LONG' 
      ? -entryPrice * quantity  // LONG: тратим на покупку
      : +entryPrice * quantity; // SHORT: получаем от продажи
    totalPL += cost;
  });

  // P&L от закрытия опционов (Сценарий 2: Закрыть опционы)
  // ВАЖНО: Каждый опцион имеет свою дату экспирации и IV из API
  options.forEach(option => {
    // ВАЖНО: При ручной премии обнуляем ask/bid, чтобы getEntryPrice() использовал premium
    const tempOption = { 
      ...option, 
      premium: option.isPremiumModified ? option.customPremium : option.premium,
      ask: option.isPremiumModified ? 0 : option.ask,
      bid: option.isPremiumModified ? 0 : option.bid
    };
    // Цена входа: ASK для Buy, BID для Sell
    const entryPrice = getEntryPrice(option);
    
    // Вычисляем индивидуальные параметры для этого опциона
    // currentDays - дни до экспирации на сегодня (без симуляции)
    // simulatedDays - дни до экспирации с учётом симуляции (daysPassed)
    const currentDaysToExpiration = calculateDaysToExpirationForOption(option, 0);
    const simulatedDaysToExpiration = calculateDaysToExpirationForOption(option, daysPassed);
    
    // Получаем прогнозируемую IV с учётом временной структуры (Volatility Surface)
    // ВАЖНО: ivSurface используется для точной интерполяции IV между датами экспирации
    const optionVolatility = getOptionVolatility(
      option, 
      currentDaysToExpiration, 
      simulatedDaysToExpiration,
      ivSurface
    );
    
    const currentValue = calculateOptionTheoreticalPrice(
      tempOption,
      underlyingPrice,
      simulatedDaysToExpiration,
      optionVolatility,
      dividendYield
    );
    const pl = calculateOptionPLValue(tempOption, underlyingPrice, currentPrice, simulatedDaysToExpiration, optionVolatility, dividendYield);

    // Добавляем IV в описание для прозрачности расчётов
    // Показываем текущую IV и прогнозируемую если они отличаются
    const currentIV = (option.impliedVolatility || option.implied_volatility || 0);
    const currentIVPercent = currentIV < 1 ? currentIV * 100 : currentIV;
    const ivDisplay = optionVolatility.toFixed(1);
    // Показываем первоначальную IV в скобках если прошло время (daysPassed > 0)
    // ЗАЧЕМ: Пользователь должен видеть как изменилась IV даже при небольших изменениях
    const showOriginalIV = daysPassed > 0 && currentIVPercent > 0;
    
    // Определяем тип цены входа: ASK для Buy, BID для Sell
    const priceType = option.action === 'Buy' ? 'ASK' : 'BID';
    // ЗАЧЕМ: Выносим IV на новую строку чтобы текст не прыгал при изменении значений
    const ivLine = `\nIV: ${ivDisplay}%${showOriginalIV ? ` (было ${currentIVPercent.toFixed(1)}%)` : ''}`;
    const description = option.action === 'Buy'
      ? `Вход по ${priceType}: ${entryPrice.toFixed(2)}, закрываем по ${currentValue.toFixed(2)}${ivLine}`
      : `Вход по ${priceType}: ${entryPrice.toFixed(2)}, выкупаем по ${currentValue.toFixed(2)}${ivLine}`;

    // Формируем label с датой экспирации (Сценарий 2)
    const dateLabel2 = option.date ? ` (${formatOptionDate(option.date)})` : '';

    // Логируем bestExitDay для отладки
    if (option.bestExitDay) {
      console.log('📅 usePositionExitCalculator: опцион с bestExitDay =', option.bestExitDay, option.action, option.type, option.strike);
    }
    
    details.push({
      label: `${option.action} ${option.type} ${option.strike}${dateLabel2}`,
      value: pl,
      description,
      type: 'option',
      bestExitDay: option.bestExitDay || null // Индивидуальный лучший день выхода для этого опциона
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
const calculateCloseAllScenario = ({ options, positions, underlyingPrice, daysPassed, currentPrice, ivSurface = null, dividendYield = 0 }) => {
  const details = [];
  let totalPL = 0;

  // Стоимость входа в позицию учитывается в totalPL, но не отображается отдельной строкой
  // LONG: покупаем акции (тратим деньги) = -entryPrice * quantity
  // SHORT: продаём акции (получаем деньги) = +entryPrice * quantity
  positions.forEach(position => {
    const quantity = Number(position.quantity) || 0;
    const entryPrice = Number(position.price) || 0;
    const cost = position.type === 'LONG' 
      ? -entryPrice * quantity  // LONG: тратим на покупку
      : +entryPrice * quantity; // SHORT: получаем от продажи
    totalPL += cost;
  });

  // P&L от закрытия опционов (Сценарий 3: Закрыть всё)
  // ВАЖНО: Каждый опцион имеет свою дату экспирации и IV из API
  options.forEach(option => {
    // ВАЖНО: При ручной премии обнуляем ask/bid, чтобы getEntryPrice() использовал premium
    const tempOption = { 
      ...option, 
      premium: option.isPremiumModified ? option.customPremium : option.premium,
      ask: option.isPremiumModified ? 0 : option.ask,
      bid: option.isPremiumModified ? 0 : option.bid
    };
    // Цена входа: ASK для Buy, BID для Sell
    const entryPrice = getEntryPrice(option);
    
    // Вычисляем индивидуальные параметры для этого опциона
    // currentDays - дни до экспирации на сегодня (без симуляции)
    // simulatedDays - дни до экспирации с учётом симуляции (daysPassed)
    const currentDaysToExpiration = calculateDaysToExpirationForOption(option, 0);
    const simulatedDaysToExpiration = calculateDaysToExpirationForOption(option, daysPassed);
    
    // Получаем прогнозируемую IV с учётом временной структуры (Volatility Surface)
    // ВАЖНО: ivSurface используется для точной интерполяции IV между датами экспирации
    const optionVolatility = getOptionVolatility(
      option, 
      currentDaysToExpiration, 
      simulatedDaysToExpiration,
      ivSurface
    );
    
    const currentValue = calculateOptionTheoreticalPrice(
      tempOption,
      underlyingPrice,
      simulatedDaysToExpiration,
      optionVolatility,
      dividendYield
    );
    const pl = calculateOptionPLValue(tempOption, underlyingPrice, currentPrice, simulatedDaysToExpiration, optionVolatility, dividendYield);

    // Добавляем IV в описание для прозрачности расчётов
    // Показываем текущую IV и прогнозируемую если они отличаются
    const currentIV = (option.impliedVolatility || option.implied_volatility || 0);
    const currentIVPercent = currentIV < 1 ? currentIV * 100 : currentIV;
    const ivDisplay = optionVolatility.toFixed(1);
    // Показываем первоначальную IV в скобках если прошло время (daysPassed > 0)
    // ЗАЧЕМ: Пользователь должен видеть как изменилась IV даже при небольших изменениях
    const showOriginalIV = daysPassed > 0 && currentIVPercent > 0;
    
    // К = P&L / (Цена входа * 100) - показывает отношение P&L к стоимости контракта
    const entryCost = entryPrice * 100; // Стоимость контракта (цена входа * 100 акций)
    const kCoeffValue = entryCost !== 0 ? pl / entryCost : 0;
    // Определяем тип цены входа: ASK для Buy, BID для Sell
    const priceType = option.action === 'Buy' ? 'ASK' : 'BID';
    // ЗАЧЕМ: Выносим IV на новую строку чтобы текст не прыгал при изменении значений
    const ivLine = `\nIV: ${ivDisplay}%${showOriginalIV ? ` (было ${currentIVPercent.toFixed(1)}%)` : ''}`;
    const description = option.action === 'Buy'
      ? `Вход по ${priceType}: ${entryPrice.toFixed(2)}, закрываем по ${currentValue.toFixed(2)}${ivLine}`
      : `Вход по ${priceType}: ${entryPrice.toFixed(2)}, выкупаем по ${currentValue.toFixed(2)}${ivLine}`;

    // Формируем label с датой экспирации (Сценарий 3)
    const dateLabel3 = option.date ? ` (${formatOptionDate(option.date)})` : '';

    details.push({
      label: `${option.action} ${option.type} ${option.strike}${dateLabel3}`,
      value: pl,
      description,
      type: 'option',
      kCoeff: kCoeffValue, // Коэффициент К для отдельной колонки
      bestExitDay: option.bestExitDay || null // Индивидуальный лучший день выхода для этого опциона
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
