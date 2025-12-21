/**
 * Утилиты оценки цены опционов
 * ЗАЧЕМ: Автозаполнение цены при выборе страйка
 * Затрагивает: UX формы
 */

export const estimateOptionPrice = (strikeNum, currentPriceNum, type) => {
  const diff = Math.abs(strikeNum - currentPriceNum);
  const percentDiff = diff / currentPriceNum;
  
  let intrinsicValue = 0;
  let timeValue = 5;
  
  if (type === 'call') {
    intrinsicValue = Math.max(0, currentPriceNum - strikeNum);
  } else {
    intrinsicValue = Math.max(0, strikeNum - currentPriceNum);
  }
  
  if (percentDiff > 0.05) {
    timeValue = Math.max(0.5, 5 - percentDiff * 20);
  }
  
  return Math.max(0.50, intrinsicValue + timeValue);
};

export const generateFallbackStrikes = (currentPrice) => {
  if (!currentPrice || !currentPrice.price) return [];
  
  const baseStrike = Math.round(currentPrice.price / 5) * 5;
  return Array.from({ length: 20 }, (_, i) => {
    const strike = baseStrike - 50 + (i * 5);
    return { strike, price: 0 };
  }).filter(s => s.strike > 0);
};
