/**
 * Валидация формы добавления позиции
 * ЗАЧЕМ: Проверка корректности введенных данных
 * Затрагивает: создание опционных позиций
 */

import { getDaysUntilExpirationUTC } from '../../../../utils/dateUtils';

// Валидация формы позиции
// ЗАЧЕМ: Проверка всех полей перед добавлением позиции
export const validatePositionForm = (formData, ticker, currentPrice) => {
  const newErrors = {};
  const newWarnings = {};

  if (!ticker) {
    newErrors.ticker = 'Выберите тикер';
  }

  if (!formData.strike) {
    newErrors.strike = 'Выберите страйк';
  }

  if (!formData.expiration) {
    newErrors.expiration = 'Выберите дату экспирации';
  } else {
    // Проверка что дата не в прошлом
    // ВАЖНО: Используем UTC для консистентности между часовыми поясами
    const daysUntil = getDaysUntilExpirationUTC(formData.expiration);
    
    if (daysUntil < 0) {
      newErrors.expiration = 'Дата экспирации не может быть в прошлом';
    }
  }

  if (!formData.price || parseFloat(formData.price) <= 0) {
    newErrors.price = 'Цена должна быть больше 0';
  } else if (currentPrice && parseFloat(formData.price) > currentPrice.price) {
    newWarnings.price = 'Цена опциона больше цены акции - проверьте данные';
  }

  if (!formData.size || parseInt(formData.size) <= 0) {
    newErrors.size = 'Количество должно быть больше 0';
  }

  // Warning для deep OTM опционов
  if (currentPrice && formData.strike) {
    const strike = parseFloat(formData.strike);
    const current = currentPrice.price;
    const diff = Math.abs(strike - current) / current;

    if (diff > 0.15) { // Более 15% от текущей цены
      if (formData.type === 'call' && strike > current) {
        newWarnings.strike = 'Опцион глубоко OTM (Out of The Money)';
      } else if (formData.type === 'put' && strike < current) {
        newWarnings.strike = 'Опцион глубоко OTM (Out of The Money)';
      }
    }
  }

  return {
    errors: newErrors,
    warnings: newWarnings,
    isValid: Object.keys(newErrors).length === 0
  };
};
