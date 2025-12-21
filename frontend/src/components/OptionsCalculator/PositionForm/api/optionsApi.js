/**
 * API функции для загрузки данных опционов
 * ЗАЧЕМ: Получение дат экспирации и страйков из API
 * Затрагивает: форма добавления позиций
 */

import axios from 'axios';

// Получение дат экспирации для тикера
// ЗАЧЕМ: Загрузка доступных дат экспирации опционов
export const fetchExpirations = async (ticker) => {
  const response = await axios.get(`/api/options/expirations?ticker=${ticker}`);
  if (response.data.status === 'success') {
    return response.data.expirations || [];
  }
  return [];
};

// Получение страйков для даты экспирации
// ЗАЧЕМ: Загрузка доступных страйков и цен опционов
export const fetchStrikes = async (ticker, expirationDate, optionType) => {
  const response = await axios.get(
    `/api/options/chain?ticker=${ticker}&expiration_date=${expirationDate}`
  );
  if (response.data.status === 'success') {
    const options = response.data.options || [];
    // Фильтруем по типу опциона
    return options.filter(opt => opt.type === optionType);
  }
  return [];
};
