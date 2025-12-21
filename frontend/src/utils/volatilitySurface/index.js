/**
 * Volatility Surface - модуль для работы с поверхностью волатильности
 * ЗАЧЕМ: Обеспечивает более точное прогнозирование цены опциона при симуляции времени
 * 
 * Volatility Surface - это 3D модель, где IV зависит от:
 * - Strike (монетность опциона)
 * - Time to Expiration (время до экспирации)
 * 
 * Затрагивает: расчёты P&L, блок "Закрыть всё", графики
 */

// Экспорт всех функций и констант
export { IV_SURFACE_CONFIG, DEFAULT_IV_PERCENT } from './constants';
export { buildIVSurface, buildIVSurfaceFromCache } from './builders';
export { interpolateIV } from './interpolation';
export { getProjectedIV, getOptionVolatility } from './projection';
