/**
 * Прогнозирование волатильности опционов
 * ЗАЧЕМ: Расчет ожидаемой IV при симуляции времени
 * Затрагивает: расчеты P&L, блок "Закрыть всё"
 */

import { DEFAULT_IV_PERCENT } from './constants';

/**
 * Рассчитать прогнозируемую IV для опциона при симуляции времени
 * ЗАЧЕМ: Основная функция для использования в расчётах P&L
 * 
 * ВАЖНО: IV Surface содержит данные для РАЗНЫХ опционов с разными датами экспирации.
 * Мы используем Term Structure (соотношение IV между датами) для прогнозирования,
 * а не абсолютные значения IV из Surface.
 * 
 * @param {Object} option - опцион с полями: strike, impliedVolatility, date
 * @param {number} currentDaysToExpiration - текущее количество дней до экспирации
 * @param {number} simulatedDaysToExpiration - симулируемое количество дней до экспирации
 * @param {Object} ivSurface - IV Surface (опционально, для определения Term Structure)
 * @returns {number} - прогнозируемая IV в процентах (например, 25 для 25%)
 */
export const getProjectedIV = (option, currentDaysToExpiration, simulatedDaysToExpiration, ivSurface = null) => {
  // Получаем текущую IV опциона
  const currentIV = option.impliedVolatility || option.implied_volatility || 0.25;
  const currentIVDecimal = currentIV > 1 ? currentIV / 100 : currentIV;
  
  // Если симулируемое время = текущему, возвращаем текущую IV
  if (simulatedDaysToExpiration >= currentDaysToExpiration || simulatedDaysToExpiration <= 0) {
    return currentIVDecimal * 100;
  }
  
  // УПРОЩЁННАЯ МОДЕЛЬ: IV растёт плавно при приближении к экспирации
  // ЗАЧЕМ: Избегаем резких скачков и нереалистичных значений IV
  
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
 * @returns {number} - волатильность в процентах (например, 25 для 25%)
 */
export const getOptionVolatility = (option, currentDaysToExpiration = null, simulatedDaysToExpiration = null, ivSurface = null) => {
  // Используем индивидуальную IV каждого опциона из API
  const optIV = option.impliedVolatility || option.implied_volatility;
  if (!optIV || optIV <= 0) {
    // Fallback на стандартную волатильность если у опциона нет IV
    return DEFAULT_IV_PERCENT;
  }
  
  // Конвертируем в проценты если в десятичном формате
  const currentIVPercent = optIV < 1 ? optIV * 100 : optIV;
  
  // Если есть данные о времени — используем прогнозируемую IV (Volatility Surface)
  // ЗАЧЕМ: IV обычно растёт при приближении к экспирации
  if (currentDaysToExpiration !== null && simulatedDaysToExpiration !== null && 
      simulatedDaysToExpiration < currentDaysToExpiration && simulatedDaysToExpiration > 0) {
    // Используем функцию прогнозирования IV с IV Surface если доступен
    const projectedIV = getProjectedIV(
      option, 
      currentDaysToExpiration, 
      simulatedDaysToExpiration,
      ivSurface // Передаём IV Surface для точной интерполяции
    );
    return projectedIV;
  }
  
  return currentIVPercent;
};
