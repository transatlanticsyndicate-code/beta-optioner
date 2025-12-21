/**
 * Конфигурация блоков для Options Calculator
 * Позволяет включать/отключать блоки и управлять их порядком отображения
 */

// ============================================
// ПРЕСЕТЫ ВЕРСИЙ КАЛЬКУЛЯТОРА
// ============================================

/**
 * Выбор активного пресета
 * Доступные варианты: 'minimal', 'standard', 'full'
 */
const ACTIVE_PRESET = 'minimal'; // Измените здесь для переключения версии

/**
 * MINIMAL - Супер минимальная версия (только самое необходимое)
 * Для быстрого расчета P&L без лишних деталей
 */
const PRESET_MINIMAL = {
  header: [],
  left: ['ticker-selector', 'position-form', 'positions-list'],
  right: ['pl-chart']
};

/**
 * STANDARD - Средняя версия (оптимальный баланс)
 * Основной функционал + готовые стратегии
 */
const PRESET_STANDARD = {
  header: [],
  left: ['ticker-selector', 'strategy-presets', 'position-form', 'positions-list'],
  right: ['position-summary', 'pl-chart']
};

/**
 * FULL - Максимальная версия (все возможности)
 * Все блоки включены для продвинутых пользователей
 */
const PRESET_FULL = {
  header: ['commission-settings'],
  left: ['ticker-selector', 'strategy-presets', 'position-form', 'positions-list'],
  right: ['position-summary', 'pl-chart', 'ai-chat']
};

// Получить активный пресет
const getActivePreset = () => {
  const presets = {
    minimal: PRESET_MINIMAL,
    standard: PRESET_STANDARD,
    full: PRESET_FULL
  };
  return presets[ACTIVE_PRESET] || PRESET_FULL;
};

// ============================================
// ОПРЕДЕЛЕНИЕ ВСЕХ БЛОКОВ
// ============================================

const calculatorBlocks = {
  // Блоки в хедере
  header: [
    {
      id: 'commission-settings',
      name: 'Настройки комиссий',
      component: 'CommissionSettings',
      enabled: true,
      order: 1,
      description: 'Настройки комиссий и параметров калькулятора'
    }
  ],

  // Блоки в левой колонке
  left: [
    {
      id: 'ticker-selector',
      name: 'Выбор тикера',
      component: 'TickerSelector',
      enabled: true,
      order: 1,
      required: true, // Обязательный блок
      description: 'Поиск и выбор тикера для анализа'
    },
    {
      id: 'strategy-presets',
      name: 'Готовые стратегии',
      component: 'StrategyPresets',
      enabled: true,
      order: 2,
      requiresTicker: true, // Показывается только если выбран тикер
      description: 'Быстрое применение готовых опционных стратегий'
    },
    {
      id: 'position-form',
      name: 'Форма добавления позиции',
      component: 'PositionFormCompact',
      enabled: true,
      order: 3,
      requiresTicker: true,
      description: 'Добавление новых опционных позиций'
    },
    {
      id: 'positions-list',
      name: 'Список позиций',
      component: 'PositionsList',
      enabled: true,
      order: 4,
      description: 'Управление добавленными позициями'
    }
  ],

  // Блоки в правой колонке
  right: [
    {
      id: 'position-summary',
      name: 'Сводка по позициям',
      component: 'PositionSummary',
      enabled: true,
      order: 1,
      description: 'Общая информация и Greeks по всем позициям'
    },
    {
      id: 'pl-chart',
      name: 'График P&L',
      component: 'PLChart',
      enabled: true,
      order: 2,
      description: 'Визуализация прибыли/убытка'
    },
    {
      id: 'ai-chat',
      name: 'AI чат-ассистент',
      component: 'AIChat',
      enabled: false, // Отключен, используется плавающий чат
      order: 3,
      description: 'Помощник для анализа позиций и стратегий'
    }
  ]
};

/**
 * Получить активные блоки для указанной позиции с учетом пресета
 * @param {string} position - 'header', 'left' или 'right'
 * @returns {Array} Массив активных блоков, отсортированных по order
 */
export const getActiveBlocks = (position) => {
  if (!calculatorBlocks[position]) {
    return [];
  }
  
  const activePreset = getActivePreset();
  const enabledBlockIds = activePreset[position] || [];
  
  return calculatorBlocks[position]
    .filter(block => {
      // Блок должен быть включен в пресете
      const inPreset = enabledBlockIds.includes(block.id);
      // И иметь enabled: true (для дополнительного контроля)
      return inPreset && block.enabled;
    })
    .sort((a, b) => a.order - b.order);
};

/**
 * Получить блок по ID
 * @param {string} blockId - ID блока
 * @returns {Object|null} Объект блока или null
 */
export const getBlockById = (blockId) => {
  for (const position in calculatorBlocks) {
    const block = calculatorBlocks[position].find(b => b.id === blockId);
    if (block) {
      return block;
    }
  }
  return null;
};

/**
 * Проверить, включен ли блок
 * @param {string} blockId - ID блока
 * @returns {boolean}
 */
export const isBlockEnabled = (blockId) => {
  const block = getBlockById(blockId);
  return block ? block.enabled : false;
};

/**
 * Получить все блоки (для UI управления)
 * @returns {Object} Все блоки по позициям
 */
export const getAllBlocks = () => {
  return calculatorBlocks;
};

/**
 * Получить текущий активный пресет
 * @returns {string} Название пресета ('minimal', 'standard', 'full')
 */
export const getCurrentPreset = () => {
  return ACTIVE_PRESET;
};

/**
 * Получить описание пресетов
 * @returns {Object} Объект с описаниями пресетов
 */
export const getPresetDescriptions = () => {
  return {
    minimal: {
      name: 'Минимальная',
      description: 'Только самое необходимое: тикер, форма, позиции и график',
      blocks: PRESET_MINIMAL
    },
    standard: {
      name: 'Стандартная',
      description: 'Оптимальный баланс: + готовые стратегии и сводка',
      blocks: PRESET_STANDARD
    },
    full: {
      name: 'Полная',
      description: 'Все возможности: + настройки комиссий и AI чат',
      blocks: PRESET_FULL
    }
  };
};

export default calculatorBlocks;
