/**
 * Утилиты работы с историей тикеров
 * ЗАЧЕМ: Сохранение и загрузка истории поиска
 */

import { TICKER_HISTORY_KEY } from '../config/constants';

export const getTickerHistory = () => {
  try {
    const history = localStorage.getItem(TICKER_HISTORY_KEY);
    return history ? JSON.parse(history) : [];
  } catch {
    return [];
  }
};

export const saveTickerToHistory = (ticker, instrumentType) => {
  try {
    const history = getTickerHistory();
    const newEntry = { ticker, instrumentType };
    const filtered = history.filter(item => item.ticker !== ticker);
    const updated = [newEntry, ...filtered].slice(0, 10);
    localStorage.setItem(TICKER_HISTORY_KEY, JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.error('Ошибка сохранения истории тикеров:', error);
    return [];
  }
};

export const removeTickerFromHistory = (ticker) => {
  try {
    const history = getTickerHistory();
    const filtered = history.filter(item => item.ticker !== ticker);
    localStorage.setItem(TICKER_HISTORY_KEY, JSON.stringify(filtered));
    return filtered;
  } catch (error) {
    console.error('Ошибка удаления тикера из истории:', error);
    return [];
  }
};
