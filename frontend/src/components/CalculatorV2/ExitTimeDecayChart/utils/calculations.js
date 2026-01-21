/**
 * Расчеты для графика временного распада
 * ЗАЧЕМ: Вычисление P&L опционов и позиций
 * Затрагивает: график ExitTimeDecayChart
 */

import { calculateOptionPLValue } from '../../../../utils/optionPricing';
import { calculateDaysRemainingUTC, getOldestEntryDate } from '../../../../utils/dateUtils';
import { getOptionVolatility } from '../../../../utils/volatilitySurface';

// Расчет P&L для позиции базового актива
export const calculateUnderlyingPL = (price, position) => {
  if (!position || !position.type) return 0;
  
  const { type, quantity, price: entryPrice } = position;
  const entryPriceNum = Number(entryPrice) || 0;
  
  if (type === 'LONG') {
    return (price - entryPriceNum) * quantity;
  } else if (type === 'SHORT') {
    return (entryPriceNum - price) * quantity;
  }
  return 0;
};

// Вычисляет оставшиеся дни до экспирации для конкретного опциона
// ВАЖНО: Передаём oldestEntryDate для корректного расчёта actualDaysPassed
export const calculateDaysRemainingForOption = (option, currentDaysPassed, oldestEntryDate = null) => {
  return calculateDaysRemainingUTC(option, currentDaysPassed, 30, oldestEntryDate);
};

// Расчет P&L для опциона
// ВАЖНО: Добавлен параметр oldestEntryDate для индивидуального расчёта daysPassed
export const calculateOptionPL = (option, daysToExpiration, targetPrice, currentPrice, ivSurface, dividendYield = 0, isAIEnabled = false, aiVolatilityMap = {}, selectedTicker = '', oldestEntryDate = null) => {
  const currentDaysToExpiration = calculateDaysRemainingUTC(option, 0, 30, oldestEntryDate);
  let optionVolatility = getOptionVolatility(option, currentDaysToExpiration, daysToExpiration, ivSurface, 'simple');
  
  // Используем AI волатильность если доступна
  if (isAIEnabled && aiVolatilityMap && selectedTicker) {
    const cacheKey = `${selectedTicker}_${option.strike}_${option.date}_${targetPrice.toFixed(2)}_${daysToExpiration}`;
    const aiVolatility = aiVolatilityMap[cacheKey];
    if (aiVolatility) {
      console.log('🤖 [ExitTimeDecayChart] Используем AI волатильность:', {
        strike: option.strike,
        days: daysToExpiration,
        standardIV: optionVolatility,
        aiIV: aiVolatility,
        cacheKey
      });
      optionVolatility = aiVolatility;
    }
  }
  
  const effectivePremium = option.isPremiumModified ? option.customPremium : option.premium;
  const tempOpt = { 
    ...option, 
    premium: effectivePremium,
    ask: option.isPremiumModified ? 0 : option.ask,
    bid: option.isPremiumModified ? 0 : option.bid
  };
  
  return calculateOptionPLValue(tempOpt, targetPrice, currentPrice, daysToExpiration, optionVolatility, dividendYield);
};
