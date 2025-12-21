/**
 * Интерполяция значений волатильности
 * ЗАЧЕМ: Получение IV для произвольных страйков и сроков
 * Затрагивает: расчеты P&L, прогнозирование цен
 */

// Линейная интерполяция между двумя значениями
// ЗАЧЕМ: Базовая функция для интерполяции
const lerp = (v0, v1, t) => v0 + t * (v1 - v0);

/**
 * Интерполировать IV для заданного страйка и времени до экспирации
 * ЗАЧЕМ: Получить прогнозируемую IV для будущей даты
 * 
 * @param {Object} surface - IV Surface структура
 * @param {number} strike - страйк опциона
 * @param {number} targetDays - целевое количество дней до экспирации
 * @param {number} fallbackIV - IV по умолчанию если интерполяция невозможна
 * @returns {number} - интерполированная IV (в десятичном формате, например 0.25)
 */
export const interpolateIV = (surface, strike, targetDays, fallbackIV = 0.25) => {
  if (!surface || Object.keys(surface).length === 0) {
    return fallbackIV;
  }
  
  // Шаг 1: Найти ближайшие страйки
  const strikes = Object.keys(surface).map(Number).sort((a, b) => a - b);
  
  if (strikes.length === 0) {
    return fallbackIV;
  }
  
  // Найти два ближайших страйка для интерполяции
  let lowerStrike = strikes[0];
  let upperStrike = strikes[strikes.length - 1];
  
  for (let i = 0; i < strikes.length; i++) {
    if (strikes[i] <= strike) {
      lowerStrike = strikes[i];
    }
    if (strikes[i] >= strike && upperStrike === strikes[strikes.length - 1]) {
      upperStrike = strikes[i];
      break;
    }
  }
  
  // Шаг 2: Интерполировать по времени для каждого страйка
  const interpolateByTime = (strikeData, days) => {
    if (!strikeData || Object.keys(strikeData).length === 0) {
      return null;
    }
    
    const timePoints = Object.keys(strikeData).map(Number).sort((a, b) => a - b);
    
    // Если точное совпадение
    if (strikeData[days] !== undefined) {
      return strikeData[days];
    }
    
    // Если меньше минимального времени - экстраполяция с учётом роста IV
    if (days < timePoints[0]) {
      // IV обычно растёт при приближении к экспирации
      // Используем формулу: IV_new = IV_old * sqrt(T_old / T_new)
      const nearestIV = strikeData[timePoints[0]];
      const ratio = Math.sqrt(timePoints[0] / Math.max(days, 1));
      // Ограничиваем рост IV максимум в 2 раза
      return Math.min(nearestIV * ratio, nearestIV * 2);
    }
    
    // Если больше максимального времени - используем последнее значение
    if (days > timePoints[timePoints.length - 1]) {
      return strikeData[timePoints[timePoints.length - 1]];
    }
    
    // Линейная интерполяция между двумя ближайшими точками
    let lowerTime = timePoints[0];
    let upperTime = timePoints[timePoints.length - 1];
    
    for (let i = 0; i < timePoints.length - 1; i++) {
      if (timePoints[i] <= days && timePoints[i + 1] >= days) {
        lowerTime = timePoints[i];
        upperTime = timePoints[i + 1];
        break;
      }
    }
    
    const t = (days - lowerTime) / (upperTime - lowerTime);
    return lerp(strikeData[lowerTime], strikeData[upperTime], t);
  };
  
  // Интерполяция по времени для нижнего и верхнего страйков
  const lowerIV = interpolateByTime(surface[lowerStrike], targetDays);
  const upperIV = interpolateByTime(surface[upperStrike], targetDays);
  
  if (lowerIV === null && upperIV === null) {
    return fallbackIV;
  }
  
  if (lowerIV === null) return upperIV;
  if (upperIV === null) return lowerIV;
  
  // Шаг 3: Интерполяция между страйками
  if (lowerStrike === upperStrike) {
    return lowerIV;
  }
  
  const strikeT = (strike - lowerStrike) / (upperStrike - lowerStrike);
  return lerp(lowerIV, upperIV, strikeT);
};
