/**
 * Утилита для работы с позициями в localStorage
 */

const STORAGE_KEY = 'calculator_positions';

/**
 * Получить все позиции из localStorage
 */
export const getPositions = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error reading positions from localStorage:', error);
    return [];
  }
};

/**
 * Сохранить позиции в localStorage
 */
export const savePositions = (positions) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
    return true;
  } catch (error) {
    console.error('Error saving positions to localStorage:', error);
    return false;
  }
};

/**
 * Добавить новую позицию
 */
export const addPosition = (ticker, type, quantity, price) => {
  const positions = getPositions();
  const newPosition = {
    id: Date.now().toString(),
    ticker: ticker.toUpperCase(),
    type, // 'LONG' or 'SHORT'
    quantity: Number(quantity),
    price: Number(price),
    createdAt: new Date().toISOString(),
  };
  
  positions.push(newPosition);
  savePositions(positions);
  return newPosition;
};

/**
 * Удалить позицию по ID
 */
export const removePosition = (id) => {
  const positions = getPositions();
  const filtered = positions.filter(p => p.id !== id);
  savePositions(filtered);
  return filtered;
};

/**
 * Обновить позицию
 */
export const updatePosition = (id, updates) => {
  const positions = getPositions();
  const index = positions.findIndex(p => p.id === id);
  
  if (index !== -1) {
    positions[index] = { ...positions[index], ...updates };
    savePositions(positions);
    return positions[index];
  }
  
  return null;
};

/**
 * Получить позиции по тикеру
 */
export const getPositionsByTicker = (ticker) => {
  const positions = getPositions();
  return positions.filter(p => p.ticker === ticker.toUpperCase());
};

/**
 * Очистить все позиции
 */
export const clearPositions = () => {
  localStorage.removeItem(STORAGE_KEY);
};

/**
 * Получить список уникальных тикеров
 */
export const getUniqueTickers = () => {
  const positions = getPositions();
  const tickers = [...new Set(positions.map(p => p.ticker))];
  return tickers.sort();
};
