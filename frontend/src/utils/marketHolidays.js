/**
 * Утилита для определения нерабочих дней американских бирж (NYSE, NASDAQ)
 * ЗАЧЕМ: Корректное отображение торговых дней в калькуляторе опционов
 * 
 * Источник: NYSE официальный календарь праздников
 * https://www.nyse.com/markets/hours-calendars
 */

// Праздники NYSE/NASDAQ на 2024-2026 годы
// Формат: 'YYYY-MM-DD'
// ЗАЧЕМ: Биржи закрыты в эти дни, опционы не торгуются
const US_MARKET_HOLIDAYS = {
  // 2024 год
  2024: [
    '2024-01-01', // New Year's Day
    '2024-01-15', // Martin Luther King Jr. Day
    '2024-02-19', // Presidents' Day
    '2024-03-29', // Good Friday
    '2024-05-27', // Memorial Day
    '2024-06-19', // Juneteenth National Independence Day
    '2024-07-04', // Independence Day
    '2024-09-02', // Labor Day
    '2024-11-28', // Thanksgiving Day
    '2024-12-25', // Christmas Day
  ],
  // 2025 год
  2025: [
    '2025-01-01', // New Year's Day
    '2025-01-20', // Martin Luther King Jr. Day
    '2025-02-17', // Presidents' Day
    '2025-04-18', // Good Friday
    '2025-05-26', // Memorial Day
    '2025-06-19', // Juneteenth National Independence Day
    '2025-07-04', // Independence Day
    '2025-09-01', // Labor Day
    '2025-11-27', // Thanksgiving Day
    '2025-12-25', // Christmas Day
  ],
  // 2026 год
  2026: [
    '2026-01-01', // New Year's Day
    '2026-01-19', // Martin Luther King Jr. Day
    '2026-02-16', // Presidents' Day
    '2026-04-03', // Good Friday
    '2026-05-25', // Memorial Day
    '2026-06-19', // Juneteenth National Independence Day
    '2026-07-03', // Independence Day (observed, July 4 is Saturday)
    '2026-09-07', // Labor Day
    '2026-11-26', // Thanksgiving Day
    '2026-12-25', // Christmas Day
  ],
};

// Названия праздников для tooltip
const HOLIDAY_NAMES = {
  '01-01': 'New Year\'s Day',
  '01-15': 'MLK Day', // 2024
  '01-19': 'MLK Day', // 2026
  '01-20': 'MLK Day', // 2025
  '02-16': 'Presidents\' Day', // 2026
  '02-17': 'Presidents\' Day', // 2025
  '02-19': 'Presidents\' Day', // 2024
  '03-29': 'Good Friday', // 2024
  '04-03': 'Good Friday', // 2026
  '04-18': 'Good Friday', // 2025
  '05-25': 'Memorial Day', // 2026
  '05-26': 'Memorial Day', // 2025
  '05-27': 'Memorial Day', // 2024
  '06-19': 'Juneteenth',
  '07-03': 'Independence Day', // observed
  '07-04': 'Independence Day',
  '09-01': 'Labor Day', // 2025
  '09-02': 'Labor Day', // 2024
  '09-07': 'Labor Day', // 2026
  '11-26': 'Thanksgiving', // 2026
  '11-27': 'Thanksgiving', // 2025
  '11-28': 'Thanksgiving', // 2024
  '12-25': 'Christmas',
};

/**
 * Проверяет, является ли дата выходным днём (суббота или воскресенье)
 * @param {Date} date - Дата для проверки
 * @returns {boolean} true если выходной
 */
export const isWeekend = (date) => {
  const day = date.getDay();
  return day === 0 || day === 6; // 0 = воскресенье, 6 = суббота
};

/**
 * Проверяет, является ли дата праздничным днём американских бирж
 * @param {Date} date - Дата для проверки
 * @returns {boolean} true если праздник
 */
export const isMarketHoliday = (date) => {
  const year = date.getFullYear();
  const holidays = US_MARKET_HOLIDAYS[year] || [];
  
  // Форматируем дату в YYYY-MM-DD
  const dateStr = date.toISOString().split('T')[0];
  
  return holidays.includes(dateStr);
};

/**
 * Получить название праздника для даты
 * @param {Date} date - Дата
 * @returns {string|null} Название праздника или null
 */
export const getHolidayName = (date) => {
  const year = date.getFullYear();
  const holidays = US_MARKET_HOLIDAYS[year] || [];
  const dateStr = date.toISOString().split('T')[0];
  
  if (!holidays.includes(dateStr)) {
    return null;
  }
  
  // Получаем MM-DD для поиска названия
  const monthDay = dateStr.slice(5); // 'MM-DD'
  return HOLIDAY_NAMES[monthDay] || 'Market Holiday';
};

/**
 * Проверяет, является ли дата нерабочим днём биржи (выходной или праздник)
 * @param {Date} date - Дата для проверки
 * @returns {{ isNonTrading: boolean, reason: string|null }}
 */
export const isNonTradingDay = (date) => {
  if (isWeekend(date)) {
    const dayName = date.getDay() === 0 ? 'Воскресенье' : 'Суббота';
    return { isNonTrading: true, reason: dayName };
  }
  
  const holidayName = getHolidayName(date);
  if (holidayName) {
    return { isNonTrading: true, reason: holidayName };
  }
  
  return { isNonTrading: false, reason: null };
};

/**
 * Получить список всех праздников для года
 * @param {number} year - Год
 * @returns {string[]} Массив дат в формате YYYY-MM-DD
 */
export const getHolidaysForYear = (year) => {
  return US_MARKET_HOLIDAYS[year] || [];
};

export default {
  isWeekend,
  isMarketHoliday,
  getHolidayName,
  isNonTradingDay,
  getHolidaysForYear,
};
