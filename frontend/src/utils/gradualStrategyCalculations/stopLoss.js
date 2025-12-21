/**
 * Расчеты Stop-Loss
 * ЗАЧЕМ: Управление рисками для градуальных стратегий
 */

export const calculateEntryStopLoss = (avgEntryPrice, pointValue, slPoints, numContracts, totalCapital) => {
  if (!slPoints || slPoints <= 0) return null;

  const slPrice = avgEntryPrice - slPoints;
  const riskPerContract = slPoints * pointValue;
  const totalRisk = riskPerContract * numContracts;
  const riskPercent = (totalRisk / totalCapital) * 100;

  return {
    slPrice: slPrice.toFixed(2),
    slPoints: slPoints.toFixed(2),
    riskPerContract: riskPerContract.toFixed(2),
    totalRisk: totalRisk.toFixed(2),
    riskPercent: riskPercent.toFixed(2),
    maxLoss: totalRisk.toFixed(2),
    maxLossPercent: riskPercent.toFixed(2),
  };
};

export const calculateExitStopLoss = (entryPrice, pointValue, slPoints, margin) => {
  if (!slPoints || slPoints <= 0) return null;

  const slPrice = entryPrice - slPoints;
  const maxLoss = slPoints * pointValue;
  const maxLossPercent = (maxLoss / margin) * 100;

  return {
    slPrice: slPrice.toFixed(2),
    slPoints: slPoints.toFixed(2),
    maxLoss: maxLoss.toFixed(2),
    maxLossPercent: maxLossPercent.toFixed(2),
  };
};
