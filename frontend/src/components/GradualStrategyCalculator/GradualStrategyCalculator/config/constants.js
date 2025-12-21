/**
 * Константы для градуального калькулятора
 * ЗАЧЕМ: Централизация настроек и значений по умолчанию
 */

export const DEFAULT_VALUES = {
  ticker: '',
  currentPrice: 0,
  direction: 'long',
  entryPrice: 0,
  stopLoss: 0,
  targetPrice: 0,
  riskPercent: 2
};

export const DIRECTIONS = {
  LONG: 'long',
  SHORT: 'short'
};
