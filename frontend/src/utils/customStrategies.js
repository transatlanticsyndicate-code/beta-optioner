/**
 * Утилиты для работы с персональными стратегиями
 * Сохраняются в localStorage
 */

const STORAGE_KEY = 'custom_options_strategies';

/**
 * Получить все персональные стратегии
 */
export const getCustomStrategies = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error loading custom strategies:', error);
    return [];
  }
};

/**
 * Сохранить новую персональную стратегию
 * @param {string} name - Название стратегии
 * @param {Array} options - Массив опционов
 * @returns {Object} - Сохраненная стратегия
 */
export const saveCustomStrategy = (name, options) => {
  try {
    const strategies = getCustomStrategies();
    
    // Проверка на дубликаты
    if (strategies.some(s => s.name === name)) {
      throw new Error('Стратегия с таким названием уже существует');
    }
    
    // Создаем стратегию, сохраняя только комбинацию операций
    const strategy = {
      id: `custom_${Date.now()}`,
      name,
      isCustom: true,
      createdAt: new Date().toISOString(),
      positions: options.map(opt => ({
        action: opt.action,      // Buy или Sell
        type: opt.type           // CALL или PUT
      }))
    };
    
    // Добавляем в начало списка
    const updated = [strategy, ...strategies];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    
    return strategy;
  } catch (error) {
    console.error('Error saving custom strategy:', error);
    throw error;
  }
};

/**
 * Удалить персональную стратегию
 * @param {string} strategyId - ID стратегии
 */
export const deleteCustomStrategy = (strategyId) => {
  try {
    const strategies = getCustomStrategies();
    const filtered = strategies.filter(s => s.id !== strategyId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return filtered;
  } catch (error) {
    console.error('Error deleting custom strategy:', error);
    throw error;
  }
};

/**
 * Применить персональную стратегию
 * @param {string} strategyId - ID стратегии
 * @param {number} currentPrice - Текущая цена актива
 * @returns {Array} - Массив позиций для создания опционов
 */
export const applyCustomStrategy = (strategyId, currentPrice) => {
  try {
    const strategies = getCustomStrategies();
    const strategy = strategies.find(s => s.id === strategyId);
    
    if (!strategy) {
      throw new Error('Стратегия не найдена');
    }
    
    // Возвращаем позиции БЕЗ страйков, дат и количества - пользователь выберет их сам
    return strategy.positions.map((pos) => {
      return {
        action: pos.action,
        type: pos.type
      };
    });
  } catch (error) {
    console.error('Error applying custom strategy:', error);
    throw error;
  }
};

/**
 * Экспортировать стратегии в JSON
 */
export const exportStrategies = () => {
  const strategies = getCustomStrategies();
  const dataStr = JSON.stringify(strategies, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `custom_strategies_${Date.now()}.json`;
  link.click();
  
  URL.revokeObjectURL(url);
};

/**
 * Импортировать стратегии из JSON
 * @param {File} file - Файл с стратегиями
 */
export const importStrategies = async (file) => {
  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    
    if (!Array.isArray(imported)) {
      throw new Error('Неверный формат файла');
    }
    
    const current = getCustomStrategies();
    const merged = [...imported, ...current];
    
    // Удаляем дубликаты по имени
    const unique = merged.reduce((acc, strategy) => {
      if (!acc.find(s => s.name === strategy.name)) {
        acc.push(strategy);
      }
      return acc;
    }, []);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
    return unique;
  } catch (error) {
    console.error('Error importing strategies:', error);
    throw error;
  }
};
