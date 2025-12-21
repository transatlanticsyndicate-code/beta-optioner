/**
 * Расчет градуального открытия позиций
 * ЗАЧЕМ: Усреднение входа в позицию
 */

import { calculateEntryStopLoss } from './stopLoss';
import { calculateMaxDrawdown } from './riskMetrics';

export const calculateGradualEntry = ({
  numContracts, currentPrice, targetEntryPrice, pointValue,
  entryLogic = 'uniform', channelWidth = 0, margin = 0,
  availableCapital = 0, entryStopLoss = 0,
}) => {
  if (!numContracts || !currentPrice || !pointValue) {
    console.error('Валидация провалилась:', { numContracts, currentPrice, pointValue });
    return null;
  }

  let effectiveTargetPrice = targetEntryPrice;
  if (!targetEntryPrice || targetEntryPrice <= 0) {
    effectiveTargetPrice = currentPrice - 100;
  }

  const entries = [];
  let totalCapitalSpent = 0;
  let totalShares = 0;

  if (entryLogic === 'channel' && channelWidth > 0) {
    if (!targetEntryPrice || targetEntryPrice <= 0) {
      effectiveTargetPrice = currentPrice - (channelWidth * (numContracts - 1) * 0.5);
    }
    
    let entryPrice = currentPrice;
    let capitalForEntry = entryPrice * pointValue;
    totalCapitalSpent += capitalForEntry;
    totalShares += 1;

    entries.push({
      number: 1, price: entryPrice, capital: capitalForEntry,
      cumulativeCapital: totalCapitalSpent, remainingContracts: numContracts - 1,
      intervalFromPrevious: 0,
    });

    if (numContracts > 1) {
      entryPrice = currentPrice - channelWidth;
      capitalForEntry = entryPrice * pointValue;
      totalCapitalSpent += capitalForEntry;
      totalShares += 1;

      entries.push({
        number: 2, price: entryPrice, capital: capitalForEntry,
        cumulativeCapital: totalCapitalSpent, remainingContracts: numContracts - 2,
        intervalFromPrevious: channelWidth,
      });
    }

    for (let i = 2; i < numContracts; i++) {
      entryPrice = entries[i - 1].price - (channelWidth * 0.5);
      capitalForEntry = entryPrice * pointValue;
      totalCapitalSpent += capitalForEntry;
      totalShares += 1;

      entries.push({
        number: i + 1, price: entryPrice, capital: capitalForEntry,
        cumulativeCapital: totalCapitalSpent, remainingContracts: numContracts - i - 1,
        intervalFromPrevious: channelWidth * 0.5,
      });
    }

    const avgEntryPrice = totalCapitalSpent / (totalShares * pointValue);
    const savingsPercent = ((currentPrice - avgEntryPrice) / currentPrice) * 100;
    const totalPriceDrop = currentPrice - entries[entries.length - 1].price;
    const totalCapital = margin || (numContracts * 10000);
    const entrySL = calculateEntryStopLoss(avgEntryPrice, pointValue, entryStopLoss, numContracts, totalCapital);
    const maxDrawdown = calculateMaxDrawdown(currentPrice, effectiveTargetPrice, numContracts, pointValue, totalCapital);

    return {
      priceDrop: totalPriceDrop.toFixed(2), interval: 'Variable',
      avgEntryPrice: avgEntryPrice.toFixed(2), totalCapitalSpent: totalCapitalSpent.toFixed(2),
      savingsPercent: savingsPercent.toFixed(2), entries, entryLogic: 'channel',
      channelWidth: channelWidth.toFixed(2), firstInterval: channelWidth.toFixed(2),
      subsequentInterval: (channelWidth * 0.5).toFixed(2), stopLoss: entrySL, maxDrawdown: maxDrawdown,
    };
  } else {
    const priceDrop = currentPrice - effectiveTargetPrice;
    const interval = priceDrop / (numContracts - 1);

    for (let i = 0; i < numContracts; i++) {
      const entryPrice = currentPrice - interval * i;
      const capitalForEntry = entryPrice * pointValue;
      totalCapitalSpent += capitalForEntry;
      totalShares += 1;

      entries.push({
        number: i + 1, price: entryPrice, capital: capitalForEntry,
        cumulativeCapital: totalCapitalSpent, remainingContracts: numContracts - i - 1,
        intervalFromPrevious: i === 0 ? 0 : interval,
      });
    }

    const avgEntryPrice = totalCapitalSpent / (totalShares * pointValue);
    const savingsPercent = ((currentPrice - avgEntryPrice) / currentPrice) * 100;
    const totalCapital = margin || (numContracts * 10000);
    const entrySL = calculateEntryStopLoss(avgEntryPrice, pointValue, entryStopLoss, numContracts, totalCapital);
    const maxDrawdown = calculateMaxDrawdown(currentPrice, effectiveTargetPrice, numContracts, pointValue, totalCapital);

    return {
      priceDrop: priceDrop.toFixed(2), interval: interval.toFixed(2),
      avgEntryPrice: avgEntryPrice.toFixed(2), totalCapitalSpent: totalCapitalSpent.toFixed(2),
      savingsPercent: savingsPercent.toFixed(2), entries, entryLogic: 'uniform',
      stopLoss: entrySL, maxDrawdown: maxDrawdown,
    };
  }
};
