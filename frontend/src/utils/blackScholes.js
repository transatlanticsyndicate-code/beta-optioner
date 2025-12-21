/**
 * Black-Scholes-Merton Option Pricing Model
 * ЗАЧЕМ: Расчёт цен опционов и греков с учётом дивидендной доходности
 * 
 * Модель BSM расширяет классическую Black-Scholes добавлением параметра q (dividend yield):
 * - d1 = (ln(S/K) + (r - q + σ²/2) × T) / (σ × √T)
 * - CALL: C = S × e^(-qT) × N(d1) - K × e^(-rT) × N(d2)
 * - PUT: P = K × e^(-rT) × N(-d2) - S × e^(-qT) × N(-d1)
 */

// Cumulative Normal Distribution Function
export function normalCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}

// Probability Density Function
export function normalPDF(x) {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

/**
 * Calculate d1 and d2 для модели Black-Scholes-Merton
 * ЗАЧЕМ: Учитываем дивидендную доходность q в формуле
 * 
 * @param {number} S - Current Stock Price
 * @param {number} K - Strike Price
 * @param {number} T - Time to Expiration (in years)
 * @param {number} r - Risk-free Interest Rate
 * @param {number} sigma - Implied Volatility
 * @param {number} q - Dividend Yield (default 0)
 */
export function calculateD1D2(S, K, T, r, sigma, q = 0) {
  // Avoid division by zero
  if (T <= 0 || sigma <= 0) {
    return { d1: 0, d2: 0 };
  }

  // BSM формула: d1 = (ln(S/K) + (r - q + σ²/2) × T) / (σ × √T)
  const d1 = (Math.log(S / K) + (r - q + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return { d1, d2 };
}

/**
 * Calculate Option Price (Black-Scholes-Merton)
 * ЗАЧЕМ: Расчёт цены опциона с учётом дивидендной доходности
 * 
 * ВАЖНО: Для американских опционов цена не может быть ниже intrinsic value,
 * так как их можно исполнить досрочно. Добавлено ограничение снизу.
 * 
 * @param {number} S - Current Stock Price
 * @param {number} K - Strike Price
 * @param {number} T - Time to Expiration (in years)
 * @param {number} r - Risk-free Interest Rate (decimal, e.g. 0.05 for 5%)
 * @param {number} sigma - Implied Volatility (decimal, e.g. 0.2 for 20%)
 * @param {string} type - Option Type ('CALL' or 'PUT')
 * @param {number} q - Dividend Yield (decimal, e.g. 0.02 for 2%, default 0)
 * @returns {number} Option Price
 */
export function calculateOptionPrice(S, K, T, r, sigma, type = 'CALL', q = 0) {
  const optionType = type.toUpperCase();

  // На экспирации (T=0) возвращаем только внутреннюю стоимость
  if (T <= 0) {
    return optionType === 'CALL' 
      ? Math.max(0, S - K) 
      : Math.max(0, K - S);
  }

  // Защита от некорректных входных данных
  const safeSigma = Math.max(sigma, 0.01);
  const safeS = Math.max(S, 0.01);
  const safeK = Math.max(K, 0.01);
  const safeQ = Math.max(q, 0); // Дивидендная доходность не может быть отрицательной

  const { d1, d2 } = calculateD1D2(safeS, safeK, T, r, safeSigma, safeQ);

  // BSM формулы с учётом дивидендов:
  // CALL: C = S × e^(-qT) × N(d1) - K × e^(-rT) × N(d2)
  // PUT: P = K × e^(-rT) × N(-d2) - S × e^(-qT) × N(-d1)
  if (optionType === 'CALL') {
    return Math.max(0, safeS * Math.exp(-safeQ * T) * normalCDF(d1) - safeK * Math.exp(-r * T) * normalCDF(d2));
  } else {
    return Math.max(0, safeK * Math.exp(-r * T) * normalCDF(-d2) - safeS * Math.exp(-safeQ * T) * normalCDF(-d1));
  }
}

/**
 * Calculate Option Greeks (Black-Scholes-Merton)
 * ЗАЧЕМ: Расчёт греков с учётом дивидендной доходности
 * 
 * @param {number} S - Current Stock Price
 * @param {number} K - Strike Price
 * @param {number} T - Time to Expiration (in years)
 * @param {number} r - Risk-free Interest Rate
 * @param {number} sigma - Implied Volatility
 * @param {string} type - Option Type ('CALL' or 'PUT')
 * @param {number} q - Dividend Yield (decimal, default 0)
 * @returns {object} { delta, gamma, theta, vega, rho }
 */
export function calculateGreeks(S, K, T, r, sigma, type = 'CALL', q = 0) {
  const optionType = type.toUpperCase();
  const safeQ = Math.max(q, 0);
  
  if (T <= 0) {
    // At expiration greeks are extreme or zero
    const intrinsicDelta = optionType === 'CALL' 
      ? (S > K ? 1 : 0) 
      : (S < K ? -1 : 0);
      
    return {
      delta: intrinsicDelta,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0
    };
  }

  const { d1, d2 } = calculateD1D2(S, K, T, r, sigma, safeQ);
  const nd1 = normalPDF(d1);
  const Nd1 = normalCDF(d1);
  const Nd2 = normalCDF(d2);
  const Nnegd1 = normalCDF(-d1);
  const Nnegd2 = normalCDF(-d2);

  let delta, theta, rho;
  
  // BSM греки с учётом дивидендов:
  // Gamma и Vega корректируются на e^(-qT)
  const expMinusQT = Math.exp(-safeQ * T);
  const gamma = (nd1 * expMinusQT) / (S * sigma * Math.sqrt(T));
  const vega = (S * expMinusQT * Math.sqrt(T) * nd1) / 100; // Per 1% IV change

  if (optionType === 'CALL') {
    // Delta для CALL с дивидендами: e^(-qT) × N(d1)
    delta = expMinusQT * Nd1;
    // Theta для CALL с дивидендами
    theta = (- (S * sigma * nd1 * expMinusQT) / (2 * Math.sqrt(T)) 
             + safeQ * S * expMinusQT * Nd1 
             - r * K * Math.exp(-r * T) * Nd2) / 365;
    rho = (K * T * Math.exp(-r * T) * Nd2) / 100;
  } else {
    // Delta для PUT с дивидендами: e^(-qT) × (N(d1) - 1)
    delta = expMinusQT * (Nd1 - 1);
    // Theta для PUT с дивидендами
    theta = (- (S * sigma * nd1 * expMinusQT) / (2 * Math.sqrt(T)) 
             - safeQ * S * expMinusQT * Nnegd1 
             + r * K * Math.exp(-r * T) * Nnegd2) / 365;
    rho = (-K * T * Math.exp(-r * T) * Nnegd2) / 100;
  }

  return {
    delta,
    gamma,
    theta,
    vega,
    rho
  };
}
