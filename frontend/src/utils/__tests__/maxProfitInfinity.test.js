/**
 * Тесты calculatePLMetrics (metricsCalculator.js) — фикс 2A-4.
 *
 * ЗАЧЕМ:
 * 1) hasUnlimitedProfit/hasUnlimitedLoss были заготовками (всегда false, никем не вызывались) —
 *    MAX прибыль купленного стрэнгла (MKTX, ZCU2026) считалась по краю ценового диапазона
 *    (±100% от текущей цены), а не как настоящая «∞».
 * 2) Risk/Reward показывал «∞» ДАЖЕ для гарантированно убыточной конструкции
 *    (maxProfit <= 0 && maxLoss < 0) — визуально неотличимо от идеальной сделки.
 */

// ЗАЧЕМ: см. пояснение в greeksMultiplier.test.js — react-plotly.js падает в jsdom, а компонент
// <Plot> в этих тестах не используется (нужна только чистая функция calculatePLDataForMetrics).
jest.mock('react-plotly.js', () => () => null);

import { calculatePLMetrics } from '../metricsCalculator';

// Дата экспирации в будущем в формате YYYY-MM-DD (нужна для calculateDaysRemainingUTC)
function futureDateISO(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

describe('calculatePLMetrics — MAX прибыль и «∞» (2A-4)', () => {
  test('купленный стрэнгл (long CALL + long PUT) → MAX прибыль становится Infinity', () => {
    const expiration = futureDateISO(45);
    const options = [
      { type: 'CALL', strike: 130, action: 'Buy', quantity: 1, ask: 3.97, date: expiration, impliedVolatility: 0.30 },
      { type: 'PUT', strike: 115, action: 'Buy', quantity: 1, ask: 8.02, date: expiration, impliedVolatility: 0.30 }
    ];

    const metrics = calculatePLMetrics(options, 122, [], 0, null, 0, false, {}, 0, '', 'stocks', 100);

    expect(metrics.maxProfit).toBe(Infinity);
    // Убыток купленного стрэнгла ограничен суммой уплаченных премий — НЕ должен стать -Infinity.
    expect(Number.isFinite(metrics.maxLoss)).toBe(true);
    expect(metrics.maxLoss).toBeLessThan(0);
    // Risk/Reward при неограниченной прибыли и конечном убытке — «∞».
    expect(metrics.riskReward).toBe('∞');
  });

  test('вертикальный спред (bull call spread) → MAX прибыль конечна', () => {
    const expiration = futureDateISO(45);
    const options = [
      { type: 'CALL', strike: 95, action: 'Buy', quantity: 1, ask: 6, date: expiration, impliedVolatility: 0.30 },
      { type: 'CALL', strike: 105, action: 'Sell', quantity: 1, bid: 2, date: expiration, impliedVolatility: 0.30 }
    ];

    const metrics = calculatePLMetrics(options, 100, [], 0, null, 0, false, {}, 0, '', 'stocks', 100);

    expect(Number.isFinite(metrics.maxProfit)).toBe(true);
    expect(metrics.maxProfit).not.toBe(Infinity);
    // Ширина спреда 10, чистый дебет 4 → максимум прибыли = (10 - 4) * 100 = 600.
    expect(metrics.maxProfit).toBeCloseTo(600, 0);
    expect(Number.isFinite(metrics.maxLoss)).toBe(true);
  });

  test('гарантированно убыточная конструкция (переплата за колл) → MAX прибыль НЕ «∞», Risk/Reward НЕ «∞»', () => {
    const expiration = futureDateISO(45);
    // Абсурдно высокая цена входа: даже на краю ценового диапазона (±100% от 100 → цена до 200)
    // внутренняя стоимость колла (макс. 100 * 100 = $10 000) намного меньше уплаченной премии
    // (500 * 100 = $50 000) — сделка убыточна при ЛЮБОЙ цене актива.
    const options = [
      { type: 'CALL', strike: 100, action: 'Buy', quantity: 1, ask: 500, date: expiration, impliedVolatility: 0.30 }
    ];

    const metrics = calculatePLMetrics(options, 100, [], 0, null, 0, false, {}, 0, '', 'stocks', 100);

    expect(metrics.maxProfit).not.toBe(Infinity);
    expect(metrics.maxProfit).toBeLessThan(0);
    expect(metrics.maxLoss).toBeLessThan(0);
    // Раньше здесь показывался «∞» — исправлено на «—».
    expect(metrics.riskReward).toBe('—');
  });

  test('короткий стрэнгл (naked short CALL + short PUT) → MAX убыток становится -Infinity, прибыль конечна', () => {
    const expiration = futureDateISO(45);
    const options = [
      { type: 'CALL', strike: 130, action: 'Sell', quantity: 1, bid: 3.97, date: expiration, impliedVolatility: 0.30 },
      { type: 'PUT', strike: 115, action: 'Sell', quantity: 1, bid: 8.02, date: expiration, impliedVolatility: 0.30 }
    ];

    const metrics = calculatePLMetrics(options, 122, [], 0, null, 0, false, {}, 0, '', 'stocks', 100);

    expect(metrics.maxLoss).toBe(-Infinity);
    expect(Number.isFinite(metrics.maxProfit)).toBe(true);
    expect(metrics.maxProfit).toBeGreaterThan(0);
  });
});
