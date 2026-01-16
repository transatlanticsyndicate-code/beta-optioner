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
 * ЛОГИКА ИНДИВИДУАЛЬНОГО РАСЧЁТА:
 * - daysPassed считается от самой старой даты входа (oldestEntryDate)
 * - Для каждого опциона вычисляем actualDaysPassed на основе его entryDate
 * - Если опцион куплен позже oldestEntryDate, для него прошло меньше дней
 * 
 * Пример: oldestEntryDate = 11.01, daysPassed = 10 (целевая дата = 21.01)
 * - Опцион от 11.01: actualDaysPassed = 10 (21.01 - 11.01)
 * - Опцион от 16.01: actualDaysPassed = 5 (21.01 - 16.01)
 * 
 * @param {Object} option - Опцион с полями date (YYYY-MM-DD), entryDate (YYYY-MM-DD)
 * @param {number} daysPassed - Прошедшие дни от самой старой даты входа (глобальный ползунок)
 * @param {number} defaultDays - Дефолтное значение если нет даты (по умолчанию 30)
 * @param {Date|null} oldestEntryDate - Самая старая дата входа среди всех опционов (опционально)
 * @returns {number} Оставшиеся дни до экспирации (не меньше 0)
 */
export function calculateDaysRemainingUTC(option, daysPassed = 0, defaultDays = 30, oldestEntryDate = null) {
  if (!option?.date) {
    return Math.max(0, defaultDays - daysPassed);
  }
  
  // Для зафиксированных позиций используем сохранённое initialDaysToExpiration
  // ЗАЧЕМ: daysPassed считается от даты сохранения, а не от сегодня
  let initialDaysToExpiration;
  if (option.isLockedPosition && option.initialDaysToExpiration !== undefined) {
    initialDaysToExpiration = option.initialDaysToExpiration;
  } else {
    // Для обычных позиций вычисляем от даты входа опциона по UTC
    // ЗАЧЕМ: Каждый опцион имеет свою дату входа (entryDate)
    const entryDateStr = option.entryDate || new Date().toISOString().split('T')[0];
    const [entryYear, entryMonth, entryDay] = entryDateStr.split('-').map(Number);
    const entryDateUTC = Date.UTC(entryYear, entryMonth - 1, entryDay);
    
    // Парсим дату экспирации
    const [expYear, expMonth, expDay] = option.date.split('-').map(Number);
    const expDateUTC = Date.UTC(expYear, expMonth - 1, expDay);
    
    // Дни от даты входа до экспирации
    initialDaysToExpiration = Math.ceil((expDateUTC - entryDateUTC) / (1000 * 60 * 60 * 24));
  }
  
  // Вычисляем actualDaysPassed для этого конкретного опциона
  // ЗАЧЕМ: Если опцион куплен позже oldestEntryDate, для него прошло меньше дней
  let actualDaysPassed = daysPassed;
  
  if (oldestEntryDate && option.entryDate && !option.isLockedPosition) {
    // Вычисляем разницу между датой входа опциона и самой старой датой входа
    const entryDateStr = option.entryDate;
    const [entryYear, entryMonth, entryDay] = entryDateStr.split('-').map(Number);
    const optionEntryDateUTC = Date.UTC(entryYear, entryMonth - 1, entryDay);
    
    // oldestEntryDate уже является Date объектом
    const oldestEntryDateUTC = Date.UTC(
      oldestEntryDate.getUTCFullYear(),
      oldestEntryDate.getUTCMonth(),
      oldestEntryDate.getUTCDate()
    );
    
    // Разница в днях между датой входа опциона и самой старой датой входа
    const entryDiff = Math.ceil((optionEntryDateUTC - oldestEntryDateUTC) / (1000 * 60 * 60 * 24));
    
    // actualDaysPassed = daysPassed - entryDiff
    // Если опцион куплен на 5 дней позже, для него прошло на 5 дней меньше
    actualDaysPassed = Math.max(0, daysPassed - entryDiff);
  }
  
  // Оставшиеся дни = изначальные - прошедшие (симуляция)
  return Math.max(0, initialDaysToExpiration - actualDaysPassed);
}

/**
 * Проверяет, есть ли у опциона оставшиеся дни до экспирации
 * ЗАЧЕМ: Используется для определения, показывать ли линию экспирации на графике
 * 
 * @param {Object} option - Опцион с полем date
 * @param {number} daysPassed - Прошедшие дни от сегодня
 * @param {Date|null} oldestEntryDate - Самая старая дата входа среди всех опционов
 * @returns {boolean} true если есть оставшиеся дни
 */
export function hasRemainingDaysUTC(option, daysPassed = 0, oldestEntryDate = null) {
  return calculateDaysRemainingUTC(option, daysPassed, 30, oldestEntryDate) > 0;
}

/**
 * Проверяет, активен ли опцион на указанный день симуляции
 * ЗАЧЕМ: Если целевая дата раньше даты входа опциона, опцион ещё не куплен
 * 
 * Пример: oldestEntryDate = 11.01, daysPassed = 3 (целевая дата = 14.01)
 * - Опцион от 11.01: активен (14.01 >= 11.01)
 * - Опцион от 16.01: НЕ активен (14.01 < 16.01)
 * 
 * @param {Object} option - Опцион с полем entryDate
 * @param {number} daysPassed - Прошедшие дни от самой старой даты входа
 * @param {Date|null} oldestEntryDate - Самая старая дата входа среди всех опционов
 * @returns {boolean} true если опцион активен (уже куплен), false если ещё не куплен
 */
export function isOptionActiveAtDay(option, daysPassed, oldestEntryDate) {
  if (!oldestEntryDate) return true; // Нет базовой даты — считаем активным
  if (option.isLockedPosition) return true; // Зафиксированные позиции всегда активны
  
  // Вычисляем разницу между датой входа опциона и самой старой датой входа
  // ВАЖНО: Если entryDate отсутствует, используем текущую дату как fallback
  const entryDateStr = option.entryDate || new Date().toISOString().split('T')[0];
  const [entryYear, entryMonth, entryDay] = entryDateStr.split('-').map(Number);
  const optionEntryDateUTC = Date.UTC(entryYear, entryMonth - 1, entryDay);
  
  const oldestEntryDateUTC = Date.UTC(
    oldestEntryDate.getUTCFullYear(),
    oldestEntryDate.getUTCMonth(),
    oldestEntryDate.getUTCDate()
  );
  
  // Разница в днях между датой входа опциона и самой старой датой входа
  const entryDiff = Math.ceil((optionEntryDateUTC - oldestEntryDateUTC) / (1000 * 60 * 60 * 24));
  
  // Опцион активен, если daysPassed >= entryDiff (целевая дата >= даты входа опциона)
  return daysPassed >= entryDiff;
}

/**
 * Вычисляет самую старую дату входа среди массива опционов
 * ЗАЧЕМ: Используется как базовая дата для расчёта daysPassed
 * 
 * @param {Array} options - Массив опционов с полем entryDate
 * @returns {Date|null} Самая старая дата входа или null
 */
export function getOldestEntryDate(options) {
  if (!options || options.length === 0) return null;
  
  let oldest = null;
  options.forEach(option => {
    const entryDateStr = option.entryDate || new Date().toISOString().split('T')[0];
    const entryDate = new Date(entryDateStr + 'T00:00:00');
    
    if (!oldest || entryDate < oldest) {
      oldest = entryDate;
    }
  });
  
  return oldest;
}
