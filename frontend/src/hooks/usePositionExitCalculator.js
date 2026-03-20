import { useMemo } from 'react';
// Импорт из старого модуля для режима "Акции" (обратная совместимость)
import {
  calculateIntrinsicValue as calculateStockIntrinsicValue,
  calculateOptionPLValue as calculateStockOptionPLValue,
  calculateOptionTheoreticalPrice as calculateStockOptionTheoreticalPrice,
  calculateOptionExpirationPLValue as calculateStockOptionExpirationPLValue,
  adjustPLByStockGroup,
} from '../utils/optionPricing';
// Импорт из нового модуля для режима "Фьючерсы"
import {
  calculateFuturesOptionPLValue,
  calculateFuturesOptionTheoreticalPrice,
  calculateFuturesOptionExpirationPLValue,
} from '../utils/futuresPricing';
import { calculateIntrinsicValueBlack76 } from '../utils/black76';
import { getOptionVolatility } from '../utils/volatilitySurface';
import { assessLiquidity, LIQUIDITY_LEVELS } from '../utils/liquidityCheck';
import { calculateDaysRemainingUTC, getOldestEntryDate, calculateDaysToExpirationFromToday } from '../utils/dateUtils';

// Режимы калькулятора
const CALCULATOR_MODES = {
  STOCKS: 'stocks',
  FUTURES: 'futures',
  CRYPTO: 'crypto'
};

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
 * ЛОГИКА ИНДИВИДУАЛЬНОГО РАСЧЁТА:
 * - daysPassed считается от самой старой даты входа (oldestEntryDate)
 * - Для каждого опциона вычисляем actualDaysPassed на основе его entryDate
 * 
 * @param {Object} option - опцион с полем date
 * @param {number} daysPassed - прошедшие дни от самой старой даты входа
 * @param {Date|null} oldestEntryDate - самая старая дата входа среди всех опционов
 * @returns {number} - оставшиеся дни до экспирации для этого опциона
 */
const calculateDaysToExpirationForOption = (option, daysPassed, oldestEntryDate = null) => {
  // Используем UTC-функцию для единообразного расчёта во всех часовых поясах
  // ВАЖНО: Передаём oldestEntryDate для корректного расчёта actualDaysPassed
  return calculateDaysRemainingUTC(option, daysPassed, 30, oldestEntryDate);
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
  dividendYield = 0,
  isAIEnabled = false,
  aiVolatilityMap = {},
  fetchAIVolatility = null,
  selectedTicker = '',
  calculatorMode = 'stocks', // Режим калькулятора: 'stocks' | 'futures'
  contractMultiplier = 100, // Множитель контракта: 100 для акций, pointValue для фьючерсов
  stockClassification = null, // Классификация акции для применения коэффициентов группы
  manualIvOverride: manualIvOverrideProp = null // Ручная фактическая IV на сегодня
}) => {
  const manualIvOverride = manualIvOverrideProp;

  return useMemo(() => {
    // Извлекаем параметры Ornstein-Uhlenbeck из классификации тикера
    // ЗАЧЕМ: Если тикер откалиброван — используем iv_mean/iv_kappa для прогноза IV
    const ouParams = (stockClassification && stockClassification.iv_mean != null && stockClassification.iv_kappa != null)
      ? { iv_mean: stockClassification.iv_mean, iv_kappa: stockClassification.iv_kappa }
      : null;
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
      dividendYield,
      calculatorMode,
      contractMultiplier
    });

    // Сценарий 2: Закрыть опционы, оставить акции (Close options only)
    const closeOptionsCalculation = calculateCloseOptionsScenario({
      options: visibleOptions,
      positions: visiblePositions,
      underlyingPrice,
      daysPassed,
      currentPrice,
      ivSurface,
      dividendYield,
      isAIEnabled,
      aiVolatilityMap,
      selectedTicker,
      calculatorMode,
      contractMultiplier,
      ouParams,
      manualIvOverride
    });

    // Сценарий 3: Закрыть всё (Close everything)
    const closeAllCalculation = calculateCloseAllScenario({
      options: visibleOptions,
      positions: visiblePositions,
      underlyingPrice,
      daysPassed,
      currentPrice,
      ivSurface,
      dividendYield,
      isAIEnabled,
      aiVolatilityMap,
      selectedTicker,
      calculatorMode,
      contractMultiplier,
      ouParams,
      manualIvOverride
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

    // Применяем коэффициент к деталям расчета (каждому элементу в массиве)
    // ЗАЧЕМ: Детализация в карточках сценариев должна показывать скорректированные значения
    // ВАЖНО: Коэффициенты разные для положительных и отрицательных P&L,
    // поэтому нужно корректировать каждый элемент отдельно, а потом суммировать
    const applyGroupAdjustmentToDetails = (details) => {
      if (calculatorMode !== CALCULATOR_MODES.STOCKS || !stockClassification) {
        return details;
      }
      return details.map(detail => ({
        ...detail,
        value: adjustPLByStockGroup(detail.value, stockClassification)
      }));
    };

    // Суммируем скорректированные значения из details
    // ЗАЧЕМ: adjustPLByStockGroup применяет разные коэффициенты для прибыли и убытков,
    // поэтому нельзя корректировать итоговую сумму - нужно суммировать уже скорректированные значения
    const sumAdjustedDetails = (details) => {
      return details.reduce((sum, detail) => sum + detail.value, 0);
    };

    // Применяем корректировку к деталям
    const adjustedExerciseDetails = applyGroupAdjustmentToDetails(exerciseCalculation.details);
    const adjustedCloseOptionsDetails = applyGroupAdjustmentToDetails(closeOptionsCalculation.details);
    const adjustedCloseAllDetails = applyGroupAdjustmentToDetails(closeAllCalculation.details);

    return {
      // Итоговый P&L = сумма скорректированных значений из details
      plExercise: sumAdjustedDetails(adjustedExerciseDetails),
      plCloseOptions: sumAdjustedDetails(adjustedCloseOptionsDetails),
      plCloseAll: sumAdjustedDetails(adjustedCloseAllDetails),
      details: {
        exercise: adjustedExerciseDetails,
        closeOptions: adjustedCloseOptionsDetails,
        closeAll: adjustedCloseAllDetails
      },
      liquidityWarnings // Предупреждения о низкой ликвидности
    };
  }, [underlyingPrice, daysPassed, options, positions, currentPrice, ivSurface, dividendYield, isAIEnabled, aiVolatilityMap, calculatorMode, contractMultiplier, stockClassification]);
};

/**
 * Сценарий 1: Исполнить опционы
 * - Buy CALL: покупаем акции по страйку
 * - Buy PUT: продаем акции по страйку
 * - Sell CALL: продаем акции по страйку
 * - Sell PUT: покупаем акции по страйку
 * - Затем P&L от изменения цены акций
 */
const calculateExerciseScenario = ({ options, positions, underlyingPrice, currentPrice, calculatorMode = 'stocks', contractMultiplier = 100 }) => {
  const details = [];
  let totalPL = 0;

  // Множитель для фьючерсов (pointValue), для акций = 1
  // ЗАЧЕМ: Для фьючерсов P&L = разница в пунктах × quantity × pointValue
  const positionMultiplier = calculatorMode === CALCULATOR_MODES.FUTURES ? contractMultiplier : 1;
  const assetLabel = calculatorMode === CALCULATOR_MODES.FUTURES ? 'контрактов' : 'акций';

  // Стоимость входа в позицию учитывается в totalPL, но не отображается отдельной строкой
  // LONG: покупаем акции/контракты (тратим деньги) = -entryPrice * quantity * multiplier
  // SHORT: продаём акции/контракты (получаем деньги) = +entryPrice * quantity * multiplier
  positions.forEach(position => {
    const quantity = Number(position.quantity) || 0;
    const entryPrice = Number(position.price) || 0;
    const cost = position.type === 'LONG'
      ? -entryPrice * quantity * positionMultiplier  // LONG: тратим на покупку
      : +entryPrice * quantity * positionMultiplier; // SHORT: получаем от продажи
    totalPL += cost;
  });

  // P&L от исполнения опционов (только ITM опционы исполняются)
  options.forEach(option => {
    // ВАЖНО: При ручной премии обнуляем ask/bid, чтобы getEntryPrice() использовал premium
    // Если нет - передаем ручные Bid/Ask, если они изменены
    const tempOption = {
      ...option,
      premium: option.isPremiumModified ? option.customPremium : option.premium,
      ask: option.isPremiumModified ? 0 : (option.isAskModified ? option.customAsk : option.ask),
      bid: option.isPremiumModified ? 0 : (option.isBidModified ? option.customBid : option.bid),
    };
    // Выбираем модель расчёта в зависимости от режима калькулятора
    const pl = calculatorMode === CALCULATOR_MODES.FUTURES
      ? calculateFuturesOptionExpirationPLValue(tempOption, underlyingPrice, contractMultiplier)
      : calculateStockOptionExpirationPLValue(tempOption, underlyingPrice, contractMultiplier);
    const strike = Number(option.strike) || 0;
    const intrinsicValue = calculatorMode === CALCULATOR_MODES.FUTURES
      ? calculateIntrinsicValueBlack76(option.type, underlyingPrice, strike)
      : calculateStockIntrinsicValue(option, underlyingPrice);
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

  // P&L от продажи акций/контрактов
  positions.forEach(position => {
    const quantity = Number(position.quantity) || 0;
    const entryPrice = Number(position.price) || 0;

    let positionPL = 0;
    let description = '';

    if (position.type === 'LONG') {
      positionPL = (underlyingPrice - entryPrice) * quantity * positionMultiplier;
      description = `Продаём ${quantity} ${assetLabel}: ${entryPrice.toFixed(2)} → ${underlyingPrice.toFixed(2)}`;
    } else if (position.type === 'SHORT') {
      positionPL = (entryPrice - underlyingPrice) * quantity * positionMultiplier;
      description = `Выкупаем ${quantity} ${assetLabel}: ${entryPrice.toFixed(2)} → ${underlyingPrice.toFixed(2)}`;
    }

    details.push({
      label: `${position.type} ${quantity} ${assetLabel} - P&L`,
      value: positionPL,
      description,
      type: 'stock-pl'
    });

    totalPL += positionPL;
  });

  return { totalPL, details };
};

/**
 * Сценарий 2: Закрыть опционы, оставить акции
 * - Закрываем опционы по текущей цене (intrinsic + time value)
 * - P&L от изменения цены акций
 */
const calculateCloseOptionsScenario = ({ options, positions, underlyingPrice, daysPassed, currentPrice, ivSurface = null, dividendYield = 0, isAIEnabled = false, aiVolatilityMap = {}, selectedTicker = '', calculatorMode = 'stocks', contractMultiplier = 100, ouParams = null, manualIvOverride = null }) => {
  const details = [];
  let totalPL = 0;

  // Множитель для фьючерсов (pointValue), для акций = 1
  // ЗАЧЕМ: Для фьючерсов P&L = разница в пунктах × quantity × pointValue
  const positionMultiplier2 = calculatorMode === CALCULATOR_MODES.FUTURES ? contractMultiplier : 1;
  const assetLabel2 = calculatorMode === CALCULATOR_MODES.FUTURES ? 'контрактов' : 'акций';

  // Стоимость входа в позицию учитывается в totalPL, но не отображается отдельной строкой
  // LONG: покупаем акции/контракты (тратим деньги) = -entryPrice * quantity * multiplier
  // SHORT: продаём акции/контракты (получаем деньги) = +entryPrice * quantity * multiplier
  positions.forEach(position => {
    const quantity = Number(position.quantity) || 0;
    const entryPrice = Number(position.price) || 0;
    const cost = position.type === 'LONG'
      ? -entryPrice * quantity * positionMultiplier2  // LONG: тратим на покупку
      : +entryPrice * quantity * positionMultiplier2; // SHORT: получаем от продажи
    totalPL += cost;
  });

  // P&L от закрытия опционов (Сценарий 2: Закрыть опционы)
  // ВАЖНО: Каждый опцион имеет свою дату экспирации и IV из API
  // DEBUG: Закомментировано для production
  // console.log(`[Расчёт выхода] 🔍 Сценарий 2: underlyingPrice=$${underlyingPrice}, daysPassed=${daysPassed}, currentPrice=$${currentPrice}`);

  // Вычисляем самую старую дату входа для индивидуального расчёта daysPassed
  const oldestEntryDate = getOldestEntryDate(options);

  options.forEach((option, optionIndex) => {
    // ВАЖНО: При ручной премии обнуляем ask/bid, чтобы getEntryPrice() использовал premium
    // Если нет - передаем ручные Bid/Ask, если они изменены
    const tempOption = {
      ...option,
      premium: option.isPremiumModified ? option.customPremium : option.premium,
      ask: option.isPremiumModified ? 0 : (option.isAskModified ? option.customAsk : option.ask),
      bid: option.isPremiumModified ? 0 : (option.isBidModified ? option.customBid : option.bid),
    };
    // Цена входа: ASK для Buy, BID для Sell
    const entryPrice = getEntryPrice(option);

    // Вычисляем индивидуальные параметры для этого опциона
    // currentDays - дни до экспирации на момент входа (без симуляции)
    // simulatedDays - дни до экспирации с учётом симуляции (daysPassed)
    // todayDays - дни от РЕАЛЬНОГО СЕГОДНЯ до экспирации (для manualIvOverride)
    // ВАЖНО: Передаём oldestEntryDate для корректного расчёта actualDaysPassed
    const currentDaysToExpiration = calculateDaysToExpirationForOption(option, 0, oldestEntryDate);
    const simulatedDaysToExpiration = calculateDaysToExpirationForOption(option, daysPassed, oldestEntryDate);
    const todayDaysToExpiration = calculateDaysToExpirationFromToday(option);

    // manualIvOverride применяется только к первому опциону (index === 0)
    // ЗАЧЕМ: Пользователь вводит фактическую IV для первого опциона стратегии
    const ivOverrideForOption = optionIndex === 0 ? manualIvOverride : null;

    // Получаем прогнозируемую IV с учётом временной структуры (Volatility Surface)
    // ВАЖНО: ouParams передаёт параметры OU-модели для mean reversion прогноза IV
    // todayDaysToExpiration используется для привязки manualIvOverride к реальному сегодня
    let optionVolatility = getOptionVolatility(
      option,
      currentDaysToExpiration,
      simulatedDaysToExpiration,
      ivSurface,
      'simple',
      ouParams,
      ivOverrideForOption,
      todayDaysToExpiration
    );

    // Используем AI волатильность если доступна
    if (isAIEnabled && aiVolatilityMap && selectedTicker && ivOverrideForOption == null) {
      const cacheKey = `${selectedTicker}_${option.strike}_${option.date}_${underlyingPrice.toFixed(2)}_${simulatedDaysToExpiration}`;
      const aiVolatility = aiVolatilityMap[cacheKey];
      if (aiVolatility) {
        console.log('🤖 [ExitCalculator/closeOptions] Используем AI волатильность:', {
          strike: option.strike,
          standardIV: optionVolatility,
          aiIV: aiVolatility,
          cacheKey
        });
        optionVolatility = aiVolatility;
      }
    }

    // Выбираем модель расчёта в зависимости от режима калькулятора (Сценарий 2)
    const currentValue = calculatorMode === CALCULATOR_MODES.FUTURES
      ? calculateFuturesOptionTheoreticalPrice(tempOption, underlyingPrice, simulatedDaysToExpiration, optionVolatility)
      : calculateStockOptionTheoreticalPrice(tempOption, underlyingPrice, simulatedDaysToExpiration, optionVolatility, dividendYield);
    // Для крипто (Binance) безрисковая ставка = 0, для акций — из FRED (null)
    const rfrScenario2 = calculatorMode === CALCULATOR_MODES.CRYPTO ? 0 : null;
    const pl = calculatorMode === CALCULATOR_MODES.FUTURES
      ? calculateFuturesOptionPLValue(tempOption, underlyingPrice, simulatedDaysToExpiration, contractMultiplier, optionVolatility)
      : calculateStockOptionPLValue(tempOption, underlyingPrice, currentPrice, simulatedDaysToExpiration, optionVolatility, dividendYield, contractMultiplier, rfrScenario2);

    // Добавляем IV в описание для прозрачности расчётов
    // Показываем текущую IV и прогнозируемую если они отличаются
    const currentIV = (option.impliedVolatility || option.implied_volatility || 0);
    const currentIVPercent = currentIV < 1 ? currentIV * 100 : currentIV;
    // ВАЖНО: AI волатильность приходит в десятичном формате (0.188), нужно умножить на 100
    const ivDisplayPercent = optionVolatility < 1 ? optionVolatility * 100 : optionVolatility;
    const ivDisplay = ivDisplayPercent.toFixed(1);
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

  // P&L от продажи акций/контрактов
  positions.forEach(position => {
    const quantity = Number(position.quantity) || 0;
    const entryPrice = Number(position.price) || 0;

    let positionPL = 0;
    let description = '';

    if (position.type === 'LONG') {
      positionPL = (underlyingPrice - entryPrice) * quantity * positionMultiplier2;
      description = `Продаём ${quantity} ${assetLabel2}: ${entryPrice.toFixed(2)} → ${underlyingPrice.toFixed(2)}`;
    } else if (position.type === 'SHORT') {
      positionPL = (entryPrice - underlyingPrice) * quantity * positionMultiplier2;
      description = `Выкупаем ${quantity} ${assetLabel2}: ${entryPrice.toFixed(2)} → ${underlyingPrice.toFixed(2)}`;
    }

    details.push({
      label: `${position.type} ${quantity} ${assetLabel2} - P&L`,
      value: positionPL,
      description,
      type: 'stock-pl'
    });

    totalPL += positionPL;
  });

  return { totalPL, details };
};

/**
 * Сценарий 3: Закрыть всё
 * - Закрываем опционы по текущей цене (intrinsic + time value)
 * - Продаем акции по текущей цене
 */
const calculateCloseAllScenario = ({ options, positions, underlyingPrice, daysPassed, currentPrice, ivSurface = null, dividendYield = 0, isAIEnabled = false, aiVolatilityMap = {}, selectedTicker = '', calculatorMode = 'stocks', contractMultiplier = 100, ouParams = null, manualIvOverride = null }) => {
  const details = [];
  let totalPL = 0;

  // Множитель для фьючерсов (pointValue), для акций = 1
  // ЗАЧЕМ: Для фьючерсов P&L = разница в пунктах × quantity × pointValue
  const positionMultiplier3 = calculatorMode === CALCULATOR_MODES.FUTURES ? contractMultiplier : 1;
  const assetLabel3 = calculatorMode === CALCULATOR_MODES.FUTURES ? 'контрактов' : 'акций';

  // Стоимость входа в позицию учитывается в totalPL, но не отображается отдельной строкой
  // LONG: покупаем акции/контракты (тратим деньги) = -entryPrice * quantity * multiplier
  // SHORT: продаём акции/контракты (получаем деньги) = +entryPrice * quantity * multiplier
  positions.forEach(position => {
    const quantity = Number(position.quantity) || 0;
    const entryPrice = Number(position.price) || 0;
    const cost = position.type === 'LONG'
      ? -entryPrice * quantity * positionMultiplier3  // LONG: тратим на покупку
      : +entryPrice * quantity * positionMultiplier3; // SHORT: получаем от продажи
    totalPL += cost;
  });

  // P&L от закрытия опционов (Сценарий 3: Закрыть всё)
  // ВАЖНО: Каждый опцион имеет свою дату экспирации и IV из API
  // Вычисляем самую старую дату входа для индивидуального расчёта daysPassed
  const oldestEntryDate = getOldestEntryDate(options);

  options.forEach((option, optionIndex) => {
    // ВАЖНО: При ручной премии обнуляем ask/bid, чтобы getEntryPrice() использовал premium
    // Если нет - передаем ручные Bid/Ask, если они изменены
    const tempOption = {
      ...option,
      premium: option.isPremiumModified ? option.customPremium : option.premium,
      ask: option.isPremiumModified ? 0 : (option.isAskModified ? option.customAsk : option.ask),
      bid: option.isPremiumModified ? 0 : (option.isBidModified ? option.customBid : option.bid),
    };
    // Цена входа: ASK для Buy, BID для Sell
    const entryPrice = getEntryPrice(option);

    // Вычисляем индивидуальные параметры для этого опциона
    // currentDays - дни до экспирации на момент входа (без симуляции)
    // simulatedDays - дни до экспирации с учётом симуляции (daysPassed)
    // todayDays - дни от РЕАЛЬНОГО СЕГОДНЯ до экспирации (для manualIvOverride)
    // ВАЖНО: Передаём oldestEntryDate для корректного расчёта actualDaysPassed
    const currentDaysToExpiration = calculateDaysToExpirationForOption(option, 0, oldestEntryDate);
    const simulatedDaysToExpiration = calculateDaysToExpirationForOption(option, daysPassed, oldestEntryDate);
    const todayDaysToExpiration = calculateDaysToExpirationFromToday(option);

    // manualIvOverride применяется только к первому опциону (index === 0)
    // ЗАЧЕМ: Пользователь вводит фактическую IV для первого опциона стратегии
    const ivOverrideForOption = optionIndex === 0 ? manualIvOverride : null;

    // Получаем прогнозируемую IV с учётом временной структуры (Volatility Surface)
    // ВАЖНО: ouParams передаёт параметры OU-модели для mean reversion прогноза IV
    // todayDaysToExpiration используется для привязки manualIvOverride к реальному сегодня
    let optionVolatility = getOptionVolatility(
      option,
      currentDaysToExpiration,
      simulatedDaysToExpiration,
      ivSurface,
      'simple',
      ouParams,
      ivOverrideForOption,
      todayDaysToExpiration
    );

    // Используем AI волатильность если доступна
    if (isAIEnabled && aiVolatilityMap && selectedTicker && ivOverrideForOption == null) {
      const cacheKey = `${selectedTicker}_${option.strike}_${option.date}_${underlyingPrice.toFixed(2)}_${simulatedDaysToExpiration}`;
      const aiVolatility = aiVolatilityMap[cacheKey];
      if (aiVolatility) {
        console.log('🤖 [ExitCalculator/closeAll] Используем AI волатильность:', {
          strike: option.strike,
          standardIV: optionVolatility,
          aiIV: aiVolatility,
          cacheKey
        });
        optionVolatility = aiVolatility;
      }
    }

    // Выбираем модель расчёта в зависимости от режима калькулятора (Сценарий 3)
    const currentValue = calculatorMode === CALCULATOR_MODES.FUTURES
      ? calculateFuturesOptionTheoreticalPrice(tempOption, underlyingPrice, simulatedDaysToExpiration, optionVolatility)
      : calculateStockOptionTheoreticalPrice(tempOption, underlyingPrice, simulatedDaysToExpiration, optionVolatility, dividendYield);
    // Для крипто (Binance) безрисковая ставка = 0, для акций — из FRED (null)
    const rfrScenario3 = calculatorMode === CALCULATOR_MODES.CRYPTO ? 0 : null;
    const pl = calculatorMode === CALCULATOR_MODES.FUTURES
      ? calculateFuturesOptionPLValue(tempOption, underlyingPrice, simulatedDaysToExpiration, contractMultiplier, optionVolatility)
      : calculateStockOptionPLValue(tempOption, underlyingPrice, currentPrice, simulatedDaysToExpiration, optionVolatility, dividendYield, contractMultiplier, rfrScenario3);

    // Добавляем IV в описание для прозрачности расчётов
    // Показываем текущую IV и прогнозируемую если они отличаются
    const currentIV = (option.impliedVolatility || option.implied_volatility || 0);
    const currentIVPercent = currentIV < 1 ? currentIV * 100 : currentIV;
    // ВАЖНО: AI волатильность приходит в десятичном формате (0.188), нужно умножить на 100
    const ivDisplayPercent = optionVolatility < 1 ? optionVolatility * 100 : optionVolatility;
    const ivDisplay = ivDisplayPercent.toFixed(1);
    // Показываем первоначальную IV в скобках если прошло время (daysPassed > 0)
    // ЗАЧЕМ: Пользователь должен видеть как изменилась IV даже при небольших изменениях
    const showOriginalIV = daysPassed > 0 && currentIVPercent > 0;

    // К = P&L / (Цена входа * multiplier) - показывает отношение P&L к стоимости контракта
    const entryCost = entryPrice * contractMultiplier; // Стоимость контракта (цена входа * множитель)
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

  // P&L от продажи акций/контрактов
  positions.forEach(position => {
    const quantity = Number(position.quantity) || 0;
    const entryPrice = Number(position.price) || 0;

    let positionPL = 0;
    let description = '';

    if (position.type === 'LONG') {
      positionPL = (underlyingPrice - entryPrice) * quantity * positionMultiplier3;
      description = `Продаём ${quantity} ${assetLabel3}: ${entryPrice.toFixed(2)} → ${underlyingPrice.toFixed(2)}`;
    } else if (position.type === 'SHORT') {
      positionPL = (entryPrice - underlyingPrice) * quantity * positionMultiplier3;
      description = `Выкупаем ${quantity} ${assetLabel3}: ${entryPrice.toFixed(2)} → ${underlyingPrice.toFixed(2)}`;
    }

    details.push({
      label: `${position.type} ${quantity} ${assetLabel3} - P&L`,
      value: positionPL,
      description,
      type: 'stock-pl'
    });

    totalPL += positionPL;
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
