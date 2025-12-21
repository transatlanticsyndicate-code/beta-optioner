/**
 * Расчеты для шкалы страйков
 * ЗАЧЕМ: Вычисление метрик и позиций страйков
 */

export const calculateStrikeMetrics = (strike, currentPrice, optionData) => {
  const distance = ((strike - currentPrice) / currentPrice) * 100;
  const moneyness = strike > currentPrice ? 'OTM' : strike < currentPrice ? 'ITM' : 'ATM';
  
  return {
    distance,
    moneyness,
    oi: optionData?.openInterest || 0,
    volume: optionData?.volume || 0
  };
};

export const formatStrikeLabel = (strike) => {
  return `$${strike.toFixed(2)}`;
};
