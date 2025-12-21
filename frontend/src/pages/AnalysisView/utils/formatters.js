/**
 * Утилиты форматирования для страницы анализа
 * ЗАЧЕМ: Форматирование дат, чисел и метрик для отображения
 * Затрагивает: отображение данных в UI
 */

// Форматирование даты в локальный формат
// ЗАЧЕМ: Преобразование ISO даты в читаемый вид
export function formatDate(dateString) {
  return new Date(dateString).toLocaleString('ru-RU');
}

// Форматирование времени выполнения
// ЗАЧЕМ: Преобразование миллисекунд в секунды с одним знаком после запятой
export function formatExecutionTime(ms) {
  return (ms / 1000).toFixed(1);
}

// Форматирование объема в миллионы
// ЗАЧЕМ: Сокращение больших чисел (1000000 → 1.0M)
export function formatVolume(volume) {
  return (volume / 1000000).toFixed(1) + 'M';
}

// Форматирование гамма экспозиции
// ЗАЧЕМ: Сокращение больших чисел в тысячи (1000 → 1.0K)
export function formatGammaExposure(gamma) {
  if (typeof gamma === 'object' && gamma.net_gamma !== undefined) {
    return (gamma.net_gamma / 1000).toFixed(1) + 'K';
  }
  return (gamma / 1000).toFixed(1) + 'K';
}

// Определение тренда по гамма экспозиции
// ЗАЧЕМ: Интерпретация значения гаммы (положительная = стабилизация, отрицательная = волатильность)
export function getGammaTrend(gamma) {
  if (typeof gamma === 'object' && gamma.net_gamma !== undefined) {
    return gamma.net_gamma > 0 ? 'Стабилизация' : 'Волатильность';
  }
  return 'Стабилизация';
}

// Получение значения P/C Ratio
// ЗАЧЕМ: Унификация доступа к P/C Ratio (может быть объектом или числом)
export function getPutCallRatio(pcRatio) {
  if (typeof pcRatio === 'object' && pcRatio.volume_ratio !== undefined) {
    return pcRatio.volume_ratio.toFixed(2);
  }
  return pcRatio.toFixed(2);
}

// Определение тренда по P/C Ratio
// ЗАЧЕМ: Интерпретация P/C Ratio (>1 = медвежий, <1 = бычий)
export function getPutCallTrend(pcRatio) {
  const ratio = typeof pcRatio === 'object' ? pcRatio.volume_ratio : pcRatio;
  return ratio > 1 ? 'Медвежий' : 'Бычий';
}
