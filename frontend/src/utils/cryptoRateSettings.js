/**
 * Настройка ставки для крипто-режима калькулятора.
 * ЗАЧЕМ: В крипто-режиме (Binance-style опционы) безрисковая ставка в модели
 * Black-Scholes раньше была жёстко зашита как 0 (universalPricing.js, PLChart.jsx,
 * OptionsTableV3.jsx). Формально ноль верен только если форвардная цена БА равна
 * спотовой. На практике между спотом и бессрочным/квартальным фьючерсом почти
 * всегда есть базис (контанго — форвард дороже спота, или бэквордация — дешевле),
 * и именно этот базис — экономический эквивалент "безрисковой ставки" в формуле
 * Блэка-Шоулза для такого инструмента. Без него коллы недооцениваются, а путы
 * переоцениваются (или наоборот, при бэквордации).
 *
 * ВАЖНО (обязательное требование задачи): значение по умолчанию — 0, то есть
 * поведение калькулятора не меняется ни на цент, пока пользователь сам не задаст
 * базис в /settings?section=market-data. Никаких автоматических/угаданных чисел.
 *
 * Затрагивает: universalPricing.js (calculateOptionTheoreticalPrice, calculateOptionPLValue),
 * PLChart.jsx, OptionsTableV3.jsx — везде, где раньше был хардкод rfr/cryptoRiskFreeRate = 0.
 */

const STORAGE_KEY = 'cryptoForwardBasisRate';

// Значение по умолчанию — 0 (старое поведение "как раньше"), см. заголовок файла.
export const DEFAULT_CRYPTO_BASIS_RATE = 0;

// Разумные пределы годового базиса. За их пределами значение считаем мусором
// (опечатка/сбой) и откатываемся к дефолту, а не подставляем в ценообразование
// нереалистичное число. ±100% годовых с большим запасом покрывает и сильную
// контанго, и сильную бэквордацию на крипто-рынках.
const MIN_RATE = -1;
const MAX_RATE = 1;

/**
 * Проверяет и нормализует значение ставки.
 * ЗАЧЕМ: единая точка защиты от мусора — используется и при сохранении из UI,
 * и при чтении (на случай, если localStorage поправили руками через devtools).
 *
 * @param {*} value - сырое значение (число, строка, что угодно)
 * @returns {number} - валидное число в допустимых пределах, либо DEFAULT_CRYPTO_BASIS_RATE
 */
const sanitizeRate = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_CRYPTO_BASIS_RATE;
  if (parsed < MIN_RATE || parsed > MAX_RATE) return DEFAULT_CRYPTO_BASIS_RATE;
  return parsed;
};

/**
 * Читает сохранённую ставку крипто-базиса из localStorage.
 * ЗАЧЕМ: синхронное чтение — используется прямо внутри функций ценообразования,
 * которые сами синхронные (по аналогии с getRiskFreeRateSync для акций).
 *
 * @returns {number} - ставка в десятичном формате (0.06 = 6% годовых), 0 по умолчанию
 */
export const getCryptoBasisRate = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_CRYPTO_BASIS_RATE;
    return sanitizeRate(raw);
  } catch (error) {
    // localStorage недоступен (приватный режим, SSR и т.п.) — безопасный дефолт
    return DEFAULT_CRYPTO_BASIS_RATE;
  }
};

/**
 * Сохраняет ставку крипто-базиса.
 * ЗАЧЕМ: вызывается из формы настроек /settings?section=market-data.
 *
 * @param {*} value - введённое пользователем значение (десятичный формат, например 0.06)
 * @returns {number} - реально сохранённое (уже провалидированное) значение
 */
export const setCryptoBasisRate = (value) => {
  const safeValue = sanitizeRate(value);
  try {
    localStorage.setItem(STORAGE_KEY, String(safeValue));
  } catch (error) {
    console.error('❌ Ошибка сохранения ставки крипто-базиса:', error);
  }
  return safeValue;
};

/**
 * Сбрасывает ставку крипто-базиса к значению по умолчанию (0).
 */
export const resetCryptoBasisRate = () => {
  return setCryptoBasisRate(DEFAULT_CRYPTO_BASIS_RATE);
};

export { STORAGE_KEY as CRYPTO_BASIS_RATE_STORAGE_KEY };
