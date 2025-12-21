/**
 * Утилиты форматирования для ML прогнозов
 * ЗАЧЕМ: Форматирование процентных изменений и определение цветов
 * Затрагивает: отображение изменений цен
 */

// Форматирование процентного изменения с цветом
// ЗАЧЕМ: Визуализация изменения цены (текущая → прогнозируемая)
export const formatPercentChange = (current, predicted) => {
  if (!current || !predicted) return { text: '-', color: 'text-muted-foreground' };
  
  const change = ((predicted - current) / current) * 100;
  const sign = change >= 0 ? '+' : '';
  const color = change >= 0 ? 'text-green-500' : 'text-red-500';
  
  return {
    text: `${sign}${change.toFixed(2)}%`,
    color,
    value: change,
  };
};

// Определение цвета по уровню уверенности
// ЗАЧЕМ: Визуальная индикация качества прогноза
export const getConfidenceColor = (confidence) => {
  if (confidence >= 0.8) return 'bg-green-500';
  if (confidence >= 0.6) return 'bg-yellow-500';
  return 'bg-red-500';
};

// Определение текстовой метки уверенности
// ЗАЧЕМ: Понятное описание уровня уверенности модели
export const getConfidenceLabel = (confidence) => {
  if (confidence >= 0.8) return 'Высокая';
  if (confidence >= 0.6) return 'Средняя';
  return 'Низкая';
};
