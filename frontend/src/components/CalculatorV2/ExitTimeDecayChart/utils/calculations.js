/**
 * Расчеты для графика временного распада
 * ЗАЧЕМ: Вычисление P&L опционов и позиций
 * Затрагивает: график ExitTimeDecayChart
 */

import { calculateOptionPLValue } from '../../../../utils/optionPricing';
import { calculateDaysRemainingUTC } from '../../../../utils/dateUtils';
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
export const calculateDaysRemainingForOption = (option, currentDaysPassed) => {
  return calculateDaysRemainingUTC(option, currentDaysPassed, 30);
};

// Расчет P&L для опциона
export const calculateOptionPL = (option, daysToExpiration, targetPrice, currentPrice, ivSurface) => {
  const currentDaysToExpiration = calculateDaysRemainingUTC(option, 0);
  const optionVolatility = getOptionVolatility(option, currentDaysToExpiration, daysToExpiration, ivSurface);
  
  const effectivePremium = option.isPremiumModified ? option.customPremium : option.premium;
  const tempOpt = { 
    ...option, 
    premium: effectivePremium,
    ask: option.isPremiumModified ? 0 : option.ask,
    bid: option.isPremiumModified ? 0 : option.bid
  };
  
  return calculateOptionPLValue(tempOpt, targetPrice, currentPrice, daysToExpiration, optionVolatility);
};
