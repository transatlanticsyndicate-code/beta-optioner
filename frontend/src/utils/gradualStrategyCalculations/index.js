/**
 * Градуальные стратегии - главный экспорт
 * ЗАЧЕМ: Централизованный экспорт всех функций
 */

export { calculateEntryStopLoss, calculateExitStopLoss } from './stopLoss';
export { calculateRiskRewardRatio, calculateMaxDrawdown } from './riskMetrics';
export { parseExitScheme, validateExitScheme } from './exitScheme';
export { calculateGradualEntry } from './gradualEntry';

// Заглушка для calculateGradualExit - требует дополнительного рефакторинга
export const calculateGradualExit = (params) => {
  console.warn('calculateGradualExit требует рефакторинга');
  return null;
};
