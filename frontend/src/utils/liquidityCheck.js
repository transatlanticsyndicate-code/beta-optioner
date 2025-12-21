/**
 * Модуль проверки ликвидности опционов
 * ЗАЧЕМ: Предупреждает пользователя о рисках торговли неликвидными опционами
 * 
 * Неликвидные опционы имеют:
 * - Широкий bid-ask spread (сложно получить хорошую цену)
 * - Низкий Open Interest (мало участников рынка)
 * - Низкий Volume (мало сделок)
 * 
 * Затрагивает: таблицу опционов, расчёт P&L
 */

/**
 * Пороговые значения для определения ликвидности
 * ЗАЧЕМ: Стандартные критерии для оценки ликвидности опционов
 */
export const LIQUIDITY_THRESHOLDS = {
  // Open Interest (количество открытых контрактов)
  OI_LOW: 100,        // Ниже — очень низкая ликвидность
  OI_MEDIUM: 500,     // 100-500 — низкая ликвидность
  OI_HIGH: 1000,      // Выше — нормальная ликвидность
  
  // Volume (объём торгов за день)
  VOLUME_LOW: 10,     // Ниже — очень низкий объём
  VOLUME_MEDIUM: 50,  // 10-50 — низкий объём
  VOLUME_HIGH: 100,   // Выше — нормальный объём
  
  // Bid-Ask Spread (в процентах от mid price)
  SPREAD_HIGH: 0.20,  // Выше 20% — очень широкий spread
  SPREAD_MEDIUM: 0.10, // 10-20% — широкий spread
  SPREAD_LOW: 0.05,   // Ниже 5% — нормальный spread
};

/**
 * Уровни ликвидности
 */
export const LIQUIDITY_LEVELS = {
  HIGH: 'high',       // Высокая ликвидность — безопасно торговать
  MEDIUM: 'medium',   // Средняя ликвидность — осторожно
  LOW: 'low',         // Низкая ликвидность — риск проскальзывания
  VERY_LOW: 'very_low' // Очень низкая — не рекомендуется торговать
};

/**
 * Рассчитать bid-ask spread в процентах
 * ЗАЧЕМ: Spread показывает стоимость входа/выхода из позиции
 * 
 * @param {number} bid - цена покупки
 * @param {number} ask - цена продажи
 * @returns {number} - spread в процентах (0.1 = 10%)
 */
export const calculateSpreadPercent = (bid, ask) => {
  if (!bid || !ask || bid <= 0 || ask <= 0) return null;
  
  const midPrice = (bid + ask) / 2;
  if (midPrice <= 0) return null;
  
  return (ask - bid) / midPrice;
};

/**
 * Оценить ликвидность опциона
 * ЗАЧЕМ: Комплексная оценка ликвидности по нескольким критериям
 * 
 * @param {Object} option - опцион с полями: oi, volume, bid, ask
 * @returns {Object} - { level, score, warnings, details }
 */
export const assessLiquidity = (option) => {
  const oi = option.oi || option.openInterest || option.open_interest || 0;
  const volume = option.volume || 0;
  const bid = option.bid || 0;
  const ask = option.ask || 0;
  
  const warnings = [];
  const details = {};
  let score = 100; // Начинаем с максимального балла
  
  // 1. Проверка Open Interest
  details.oi = oi;
  if (oi < LIQUIDITY_THRESHOLDS.OI_LOW) {
    score -= 40;
    warnings.push(`Очень низкий OI: ${oi.toLocaleString()}`);
  } else if (oi < LIQUIDITY_THRESHOLDS.OI_MEDIUM) {
    score -= 20;
    warnings.push(`Низкий OI: ${oi.toLocaleString()}`);
  } else if (oi < LIQUIDITY_THRESHOLDS.OI_HIGH) {
    score -= 10;
  }
  
  // 2. Проверка Volume
  details.volume = volume;
  if (volume < LIQUIDITY_THRESHOLDS.VOLUME_LOW) {
    score -= 30;
    warnings.push(`Очень низкий объём: ${volume}`);
  } else if (volume < LIQUIDITY_THRESHOLDS.VOLUME_MEDIUM) {
    score -= 15;
    warnings.push(`Низкий объём: ${volume}`);
  } else if (volume < LIQUIDITY_THRESHOLDS.VOLUME_HIGH) {
    score -= 5;
  }
  
  // 3. Проверка Bid-Ask Spread
  const spreadPercent = calculateSpreadPercent(bid, ask);
  details.spreadPercent = spreadPercent;
  
  if (spreadPercent !== null) {
    if (spreadPercent > LIQUIDITY_THRESHOLDS.SPREAD_HIGH) {
      score -= 30;
      warnings.push(`Широкий spread: ${(spreadPercent * 100).toFixed(1)}%`);
    } else if (spreadPercent > LIQUIDITY_THRESHOLDS.SPREAD_MEDIUM) {
      score -= 15;
      warnings.push(`Spread: ${(spreadPercent * 100).toFixed(1)}%`);
    } else if (spreadPercent > LIQUIDITY_THRESHOLDS.SPREAD_LOW) {
      score -= 5;
    }
  } else if (bid === 0 || ask === 0) {
    // Нет котировок — очень плохо
    score -= 40;
    warnings.push('Нет котировок bid/ask');
  }
  
  // Определяем уровень ликвидности
  let level;
  if (score >= 80) {
    level = LIQUIDITY_LEVELS.HIGH;
  } else if (score >= 60) {
    level = LIQUIDITY_LEVELS.MEDIUM;
  } else if (score >= 40) {
    level = LIQUIDITY_LEVELS.LOW;
  } else {
    level = LIQUIDITY_LEVELS.VERY_LOW;
  }
  
  return {
    level,
    score: Math.max(0, score),
    warnings,
    details
  };
};

/**
 * Получить цвет индикатора ликвидности
 * ЗАЧЕМ: Визуальная индикация уровня ликвидности
 * 
 * @param {string} level - уровень ликвидности
 * @returns {Object} - { bg, text, border }
 */
export const getLiquidityColor = (level) => {
  switch (level) {
    case LIQUIDITY_LEVELS.HIGH:
      return {
        bg: 'bg-green-100',
        text: 'text-green-700',
        border: 'border-green-300',
        icon: '✓'
      };
    case LIQUIDITY_LEVELS.MEDIUM:
      return {
        bg: 'bg-yellow-100',
        text: 'text-yellow-700',
        border: 'border-yellow-300',
        icon: '⚠'
      };
    case LIQUIDITY_LEVELS.LOW:
      return {
        bg: 'bg-orange-100',
        text: 'text-orange-700',
        border: 'border-orange-300',
        icon: '⚠'
      };
    case LIQUIDITY_LEVELS.VERY_LOW:
      return {
        bg: 'bg-red-100',
        text: 'text-red-700',
        border: 'border-red-300',
        icon: '⛔'
      };
    default:
      return {
        bg: 'bg-gray-100',
        text: 'text-gray-500',
        border: 'border-gray-300',
        icon: '?'
      };
  }
};

/**
 * Получить текстовое описание уровня ликвидности
 * ЗАЧЕМ: Понятное объяснение для пользователя
 * 
 * @param {string} level - уровень ликвидности
 * @returns {string} - описание
 */
export const getLiquidityDescription = (level) => {
  switch (level) {
    case LIQUIDITY_LEVELS.HIGH:
      return 'Высокая ликвидность';
    case LIQUIDITY_LEVELS.MEDIUM:
      return 'Средняя ликвидность';
    case LIQUIDITY_LEVELS.LOW:
      return 'Низкая ликвидность';
    case LIQUIDITY_LEVELS.VERY_LOW:
      return 'Очень низкая ликвидность';
    default:
      return 'Нет данных';
  }
};

/**
 * Форматировать предупреждение о ликвидности для tooltip
 * ЗАЧЕМ: Подробная информация при наведении
 * 
 * @param {Object} assessment - результат assessLiquidity
 * @returns {string} - текст для tooltip
 */
export const formatLiquidityTooltip = (assessment) => {
  const lines = [getLiquidityDescription(assessment.level)];
  
  if (assessment.warnings.length > 0) {
    lines.push('');
    lines.push('Предупреждения:');
    assessment.warnings.forEach(w => lines.push(`• ${w}`));
  }
  
  lines.push('');
  lines.push(`Оценка: ${assessment.score}/100`);
  
  return lines.join('\n');
};
