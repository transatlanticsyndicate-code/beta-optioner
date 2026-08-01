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
  adjustPLByStockGroup,
  PRICING_CONSTANTS
} from './optionPricing';
import { calculateFuturesOptionPLValue, calculateFuturesGreeks } from './futuresPricing';
import {
  getOldestEntryDate,
  isOptionActiveAtDay,
  calculateDaysRemainingPreciseET,
  calculateDaysToExpirationFromTodayPreciseET,
} from './dateUtils';
import { getOptionVolatility } from './volatilitySurface';
import { CALCULATOR_MODES } from './universalPricing';
import { calculateGreeks as calculateBSMGreeks } from './blackScholes';
import { getRiskFreeRateSync } from '../hooks/useRiskFreeRate';
import { getCryptoBasisRate } from './cryptoRateSettings';

/**
 * Получение цены входа в позицию
 * ЗАЧЕМ: Для Buy используем ASK, для Sell используем BID (биржевая логика)
 * Fallback на premium если bid/ask недоступны
 * 
 * @param {object} option - объект опциона
 * @returns {number} - цена входа
 */
function getEntryPrice(option = {}) {
  // Если премия изменена вручную, используем её (наивысший приоритет)
  if (option.isPremiumModified && option.customPremium !== undefined) {
    return parseFloat(option.customPremium) || 0;
  }

  const isBuy = (option.action || 'Buy').toLowerCase() === 'buy';

  if (isBuy) {
    // Покупка: входим по ASK (цена продавца)
    // Учитываем ручную правку цен Bid/Ask
    const ask = option.isAskModified && option.customAsk !== undefined ? parseFloat(option.customAsk) : parseFloat(option.ask);
    if (!isNaN(ask) && ask > 0) return ask;
  } else {
    // Продажа: входим по BID (цена покупателя)
    // Учитываем ручную правку цен Bid/Ask
    const bid = option.isBidModified && option.customBid !== undefined ? parseFloat(option.customBid) : parseFloat(option.bid);
    if (!isNaN(bid) && bid > 0) return bid;
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
 * Суммирует направление «крыльев» конструкции на экспирации по типам опционов
 * ЗАЧЕМ: Общая заготовка для hasUnlimitedLoss/hasUnlimitedProfit — считает суммарное
 * количество купленных/проданных коллов и путов (с учётом знака позиции), плюс
 * вклад позиций базового актива.
 *
 * @param {Array} options - массив видимых опционов
 * @param {Array} positions - массив позиций базового актива
 * @returns {{callWing: number, putWing: number, longUnderlying: number, shortUnderlying: number}}
 */
function summarizeWings(options = [], positions = []) {
  let callWing = 0; // >0 — суммарно куплены коллы (сила вверх), <0 — суммарно проданы
  let putWing = 0;  // >0 — суммарно куплены путы (сила вниз), <0 — суммарно проданы

  (options || [])
    .filter(opt => opt.visible !== false)
    .forEach(option => {
      const quantity = Math.abs(parseInt(option.quantity) || 0);
      // ЗАЧЕМ: регистронезависимо, как и в calculateTotalGreeks (см. optionPricing.js:46-48)
      const sign = (option.action || 'Buy').toLowerCase() === 'buy' ? 1 : -1;

      if (option.type === 'CALL') {
        callWing += quantity * sign;
      } else if (option.type === 'PUT') {
        putWing += quantity * sign;
      }
    });

  let longUnderlying = 0;
  let shortUnderlying = 0;
  (positions || [])
    .filter(pos => pos.visible !== false)
    .forEach(position => {
      const qty = Math.abs(parseFloat(position.quantity) || 0);
      if (position.type === 'LONG') longUnderlying += qty;
      else if (position.type === 'SHORT') shortUnderlying += qty;
    });

  return { callWing, putWing, longUnderlying, shortUnderlying };
}

/**
 * Проверяет, имеет ли стратегия неограниченный потенциал убытка
 * ЗАЧЕМ: Наивная симметрия с hasUnlimitedProfit — непокрытые (net) продажи коллов/путов
 * и короткие/длинные позиции базового актива дают потенциально неограниченный убыток
 * (для путов/лонга — до движения цены на 100% вниз, что по конвенции этого калькулятора
 * тоже отображается как «∞», см. дисклеймер в тултипах MAX убыток/MAX прибыль).
 *
 * @param {Array} options - массив видимых опционов
 * @param {Array} positions - массив позиций базового актива
 * @returns {boolean} - true если потенциал убытка неограничен
 */
function hasUnlimitedLoss(options, positions = []) {
  const { callWing, putWing, longUnderlying, shortUnderlying } = summarizeWings(options, positions);
  // Net-продажа коллов (callWing < 0) → неограниченный убыток вверх; шорт базового актива — туда же.
  const unlimitedUp = callWing < 0 || shortUnderlying > 0;
  // Net-продажа путов (putWing < 0) → неограниченный убыток вниз; лонг базового актива — туда же.
  const unlimitedDown = putWing < 0 || longUnderlying > 0;
  return unlimitedUp || unlimitedDown;
}

/**
 * Проверяет, имеет ли стратегия неограниченный потенциал прибыли
 * Логика: если суммарное количество купленных коллов (с учётом знака позиции) больше нуля —
 * прибыль неограничена вверх; аналогично для путов вниз (плюс вклад позиций базового актива).
 *
 * @param {Array} options - массив видимых опционов
 * @param {Array} positions - массив позиций базового актива
 * @returns {boolean} - true если потенциал прибыли неограничен
 */
function hasUnlimitedProfit(options, positions = []) {
  const { callWing, putWing, longUnderlying, shortUnderlying } = summarizeWings(options, positions);
  const unlimitedUp = callWing > 0 || longUnderlying > 0;
  const unlimitedDown = putWing > 0 || shortUnderlying > 0;
  return unlimitedUp || unlimitedDown;
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
 * @returns {Object} - объект с метриками { maxLoss, maxProfit, breakevens, riskReward, expirationDateLabel }
 */
export function calculatePLMetrics(options, currentPrice, positions = [], daysPassed = 0, ivSurface = null, dividendYield = 0, isAIEnabled = false, aiVolatilityMap = {}, targetPrice = 0, selectedTicker = '', calculatorMode = 'stocks', contractMultiplier = 100) {
  if (!options || !currentPrice) {
    return {
      maxLoss: 0,
      maxProfit: 0,
      breakevens: [],
      riskReward: '—',
      expirationDateLabel: null
    };
  }

  const visibleOptions = options.filter(opt => opt.visible !== false);
  const visiblePositions = positions.filter(pos => pos.visible !== false);

  if (visibleOptions.length === 0 && visiblePositions.length === 0) {
    return {
      maxLoss: 0,
      maxProfit: 0,
      breakevens: [],
      riskReward: '—',
      expirationDateLabel: null
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
      riskReward: '—',
      expirationDateLabel: null
    };
  }

  // MAX убыток и MAX прибыль считаем на дату экспирации (daysRemaining = 0)
  // ЗАЧЕМ: Временна́я стоимость на дату экспирации = 0, P&L определяется только внутренней стоимостью.
  // Это единственно корректный способ — MAX убыток не должен зависеть от ползунка дней.
  // Передаём daysPassed = 999999 чтобы гарантированно обнулить daysRemaining для всех опционов.
  const { totalPLArray: expirationPLArray } = calculatePLDataForMetrics(options, currentPrice, positions, 999999, ivSurface, dividendYield, isAIEnabled, aiVolatilityMap, targetPrice, selectedTicker, calculatorMode, contractMultiplier, 'simple');

  // Защита от пустых массивов: Math.min/Math.max от пустого массива возвращают ±Infinity,
  // что потом утекает в UI (видится как «—» или ломает форматирование). Если оба массива
  // пустые — возвращаем 0/0, чтобы метрика выглядела предсказуемо.
  const sourcePLArray = expirationPLArray.length > 0 ? expirationPLArray : totalPLArray;
  let maxProfit = sourcePLArray.length > 0 ? Math.max(...sourcePLArray) : 0;
  let maxLoss = sourcePLArray.length > 0 ? Math.min(...sourcePLArray) : 0;

  // ЗАЧЕМ (фикс 2A-4.2): диапазон цен для sourcePLArray ограничен ±100% от текущей цены —
  // для конструкций с реально неограниченным потенциалом (net-лонг коллов/путов, непокрытые
  // продажи) значение на краю диапазона — произвольное число, зависящее от ширины диапазона,
  // а не настоящий максимум/минимум. Заменяем его на явную «∞», где это математически верно.
  if (maxProfit > 0 && hasUnlimitedProfit(visibleOptions, visiblePositions)) {
    maxProfit = Infinity;
  }
  if (maxLoss < 0 && hasUnlimitedLoss(visibleOptions, visiblePositions)) {
    maxLoss = -Infinity;
  }

  // Рассчитываем Break-even точки (где P&L пересекает 0)
  // ЗАЧЕМ (фикс 2A-4.3): считаем по sourcePLArray (НА ДАТУ ЭКСПИРАЦИИ), а не по totalPLArray
  // (текущая/симулируемая дата). MAX прибыль/убыток уже считаются на экспирации — точка
  // безубытка должна быть согласована с ними (страйк ± премия), а не «плавать» при движении
  // ползунка дней.
  const breakevens = [];
  for (let i = 1; i < sourcePLArray.length; i++) {
    const prev = sourcePLArray[i - 1];
    const curr = sourcePLArray[i];

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
  // ЗАЧЕМ (фикс 2A-4.1): раньше гарантированно убыточная конструкция (maxProfit <= 0 && maxLoss < 0)
  // тоже показывала «∞» — визуально неотличимо от идеальной сделки. Явно разводим случаи через isFinite.
  let riskReward = '—';
  const profitIsUnlimited = maxProfit > 0 && !isFinite(maxProfit);
  const lossIsUnlimited = maxLoss < 0 && !isFinite(maxLoss);

  if (maxProfit === 0 && maxLoss === 0) {
    riskReward = '—';
  } else if (profitIsUnlimited && lossIsUnlimited) {
    // Оба конца неограничены — соотношение риск/прибыль не определено.
    riskReward = '—';
  } else if (profitIsUnlimited) {
    // Прибыль не ограничена, убыток конечен (или его нет) — идеальное соотношение.
    riskReward = '∞';
  } else if (lossIsUnlimited) {
    // Убыток не ограничен, прибыль конечна — «∞» здесь означало бы противоположное тому, что происходит.
    riskReward = '—';
  } else if (maxLoss < 0 && maxProfit > 0) {
    const ratio = maxProfit / Math.abs(maxLoss);
    riskReward = `1:${ratio.toFixed(2)}`;
  } else if (maxProfit > 0 && maxLoss >= 0) {
    riskReward = '∞';
  } else if (maxProfit <= 0 && maxLoss < 0) {
    // Гарантированный убыток при любой цене на экспирации — НЕ «∞» (это не идеальная сделка).
    riskReward = '—';
  }

  return {
    maxLoss,
    maxProfit,
    breakevens: uniqueBreakevens.sort((a, b) => a - b),
    riskReward,
    // ЗАЧЕМ: точка безубытка теперь считается на дату экспирации — карточка должна явно
    // показывать, к какой дате она относится (см. OptionsMetrics.jsx).
    expirationDateLabel: getNearestExpirationDateLabel(visibleOptions)
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
 * Возвращает дату ближайшей экспирации среди видимых опционов в формате DD.MM.YYYY
 * ЗАЧЕМ: Точка безубытка считается НА ДАТУ ЭКСПИРАЦИИ (см. calculatePLMetrics) — карточка
 * должна явно показывать, к какой дате относится это число, а не к текущей/симулируемой дате.
 *
 * @param {Array} options - массив опционов (ожидаются уже отфильтрованные по visible)
 * @returns {string|null} - дата в формате DD.MM.YYYY или null, если дат нет
 */
function getNearestExpirationDateLabel(options) {
  if (!options || options.length === 0) return null;

  const dates = options.map(opt => {
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

    return isNaN(date.getTime()) ? null : date.getTime();
  }).filter(d => d !== null);

  if (dates.length === 0) return null;

  const nearest = new Date(Math.min(...dates));
  const dd = String(nearest.getDate()).padStart(2, '0');
  const mm = String(nearest.getMonth() + 1).padStart(2, '0');
  const yyyy = nearest.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

/**
 * Рассчитывает суммарные Greeks для портфеля НА ОСНОВЕ ПОЛЕЙ НОГИ (замороженные значения,
 * заполненные при импорте котировок — не реагируют на ползунок дней/цену).
 * ЗАЧЕМ: Используется как быстрый расчёт и как safety-fallback для calculateLiveGreeks
 * (см. OptionsMetrics.jsx), если «живой» расчёт по какой-то причине недоступен/некорректен.
 *
 * ВАЖНО (фикс 2A-1): 1 опционный контракт = contractMultiplier единиц базового актива
 * (100 акций, либо стоимость пункта для фьючерсов) — без множителя карточки показывали
 * греки в contractMultiplier раз меньше реальных.
 *
 * @param {Array} options - массив опционов с Greeks (delta/gamma/theta/vega на 1 акцию)
 * @param {number} contractMultiplier - множитель контракта (100 для акций, pointValue для фьючерсов)
 * @returns {Object} - {delta, gamma, theta, vega} в долларах на всю позицию
 */
export function calculateTotalGreeks(options, contractMultiplier = 100) {
  if (!options || options.length === 0) {
    return { delta: 0, gamma: 0, theta: 0, vega: 0 };
  }

  return options
    .filter(opt => opt.visible !== false)
    .reduce((total, option) => {
      // ЗАЧЕМ: количество по модулю — отрицательное quantity не должно повторно
      // инвертировать знак позиции (двойная инверсия знака — известный дефект).
      const quantity = Math.abs(parseInt(option.quantity) || 0);
      // ЗАЧЕМ: регистронезависимое сравнение — 'buy' в нижнем регистре раньше трактовался
      // как Sell из-за строгого сравнения с 'Buy' (см. optionPricing.js:46-48 — образец).
      const sign = (option.action || 'Buy').toLowerCase() === 'buy' ? 1 : -1;
      const factor = quantity * sign * contractMultiplier;

      return {
        delta: total.delta + ((option.delta || 0) * factor),
        gamma: total.gamma + ((option.gamma || 0) * factor),
        theta: total.theta + ((option.theta || 0) * factor),
        vega: total.vega + ((option.vega || 0) * factor)
      };
    }, { delta: 0, gamma: 0, theta: 0, vega: 0 });
}

/**
 * Рассчитывает суммарные Greeks для портфеля «вживую» — по актуальным цене/дням/волатильности,
 * а не по замороженным полям ноги (заполненным при импорте котировок).
 *
 * ЗАЧЕМ (2A-3): греки из полей ноги не реагируют ни на ползунок дней, ни на целевую цену, ни
 * на ручную волатильность (Fact IV) — у позиции недельной давности показывались греки на дату
 * входа. Используем ту же волатильность/дни-до-экспирации по каждой ноге, что и P&L график
 * (calculatePLDataForMetrics в PLChart.jsx), чтобы карточки были согласованы с графиком и
 * колонкой P&L таблицы:
 *  - calculateDaysRemainingPreciseET / isOptionActiveAtDay / getOldestEntryDate — те же дни/активность ноги
 *    (дни — точная ET-версия, т.к. идут в формулу ценообразования, см. комментарий ниже по коду);
 *  - getOptionVolatility(..., option.manualIvOverride, ...) — та же волатильность (Fact IV/IV Surface).
 *
 * Считаем каждую ногу напрямую через Black-Scholes-Merton (акции/крипта/ETF) или Black-76
 * (фьючерсы) и свой contractMultiplier — НЕ через calculatePortfolioGreeks/
 * calculateFuturesPortfolioGreeks из universalPricing.js/futuresPricing.js, т.к. они не
 * поддерживают ручную волатильность по отдельной ноге, а calculatePortfolioGreeks дополнительно
 * жёстко умножает на 100 даже в режиме «Крипто» (там множитель должен быть 1).
 *
 * @param {Array} options - массив опционов
 * @param {number} currentPrice - симуляционная цена базового актива (с учётом ползунка цены)
 * @param {number} daysPassed - симуляционные прошедшие дни (с учётом ползунка дней)
 * @param {number} contractMultiplier - множитель контракта (100 акции/ETF, 1 крипто, pointValue фьючерсы)
 * @param {string} calculatorMode - режим калькулятора ('stocks' | 'futures' | 'crypto' | 'etf')
 * @param {Object} ivSurface - IV Surface для интерполяции (опционально)
 * @param {number} dividendYield - дивидендная доходность (десятичный формат, уже гейтится тумблером выше по дереву)
 * @param {boolean} isAIEnabled - использовать ли AI-волатильность
 * @param {Object} aiVolatilityMap - кэш AI-волатильности
 * @param {number} targetPrice - целевая цена (для ключа кэша AI-волатильности)
 * @param {string} selectedTicker - тикер (для ключа кэша AI-волатильности)
 * @returns {Object} - {delta, gamma, theta, vega} в долларах на всю позицию
 */
export function calculateLiveGreeks(
  options,
  currentPrice = 0,
  daysPassed = 0,
  contractMultiplier = 100,
  calculatorMode = CALCULATOR_MODES.STOCKS,
  ivSurface = null,
  dividendYield = 0,
  isAIEnabled = false,
  aiVolatilityMap = {},
  targetPrice = 0,
  selectedTicker = ''
) {
  const zero = { delta: 0, gamma: 0, theta: 0, vega: 0 };
  if (!options || options.length === 0 || !currentPrice) return zero;

  const visibleOptions = options.filter(opt => opt.visible !== false);
  if (visibleOptions.length === 0) return zero;

  const oldestEntryDate = getOldestEntryDate(options);
  // ЗАЧЕМ: для крипто — настраиваемый форвардный базис (по умолчанию 0 — старое
  // поведение, см. cryptoRateSettings.js), как и в остальном калькуляторе
  // (см. calculatePLDataForMetrics в PLChart.jsx), для акций/ETF — актуальная ставка ФРС.
  const riskFreeRate = calculatorMode === CALCULATOR_MODES.CRYPTO ? getCryptoBasisRate() : getRiskFreeRateSync();

  return visibleOptions.reduce((total, option) => {
    // Опцион ещё не куплен на симулируемую дату — не должен участвовать в греках (как и в P&L графике).
    if (!isOptionActiveAtDay(option, daysPassed, oldestEntryDate)) {
      return total;
    }

    const quantity = Math.abs(parseInt(option.quantity) || 0);
    if (!quantity) return total;
    // ЗАЧЕМ: регистронезависимо (фикс 2A-1), как и в calculateTotalGreeks.
    const sign = (option.action || 'Buy').toLowerCase() === 'buy' ? 1 : -1;

    // Индивидуальные дни до экспирации для этой ноги (с учётом ползунка daysPassed) — та же
    // логика, что использует P&L график и MAX прибыль/убыток.
    // ЗАЧЕМ (аудит A1 п.3): здесь эти дни идут ПРЯМО в формулу ценообразования
    // (timeToExpiryYears = optionDaysRemaining/365 ниже, вход в Black-Scholes/Black-76) —
    // поэтому используем точную ET-версию (16:00 America/New_York), а не целые календарные
    // дни до полуночи UTC. currentDaysToExpiration и optionDaysRemaining переключены ВМЕСТЕ
    // (одна и та же precise-функция), чтобы их разница (используется getOptionVolatility для
    // проекции IV между текущей и симулируемой точкой) не исказилась — обе смещаются на одну
    // и ту же дробную поправку для этой даты экспирации.
    const optionDaysRemaining = calculateDaysRemainingPreciseET(option, daysPassed, 30, oldestEntryDate);
    const currentDaysToExpiration = calculateDaysRemainingPreciseET(option, 0, 30, oldestEntryDate);
    const todaySimDaysForOpt = calculateDaysToExpirationFromTodayPreciseET(option);

    // Волатильность: ручная Fact IV ноги (manualIvOverride) имеет приоритет, иначе — IV Surface/API.
    // getOptionVolatility возвращает волатильность В ПРОЦЕНТАХ (например 25 = 25%).
    let ivPercent = getOptionVolatility(option, currentDaysToExpiration, optionDaysRemaining, ivSurface, 'simple', null, option.manualIvOverride, todaySimDaysForOpt);

    if (isAIEnabled && aiVolatilityMap && selectedTicker && targetPrice) {
      const cacheKey = `${selectedTicker}_${option.strike}_${option.date}_${targetPrice.toFixed(2)}_${optionDaysRemaining}`;
      const aiVolatility = aiVolatilityMap[cacheKey];
      if (aiVolatility) {
        ivPercent = aiVolatility;
      }
    }

    // ВАЖНО (2A-3): волатильность снизу ограничена 1% — при sigma → 0 гамма в формуле
    // Black-Scholes/Black-76 делится на sigma и уходит в бесконечность (см. знаменатель gamma).
    const rawVolatility = ivPercent > 1 ? ivPercent / 100 : ivPercent;
    const volatility = Math.max(0.01, rawVolatility || 0);

    let greeks;
    if (calculatorMode === CALCULATOR_MODES.FUTURES) {
      // Black-76: calculateFuturesGreeks сам конвертирует volatility>1 из процентов в доли,
      // здесь volatility уже в долях (<=1), поэтому пройдёт как есть.
      greeks = calculateFuturesGreeks(option, currentPrice, optionDaysRemaining, volatility);
    } else {
      const strike = parseFloat(option.strike) || 0;
      const type = option.type || 'CALL';
      const timeToExpiryYears = Math.max(0, optionDaysRemaining) / 365;
      const q = Math.max(0, dividendYield) || 0;
      greeks = calculateBSMGreeks(currentPrice, strike, timeToExpiryYears, riskFreeRate, volatility, type, q);
    }

    if (!greeks) return total;

    const factor = quantity * sign * contractMultiplier;
    const delta = (Number.isFinite(greeks.delta) ? greeks.delta : 0) * factor;
    const gamma = (Number.isFinite(greeks.gamma) ? greeks.gamma : 0) * factor;
    const theta = (Number.isFinite(greeks.theta) ? greeks.theta : 0) * factor;
    const vega = (Number.isFinite(greeks.vega) ? greeks.vega : 0) * factor;

    return {
      delta: total.delta + delta,
      gamma: total.gamma + gamma,
      theta: total.theta + theta,
      vega: total.vega + vega
    };
  }, zero);
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
 * ЗАЧЕМ: Множитель контракта (contractMultiplier) уже применён ДО вызова этой функции —
 * в calculateTotalGreeks/calculateLiveGreeks. formatGreek только форматирует готовое число.
 * @param {number} value - значение греков (уже умножено на quantity/знак/contractMultiplier)
 * @param {number} decimals - количество знаков после запятой
 * @returns {string} - отформатированная строка
 */
export function formatGreek(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) return '0';

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

/**
 * УДАЛЕНО: calculatePortfolioPLAtPrice больше не используется.
 *
 * P&L TOTAL и P&L базового актива теперь считаются прямо в PositionFinancialControl:
 * underlyingPL — линейная формула по позициям БА; optionsPL приходит готовым числом
 * из OptionsTableV3 через onOptionsTotalPLChange (то же значение, что в строке «ИТОГО»).
 * Это архитектурно гарантирует, что P&L TOTAL = P&L актива + ИТОГО таблицы — никаких
 * параллельных пересчётов не существует.
 */
