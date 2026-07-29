/**
 * Тесты calculateLiveGreeks (metricsCalculator.js) — 2A-3 «живые» греки.
 *
 * ЗАЧЕМ: Раньше греки в карточках брались из полей ноги, заполненных при импорте котировок,
 * и были заморожены — не реагировали ни на ползунок дней, ни на целевую цену, ни на ручную
 * волатильность. calculateLiveGreeks пересчитывает греки через Black-Scholes/Black-76 по
 * актуальным цене/дням/IV каждой ноги (та же волатильность/дни, что использует P&L график).
 */

// ЗАЧЕМ: см. пояснение в greeksMultiplier.test.js — react-plotly.js падает в jsdom, а компонент
// <Plot> в этих тестах не используется (нужна только чистая функция calculatePLDataForMetrics).
jest.mock('react-plotly.js', () => () => null);

import { calculateLiveGreeks } from '../metricsCalculator';

function futureDateISO(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

describe('calculateLiveGreeks — реагирует на симуляцию (2A-3)', () => {
  test('дельта меняется при изменении симулируемой цены базового актива', () => {
    const expiration = futureDateISO(60);
    const options = [
      { type: 'CALL', strike: 100, action: 'Buy', quantity: 1, ask: 5, date: expiration, impliedVolatility: 0.30 }
    ];

    const atLowPrice = calculateLiveGreeks(options, 80, 0, 100, 'stocks', null, 0, false, {}, 0, '');
    const atHighPrice = calculateLiveGreeks(options, 120, 0, 100, 'stocks', null, 0, false, {}, 0, '');

    // Глубоко OTM (цена 80 < страйк 100) дельта близка к 0, глубоко ITM (120 > 100) — близка к contractMultiplier.
    expect(atLowPrice.delta).toBeLessThan(atHighPrice.delta);
    expect(atHighPrice.delta).toBeGreaterThan(50); // ближе к 100 (максимум для 1 контракта × 100)
    expect(atLowPrice.delta).toBeLessThan(50);
  });

  test('греки меняются при изменении симулируемых прошедших дней (daysPassed)', () => {
    const expiration = futureDateISO(60);
    const options = [
      { type: 'CALL', strike: 100, action: 'Buy', quantity: 1, ask: 5, date: expiration, impliedVolatility: 0.30 }
    ];

    const farFromExpiry = calculateLiveGreeks(options, 100, 0, 100, 'stocks', null, 0, false, {}, 0, '');
    const closeToExpiry = calculateLiveGreeks(options, 100, 55, 100, 'stocks', null, 0, false, {}, 0, ''); // осталось ~5 дней

    // Гамма атм-опциона растёт по мере приближения к экспирации.
    expect(closeToExpiry.gamma).toBeGreaterThan(farFromExpiry.gamma);
    // Тета (распад) по модулю тоже растёт ближе к экспирации для ATM-опциона.
    expect(Math.abs(closeToExpiry.theta)).toBeGreaterThan(Math.abs(farFromExpiry.theta));
  });

  test('нулевая/некорректная волатильность не даёт Infinity/NaN (пол 1%)', () => {
    const expiration = futureDateISO(30);
    const options = [
      { type: 'CALL', strike: 100, action: 'Buy', quantity: 1, ask: 5, date: expiration, impliedVolatility: 0 }
    ];

    const result = calculateLiveGreeks(options, 100, 0, 100, 'stocks', null, 0, false, {}, 0, '');

    ['delta', 'gamma', 'theta', 'vega'].forEach(key => {
      expect(Number.isFinite(result[key])).toBe(true);
      expect(Number.isNaN(result[key])).toBe(false);
    });
  });

  test('ручная волатильность ноги (manualIvOverride) применяется вместо API IV', () => {
    const expiration = futureDateISO(30);
    const lowIvOption = [
      { type: 'CALL', strike: 100, action: 'Buy', quantity: 1, ask: 5, date: expiration, impliedVolatility: 0.10 }
    ];
    const overriddenOption = [
      { type: 'CALL', strike: 100, action: 'Buy', quantity: 1, ask: 5, date: expiration, impliedVolatility: 0.10, manualIvOverride: 80, manualIvOverrideDate: new Date().toISOString().split('T')[0] }
    ];

    const withApiIv = calculateLiveGreeks(lowIvOption, 100, 0, 100, 'stocks', null, 0, false, {}, 0, '');
    const withManualIv = calculateLiveGreeks(overriddenOption, 100, 0, 100, 'stocks', null, 0, false, {}, 0, '');

    // При гораздо более высокой ручной IV вега (чувствительность к IV) должна отличаться.
    expect(withManualIv.vega).not.toBeCloseTo(withApiIv.vega, 2);
  });

  test('фьючерсы: используется contractMultiplier (pointValue), а не 100', () => {
    const expiration = futureDateISO(60);
    const options = [
      { type: 'CALL', strike: 100, action: 'Buy', quantity: 1, ask: 5, date: expiration, impliedVolatility: 0.30 }
    ];

    const withPointValue1 = calculateLiveGreeks(options, 120, 0, 1, 'futures', null, 0, false, {}, 0, '');
    const withPointValue12_5 = calculateLiveGreeks(options, 120, 0, 12.5, 'futures', null, 0, false, {}, 0, '');

    expect(withPointValue12_5.delta).toBeCloseTo(withPointValue1.delta * 12.5, 4);
  });

  test('опцион с visible: false не участвует в сумме', () => {
    const expiration = futureDateISO(60);
    const options = [
      { type: 'CALL', strike: 100, action: 'Buy', quantity: 1, ask: 5, date: expiration, impliedVolatility: 0.30, visible: false }
    ];

    const result = calculateLiveGreeks(options, 100, 0, 100, 'stocks', null, 0, false, {}, 0, '');
    expect(result).toEqual({ delta: 0, gamma: 0, theta: 0, vega: 0 });
  });

  test('пустой массив/нулевая цена даёт нулевые греки без ошибок', () => {
    expect(calculateLiveGreeks([], 100, 0, 100, 'stocks')).toEqual({ delta: 0, gamma: 0, theta: 0, vega: 0 });
    expect(calculateLiveGreeks(undefined, 100, 0, 100, 'stocks')).toEqual({ delta: 0, gamma: 0, theta: 0, vega: 0 });
    const expiration = futureDateISO(30);
    const options = [{ type: 'CALL', strike: 100, action: 'Buy', quantity: 1, ask: 5, date: expiration }];
    expect(calculateLiveGreeks(options, 0, 0, 100, 'stocks')).toEqual({ delta: 0, gamma: 0, theta: 0, vega: 0 });
  });
});
