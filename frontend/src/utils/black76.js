/**
 * Black-76 Option Pricing Model для опционов на фьючерсы
 * ЗАЧЕМ: Расчёт цен опционов и греков для фьючерсных контрактов
 * Затрагивает: UniversalOptionsCalculator в режиме "Фьючерсы"
 * 
 * Отличия от Black-Scholes-Merton (для акций):
 * - Базовый актив: цена фьючерса F (не цена акции S)
 * - Дивиденды: НЕ используются (q = 0)
 * - Безрисковая ставка r: используется ТОЛЬКО для дисконтирования премии
 * - Формула d1: НЕ содержит r (в отличие от BSM)
 * 
 * Формулы Black-76:
 * d1 = (ln(F/K) + (σ²/2) × T) / (σ × √T)
 * d2 = d1 - σ × √T
 * CALL: C = e^(-rT) × [F × N(d1) - K × N(d2)]
 * PUT:  P = e^(-rT) × [K × N(-d2) - F × N(-d1)]
 */

/**
 * Кумулятивная функция нормального распределения (CDF)
 * ЗАЧЕМ: Используется в формулах Black-76 для расчёта вероятностей
 * @param {number} x - значение
 * @returns {number} - вероятность P(X ≤ x)
 */
export function normalCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}

/**
 * Функция плотности нормального распределения (PDF)
 * ЗАЧЕМ: Используется для расчёта греков (gamma, vega)
 * @param {number} x - значение
 * @returns {number} - плотность вероятности
 */
export function normalPDF(x) {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

/**
 * Расчёт d1 и d2 для модели Black-76
 * ЗАЧЕМ: Ключевые параметры для расчёта цены и греков
 * ВАЖНО: В отличие от BSM, формула d1 НЕ содержит r!
 * 
 * @param {number} F - Цена фьючерса (Futures Price)
 * @param {number} K - Страйк (Strike Price)
 * @param {number} T - Время до экспирации в годах
 * @param {number} sigma - Implied Volatility (десятичный формат, 0.20 = 20%)
 * @returns {Object} - { d1, d2 }
 */
export function calculateD1D2Black76(F, K, T, sigma) {
  // Защита от деления на ноль
  if (T <= 0 || sigma <= 0) {
    return { d1: 0, d2: 0 };
  }

  // Black-76: d1 = (ln(F/K) + (σ²/2) × T) / (σ × √T)
  // ВАЖНО: Здесь НЕТ r в формуле (в отличие от BSM где есть r - q)
  const d1 = (Math.log(F / K) + (sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  
  return { d1, d2 };
}

/**
 * Расчёт цены опциона по модели Black-76
 * ЗАЧЕМ: Основная функция ценообразования для опционов на фьючерсы
 * 
 * @param {number} F - Цена фьючерса
 * @param {number} K - Страйк
 * @param {number} T - Время до экспирации в годах
 * @param {number} r - Безрисковая ставка (для дисконтирования премии)
 * @param {number} sigma - Implied Volatility
 * @param {string} type - Тип опциона ('CALL' или 'PUT')
 * @returns {number} - Цена опциона
 */
export function calculateOptionPriceBlack76(F, K, T, r, sigma, type = 'CALL') {
  const optionType = type.toUpperCase();

  // На экспирации (T=0) возвращаем только внутреннюю стоимость
  if (T <= 0) {
    return optionType === 'CALL' 
      ? Math.max(0, F - K) 
      : Math.max(0, K - F);
  }

  // Защита от некорректных входных данных
  const safeSigma = Math.max(sigma, 0.01);
  const safeF = Math.max(F, 0.01);
  const safeK = Math.max(K, 0.01);

  const { d1, d2 } = calculateD1D2Black76(safeF, safeK, T, safeSigma);
  
  // Дисконтирующий множитель
  const discount = Math.exp(-r * T);

  // Black-76 формулы:
  // CALL: C = e^(-rT) × [F × N(d1) - K × N(d2)]
  // PUT:  P = e^(-rT) × [K × N(-d2) - F × N(-d1)]
  if (optionType === 'CALL') {
    return Math.max(0, discount * (safeF * normalCDF(d1) - safeK * normalCDF(d2)));
  } else {
    return Math.max(0, discount * (safeK * normalCDF(-d2) - safeF * normalCDF(-d1)));
  }
}

/**
 * Расчёт греков по модели Black-76
 * ЗАЧЕМ: Анализ чувствительности опциона к изменению параметров
 * 
 * @param {number} F - Цена фьючерса
 * @param {number} K - Страйк
 * @param {number} T - Время до экспирации в годах
 * @param {number} r - Безрисковая ставка
 * @param {number} sigma - Implied Volatility
 * @param {string} type - Тип опциона ('CALL' или 'PUT')
 * @returns {Object} - { delta, gamma, theta, vega, rho }
 */
export function calculateGreeksBlack76(F, K, T, r, sigma, type = 'CALL') {
  const optionType = type.toUpperCase();
  
  // На экспирации греки экстремальны или равны нулю
  if (T <= 0) {
    const intrinsicDelta = optionType === 'CALL' 
      ? (F > K ? 1 : 0) 
      : (F < K ? -1 : 0);
      
    return {
      delta: intrinsicDelta,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0
    };
  }

  // Защита от некорректных данных
  const safeSigma = Math.max(sigma, 0.01);
  const safeF = Math.max(F, 0.01);

  const { d1, d2 } = calculateD1D2Black76(safeF, K, T, safeSigma);
  const nd1 = normalPDF(d1);
  const Nd1 = normalCDF(d1);
  const Nd2 = normalCDF(d2);
  
  // Дисконтирующий множитель
  const discount = Math.exp(-r * T);
  const sqrtT = Math.sqrt(T);

  let delta, theta, rho;
  
  // Gamma и Vega одинаковы для CALL и PUT в Black-76
  // Gamma = e^(-rT) × n(d1) / (F × σ × √T)
  const gamma = (discount * nd1) / (safeF * safeSigma * sqrtT);
  
  // Vega = e^(-rT) × F × √T × n(d1) / 100 (на 1% изменения IV)
  const vega = (discount * safeF * sqrtT * nd1) / 100;

  if (optionType === 'CALL') {
    // Delta для CALL: e^(-rT) × N(d1)
    delta = discount * Nd1;
    
    // Theta для CALL (в день)
    // Θ = -e^(-rT) × F × n(d1) × σ / (2√T) + r × C
    const callPrice = calculateOptionPriceBlack76(safeF, K, T, r, safeSigma, 'CALL');
    theta = (-(discount * safeF * nd1 * safeSigma) / (2 * sqrtT) + r * callPrice) / 365;
    
    // Rho для CALL: -T × C
    rho = (-T * callPrice) / 100;
  } else {
    // Delta для PUT: e^(-rT) × (N(d1) - 1)
    delta = discount * (Nd1 - 1);
    
    // Theta для PUT (в день)
    const putPrice = calculateOptionPriceBlack76(safeF, K, T, r, safeSigma, 'PUT');
    theta = (-(discount * safeF * nd1 * safeSigma) / (2 * sqrtT) + r * putPrice) / 365;
    
    // Rho для PUT: -T × P
    rho = (-T * putPrice) / 100;
  }

  return {
    delta,
    gamma,
    theta,
    vega,
    rho
  };
}

/**
 * Расчёт внутренней стоимости опциона на фьючерс
 * ЗАЧЕМ: Базовый компонент стоимости — разница между ценой фьючерса и страйком
 * 
 * @param {string} type - Тип опциона ('CALL' или 'PUT')
 * @param {number} F - Цена фьючерса
 * @param {number} K - Страйк
 * @returns {number} - Внутренняя стоимость (≥0)
 */
export function calculateIntrinsicValueBlack76(type, F, K) {
  if (type.toUpperCase() === 'CALL') {
    return Math.max(0, F - K);
  }
  return Math.max(0, K - F);
}
