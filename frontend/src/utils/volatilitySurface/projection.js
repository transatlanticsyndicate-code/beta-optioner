/**
 * Прогнозирование волатильности опционов
 * ЗАЧЕМ: Расчет ожидаемой IV при симуляции времени
 * Затрагивает: расчеты P&L, блок "Закрыть всё"
 */

import { DEFAULT_IV_PERCENT } from './constants';
import { interpolateIV } from './interpolation';

/**
 * Рассчитать прогнозируемую IV для опциона при симуляции времени
 * ЗАЧЕМ: Основная функция для использования в расчётах P&L
 * 
 * Поддерживает два метода:
 * - 'simple': Упрощённая формула роста √t (по умолчанию)
 * - 'surface': Билинейная интерполяция по IV Surface (страйк + время)
 * 
 * @param {Object} option - опцион с полями: strike, impliedVolatility, date
 * @param {number} currentDaysToExpiration - текущее количество дней до экспирации
 * @param {number} simulatedDaysToExpiration - симулируемое количество дней до экспирации
 * @param {Object} ivSurface - IV Surface (опционально, для метода 'surface')
 * @param {string} method - метод прогноза: 'simple' или 'surface'
 * @returns {number} - прогнозируемая IV в процентах (например, 25 для 25%)
 */
export const getProjectedIV = (option, currentDaysToExpiration, simulatedDaysToExpiration, ivSurface = null, method = 'simple') => {
  // Получаем текущую IV опциона
  const currentIV = option.impliedVolatility || option.implied_volatility || 0.25;
  const currentIVDecimal = currentIV > 1 ? currentIV / 100 : currentIV;
  
  // Логирование для отладки
  console.log('🔮 [getProjectedIV] Вызов:', {
    strike: option.strike,
    method,
    currentDays: currentDaysToExpiration,
    simulatedDays: simulatedDaysToExpiration,
    hasIVSurface: ivSurface ? Object.keys(ivSurface).length : 0,
    currentIV: currentIVDecimal
  });
  
  // Если симулируемое время = текущему, возвращаем текущую IV
  if (simulatedDaysToExpiration >= currentDaysToExpiration || simulatedDaysToExpiration <= 0) {
    return currentIVDecimal * 100;
  }
  
  // === МЕТОД IV SURFACE ===
  // ЗАЧЕМ: Использует реальные данные IV из разных страйков и дат для интерполяции
  if (method === 'surface' && ivSurface && Object.keys(ivSurface).length > 0) {
    const strike = Number(option.strike) || 0;
    // interpolateIV возвращает IV в десятичном формате (0.25)
    const interpolatedIV = interpolateIV(ivSurface, strike, simulatedDaysToExpiration, currentIVDecimal);
    // Конвертируем в проценты
    const resultIV = interpolatedIV < 1 ? interpolatedIV * 100 : interpolatedIV;
    console.log('🔮 [getProjectedIV] IV Surface результат:', { strike, interpolatedIV, resultIV });
    return resultIV;
  }
  
  // === УПРОЩЁННЫЙ МЕТОД ===
  // ЗАЧЕМ: IV растёт плавно при приближении к экспирации по формуле √t
  const timeRatio = currentDaysToExpiration / Math.max(simulatedDaysToExpiration, 1);
  
  // Консервативная модель роста IV:
  // Используем логарифмическую функцию для плавного роста с насыщением
  // При ratio = 1: factor = 1.0 (без изменений)
  // При ratio = 2: factor ≈ 1.15
  // При ratio = 4: factor ≈ 1.30
  // При ratio = 10: factor ≈ 1.46
  // При ratio = 32: factor ≈ 1.50 (максимум)
  
  // Формула: 1 + 0.5 * (1 - 1/sqrt(timeRatio))
  // Это даёт плавный рост от 1.0 до максимума 1.5
  const growthFactor = 1 + 0.5 * (1 - 1 / Math.sqrt(timeRatio));
  
  const projectedIV = currentIVDecimal * growthFactor;
  
  return projectedIV * 100;
};

/**
 * Вычисляет индивидуальную волатильность для опциона с учётом временной структуры
 * ЗАЧЕМ: Единая функция для расчёта IV во всех модулях (таблица опционов, расчёт выхода, графики)
 * 
 * ВАЖНО: Всегда используем IV из API. Стандартная волатильность 25% — только fallback если нет данных.
 * 
 * @param {Object} option - опцион с полем impliedVolatility
 * @param {number} currentDaysToExpiration - текущее количество дней до экспирации (опционально)
 * @param {number} simulatedDaysToExpiration - симулируемое количество дней до экспирации (опционально)
 * @param {Object} ivSurface - IV Surface для интерполяции (опционально)
 * @param {string} method - метод прогноза: 'simple' или 'surface' (по умолчанию 'simple')
 * @returns {number} - волатильность в процентах (например, 25 для 25%)
 */
export const getOptionVolatility = (option, currentDaysToExpiration = null, simulatedDaysToExpiration = null, ivSurface = null, method = 'simple') => {
  // Используем индивидуальную IV каждого опциона из API
  const optIV = option.impliedVolatility || option.implied_volatility;
  if (!optIV || optIV <= 0) {
    // Fallback на стандартную волатильность если у опциона нет IV
    return DEFAULT_IV_PERCENT;
  }
  
  // Конвертируем в проценты если в десятичном формате
  const currentIVPercent = optIV < 1 ? optIV * 100 : optIV;
  
  // Если есть данные о времени — используем прогнозируемую IV
  // ЗАЧЕМ: IV обычно растёт при приближении к экспирации
  if (currentDaysToExpiration !== null && simulatedDaysToExpiration !== null && 
      simulatedDaysToExpiration < currentDaysToExpiration && simulatedDaysToExpiration > 0) {
    // Используем функцию прогнозирования IV с выбранным методом
    const projectedIV = getProjectedIV(
      option, 
      currentDaysToExpiration, 
      simulatedDaysToExpiration,
      ivSurface,
      method // Передаём метод прогноза
    );
    return projectedIV;
  }
  
  return currentIVPercent;
};
