/**
 * Greeks Calculator - расчет греков для опционов
 * Использует общее математическое ядро Black-Scholes
 */

import { calculateGreeks } from './blackScholes';
import { getDaysUntilExpirationUTC } from './dateUtils';

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
    const T = calculateTimeToExpiration(pos.expiration || pos.date); // Support both field names
    const sigma = pos.iv || pos.implied_volatility || 0.5; // IV по умолчанию 50%
    const multiplier = pos.direction === 'buy' || (pos.action || '').toLowerCase() === 'buy' ? 1 : -1;
    const size = (pos.size || pos.quantity || 0) * multiplier;
    const type = pos.type || 'CALL';

    if (T > 0) {
      const greeks = calculateGreeks(S, K, T, r, sigma, type);

      // Greeks are per share, so multiply by 100 for contract
      totalDelta += greeks.delta * size * 100;
      totalGamma += greeks.gamma * size * 100;
      totalTheta += greeks.theta * size * 100;
      totalVega += greeks.vega * size * 100;
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
 * ВАЖНО: Используем UTC для консистентности между часовыми поясами
 */
function calculateTimeToExpiration(expirationDate) {
  if (!expirationDate) return 0;

  try {
    // Используем UTC-функцию для единообразного расчёта
    const diffDays = getDaysUntilExpirationUTC(expirationDate);
    return Math.max(0, diffDays / 365);
  } catch (e) {
    return 0;
  }
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

  // Нормализуем дельту относительно размера портфеля? 
  // Пока оставляем старую логику, так как PoP - это вероятностная метрика, 
  // которую сложно посчитать точно без Монте-Карло.

  const deltaEffect = Math.tanh(greeks.delta / 100) * 25; // Ограничиваем влияние
  const pop = 50 + deltaEffect;

  return Math.max(0, Math.min(100, pop));
}
