/**
 * Расчет Stop-Loss для входа (ATR-based)
 * @param {number} avgEntryPrice - Средняя цена входа
 * @param {number} pointValue - Стоимость пункта
 * @param {number} slPoints - Stop-Loss в пунктах
 * @param {number} numContracts - Количество контрактов
 * @param {number} totalCapital - Общий капитал
 * @returns {Object} Данные Stop-Loss
 */
const calculateEntryStopLoss = (avgEntryPrice, pointValue, slPoints, numContracts, totalCapital) => {
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

/**
 * Расчет Stop-Loss для выхода (Trailing Stop-Loss)
 * @param {number} entryPrice - Цена входа
 * @param {number} pointValue - Стоимость пункта
 * @param {number} slPoints - Stop-Loss в пунктах
 * @param {number} margin - Маржин
 * @returns {Object} Данные Stop-Loss
 */
const calculateExitStopLoss = (entryPrice, pointValue, slPoints, margin) => {
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

/**
 * Расчет Risk/Reward Ratio
 * @param {number} profitTarget - Целевая прибыль
 * @param {number} totalRisk - Общий риск
 * @returns {number} Risk/Reward ratio
 */
const calculateRiskRewardRatio = (profitTarget, totalRisk) => {
  if (totalRisk <= 0) return Infinity;
  return profitTarget / totalRisk;
};

/**
 * Расчет Max Drawdown
 * @param {number} currentPrice - Текущая цена
 * @param {number} targetPrice - Целевая цена
 * @param {number} numContracts - Количество контрактов
 * @param {number} pointValue - Стоимость пункта
 * @param {number} totalCapital - Общий капитал
 * @returns {Object} Max Drawdown данные
 */
const calculateMaxDrawdown = (currentPrice, targetPrice, numContracts, pointValue, totalCapital) => {
  const maxDrawdownDollars = Math.abs(currentPrice - targetPrice) * numContracts * pointValue;
  const maxDrawdownPercent = (maxDrawdownDollars / totalCapital) * 100;

  return {
    maxDrawdownDollars: maxDrawdownDollars.toFixed(2),
    maxDrawdownPercent: maxDrawdownPercent.toFixed(2),
  };
};
export const parseExitScheme = (input) => {
  if (!input || typeof input !== 'string') return null;
  
  // Удаляем пробелы и разбиваем по запятой или плюсу
  const groups = input
    .replace(/\s/g, '')
    .split(/[,+]/)
    .map(num => parseInt(num, 10))
    .filter(num => !isNaN(num) && num > 0);
  
  return groups.length > 0 ? groups : null;
};

/**
 * Валидация схемы выхода
 * @param {Array<number>} groups - Массив размеров групп
 * @param {number} totalContracts - Общее количество контрактов
 * @returns {Object} { isValid: boolean, error: string|null }
 */
export const validateExitScheme = (groups, totalContracts) => {
  if (!groups || !Array.isArray(groups) || groups.length === 0) {
    return { isValid: false, error: 'Схема выхода не указана' };
  }
  
  const sum = groups.reduce((acc, g) => acc + g, 0);
  
  if (sum !== totalContracts) {
    return { 
      isValid: false, 
      error: `Сумма контрактов (${sum}) не равна общему количеству (${totalContracts})` 
    };
  }
  
  return { isValid: true, error: null };
};

/**
 * Расчет градуального ОТКРЫТИЯ позиций (усреднение входа)
 * @param {Object} params - Параметры расчета
 * @param {number} params.numContracts - Количество контрактов
 * @param {number} params.currentPrice - Текущая цена
 * @param {number} params.targetEntryPrice - Целевая цена входа
 * @param {number} params.pointValue - Стоимость пункта
 * @param {string} params.entryLogic - Логика усреднения: 'uniform' или 'channel'
 * @param {number} params.channelWidth - Ширина канала (только для channel логики)
 * @param {number} params.margin - Маржин
 * @param {number} params.availableCapital - Доступный капитал
 * @param {number} params.entryStopLoss - Stop-Loss в пунктах
 */
export const calculateGradualEntry = ({
  numContracts,
  currentPrice,
  targetEntryPrice,
  pointValue,
  entryLogic = 'uniform', // НОВЫЙ ПАРАМЕТР
  channelWidth = 0, // НОВЫЙ ПАРАМЕТР
  margin = 0,
  availableCapital = 0,
  entryStopLoss = 0, // НОВЫЙ ПАРАМЕТР
}) => {
  // Валидация
  if (!numContracts || !currentPrice || !pointValue) {
    console.error('Валидация провалилась:', { numContracts, currentPrice, pointValue });
    return null;
  }

  // Если targetEntryPrice = 0 или не указана, устанавливаем значение по умолчанию
  let effectiveTargetPrice = targetEntryPrice;
  if (!targetEntryPrice || targetEntryPrice <= 0) {
    effectiveTargetPrice = currentPrice - 100; // Значение по умолчанию
  }

  const entries = [];
  let totalCapitalSpent = 0;
  let totalShares = 0;

  if (entryLogic === 'channel' && channelWidth > 0) {
    // НОВАЯ ЛОГИКА: С шириной канала
    
    // Если targetEntryPrice = 0, рассчитываем автоматически
    if (!targetEntryPrice || targetEntryPrice <= 0) {
      effectiveTargetPrice = currentPrice - (channelWidth * (numContracts - 1) * 0.5);
    }
    
    // Первая покупка: по текущей цене
    let entryPrice = currentPrice;
    let capitalForEntry = entryPrice * pointValue;
    totalCapitalSpent += capitalForEntry;
    totalShares += 1;

    entries.push({
      number: 1,
      price: entryPrice,
      capital: capitalForEntry,
      cumulativeCapital: totalCapitalSpent,
      remainingContracts: numContracts - 1,
      intervalFromPrevious: 0, // Первая покупка - без интервала
    });

    // Вторая покупка: полная ширина канала
    if (numContracts > 1) {
      entryPrice = currentPrice - channelWidth;
      capitalForEntry = entryPrice * pointValue;
      totalCapitalSpent += capitalForEntry;
      totalShares += 1;

      entries.push({
        number: 2,
        price: entryPrice,
        capital: capitalForEntry,
        cumulativeCapital: totalCapitalSpent,
        remainingContracts: numContracts - 2,
        intervalFromPrevious: channelWidth, // Полная ширина
      });
    }

    // Остальные покупки: 50% от ширины канала
    for (let i = 2; i < numContracts; i++) {
      entryPrice = entries[i - 1].price - (channelWidth * 0.5);
      capitalForEntry = entryPrice * pointValue;
      totalCapitalSpent += capitalForEntry;
      totalShares += 1;

      entries.push({
        number: i + 1,
        price: entryPrice,
        capital: capitalForEntry,
        cumulativeCapital: totalCapitalSpent,
        remainingContracts: numContracts - i - 1,
        intervalFromPrevious: channelWidth * 0.5, // 50% ширины
      });
    }

    const avgEntryPrice = totalCapitalSpent / (totalShares * pointValue);
    const savingsPercent = ((currentPrice - avgEntryPrice) / currentPrice) * 100;
    const totalPriceDrop = currentPrice - entries[entries.length - 1].price;

    // Расчет Stop-Loss и Max Drawdown
    const totalCapital = margin || (numContracts * 10000); // Если маржин не указан, используем примерное значение
    const entrySL = calculateEntryStopLoss(avgEntryPrice, pointValue, entryStopLoss, numContracts, totalCapital);
    const maxDrawdown = calculateMaxDrawdown(currentPrice, effectiveTargetPrice, numContracts, pointValue, totalCapital);

    return {
      priceDrop: totalPriceDrop.toFixed(2),
      interval: 'Variable', // Переменный интервал
      avgEntryPrice: avgEntryPrice.toFixed(2),
      totalCapitalSpent: totalCapitalSpent.toFixed(2),
      savingsPercent: savingsPercent.toFixed(2),
      entries,
      entryLogic: 'channel',
      channelWidth: channelWidth.toFixed(2),
      firstInterval: channelWidth.toFixed(2),
      subsequentInterval: (channelWidth * 0.5).toFixed(2),
      stopLoss: entrySL,
      maxDrawdown: maxDrawdown,
    };

  } else {
    // СТАРАЯ ЛОГИКА: Равномерное усреднение
    const priceDrop = currentPrice - effectiveTargetPrice;
    const interval = priceDrop / (numContracts - 1);

    for (let i = 0; i < numContracts; i++) {
      const entryPrice = currentPrice - interval * i;
      const capitalForEntry = entryPrice * pointValue;
      totalCapitalSpent += capitalForEntry;
      totalShares += 1;

      entries.push({
        number: i + 1,
        price: entryPrice,
        capital: capitalForEntry,
        cumulativeCapital: totalCapitalSpent,
        remainingContracts: numContracts - i - 1,
        intervalFromPrevious: i === 0 ? 0 : interval, // Равномерный интервал
      });
    }

    const avgEntryPrice = totalCapitalSpent / (totalShares * pointValue);
    const savingsPercent = ((currentPrice - avgEntryPrice) / currentPrice) * 100;

    // Расчет Stop-Loss и Max Drawdown
    const totalCapital = margin || (numContracts * 10000);
    const entrySL = calculateEntryStopLoss(avgEntryPrice, pointValue, entryStopLoss, numContracts, totalCapital);
    const maxDrawdown = calculateMaxDrawdown(currentPrice, effectiveTargetPrice, numContracts, pointValue, totalCapital);

    return {
      priceDrop: priceDrop.toFixed(2),
      interval: interval.toFixed(2),
      avgEntryPrice: avgEntryPrice.toFixed(2),
      totalCapitalSpent: totalCapitalSpent.toFixed(2),
      savingsPercent: savingsPercent.toFixed(2),
      entries,
      entryLogic: 'uniform',
      stopLoss: entrySL,
      maxDrawdown: maxDrawdown,
    };
  }
};

/**
 * Расчет градуального ЗАКРЫТИЯ позиций (фиксация прибыли)
 * @param {Object} params - Параметры расчета
 * @param {number} params.numContracts - Общее количество контрактов
 * @param {number} params.entryPrice - Цена входа
 * @param {number} params.margin - Маржин
 * @param {number} params.targetProfitPercent - Целевая прибыль в %
 * @param {number} params.pointValue - Стоимость пункта
 * @param {Array<number>} params.exitGroups - Схема выхода группами (например, [2, 3, 3])
 */
export const calculateGradualExit = ({
  numContracts,
  entryPrice,
  margin,
  targetProfitPercent,
  pointValue,
  exitGroups = null, // НОВЫЙ ПАРАМЕТР для групповых выходов
}) => {
  // Валидация
  if (!numContracts || !entryPrice || !margin || !targetProfitPercent || !pointValue) {
    return null;
  }

  // Целевая прибыль в долларах
  const targetProfitUSD = margin * (targetProfitPercent / 100);

  // Если не указаны группы, используем равномерный выход по 1 контракту
  const groups = exitGroups || Array(numContracts).fill(1);
  
  // Валидация групп
  const totalInGroups = groups.reduce((sum, g) => sum + g, 0);
  if (totalInGroups !== numContracts) {
    console.error('Сумма контрактов в группах не равна общему количеству');
    return null;
  }

  // Рассчитываем интервал между ГРУППАМИ
  // Формула: учитываем что каждая группа закрывает разное количество контрактов
  let weightedSum = 0;
  let cumulativeContracts = 0;
  groups.forEach((groupSize, idx) => {
    cumulativeContracts += groupSize;
    weightedSum += groupSize * cumulativeContracts;
  });
  
  const interval = targetProfitUSD / (weightedSum * pointValue);

  // Рассчитываем цены закрытия для каждой ГРУППЫ
  const exits = [];
  let cumulativeProfit = 0;
  let contractsClosedSoFar = 0;
  let contractsRemaining = numContracts;

  groups.forEach((groupSize, i) => {
    contractsClosedSoFar += groupSize;
    const exitPrice = entryPrice + interval * contractsClosedSoFar;
    const priceGain = exitPrice - entryPrice;
    contractsRemaining -= groupSize;
    
    // Прибыль за эту группу
    const profitForGroup = priceGain * pointValue * groupSize;
    cumulativeProfit += profitForGroup;

    exits.push({
      number: i + 1,
      groupSize: groupSize, // НОВОЕ ПОЛЕ
      price: exitPrice,
      gain: priceGain,
      profitPerContract: profitForGroup,
      remainingContracts: contractsRemaining,
      cumulativeProfit,
      contractsClosedSoFar,
    });
  });

  // Финальная цена
  const finalPrice = entryPrice + interval * numContracts;

  // Общий рост цены
  const totalPriceGain = finalPrice - entryPrice;

  // Отклонение от целевой прибыли
  const actualProfit = cumulativeProfit;
  const deviation = actualProfit - targetProfitUSD;
  const deviationPercent = (deviation / targetProfitUSD) * 100;

  // ROI
  const roi = (actualProfit / margin) * 100;

  // Расчет Stop-Loss для выхода
  const exitSL = calculateExitStopLoss(entryPrice, pointValue, 0, margin); // slPoints = 0 по умолчанию

  // Расчет Risk/Reward Ratio (используем целевую прибыль и потенциальный риск)
  const potentialRisk = (entryPrice * 0.05) * pointValue * numContracts; // Примерный риск 5% от цены входа
  const riskRewardRatio = calculateRiskRewardRatio(parseFloat(targetProfitUSD), potentialRisk);

  return {
    targetProfitUSD: targetProfitUSD.toFixed(2),
    interval: interval.toFixed(2),
    totalPriceGain: totalPriceGain.toFixed(2),
    finalPrice: finalPrice.toFixed(2),
    actualProfit: actualProfit.toFixed(2),
    deviation: deviation.toFixed(2),
    deviationPercent: deviationPercent.toFixed(2),
    roi: roi.toFixed(2),
    riskRewardRatio: riskRewardRatio === Infinity ? '∞' : riskRewardRatio.toFixed(2),
    exits,
    exitGroups: groups, // Сохраняем схему выхода в результатах
    stopLoss: exitSL,
  };
};

/**
 * Генерация данных для графика P&L при открытии
 */
export const generateEntryChartData = (entryResults, currentPrice, targetPrice) => {
  if (!entryResults) return [];

  const data = [];
  const priceStep = (currentPrice - targetPrice) / 50; // 50 точек на графике

  for (let i = 0; i <= 50; i++) {
    const price = currentPrice - priceStep * i;
    
    // Сколько контрактов уже открыто на этой цене
    const openedContracts = entryResults.entries.filter(
      (e) => e.price >= price
    ).length;

    // Средняя цена открытых контрактов
    const openedEntries = entryResults.entries.filter((e) => e.price >= price);
    const avgPrice =
      openedContracts > 0
        ? openedEntries.reduce((sum, e) => sum + e.price, 0) / openedContracts
        : currentPrice;

    data.push({
      price: price.toFixed(2),
      avgCost: avgPrice.toFixed(2),
      contractsOpened: openedContracts,
    });
  }

  return data;
};

/**
 * Генерация данных для графика P&L при закрытии
 */
export const generateExitChartData = (exitResults, entryPrice) => {
  if (!exitResults) return [];

  const data = [];
  const priceRange = parseFloat(exitResults.finalPrice) - entryPrice;
  const priceStep = priceRange / 50;

  for (let i = 0; i <= 50; i++) {
    const price = entryPrice + priceStep * i;

    // Сколько контрактов закрыто на этой цене
    const closedContracts = exitResults.exits.filter(
      (e) => e.price <= price
    ).length;

    // Накопленная прибыль на этой цене
    const closedExits = exitResults.exits.filter((e) => e.price <= price);
    const cumulativeProfit =
      closedContracts > 0
        ? closedExits[closedExits.length - 1].cumulativeProfit
        : 0;

    data.push({
      price: price.toFixed(2),
      profit: parseFloat(cumulativeProfit).toFixed(2),
      contractsClosed: closedContracts,
    });
  }

  return data;
};

/**
 * Сравнение стратегий с разными ROI
 */
export const compareStrategies = (baseParams, roiVariants = [50, 100, 150]) => {
  return roiVariants.map((roi) => {
    const result = calculateGradualExit({
      ...baseParams,
      targetProfitPercent: roi,
    });

    return {
      roi,
      ...result,
    };
  });
};

// Экспорт вспомогательных функций
export { calculateEntryStopLoss, calculateExitStopLoss, calculateRiskRewardRatio, calculateMaxDrawdown };
