/**
 * Volatility Surface - модуль для работы с поверхностью волатильности
 * ЗАЧЕМ: Обеспечивает более точное прогнозирование цены опциона при симуляции времени
 * 
 * Volatility Surface - это 3D модель, где IV зависит от:
 * - Strike (монетность опциона)
 * - Time to Expiration (время до экспирации)
 * 
 * Затрагивает: расчёты P&L, блок "Закрыть всё", графики
 */

import { getDaysUntilExpirationUTC } from './dateUtils';

/**
 * Структура данных IV Surface:
 * {
 *   [strike]: {
 *     [daysToExpiration]: impliedVolatility
 *   }
 * }
 * 
 * Пример:
 * {
 *   450: { 7: 0.35, 14: 0.30, 30: 0.25, 60: 0.22 },
 *   455: { 7: 0.32, 14: 0.28, 30: 0.24, 60: 0.21 },
 *   460: { 7: 0.30, 14: 0.26, 30: 0.23, 60: 0.20 }
 * }
 */

/**
 * Построить IV Surface из массива опционов с разными датами экспирации
 * ЗАЧЕМ: Создаёт структуру данных для интерполяции IV
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
 * Линейная интерполяция между двумя значениями
 */
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

/**
 * Рассчитать прогнозируемую IV для опциона при симуляции времени
 * ЗАЧЕМ: Основная функция для использования в расчётах P&L
 *
 * Использует модель Ornstein-Uhlenbeck (mean reversion) если доступны
 * калиброванные параметры iv_mean и iv_kappa из ticker_overrides.json.
 * Иначе — консервативный fallback (IV не меняется).
 *
 * Формула OU: IV(t+dt) = iv_mean + (IV(t) - iv_mean) * exp(-kappa * dt)
 * Где dt — прошедшее время в годах (daysPassed / 365)
 *
 * @param {Object} option - опцион с полями: strike, impliedVolatility, date
 * @param {number} currentDaysToExpiration - текущее количество дней до экспирации
 * @param {number} simulatedDaysToExpiration - симулируемое количество дней до экспирации
 * @param {Object} ivSurface - IV Surface (опционально, для определения Term Structure)
 * @param {Object} ouParams - параметры OU модели: { iv_mean, iv_kappa } (опционально)
 * @returns {number} - прогнозируемая IV в процентах (например, 25 для 25%)
 */
export const getProjectedIV = (option, currentDaysToExpiration, simulatedDaysToExpiration, ivSurface = null, ouParams = null, manualIvOverride = null) => {
  // Базовая IV: manualIvOverride или IV из API
  // ЗАЧЕМ: Caller (getOptionVolatility) уже решил с какой точки проецировать (entry или today)
  const baseIV = manualIvOverride ?? option.impliedVolatility ?? option.implied_volatility ?? 0.25;
  const baseIVDecimal = baseIV > 1 ? baseIV / 100 : baseIV;

  // Если нет смысла проецировать — возвращаем базовую IV
  if (simulatedDaysToExpiration >= currentDaysToExpiration || simulatedDaysToExpiration <= 0) {
    return baseIVDecimal * 100;
  }

  // Количество прошедших дней от текущей точки до симулируемой даты
  const daysPassed = currentDaysToExpiration - simulatedDaysToExpiration;

  // МОДЕЛЬ ORNSTEIN-UHLENBECK (mean reversion)
  // ЗАЧЕМ: Если IV сейчас выше среднего — она будет падать, если ниже — расти.
  //        Это устраняет систематическую ошибку "замороженной IV".
  if (ouParams && ouParams.iv_mean != null && ouParams.iv_kappa != null) {
    const ivMean = ouParams.iv_mean;   // долгосрочное среднее (в долях, например 0.35)

    // Ограничиваем kappa: AR(1) на дневных данных даёт завышенные значения (80-100/год),
    // что приводит к мгновенному возврату IV к среднему уже за 3-5 дней.
    // Реалистичный диапазон для опционных IV: 5-20/год (half-life 13-50 дней).
    // ЗАЧЕМ: При kappa=100 и dt=7дней decay=exp(-1.9)=0.15 — IV почти сразу замерзает на iv_mean.
    const kappa = Math.min(ouParams.iv_kappa, 20.0);

    // dt — прошедшее время в годах
    const dt = daysPassed / 365.0;

    // OU формула: IV(t+dt) = iv_mean + (IV(t) - iv_mean) * exp(-kappa * dt)
    const decayFactor = Math.exp(-kappa * dt);
    const projectedIVDecimal = ivMean + (baseIVDecimal - ivMean) * decayFactor;

    // Ограничиваем результат разумными пределами (5% ... 300%)
    const clampedIV = Math.max(0.05, Math.min(3.0, projectedIVDecimal));

    return clampedIV * 100;
  }

  // FALLBACK: нет калибровочных данных — IV остаётся равной базовой (плоская модель)
  // ЗАЧЕМ: старая эвристика роста IV при приближении к экспирации систематически завышала
  // прогнозную стоимость купленных опционов. На реальной сделке ADBE эвристика давала
  // прогноз Start P&L −$2 259 против факта −$3 224, а с плоской IV прогноз −$3 061 —
  // почти совпадает с рынком. Без калибровочных данных под конкретный тикер честнее
  // держать IV постоянной, чем угадывать направление и силу изменения.
  return baseIVDecimal * 100;
};

/**
 * Рассчитать коэффициент изменения IV на основе Term Structure
 * ЗАЧЕМ: Определяет как IV меняется при переходе от одного срока к другому
 * 
 * Логика: находим в IV Surface опционы с близкими сроками к currentDays и simulatedDays,
 * вычисляем соотношение их IV, и применяем это соотношение к текущей IV опциона.
 * 
 * @param {Object} surface - IV Surface структура
 * @param {number} strike - страйк опциона
 * @param {number} currentDays - текущее количество дней до экспирации
 * @param {number} simulatedDays - симулируемое количество дней до экспирации
 * @returns {number} - коэффициент изменения IV (например, 1.1 означает рост на 10%)
 */
const getTermStructureRatio = (surface, strike, currentDays, simulatedDays) => {
  // Находим ближайший страйк в Surface
  const strikes = Object.keys(surface).map(Number).sort((a, b) => a - b);
  if (strikes.length === 0) return null; // null означает "использовать fallback"
  
  // Находим ближайший страйк
  let closestStrike = strikes[0];
  let minDiff = Math.abs(strikes[0] - strike);
  for (const s of strikes) {
    const diff = Math.abs(s - strike);
    if (diff < minDiff) {
      minDiff = diff;
      closestStrike = s;
    }
  }
  
  const strikeData = surface[closestStrike];
  if (!strikeData || Object.keys(strikeData).length === 0) return null;
  
  const timePoints = Object.keys(strikeData).map(Number).sort((a, b) => a - b);
  if (timePoints.length < 2) return null;
  
  const minTime = timePoints[0];
  const maxTime = timePoints[timePoints.length - 1];
  
  // ВАЖНО: Если оба значения (currentDays и simulatedDays) за пределами IV Surface,
  // возвращаем null чтобы использовать fallback модель
  // ЗАЧЕМ: IV Surface не содержит данных для этого диапазона времени
  if (currentDays > maxTime && simulatedDays > maxTime) {
    return null; // Оба за пределами — используем fallback
  }
  
  // Находим IV для ближайших точек к currentDays и simulatedDays
  const findClosestIV = (targetDays) => {
    // Точное совпадение
    if (strikeData[targetDays] !== undefined) {
      return strikeData[targetDays];
    }
    
    // Если targetDays меньше минимума - экстраполяция с учётом роста IV
    if (targetDays < minTime) {
      // IV растёт при приближении к экспирации: IV_new = IV_old * sqrt(T_old / T_new)
      const nearestIV = strikeData[minTime];
      const ratio = Math.sqrt(minTime / Math.max(targetDays, 1));
      return Math.min(nearestIV * ratio, nearestIV * 2); // Ограничиваем рост в 2 раза
    }
    
    // Если targetDays больше максимума - экстраполяция с учётом снижения IV
    if (targetDays > maxTime) {
      // IV снижается при удалении от экспирации: IV_new = IV_old * sqrt(T_old / T_new)
      const nearestIV = strikeData[maxTime];
      const ratio = Math.sqrt(maxTime / targetDays);
      return nearestIV * ratio;
    }
    
    // Находим две ближайшие точки для интерполяции
    let lowerTime = minTime;
    let upperTime = maxTime;
    
    for (let i = 0; i < timePoints.length - 1; i++) {
      if (timePoints[i] <= targetDays && timePoints[i + 1] >= targetDays) {
        lowerTime = timePoints[i];
        upperTime = timePoints[i + 1];
        break;
      }
    }
    
    // Линейная интерполяция
    const t = (targetDays - lowerTime) / (upperTime - lowerTime);
    return lerp(strikeData[lowerTime], strikeData[upperTime], t);
  };
  
  const ivAtCurrentDays = findClosestIV(currentDays);
  const ivAtSimulatedDays = findClosestIV(simulatedDays);
  
  // Вычисляем коэффициент изменения
  // Если IV для более короткого срока выше (что типично), ratio > 1
  if (ivAtCurrentDays <= 0) return null;
  
  const ratio = ivAtSimulatedDays / ivAtCurrentDays;
  
  // Ограничиваем коэффициент разумными пределами (0.5 - 2.0)
  // ЗАЧЕМ: Избегаем экстремальных значений из-за шума в данных
  return Math.max(0.5, Math.min(ratio, 2.0));
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
 * @param {string} mode - режим расчёта (не используется, оставлен для совместимости)
 * @param {Object} ouParams - параметры Ornstein-Uhlenbeck: { iv_mean, iv_kappa } (опционально)
 * @returns {number} - волатильность в процентах (например, 25 для 25%)
 */
export const getOptionVolatility = (option, currentDaysToExpiration = null, simulatedDaysToExpiration = null, ivSurface = null, mode = null, ouParams = null, manualIvOverride = null, todayDaysToExpiration = null) => {
  // Fallback IV если у опциона нет данных из API
  const DEFAULT_IV = 25;

  // ЗАЧЕМ: manualIvOverride имеет приоритет над IV из API
  // ВАЖНО: Пересчитываем IV от даты ввода manualIvOverride до целевой даты (сегодня или позиция ползунка)
  // ЗАЧЕМ: IV должна равняться manualIvOverride только в день ввода, а в другие дни — пересчитываться
  if (manualIvOverride && manualIvOverride > 0) {
    const manualIVPercent = manualIvOverride < 1 ? manualIvOverride * 100 : manualIvOverride;
    
    // Получаем дату ввода manualIvOverride (если есть)
    // ЗАЧЕМ: От этой даты начинается перерасчёт IV
    // ВАЖНО: Миграция для старых записей — если нет manualIvOverrideDate, используем entryDate или today
    let overrideDate = option.manualIvOverrideDate;
    if (!overrideDate && manualIvOverride) {
      // Миграция: для старых записей используем entryDate или сегодняшнюю дату
      overrideDate = option.entryDate || new Date().toISOString().split('T')[0];
      console.log('🔄 [getOptionVolatility] Миграция: используем entryDate вместо manualIvOverrideDate:', overrideDate);
    }
    
    // DEBUG: Логируем для отладки
    console.log('📊 [getOptionVolatility]', {
      optionId: option.id,
      manualIvOverride,
      overrideDate,
      manualIvOverrideDate: option.manualIvOverrideDate,
      currentDaysToExpiration,
      simulatedDaysToExpiration,
      todayDaysToExpiration
    });
    
    // Если даты ввода нет — возвращаем manualIvOverride (старое поведение для совместимости)
    if (!overrideDate) {
      console.log('  ⚠️ [getOptionVolatility] Нет overrideDate, возвращаем manualIvOverride');
      return manualIVPercent;
    }
    
    // Определяем базовую точку: дни до экспирации на момент ввода Fact IV
    // todayDaysToExpiration = дни до экспирации от СЕГОДНЯ
    // daysSinceOverride = сколько дней прошло с момента ввода
    // baseDays = дни до экспирации на момент ввода = todayDays + daysSinceOverride
    const today = new Date().toISOString().split('T')[0];
    const overrideDateObj = new Date(overrideDate);
    const todayObj = new Date(today);
    const daysSinceOverride = Math.floor((todayObj - overrideDateObj) / (1000 * 60 * 60 * 24));
    
    const todayDays = todayDaysToExpiration ?? currentDaysToExpiration ?? 0;
    const baseDaysToExpiration = todayDays + daysSinceOverride;
    
    // Определяем целевую точку: куда смотрим (сегодня или позиция ползунка)
    const targetDaysToExpiration = (simulatedDaysToExpiration !== null && simulatedDaysToExpiration !== undefined)
      ? simulatedDaysToExpiration
      : todayDays;
    
    console.log('  📅 [getOptionVolatility] Расчёт:', {
      today,
      daysSinceOverride,
      todayDays,
      baseDaysToExpiration,
      targetDaysToExpiration
    });
    
    // Если целевая дата == дате ввода — возвращаем manualIvOverride напрямую
    // ЗАЧЕМ: В день ввода IV должна равняться введённому значению
    const daysFromBaseToTarget = baseDaysToExpiration - targetDaysToExpiration;
    const targetDate = new Date(overrideDate);
    targetDate.setDate(targetDate.getDate() + daysFromBaseToTarget);
    const targetDateStr = targetDate.toISOString().split('T')[0];
    
    console.log('  🎯 [getOptionVolatility] Целевая дата:', { targetDateStr, overrideDate });
    
    if (overrideDate === targetDateStr) {
      console.log('  ✅ [getOptionVolatility] Дата совпадает, возвращаем manualIvOverride');
      return manualIVPercent;
    }
    
    // Пересчитываем IV от даты ввода до целевой даты (сегодня или позиция ползунка)
    // ЗАЧЕМ: Используем getProjectedIV для расчёта изменения IV за прошедшие/будущие дни
    const projectedIV = getProjectedIV(
      option,
      baseDaysToExpiration,  // дни до экспирации от даты ввода (базовая точка)
      targetDaysToExpiration,  // целевая дата (сегодня или позиция ползунка)
      ivSurface,
      ouParams,
      manualIvOverride  // якорное значение IV
    );
    
    console.log('   [getOptionVolatility] Projected IV:', projectedIV);
    
    return projectedIV;
  }

  // Стандартная логика без manualIvOverride
  const optIV = option.impliedVolatility ?? option.implied_volatility;
  if (!optIV || optIV <= 0) {
    return DEFAULT_IV;
  }

  // Конвертируем в проценты если в десятичном формате
  const currentIVPercent = optIV < 1 ? optIV * 100 : optIV;

  // Если есть данные о времени — используем прогнозируемую IV
  // ЗАЧЕМ: Передаём ouParams для Ornstein-Uhlenbeck модели если доступны
  if (currentDaysToExpiration !== null && simulatedDaysToExpiration !== null &&
      simulatedDaysToExpiration < currentDaysToExpiration && simulatedDaysToExpiration > 0) {
    return getProjectedIV(option, currentDaysToExpiration, simulatedDaysToExpiration, ivSurface, ouParams, null);
  }

  return currentIVPercent;
};

/**
 * Экспорт констант для настройки поведения
 */
export const IV_SURFACE_CONFIG = {
  // Максимальный коэффициент роста IV при приближении к экспирации
  MAX_IV_GROWTH_RATIO: 1.5,
  
  // Минимальное количество дней для расчёта (избегаем деления на 0)
  MIN_DAYS_FOR_CALCULATION: 1,
  
  // IV по умолчанию если нет данных
  DEFAULT_IV: 0.25
};
