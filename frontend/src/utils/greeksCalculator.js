/**
 * Greeks Calculator - расчет греков для опционов
 * Упрощенная версия без Black-Scholes (для MVP)
 */

// Нормальное распределение (приближение)
function normalCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}

// Расчет d1 и d2 для Black-Scholes
function calculateD1D2(S, K, T, r, sigma) {
  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return { d1, d2 };
}

/**
 * Расчет Delta
 * Call: N(d1)
 * Put: N(d1) - 1
 */
export function calculateDelta(S, K, T, r, sigma, type = 'call') {
  if (T <= 0) {
    // На экспирации
    if (type === 'call') {
      return S > K ? 1 : 0;
    } else {
      return S < K ? -1 : 0;
    }
  }

  const { d1 } = calculateD1D2(S, K, T, r, sigma);
  const delta = normalCDF(d1);
  
  return type === 'call' ? delta : delta - 1;
}

/**
 * Расчет Gamma
 * Одинаковая для Call и Put
 */
export function calculateGamma(S, K, T, r, sigma) {
  if (T <= 0) return 0;

  const { d1 } = calculateD1D2(S, K, T, r, sigma);
  const gamma = Math.exp(-d1 * d1 / 2) / (S * sigma * Math.sqrt(2 * Math.PI * T));
  
  return gamma;
}

/**
 * Расчет Theta (в днях)
 * Показывает изменение цены опциона за 1 день
 */
export function calculateTheta(S, K, T, r, sigma, type = 'call') {
  if (T <= 0) return 0;

  const { d1, d2 } = calculateD1D2(S, K, T, r, sigma);
  const sqrtT = Math.sqrt(T);
  
  const term1 = -(S * Math.exp(-d1 * d1 / 2) * sigma) / (2 * sqrtT * Math.sqrt(2 * Math.PI));
  
  if (type === 'call') {
    const term2 = r * K * Math.exp(-r * T) * normalCDF(d2);
    return (term1 - term2) / 365; // Переводим в дни
  } else {
    const term2 = r * K * Math.exp(-r * T) * normalCDF(-d2);
    return (term1 + term2) / 365;
  }
}

/**
 * Расчет Vega
 * Показывает изменение цены при изменении IV на 1%
 */
export function calculateVega(S, K, T, r, sigma) {
  if (T <= 0) return 0;

  const { d1 } = calculateD1D2(S, K, T, r, sigma);
  const vega = S * Math.sqrt(T) * Math.exp(-d1 * d1 / 2) / Math.sqrt(2 * Math.PI);
  
  return vega / 100; // Переводим в проценты
}

/**
 * Расчет Greeks для портфеля
 */
export function calculatePortfolioGreeks(positions, currentPrice) {
  if (!positions || positions.length === 0 || !currentPrice) {
    return {
      delta: 0,
      gamma: 0,
      theta: 0,
      vega: 0
    };
  }

  let totalDelta = 0;
  let totalGamma = 0;
  let totalTheta = 0;
  let totalVega = 0;

  const S = currentPrice.price;
  const r = 0.05; // Безрисковая ставка 5%

  positions.forEach(pos => {
    if (!pos.visible) return;

    const K = pos.strike;
    const T = calculateTimeToExpiration(pos.expiration);
    const sigma = pos.iv || 0.3; // IV по умолчанию 30%
    const multiplier = pos.direction === 'buy' ? 1 : -1;
    const size = pos.size * multiplier;

    if (T > 0) {
      totalDelta += calculateDelta(S, K, T, r, sigma, pos.type) * size * 100;
      totalGamma += calculateGamma(S, K, T, r, sigma) * size * 100;
      totalTheta += calculateTheta(S, K, T, r, sigma, pos.type) * size * 100;
      totalVega += calculateVega(S, K, T, r, sigma) * size * 100;
    }
  });

  return {
    delta: totalDelta,
    gamma: totalGamma,
    theta: totalTheta,
    vega: totalVega
  };
}

/**
 * Расчет времени до экспирации в годах
 */
function calculateTimeToExpiration(expirationDate) {
  const now = new Date();
  const expiration = new Date(expirationDate);
  const diffTime = expiration - now;
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return Math.max(0, diffDays / 365);
}

/**
 * Расчет Probability of Profit (упрощенный)
 * Основан на дельте портфеля
 */
export function calculateProbabilityOfProfit(positions, currentPrice) {
  if (!positions || positions.length === 0 || !currentPrice) {
    return 0;
  }

  const greeks = calculatePortfolioGreeks(positions, currentPrice);
  
  // Упрощенный расчет: PoP ≈ 50% + Delta * коэффициент
  // Положительная дельта = бычья позиция = выше 50%
  // Отрицательная дельта = медвежья позиция = ниже 50%
  
  const deltaEffect = Math.tanh(greeks.delta / 100) * 25; // Ограничиваем влияние
  const pop = 50 + deltaEffect;
  
  return Math.max(0, Math.min(100, pop));
}
