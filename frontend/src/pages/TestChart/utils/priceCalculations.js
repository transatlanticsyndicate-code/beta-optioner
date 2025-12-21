/**
 * Расчеты цен для графика
 * ЗАЧЕМ: Вычисление средних цен и других метрик
 */

export const calculateAverageEntry = (entry1, entry2) => {
  const entry1Val = parseFloat(entry1) || 0;
  const entry2Val = parseFloat(entry2) || 0;
  
  if (entry1Val && entry2Val) {
    return ((entry1Val + entry2Val) / 2).toFixed(2);
  } else if (entry1Val) {
    return entry1Val.toFixed(2);
  } else if (entry2Val) {
    return entry2Val.toFixed(2);
  }
  return '';
};
