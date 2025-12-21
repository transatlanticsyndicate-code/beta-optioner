/**
 * API функции для компактной формы позиций
 * ЗАЧЕМ: Загрузка дат экспирации и опционов с prefetch
 * Затрагивает: оптимизация загрузки данных
 */

import axios from 'axios';

export const fetchExpirations = async (ticker) => {
  const response = await axios.get(`/api/options/expirations?ticker=${ticker}`);
  if (response.data.status === 'success') {
    return response.data.expirations || [];
  }
  return [];
};

export const fetchOptionsForDate = async (ticker, date, type) => {
  const response = await axios.get(
    `/api/options/chain?ticker=${ticker}&expiration_date=${date}`,
    { timeout: 10000 }
  );
  
  if (response.data.status === 'success') {
    const options = response.data.options || [];
    return options.filter(opt => opt.type === type);
  }
  return [];
};

export const prefetchOptionsForDate = async (ticker, date, type, allOptionsData) => {
  const key = `${date}_${type}`;
  if (allOptionsData[key]) {
    return null;
  }
  
  try {
    const filtered = await fetchOptionsForDate(ticker, date, type);
    return { key, data: filtered };
  } catch (error) {
    console.error(`❌ Prefetch error for ${date} ${type}:`, error.message);
    return null;
  }
};
