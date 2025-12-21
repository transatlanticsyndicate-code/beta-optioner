/**
 * Утилиты форматирования для калькулятора выхода
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

// Расчет диапазона цен для слайдера
// ЗАЧЕМ: Определение min/max цены для симуляции (±50% от текущей)
export const getPriceRange = (currentPrice) => {
  const minPrice = Math.round(currentPrice * 0.5);
  const maxPrice = Math.round(currentPrice * 1.5);
  return { minPrice, maxPrice };
};
