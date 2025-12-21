/**
 * Построение IV Surface из данных опционов
 * ЗАЧЕМ: Создание структуры данных для интерполяции волатильности
 * Затрагивает: загрузка опционов, кэширование IV
 */

import { getDaysUntilExpirationUTC } from '../dateUtils';

/**
 * Построить IV Surface из массива опционов с разными датами экспирации
 * ЗАЧЕМ: Создаёт структуру данных для интерполяции IV
 * 
 * Структура данных IV Surface:
 * {
 *   [strike]: {
 *     [daysToExpiration]: impliedVolatility
 *   }
 * }
 * 
 * @param {Array} optionsData - массив опционов с полями: strike, daysToExpiration, impliedVolatility
 * @returns {Object} - IV Surface структура
 */
export const buildIVSurface = (optionsData) => {
  const surface = {};
  
  optionsData.forEach(option => {
    const strike = option.strike;
    const days = option.daysToExpiration || option.days_to_expiration;
    const iv = option.impliedVolatility || option.implied_volatility;
    
    if (strike && days > 0 && iv > 0) {
      if (!surface[strike]) {
        surface[strike] = {};
      }
      // Конвертируем IV в десятичный формат если нужно
      surface[strike][days] = iv > 1 ? iv / 100 : iv;
    }
  });
  
  return surface;
};

/**
 * Создать IV Surface из загруженных опционов для нескольких дат экспирации
 * ЗАЧЕМ: Собирает данные IV из всех загруженных опционов
 * 
 * @param {Object} strikesByDate - объект { date: [strikes] }
 * @param {Object} optionDetailsCache - кэш деталей опционов с IV
 * @returns {Object} - IV Surface структура
 */
export const buildIVSurfaceFromCache = (strikesByDate, optionDetailsCache) => {
  const surface = {};
  
  Object.entries(optionDetailsCache).forEach(([key, optionData]) => {
    if (!optionData || !optionData.strike) return;
    
    const strike = optionData.strike;
    const iv = optionData.impliedVolatility || optionData.implied_volatility;
    
    // Вычисляем дни до экспирации
    // ВАЖНО: Используем UTC для консистентности между часовыми поясами
    let daysToExpiration = 30; // default
    const dateStr = optionData.date || optionData.expiration_date;
    if (dateStr) {
      daysToExpiration = getDaysUntilExpirationUTC(dateStr);
    }
    
    if (strike && daysToExpiration > 0 && iv > 0) {
      if (!surface[strike]) {
        surface[strike] = {};
      }
      // Конвертируем IV в десятичный формат если нужно
      surface[strike][daysToExpiration] = iv > 1 ? iv / 100 : iv;
    }
  });
  
  return surface;
};
