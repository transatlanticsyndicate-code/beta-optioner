/**
 * Утилиты для работы с датами в опционном калькуляторе
 * ЗАЧЕМ: Обеспечивает единообразный расчёт дат по UTC для всех пользователей
 * Затрагивает: PLChart, usePositionExitCalculator, metricsCalculator
 * 
 * ВАЖНО: Все расчёты дней до экспирации должны использовать UTC,
 * чтобы пользователи в разных часовых поясах видели одинаковые результаты
 */

/**
 * Вычисляет количество дней между сегодняшней датой (UTC) и датой экспирации
 * ЗАЧЕМ: Единообразный расчёт для всех часовых поясов
 * 
 * @param {string} dateStr - Дата экспирации в формате YYYY-MM-DD
 * @returns {number} Количество дней от сегодня (UTC)
 */
export function getDaysUntilExpirationUTC(dateStr) {
  if (!dateStr) return 0;
  
  // Получаем текущую дату в UTC (без времени)
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  
  // Парсим дату экспирации как UTC (YYYY-MM-DD)
  const [year, month, day] = dateStr.split('-').map(Number);
  const expDateUTC = Date.UTC(year, month - 1, day); // month - 1, т.к. месяцы 0-indexed
  
  const diffTime = expDateUTC - todayUTC;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

/**
 * Вычисляет оставшиеся дни до экспирации для опциона с учётом прошедших дней
 * ЗАЧЕМ: Используется в графике P&L и расчёте выхода из позиции
 * 
 * IMPORTANT: Использует UTC для консистентности между часовыми поясами
 * 
 * Для зафиксированных позиций (isLockedPosition=true) используем сохранённое
 * initialDaysToExpiration, а не вычисляем от сегодняшней даты.
 * ЗАЧЕМ: При открытии сохранённой позиции дни должны считаться от даты сохранения.
 * 
 * @param {Object} option - Опцион с полем date (YYYY-MM-DD) и опционально initialDaysToExpiration
 * @param {number} daysPassed - Прошедшие дни (от даты сохранения для locked, от сегодня для обычных)
 * @param {number} defaultDays - Дефолтное значение если нет даты (по умолчанию 30)
 * @returns {number} Оставшиеся дни до экспирации (не меньше 0)
 */
export function calculateDaysRemainingUTC(option, daysPassed = 0, defaultDays = 30) {
  if (!option?.date) {
    return Math.max(0, defaultDays - daysPassed);
  }
  
  // Для зафиксированных позиций используем сохранённое initialDaysToExpiration
  // ЗАЧЕМ: daysPassed считается от даты сохранения, а не от сегодня
  let initialDaysToExpiration;
  if (option.isLockedPosition && option.initialDaysToExpiration !== undefined) {
    initialDaysToExpiration = option.initialDaysToExpiration;
  } else {
    // Для обычных позиций вычисляем от сегодня по UTC
    initialDaysToExpiration = getDaysUntilExpirationUTC(option.date);
  }
  
  // Оставшиеся дни = изначальные - прошедшие (симуляция)
  return Math.max(0, initialDaysToExpiration - daysPassed);
}

/**
 * Проверяет, есть ли у опциона оставшиеся дни до экспирации
 * ЗАЧЕМ: Используется для определения, показывать ли линию экспирации на графике
 * 
 * @param {Object} option - Опцион с полем date
 * @param {number} daysPassed - Прошедшие дни от сегодня
 * @returns {boolean} true если есть оставшиеся дни
 */
export function hasRemainingDaysUTC(option, daysPassed = 0) {
  return calculateDaysRemainingUTC(option, daysPassed) > 0;
}
