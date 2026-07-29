/**
 * Тесты точки безубытка в calculatePLMetrics (metricsCalculator.js) — фикс 2A-4.3.
 *
 * ЗАЧЕМ: Точка безубытка раньше считалась по массиву P&L НА ТЕКУЩУЮ (симулируемую) дату,
 * тогда как MAX прибыль/убыток — на дату экспирации. Из-за этого безубыток у свежей позиции
 * был не «страйк ± премия», а шумной величиной, зависящей от положения ползунка дней.
 * Теперь оба массива считаются на экспирации и должны быть согласованы.
 */

// ЗАЧЕМ: см. пояснение в greeksMultiplier.test.js — react-plotly.js падает в jsdom, а компонент
// <Plot> в этих тестах не используется (нужна только чистая функция calculatePLDataForMetrics).
jest.mock('react-plotly.js', () => () => null);

import { calculatePLMetrics } from '../metricsCalculator';

function futureDateISO(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

describe('calculatePLMetrics — точка безубытка на дату экспирации (2A-4.3)', () => {
  test('одиночный купленный колл: безубыток = страйк + премия', () => {
    const expiration = futureDateISO(45);
    const options = [
      { type: 'CALL', strike: 100, action: 'Buy', quantity: 1, ask: 5, date: expiration, impliedVolatility: 0.30 }
    ];

    const metrics = calculatePLMetrics(options, 100, [], 0, null, 0, false, {}, 0, '', 'stocks', 100);

    expect(metrics.breakevens).toHaveLength(1);
    expect(Math.abs(metrics.breakevens[0] - 105)).toBeLessThan(0.5);
  });

  test('одиночный купленный пут: безубыток = страйк - премия', () => {
    const expiration = futureDateISO(45);
    const options = [
      { type: 'PUT', strike: 100, action: 'Buy', quantity: 1, ask: 4, date: expiration, impliedVolatility: 0.30 }
    ];

    const metrics = calculatePLMetrics(options, 100, [], 0, null, 0, false, {}, 0, '', 'stocks', 100);

    expect(metrics.breakevens).toHaveLength(1);
    expect(Math.abs(metrics.breakevens[0] - 96)).toBeLessThan(0.5);
  });

  test('безубыток не «плавает» при изменении ползунка дней (daysPassed)', () => {
    const expiration = futureDateISO(45);
    const options = [
      { type: 'CALL', strike: 100, action: 'Buy', quantity: 1, ask: 5, date: expiration, impliedVolatility: 0.30 }
    ];

    const atDay0 = calculatePLMetrics(options, 100, [], 0, null, 0, false, {}, 0, '', 'stocks', 100);
    const atDay10 = calculatePLMetrics(options, 100, [], 10, null, 0, false, {}, 0, '', 'stocks', 100);

    expect(atDay0.breakevens).toHaveLength(1);
    expect(atDay10.breakevens).toHaveLength(1);
    expect(Math.abs(atDay0.breakevens[0] - atDay10.breakevens[0])).toBeLessThan(0.5);
  });

  test('возвращает дату ближайшей экспирации для подписи карточки', () => {
    const expiration = futureDateISO(45);
    const options = [
      { type: 'CALL', strike: 100, action: 'Buy', quantity: 1, ask: 5, date: expiration, impliedVolatility: 0.30 }
    ];

    const metrics = calculatePLMetrics(options, 100, [], 0, null, 0, false, {}, 0, '', 'stocks', 100);

    expect(metrics.expirationDateLabel).not.toBeNull();
    expect(metrics.expirationDateLabel).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
  });
});
