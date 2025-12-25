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

// Парсинг пользовательской схемы выхода (например: "25,25,25,25" или "50,50")
export const parseExitScheme = (schemeString) => {
  if (!schemeString || typeof schemeString !== 'string') {
    return [];
  }
  
  try {
    const parts = schemeString.split(',').map(p => {
      const num = parseInt(p.trim());
      return isNaN(num) ? 0 : num;
    });
    
    return parts.filter(p => p > 0);
  } catch (error) {
    console.error('Error parsing exit scheme:', error);
    return [];
  }
};

// Валидация схемы выхода
export const validateExitScheme = (scheme, totalQuantity) => {
  if (!Array.isArray(scheme) || scheme.length === 0) {
    return {
      isValid: false,
      error: 'Схема выхода пуста'
    };
  }
  
  const sum = scheme.reduce((acc, val) => acc + val, 0);
  
  if (sum !== totalQuantity) {
    return {
      isValid: false,
      error: `Сумма частей (${sum}) не равна общему количеству (${totalQuantity})`
    };
  }
  
  return {
    isValid: true,
    error: null
  };
};
