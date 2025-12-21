/**
 * Константы для калькулятора опционов (Basic версия)
 * ЗАЧЕМ: Централизованное хранение демо-данных и конфигурации
 * Затрагивает: начальные данные, настройки по умолчанию
 */

// Демо-данные для опционов
// ЗАЧЕМ: Показать пользователю пример работы калькулятора при первом запуске
export const DEMO_OPTIONS = [
  { 
    id: "1", 
    action: "Buy", 
    type: "CALL", 
    strike: 250, 
    date: "2025-10-25", 
    quantity: 1, 
    premium: 5.9, 
    bid: 5.8, 
    ask: 6.0, 
    volume: 2164, 
    oi: 134514, 
    visible: true 
  },
  { 
    id: "2", 
    action: "Buy", 
    type: "PUT", 
    strike: 240, 
    date: "2025-10-25", 
    quantity: 1, 
    premium: 14.7, 
    bid: 14.5, 
    ask: 16.0, 
    volume: 12164, 
    oi: 234514, 
    visible: true 
  },
  { 
    id: "3", 
    action: "Sell", 
    type: "CALL", 
    strike: 260, 
    date: "2025-11-15", 
    quantity: -1, 
    premium: 8.1, 
    bid: 8.0, 
    ask: 8.2, 
    volume: 5164, 
    oi: 184514, 
    visible: true 
  },
  { 
    id: "4", 
    action: "Sell", 
    type: "PUT", 
    strike: 230, 
    date: "2025-11-15", 
    quantity: -1, 
    premium: 5.0, 
    bid: 4.8, 
    ask: 5.2, 
    volume: 3164, 
    oi: 94514, 
    visible: true 
  },
  { 
    id: "5", 
    action: "Buy", 
    type: "CALL", 
    strike: 255, 
    date: "2025-12-20", 
    quantity: 2, 
    premium: 12.5, 
    bid: 12.3, 
    ask: 12.7, 
    volume: 8164, 
    oi: 324514, 
    visible: true 
  },
  { 
    id: "6", 
    action: "Sell", 
    type: "CALL", 
    strike: 245, 
    date: "2025-12-20", 
    quantity: -2, 
    premium: 18.2, 
    bid: 18.0, 
    ask: 18.4, 
    volume: 9164, 
    oi: 424514, 
    visible: true 
  },
];

// Настройки по умолчанию
// ЗАЧЕМ: Начальные значения для нового калькулятора
export const DEFAULT_SETTINGS = {
  daysPassed: 0,
  chartDisplayMode: 'profit-loss-dollar',
  showOptionLines: true,
  showProbabilityZones: true,
  useDividends: true,
};

// Режимы отображения графика
// ЗАЧЕМ: Enum для типов графиков P&L
export const CHART_DISPLAY_MODES = {
  PROFIT_LOSS_DOLLAR: 'profit-loss-dollar',
  PROFIT_LOSS_PERCENT: 'profit-loss-percent',
  BREAK_EVEN: 'break-even',
};

// Типы опционов
// ЗАЧЕМ: Enum для типов опционов
export const OPTION_TYPES = {
  CALL: 'CALL',
  PUT: 'PUT',
};

// Типы действий с опционами
// ЗАЧЕМ: Enum для действий (покупка/продажа)
export const OPTION_ACTIONS = {
  BUY: 'Buy',
  SELL: 'Sell',
};
