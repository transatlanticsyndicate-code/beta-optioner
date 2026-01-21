/**
 * Утилита для экспорта и импорта сохранённых конфигураций калькулятора
 * ЗАЧЕМ: Позволяет передавать конфигурации между пользователями для проверки и тестирования
 * Затрагивает: localStorage (savedCalculatorConfigurations, calculator_positions)
 */

// Ключи localStorage для экспорта
const STORAGE_KEYS = {
  configurations: 'savedCalculatorConfigurations',
  positions: 'calculator_positions',
};

// Текущая версия формата экспорта
const EXPORT_VERSION = '1.0';

/**
 * Экспортирует все сохранённые конфигурации и позиции в JSON-файл
 * ЗАЧЕМ: Создаёт портативный файл для передачи коллегам
 * @param {string} exportedBy - Имя пользователя, выполняющего экспорт
 * @param {string} storageKey - Ключ localStorage для конфигураций (по умолчанию для старого калькулятора)
 */
export const exportConfigurations = (exportedBy = 'Unknown', storageKey = STORAGE_KEYS.configurations) => {
  try {
    // Собираем данные из localStorage
    const configurations = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const positions = JSON.parse(localStorage.getItem(STORAGE_KEYS.positions) || '[]');

    // Формируем объект экспорта с метаданными
    const exportData = {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      exportedBy,
      data: {
        configurations,
        positions,
      },
      stats: {
        configurationsCount: configurations.length,
        positionsCount: positions.length,
      },
    };

    // Создаём и скачиваем файл
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    // Формируем имя файла с датой
    const date = new Date().toISOString().split('T')[0];
    const prefix = storageKey === 'universalCalculatorConfigurations' ? 'universal-calc' : 'optioner';
    link.href = url;
    link.download = `${prefix}-export-${date}.json`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return { success: true, stats: exportData.stats };
  } catch (error) {
    console.error('Ошибка экспорта конфигураций:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Валидирует структуру импортируемого файла
 * ЗАЧЕМ: Предотвращает импорт повреждённых или некорректных данных
 * @param {object} data - Данные из импортируемого файла
 * @returns {object} - Результат валидации с ошибками если есть
 */
export const validateImportData = (data) => {
  const errors = [];

  // Проверка базовой структуры
  if (!data || typeof data !== 'object') {
    errors.push('Файл не содержит валидных данных');
    return { valid: false, errors };
  }

  // Проверка версии
  if (!data.version) {
    errors.push('Отсутствует версия формата');
  }

  // Проверка наличия данных
  if (!data.data) {
    errors.push('Отсутствует секция данных');
    return { valid: false, errors };
  }

  // Проверка массивов
  if (data.data.configurations && !Array.isArray(data.data.configurations)) {
    errors.push('Конфигурации должны быть массивом');
  }

  if (data.data.positions && !Array.isArray(data.data.positions)) {
    errors.push('Позиции должны быть массивом');
  }

  return {
    valid: errors.length === 0,
    errors,
    stats: {
      configurationsCount: data.data?.configurations?.length || 0,
      positionsCount: data.data?.positions?.length || 0,
      exportedAt: data.exportedAt,
      exportedBy: data.exportedBy,
      version: data.version,
    },
  };
};

/**
 * Читает и парсит файл импорта
 * ЗАЧЕМ: Преобразует файл в объект для дальнейшей обработки
 * @param {File} file - Файл для импорта
 * @returns {Promise<object>} - Распарсенные данные
 */
export const readImportFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        resolve(data);
      } catch (error) {
        reject(new Error('Не удалось прочитать файл. Убедитесь, что это валидный JSON.'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Ошибка чтения файла'));
    };
    
    reader.readAsText(file);
  });
};

/**
 * Импортирует конфигурации с выбранным режимом
 * ЗАЧЕМ: Позволяет гибко управлять процессом импорта (замена или объединение)
 * @param {object} importData - Данные для импорта
 * @param {string} mode - Режим импорта: 'replace' или 'merge'
 * @param {string} storageKey - Ключ localStorage для конфигураций (по умолчанию для старого калькулятора)
 * @returns {object} - Результат импорта
 */
export const importConfigurations = (importData, mode = 'merge', storageKey = STORAGE_KEYS.configurations) => {
  try {
    const { configurations = [], positions = [] } = importData.data;

    if (mode === 'replace') {
      // Полная замена данных
      localStorage.setItem(storageKey, JSON.stringify(configurations));
      localStorage.setItem(STORAGE_KEYS.positions, JSON.stringify(positions));
      
      return {
        success: true,
        imported: {
          configurations: configurations.length,
          positions: positions.length,
        },
      };
    }

    // Режим объединения (merge)
    const existingConfigs = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const existingPositions = JSON.parse(localStorage.getItem(STORAGE_KEYS.positions) || '[]');

    // Объединяем конфигурации, избегая дубликатов по ID
    const existingConfigIds = new Set(existingConfigs.map(c => c.id));
    const newConfigs = configurations.filter(c => !existingConfigIds.has(c.id));
    const mergedConfigs = [...existingConfigs, ...newConfigs];

    // Объединяем позиции, избегая дубликатов по ID
    const existingPositionIds = new Set(existingPositions.map(p => p.id));
    const newPositions = positions.filter(p => !existingPositionIds.has(p.id));
    const mergedPositions = [...existingPositions, ...newPositions];

    // Сохраняем объединённые данные
    localStorage.setItem(storageKey, JSON.stringify(mergedConfigs));
    localStorage.setItem(STORAGE_KEYS.positions, JSON.stringify(mergedPositions));

    return {
      success: true,
      imported: {
        configurations: newConfigs.length,
        positions: newPositions.length,
      },
      skipped: {
        configurations: configurations.length - newConfigs.length,
        positions: positions.length - newPositions.length,
      },
    };
  } catch (error) {
    console.error('Ошибка импорта конфигураций:', error);
    return { success: false, error: error.message };
  }
};
