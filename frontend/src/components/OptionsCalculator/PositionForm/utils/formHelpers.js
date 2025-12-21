/**
 * Утилиты для формы позиций
 * ЗАЧЕМ: Вспомогательные функции для работы с формой
 * Затрагивает: создание и управление позициями
 */

// Создание объекта позиции из данных формы
// ЗАЧЕМ: Формирование структуры данных позиции
export const createPositionFromForm = (formData, ticker) => {
  return {
    id: `${Date.now()}-${Math.random()}`,
    ticker: ticker,
    strike: parseFloat(formData.strike),
    type: formData.type,
    expiration: formData.expiration,
    direction: formData.direction,
    size: parseInt(formData.size),
    price: parseFloat(formData.price),
    commission: parseFloat(formData.commission),
    visible: true,
    iv: null // Будет заполнено из API если доступно
  };
};

// Сброс формы после добавления позиции
// ЗАЧЕМ: Очистка полей для следующего ввода
export const resetFormFields = (formData) => {
  return {
    ...formData,
    strike: '',
    price: '',
    size: 1
  };
};

// Автозаполнение цены из выбранного страйка
// ЗАЧЕМ: Упрощение ввода данных
export const autofillPriceFromStrike = (strike, strikes) => {
  const option = strikes.find(s => s.strike === parseFloat(strike));
  if (option && option.price) {
    return {
      price: option.price.toFixed(2),
      iv: option.iv || null
    };
  }
  return null;
};
