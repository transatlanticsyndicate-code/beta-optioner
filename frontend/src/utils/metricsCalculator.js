/**
 * Утилиты для расчета метрик опционной стратегии
 * Согласно ТЗ: TZ_METRICS_BLOCK.md
 * 
 * ОБНОВЛЕНО: Использует единую модель Black-Scholes из optionPricing.js
 */

import { calculatePLDataForMetrics } from '../components/CalculatorV2/PLChart';
import { 
  calculateOptionPLValue, 
  calculateIntrinsicValue,
  PRICING_CONSTANTS 
} from './optionPricing';

/**
 * Получение цены входа в позицию
 * ЗАЧЕМ: Для Buy используем ASK, для Sell используем BID (биржевая логика)
 * Fallback на premium если bid/ask недоступны
 * 
 * @param {object} option - объект опциона
 * @returns {number} - цена входа
 */
function getEntryPrice(option = {}) {
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
}

/**
 * Рассчитывает общую премию (сумму всех премий с учетом Buy/Sell)
 * ЗАЧЕМ: Для Buy используем ASK, для Sell используем BID
 * @param {Array} options - массив опционов
 * @param {number} contractMultiplier - множитель контракта (100 для акций, pointValue для фьючерсов)
 * @returns {number} - общая премия (отрицательная = дебет, положительная = кредит)
 */
export function calculateTotalPremium(options, contractMultiplier = 100) {
  if (!options || options.length === 0) return 0;

  return options
    .filter(opt => opt.visible !== false)
    .reduce((total, option) => {
      // Цена входа: ASK для Buy, BID для Sell
      const entryPrice = getEntryPrice(option);
      const quantity = Math.abs(parseInt(option.quantity) || 0);
      const multiplier = option.action === 'Sell' ? 1 : -1;
      
      return total + (entryPrice * quantity * multiplier * contractMultiplier);
    }, 0);
}

/**
 * Проверяет, покрыт ли проданный опцион позицией базового актива
 * @param {Object} option - опцион
 * @param {Array} positions - массив позиций базового актива
 * @param {number} currentPrice - текущая цена актива
 * @param {number} optionQuantity - количество контрактов опциона
 * @param {number} contractMultiplier - множитель контракта (100 для акций, pointValue для фьючерсов)
 * @returns {boolean} - true если опцион покрыт
 */
function checkIfCovered(option, positions, currentPrice, optionQuantity, contractMultiplier = 100) {
  if (!positions || positions.length === 0) return false;

  // Опцион должен быть продан (Sell)
  if (option.action !== 'Sell') return false;

  // Рассчитываем количество акций/единиц, необходимое для покрытия
  const sharesNeeded = optionQuantity * contractMultiplier;

  let totalSharesAvailable = 0;

  positions.forEach(position => {
    if (!position.type || !position.quantity) return;

    const positionQuantity = Math.abs(parseFloat(position.quantity) || 0);

    if (option.type === 'CALL') {
      // Covered Call: нужна длинная позиция (LONG) в базовом активе
      if (position.type === 'LONG') {
        totalSharesAvailable += positionQuantity;
      }
    } else if (option.type === 'PUT') {
      // Covered Put: нужна короткая позиция (SHORT) в базовом активе
      // ИЛИ достаточное количество наличных (cash-secured put)
      if (position.type === 'SHORT') {
        totalSharesAvailable += positionQuantity;
      } else if (position.type === 'CASH') {
        // Cash-secured put: наличные должны покрывать страйк × количество
        const cashValue = parseFloat(position.quantity) || 0;
        const requiredCash = option.strike * sharesNeeded;
        if (cashValue >= requiredCash) {
          totalSharesAvailable += sharesNeeded; // Эквивалент акций
        }
      }
    }
  });

  return totalSharesAvailable >= sharesNeeded;
}
export function calculateRequiredCapital(options, currentPrice = 245.27, positions = [], contractMultiplier = 100) {
  if (!options || options.length === 0) return 0;

  const visibleOptions = options.filter(opt => opt.visible !== false);
  const visiblePositions = positions.filter(pos => pos.visible !== false);

  if (visibleOptions.length === 0) return 0;

  const premium = calculateTotalPremium(options, contractMultiplier);
  let marginRequirement = 0;

  visibleOptions.forEach(option => {
    // Используем getEntryPrice для получения цены входа (ASK/BID)
    const optionEntryPrice = getEntryPrice(option);
    if (!option.strike || optionEntryPrice <= 0) return;

    const quantity = Math.abs(option.quantity || 1);
    const strike = option.strike;
    const optionPremium = optionEntryPrice;

    if (option.action === 'Sell') {
      // Проверяем покрытие позиции базовым активом
      const isCovered = checkIfCovered(option, visiblePositions, currentPrice, quantity, contractMultiplier);

      if (isCovered) {
        // Для покрытых позиций маржа значительно ниже
        if (option.type === 'CALL') {
          // Covered Call: максимум между премией и 10% от прибыли
          const maxProfit = Math.max(0, strike - currentPrice);
          marginRequirement += Math.min(optionPremium, maxProfit) * quantity * contractMultiplier;
        } else if (option.type === 'PUT') {
          // Covered Put: максимум между премией и 10% от прибыли
          const maxProfit = Math.max(0, currentPrice - strike);
          marginRequirement += Math.min(optionPremium, maxProfit) * quantity * contractMultiplier;
        }
      } else {
        // Непокрытые (naked) опционы - стандартная маржа Reg T
        if (option.type === 'CALL') {
          const otmAmount = Math.max(0, strike - currentPrice);
          const callMargin = (0.20 * currentPrice + optionPremium - otmAmount) * quantity * contractMultiplier;
          marginRequirement += Math.max(callMargin, (0.10 * currentPrice + optionPremium) * quantity * contractMultiplier);
        } else if (option.type === 'PUT') {
          const otmAmount = Math.max(0, currentPrice - strike);
          const putMargin = (0.20 * currentPrice + optionPremium - otmAmount) * quantity * contractMultiplier;
          marginRequirement += Math.max(putMargin, (0.10 * strike + optionPremium) * quantity * contractMultiplier);
        }
      }
    }
  });

  // Учитываем спреды (они могут снижать маржу независимо от покрытия)
  const spreads = detectSpreads(visibleOptions);
  if (spreads.length > 0) {
    marginRequirement = Math.min(marginRequirement, calculateSpreadMargin(spreads, currentPrice, contractMultiplier));
  }

  const debitAmount = premium < 0 ? Math.abs(premium) : 0;
  return debitAmount + marginRequirement;
}

/**
 * Определяет спреды в позиции
 * @param {Array} options - массив опционов
 * @returns {Array} - массив найденных спредов
 */
function detectSpreads(options) {
  const spreads = [];
  
  const groups = {};
  options.forEach(option => {
    const key = `${option.type}_${option.date}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(option);
  });

  Object.values(groups).forEach(group => {
    if (group.length >= 2) {
      group.sort((a, b) => a.strike - b.strike);
      
      for (let i = 0; i < group.length - 1; i++) {
        const lower = group[i];
        const upper = group[i + 1];
        
        if ((lower.action === 'Buy' && upper.action === 'Sell') ||
            (lower.action === 'Sell' && upper.action === 'Buy')) {
          spreads.push({
            type: lower.type === 'CALL' ? 'vertical_call' : 'vertical_put',
            lower: lower,
            upper: upper,
            width: upper.strike - lower.strike
          });
        }
      }
    }
  });

  return spreads;
}

/**
 * Рассчитывает маржу для спредов
 * @param {Array} spreads - массив спредов
 * @param {number} currentPrice - текущая цена актива
 * @param {number} contractMultiplier - множитель контракта (100 для акций, pointValue для фьючерсов)
 * @returns {number} - маржинальные требования для спредов
 */
function calculateSpreadMargin(spreads, currentPrice, contractMultiplier = 100) {
  let totalMargin = 0;

  spreads.forEach(spread => {
    const width = spread.width;
    const quantity = Math.abs(spread.lower.quantity || 1);

    if (spread.type === 'vertical_call') {
      // Используем getEntryPrice для ASK/BID вместо premium
      const netCredit = getEntryPrice(spread.upper) - getEntryPrice(spread.lower);
      const spreadMargin = Math.max(0, (width - netCredit) * quantity * contractMultiplier);
      totalMargin += spreadMargin;
    } else if (spread.type === 'vertical_put') {
      // Используем getEntryPrice для ASK/BID вместо premium
      const netCredit = getEntryPrice(spread.lower) - getEntryPrice(spread.upper);
      const spreadMargin = Math.max(0, (width - netCredit) * quantity * contractMultiplier);
      totalMargin += spreadMargin;
    }
  });

  return totalMargin;
}

/**
 * Проверяет, имеет ли стратегия неограниченный потенциал убытка
 * @param {Array} options - массив видимых опционов
 * @param {Array} positions - массив позиций базового актива
 * @returns {boolean} - true если потенциал убытка неограничен
 */
function hasUnlimitedLoss(options, positions = []) {
  // TODO: Разработать логику определения неограниченного убытка
  return false;
}

/**
 * Проверяет, имеет ли стратегия неограниченный потенциал прибыли
 * @param {Array} options - массив видимых опционов
 * @param {Array} positions - массив позиций базового актива
 * @returns {boolean} - true если потенциал прибыли неограничен
 */
function hasUnlimitedProfit(options, positions = []) {
  // TODO: Разработать логику определения неограниченной прибыли
  return false;
}

/**
 * Рассчитывает P&L для позиции базового актива (используется в графике и метриках)
 * @param {number} price - текущая цена актива
 * @param {Object} position - позиция базового актива
 * @returns {number} - P&L позиции
 */
export function calculateUnderlyingPLForMetrics(price, position) {
  if (!position || !position.type) return 0;
  
  const { type, quantity, price: entryPrice } = position;
  const qty = parseFloat(quantity) || 0;
  const entry = parseFloat(entryPrice) || 0;
  
  if (type === 'LONG') {
    return (price - entry) * qty;
  } else if (type === 'SHORT') {
    return (entry - price) * qty;
  }
  return 0;
}

/**
 * Рассчитывает P&L метрики стратегии (MAX убыток, MAX прибыль, Break-even, Risk/Reward)
 * Использует данные из графика P&L для абсолютной точности
 * 
 * IMPORTANT: Используем daysPassed (прошедшие дни) вместо daysRemaining
 * 
 * @param {Array} options - массив опционов
 * @param {number} currentPrice - текущая цена актива
 * @param {Array} positions - массив позиций базового актива
 * @param {number} daysPassed - прошедшие дни от сегодня
 * @param {Object} ivSurface - IV Surface для интерполяции (опционально)
 * @returns {Object} - объект с метриками { maxLoss, maxProfit, breakevens, riskReward }
 */
export function calculatePLMetrics(options, currentPrice, positions = [], daysPassed = 0, ivSurface = null, dividendYield = 0, isAIEnabled = false, aiVolatilityMap = {}, targetPrice = 0, selectedTicker = '', calculatorMode = 'stocks', contractMultiplier = 100) {
  if (!options || !currentPrice) {
    return {
      maxLoss: 0,
      maxProfit: 0,
      breakevens: [],
      riskReward: '—'
    };
  }

  const visibleOptions = options.filter(opt => opt.visible !== false);
  const visiblePositions = positions.filter(pos => pos.visible !== false);
  
  if (visibleOptions.length === 0 && visiblePositions.length === 0) {
    return {
      maxLoss: 0,
      maxProfit: 0,
      breakevens: [],
      riskReward: '—'
    };
  }

  // Используем функцию расчета P&L данных из графика
  // Это гарантирует, что метрики используют ту же логику, что и график
  // ivSurface передаётся для точной интерполяции IV между датами экспирации
  // dividendYield передаётся для модели BSM
  // isAIEnabled и aiVolatilityMap передаются для использования AI волатильности
  const { prices, totalPLArray } = calculatePLDataForMetrics(options, currentPrice, positions, daysPassed, ivSurface, dividendYield, isAIEnabled, aiVolatilityMap, targetPrice, selectedTicker, calculatorMode, contractMultiplier, 'simple');
  
  if (prices.length === 0 || totalPLArray.length === 0) {
    return {
      maxLoss: 0,
      maxProfit: 0,
      breakevens: [],
      riskReward: '—'
    };
  }

  // Определяем MAX прибыль и MAX убыток
  const maxProfit = Math.max(...totalPLArray);
  const maxLoss = Math.min(...totalPLArray);

  // Рассчитываем Break-even точки (где P&L пересекает 0)
  const breakevens = [];
  for (let i = 1; i < totalPLArray.length; i++) {
    const prev = totalPLArray[i - 1];
    const curr = totalPLArray[i];
    
    // Пересечение нуля
    if ((prev < 0 && curr > 0) || (prev > 0 && curr < 0)) {
      // Уточняем точку линейной интерполяцией
      const ratio = Math.abs(prev) / (Math.abs(prev) + Math.abs(curr));
      const breakeven = prices[i - 1] + (prices[i] - prices[i - 1]) * ratio;
      breakevens.push(breakeven);
    }
  }

  // Удаляем дубликаты
  const uniqueBreakevens = [];
  breakevens.forEach(be => {
    if (!uniqueBreakevens.some(ube => Math.abs(ube - be) < 0.1)) {
      uniqueBreakevens.push(be);
    }
  });

  // Рассчитываем Risk/Reward
  let riskReward = '—';
  if (maxLoss < 0 && maxProfit > 0) {
    const ratio = maxProfit / Math.abs(maxLoss);
    riskReward = `1:${ratio.toFixed(2)}`;
  } else if (maxProfit === 0 && maxLoss === 0) {
    riskReward = '—';
  } else if (maxProfit > 0 && maxLoss >= 0) {
    riskReward = '∞';
  } else if (maxProfit <= 0 && maxLoss < 0) {
    riskReward = '∞';
  }

  return {
    maxLoss,
    maxProfit,
    breakevens: uniqueBreakevens.sort((a, b) => a - b),
    riskReward
  };
}


/**
 * Рассчитывает P&L одного опциона при заданной цене актива
 * ОБНОВЛЕНО: Использует Black-Scholes для расчёта на экспирации (daysRemaining = 0)
 * 
 * @param {Object} option - опцион
 * @param {number} price - цена актива
 * @param {number} daysRemaining - дней до экспирации (по умолчанию 0 = на экспирации)
 * @returns {number} - P&L опциона
 */
export function calculateOptionPL(option, price, daysRemaining = 0) {
  // Используем единую функцию из optionPricing.js (Black-Scholes)
  return calculateOptionPLValue(option, price, price, daysRemaining);
}

/**
 * Находит точки безубыточности в данных P&L
 * @param {Array} plData - массив объектов { price, pl }
 * @param {number} tolerance - допустимая погрешность для определения break-even
 * @returns {Array} - массив цен break-even
 */
export function findBreakevens(plData, tolerance = 10) {
  const breakevens = [];
  
  for (let i = 1; i < plData.length; i++) {
    const prev = plData[i - 1];
    const curr = plData[i];
    
    if (prev.pl * curr.pl < 0) {
      const ratio = Math.abs(prev.pl) / (Math.abs(prev.pl) + Math.abs(curr.pl));
      const breakeven = prev.price + (curr.price - prev.price) * ratio;
      breakevens.push(breakeven);
    }
  }
  
  const uniqueBreakevens = [];
  breakevens.forEach(be => {
    const rounded = Math.round(be * 100) / 100;
    if (!uniqueBreakevens.some(existing => Math.abs(existing - rounded) < 1)) {
      uniqueBreakevens.push(rounded);
    }
  });
  
  return uniqueBreakevens.sort((a, b) => a - b);
}

/**
 * Рассчитывает дни до экспирации ближайшего опциона
 * @param {Array} options - массив опционов
 * @returns {number} - дней до экспирации
 */
export function calculateDaysToExpiration(options) {
  if (!options || options.length === 0) return 0;

  const visibleOptions = options.filter(opt => opt.visible !== false);
  if (visibleOptions.length === 0) return 0;

  const dates = visibleOptions.map(opt => {
    const dateStr = opt.date || opt.expiration_date;
    if (!dateStr) return null;

    let date;
    if (dateStr.includes('.')) {
      const [day, month, year] = dateStr.split('.');
      const fullYear = year.length === 2 ? `20${year}` : year;
      date = new Date(`${fullYear}-${month}-${day}`);
    } else {
      date = new Date(dateStr);
    }

    return date.getTime();
  }).filter(d => d !== null);

  if (dates.length === 0) return 0;

  const nearestDate = Math.min(...dates);
  const today = new Date().setHours(0, 0, 0, 0);
  const diffTime = nearestDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays);
}

/**
 * Рассчитывает суммарные Greeks для портфеля
 * @param {Array} options - массив опционов с Greeks
 * @returns {Object} - {delta, gamma, theta, vega}
 */
export function calculateTotalGreeks(options) {
  if (!options || options.length === 0) {
    return { delta: 0, gamma: 0, theta: 0, vega: 0 };
  }

  return options
    .filter(opt => opt.visible !== false)
    .reduce((total, option) => {
      const quantity = parseInt(option.quantity) || 0;
      const multiplier = option.action === 'Buy' ? 1 : -1;

      return {
        delta: total.delta + ((option.delta || 0) * quantity * multiplier),
        gamma: total.gamma + ((option.gamma || 0) * quantity * multiplier),
        theta: total.theta + ((option.theta || 0) * quantity * multiplier),
        vega: total.vega + ((option.vega || 0) * quantity * multiplier)
      };
    }, { delta: 0, gamma: 0, theta: 0, vega: 0 });
}

/**
 * Форматирует число в валюту
 * @param {number} value - значение
 * @param {boolean} showSign - показывать знак +/-
 * @returns {string} - отформатированная строка
 */
export function formatCurrency(value, showSign = false) {
  if (value === null || value === undefined || isNaN(value)) return '$0';
  
  if (!isFinite(value)) {
    return value < 0 ? '-∞' : '∞';
  }
  
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : (showSign && value > 0 ? '+' : '');
  
  if (absValue >= 1000000) {
    return `${sign}$${(absValue / 1000000).toFixed(2)}M`;
  } else if (absValue >= 1000) {
    return `${sign}$${(absValue / 1000).toFixed(2)}K`;
  } else {
    return `${sign}$${absValue.toFixed(2)}`;
  }
}

/**
 * Форматирует Greek значение
 * @param {number} value - значение греков (уже в правильном формате из API/расширения)
 * @param {number} decimals - количество знаков после запятой
 * @returns {string} - отформатированная строка
 */
export function formatGreek(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) return '0';
  
  // ИСПРАВЛЕНО: Не умножаем на 100, т.к. греки из расширения уже в правильном формате
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}`;
}

/**
 * Определяет цвет для значения
 * @param {number} value - значение
 * @param {boolean} inverse - инвертировать цвета (для Theta)
 * @returns {string} - цвет: 'red', 'green', 'gray'
 */
export function getValueColor(value, inverse = false) {
  if (value === null || value === undefined || isNaN(value)) return 'gray';
  
  if (value === 0) return 'gray';
  
  if (inverse) {
    return value > 0 ? 'red' : 'green';
  } else {
    return value > 0 ? 'green' : 'red';
  }
}
