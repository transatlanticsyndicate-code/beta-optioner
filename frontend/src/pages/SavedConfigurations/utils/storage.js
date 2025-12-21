/**
 * Работа с localStorage для конфигураций
 * ЗАЧЕМ: Загрузка, сохранение и удаление конфигураций
 */

export const loadConfigurations = () => {
  const saved = localStorage.getItem('savedCalculatorConfigurations');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (error) {
      console.error('Ошибка загрузки конфигураций:', error);
      return [];
    }
  }
  return [];
};

export const saveConfigurations = (configurations) => {
  localStorage.setItem('savedCalculatorConfigurations', JSON.stringify(configurations));
};

export const deleteConfiguration = (configurations, id) => {
  return configurations.filter(config => config.id !== id);
};
