/**
 * Конфигурация блоков для Options Calculator V3 (изолированная копия V2)
 * Стартовая копия идентична V2 и может дорабатываться независимо.
 */

// ============================================
// ОПРЕДЕЛЕНИЕ ВСЕХ БЛОКОВ
// ============================================

const calculatorV3Blocks = {
  // Основные блоки (отображаются всегда в указанном порядке)
  main: [
    {
      id: 'calculator-settings',
      name: 'Настройки калькулятора',
      component: 'CalculatorSettings',
      enabled: true,
      order: 9,
      description: 'Настройки комиссий, параметров расчета и отображения',
      width: 'w-full'
    },
    {
      id: 'ticker-selector-advanced',
      name: 'Выбор тикера',
      component: 'TickerSelectorAdvanced',
      enabled: true,
      order: 1,
      required: true,
      description: 'Поиск и выбор тикера с позициями базового актива',
      width: 'w-full'
    },
    {
      id: 'options-block',
      name: 'Блок опционы',
      component: 'OptionsBlock',
      enabled: true,
      order: 2,
      requiresTicker: true,
      description: 'Добавление опционов, выбор стратегий, управление позициями',
      width: 'w-full',
      features: [
        'Добавить опцион',
        'Выбрать стратегию', 
        'Сохранить',
        'Таблица опционов'
      ]
    },
    {
      id: 'expiration-dates',
      name: 'Календарь экспирации',
      component: 'ExpirationCalendar',
      enabled: true,
      order: 3,
      requiresTicker: true,
      description: 'Календарь с датами экспирации опционов',
      width: 'w-full',
      features: [
        'Blur overlay до выбора тикера',
        'Прогресс-бар загрузки',
        'Группировка по месяцам',
        'Горизонтальный скролл',
        'Выбор активной даты'
      ]
    },
    {
      id: 'strike-scale',
      name: 'Шкала страйков',
      component: 'StrikeScale',
      enabled: true,
      order: 4,
      requiresTicker: true,
      description: 'Интерактивная шкала цен с прибылью/убытком',
      width: 'w-full',
      features: [
        'Верхняя шкала (зеленые полосы - прибыль)',
        'Нижняя шкала (красные полосы - убыток)',
        'Горизонтальный скролл',
        'Интерактивное перетаскивание'
      ]
    },
    {
      id: 'metrics-block',
      name: 'Метрики опционов',
      component: 'OptionsMetrics',
      enabled: true,
      order: 5,
      requiresPositions: true,
      description: 'Ключевые метрики и Greeks опционных позиций',
      width: 'w-full',
      metrics: [
        { key: 'maxLoss', label: 'MAX убыток', format: 'currency', example: '$-245.27' },
        { key: 'maxProfit', label: 'MAX прибыль', format: 'currency', example: '∞' },
        { key: 'breakeven', label: 'Точка безубытка', format: 'currency', example: '$255.90' },
        { key: 'totalPremium', label: 'Всего премии', format: 'currency', example: '$29.30' },
        { key: 'riskReward', label: 'Риск/Прибыль', format: 'ratio', example: '1:5.82' },
        { key: 'margin', label: 'Маржин', format: 'currency', example: '$2,000.00' },
        { key: 'delta', label: 'Дельта', format: 'greek', symbol: 'Δ', example: '43.3' },
        { key: 'gamma', label: 'Гамма', format: 'greek', symbol: 'Γ', example: '2.04' },
        { key: 'theta', label: 'Тета', format: 'greek', symbol: 'Θ', example: '-19.04' },
        { key: 'vega', label: 'Вега', format: 'greek', symbol: 'ν', example: '23.1' }
      ]
    },
    {
      id: 'tradingview-widget',
      name: 'Виджет актива TradingView',
      component: 'TradingViewWidget',
      enabled: true,
      order: 6,
      requiresTicker: true,
      description: 'График цены базового актива с TradingView',
      width: 'w-full'
    },
    {
      id: 'pl-chart',
      name: 'График прибыли/убытка',
      component: 'PLChart',
      enabled: true,
      order: 7,
      requiresPositions: true,
      description: 'Интерактивный график P&L стратегии',
      width: 'w-full'
    },
    {
      id: 'options-chain',
      name: 'Доска опционов (Options Chain)',
      component: 'OptionsChain',
      enabled: true,
      order: 8,
      requiresTicker: true,
      description: 'Полная таблица опционов с Calls и Puts',
      width: 'w-full',
      features: [
        'Двухсекционная таблица (Calls слева, Puts справа)',
        'Центральная колонка Strike',
        'Цветовые индикаторы объема',
        'Сортировка по колонкам',
        'Подсветка при наведении'
      ],
      columns: {
        calls: ['Time value', 'Rho', 'Vega', 'Theta', 'Gamma', 'Delta', 'Price', 'Ask', 'Bid', 'Volume', 'Strike'],
        puts: ['Strike', 'Volume', 'Bid', 'Ask', 'Price', 'Delta', 'Gamma', 'Theta', 'Vega', 'Rho', 'Time value']
      }
    },
    {
      id: 'risk-calculator',
      name: 'Калькулятор риска',
      component: 'RiskCalculator',
      enabled: true,
      order: 8,
      requiresTicker: true,
      description: 'Анализ риска и выбор стратегий на основе прогноза',
      width: 'w-full',
      features: [
        'Выбор тренда (6 вариантов)',
        'Целевой уровень цены',
        'Ограничение риска',
        'Слайдер риск/доходность',
        'Подбор стратегий'
      ]
    },
    {
      id: 'strategy-builder',
      name: 'Конструктор стратегий',
      component: 'StrategyBuilder',
      enabled: true,
      order: 9,
      requiresTicker: true,
      description: 'Автоматический подбор подходящих опционных стратегий',
      width: 'w-full',
      features: [
        'Анализ рыночных условий',
        'Рекомендации стратегий',
        'Фильтры по риску/доходности',
        'Быстрое применение стратегий'
      ]
    },
    {
      id: 'recommendations',
      name: 'Блок рекомендаций',
      component: 'Recommendations',
      enabled: true,
      order: 10,
      requiresPositions: true,
      description: 'AI-рекомендации по оптимизации стратегии',
      width: 'w-full'
    }
  ]
};

export const getActiveBlocks = () => {
  return calculatorV3Blocks.main
    .filter(block => block.enabled)
    .sort((a, b) => a.order - b.order);
};

export const getBlockById = (blockId) => {
  return calculatorV3Blocks.main.find(b => b.id === blockId) || null;
};

export const isBlockEnabled = (blockId) => {
  const block = getBlockById(blockId);
  return block ? block.enabled : false;
};

export const getAllBlocks = () => {
  return calculatorV3Blocks.main;
};

export const requiresTicker = (blockId) => {
  const block = getBlockById(blockId);
  return block ? !!block.requiresTicker : false;
};

export const requiresPositions = (blockId) => {
  const block = getBlockById(blockId);
  return block ? !!block.requiresPositions : false;
};

export default calculatorV3Blocks;
