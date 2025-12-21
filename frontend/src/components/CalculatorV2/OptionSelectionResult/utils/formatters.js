/**
 * Утилиты форматирования для результатов подбора опционов
 * ЗАЧЕМ: Форматирование валюты и определение цветов для P&L
 * Затрагивает: отображение прибыли/убытка
 */

// Форматирование валюты с сокращениями (K, M)
// ЗАЧЕМ: Компактное отображение больших сумм денег
export const formatCurrency = (value) => {
  const absValue = Math.abs(value);
  const sign = value >= 0 ? '+' : '-';
  
  if (absValue >= 1000000) {
    return `${sign}$${(absValue / 1000000).toFixed(2)}M`;
  } else if (absValue >= 1000) {
    return `${sign}$${(absValue / 1000).toFixed(2)}K`;
  } else {
    return `${sign}$${absValue.toFixed(2)}`;
  }
};

// Определение цвета для P&L
// ЗАЧЕМ: Визуальная индикация прибыли (зеленый) или убытка (красный)
export const getPLColor = (value) => {
  if (value > 0) return 'text-green-600';
  if (value < 0) return 'text-red-600';
  return 'text-gray-600';
};

// Извлечение P&L CALL опциона из деталей расчета
// ЗАЧЕМ: Для отображения актуального P&L CALL опциона
export const getCallPLFromDetails = (details) => {
  if (!details || !Array.isArray(details)) return 0;
  const callDetail = details.find(d => d.type === 'option' && d.label?.includes('CALL'));
  return callDetail?.value || 0;
};
