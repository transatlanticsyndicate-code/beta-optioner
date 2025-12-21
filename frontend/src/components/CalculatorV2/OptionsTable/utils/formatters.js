/**
 * Утилиты форматирования для таблицы опционов
 * ЗАЧЕМ: Форматирование дат, цен и P&L значений
 */

export const formatDateForDisplay = (isoDate) => {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  const shortYear = year.slice(-2);
  return `${day}.${month}.${shortYear}`;
};

export const formatPLValue = (value) => {
  const absValue = Math.abs(Math.round(value));
  const formatted = absValue.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const sign = value >= 0 ? '+' : '-';
  return `${sign}$ ${formatted}`;
};
