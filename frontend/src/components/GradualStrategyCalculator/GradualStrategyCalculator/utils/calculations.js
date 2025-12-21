/**
 * Расчеты для градуальной стратегии
 * ЗАЧЕМ: Вычисление позиций, рисков и прибыли
 */

export const calculatePositionSize = (capital, riskPercent, stopLossPercent) => {
  const riskAmount = capital * (riskPercent / 100);
  const positionSize = riskAmount / (stopLossPercent / 100);
  return positionSize;
};

export const calculateRiskReward = (entryPrice, stopLoss, targetPrice) => {
  const risk = Math.abs(entryPrice - stopLoss);
  const reward = Math.abs(targetPrice - entryPrice);
  return risk > 0 ? reward / risk : 0;
};
