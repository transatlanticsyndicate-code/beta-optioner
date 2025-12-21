/**
 * Метрики риска
 * ЗАЧЕМ: Расчет Risk/Reward и Max Drawdown
 */

export const calculateRiskRewardRatio = (profitTarget, totalRisk) => {
  if (totalRisk <= 0) return Infinity;
  return profitTarget / totalRisk;
};

export const calculateMaxDrawdown = (currentPrice, targetPrice, numContracts, pointValue, totalCapital) => {
  const maxDrawdownDollars = Math.abs(currentPrice - targetPrice) * numContracts * pointValue;
  const maxDrawdownPercent = (maxDrawdownDollars / totalCapital) * 100;

  return {
    maxDrawdownDollars: maxDrawdownDollars.toFixed(2),
    maxDrawdownPercent: maxDrawdownPercent.toFixed(2),
  };
};
