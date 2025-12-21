/**
 * Утилиты для калькулятора опционов
 * ЗАЧЕМ: Вспомогательные функции для форматирования, валидации и преобразования данных
 * Затрагивает: даты, цены, числовые значения
 */

// Форматирование даты для отображения
// ЗАЧЕМ: Преобразование ISO формата (YYYY-MM-DD) в читаемый вид (DD.MM.YY)
export function formatDateForDisplay(isoDate) {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  const shortYear = year.slice(-2);
  return `${day}.${month}.${shortYear}`;
}

// Округление числа до ближайшего шага
// ЗАЧЕМ: Для выравнивания страйков и цен по шагу
export function roundToStep(value, step) {
  return Math.round(value / step) * step;
}

// Валидация цены
// ЗАЧЕМ: Проверка корректности введенной цены
export function validatePrice(price) {
  const num = parseFloat(price);
  return !isNaN(num) && num > 0;
}

// Форматирование числа с разделителями тысяч
// ЗАЧЕМ: Читаемость больших чисел (1000000 → 1,000,000)
export function formatNumber(num, decimals = 2) {
  if (num === null || num === undefined) return '0';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}
