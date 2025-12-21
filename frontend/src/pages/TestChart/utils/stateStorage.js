/**
 * Управление сохранением состояния в localStorage
 * ЗАЧЕМ: Сохранение настроек пользователя между сессиями
 */

const STATE_KEY = 'testChartState';

export const savePageState = (state) => {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Ошибка при сохранении состояния:', error);
  }
};

export const loadPageState = () => {
  try {
    const saved = localStorage.getItem(STATE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.warn('Ошибка при загрузке состояния:', error);
  }
  return null;
};

export const resetPageState = () => {
  try {
    localStorage.removeItem(STATE_KEY);
  } catch (error) {
    console.warn('Ошибка при сбросе состояния:', error);
  }
};
