/**
 * Тесты calculateTotalGreeks (metricsCalculator.js) — фикс 2A-1.
 *
 * ЗАЧЕМ: Функция суммировала delta/gamma/theta/vega без множителя контракта (1 опционный
 * контракт = 100 акций для акций, pointValue для фьючерсов), из-за чего карточки метрик
 * показывали греки в contractMultiplier раз меньше реальных (MKTX: показывало Δ +0.50
 * вместо реальных Δ ≈ +50). Заодно исправлены два смежных дефекта:
 * - знак позиции ('Sell' действовал регистрозависимо: 'buy' строчными трактовалось как продажа);
 * - количество контрактов бралось без Math.abs, из-за чего отрицательное quantity дважды
 *   инвертировало знак позиции.
 */

// ЗАЧЕМ: metricsCalculator.js импортирует calculatePLDataForMetrics из PLChart.jsx, а тот —
// react-plotly.js (сам Plotly в тестовом jsdom-окружении падает на window.URL.createObjectURL).
// calculatePLDataForMetrics — чистая функция, компонент <Plot> в тестах не рендерится, поэтому
// подменяем модуль заглушкой — безопасно и не затрагивает исходный код.
jest.mock('react-plotly.js', () => () => null);

import { calculateTotalGreeks } from '../metricsCalculator';

describe('calculateTotalGreeks — множитель контракта (2A-1)', () => {
  test('акции: множитель по умолчанию 100 применяется ко всем четырём грекам', () => {
    const options = [
      { type: 'CALL', strike: 130, action: 'Buy', quantity: 4, delta: 0.50, gamma: 0.09, theta: -0.37, vega: 1.16 }
    ];
    const result = calculateTotalGreeks(options, 100);

    // На 1 контракт (без учёта quantity=4) грек уже умножен на 100 → на 4 контракта ×4 ещё.
    expect(result.delta).toBeCloseTo(0.50 * 4 * 100, 5);
    expect(result.gamma).toBeCloseTo(0.09 * 4 * 100, 5);
    expect(result.theta).toBeCloseTo(-0.37 * 4 * 100, 5);
    expect(result.vega).toBeCloseTo(1.16 * 4 * 100, 5);
  });

  test('MKTX пример с прода: 4×CALL130 (Buy) + 2×PUT115 (Buy), множитель 100', () => {
    const options = [
      { type: 'CALL', strike: 130, action: 'Buy', quantity: 4, delta: 0.125, gamma: 0.0225, theta: -0.0925, vega: 0.29 },
      { type: 'PUT', strike: 115, action: 'Buy', quantity: 2, delta: 0, gamma: 0, theta: 0, vega: 0 }
    ];
    // Берём дельту так, чтобы суммарно совпасть с эталоном из ТЗ: Δ ≈ +50 (4 * 0.125 * 100 = 50).
    const result = calculateTotalGreeks(options, 100);
    expect(result.delta).toBeCloseTo(50, 5);
  });

  test('фьючерс с множителем цены пункта 12.5 применяется вместо 100', () => {
    const options = [
      { type: 'CALL', strike: 100, action: 'Buy', quantity: 1, delta: 0.5, gamma: 0.01, theta: -0.05, vega: 0.2 }
    ];
    const result = calculateTotalGreeks(options, 12.5);

    expect(result.delta).toBeCloseTo(0.5 * 1 * 12.5, 5);
    expect(result.gamma).toBeCloseTo(0.01 * 1 * 12.5, 5);
    expect(result.theta).toBeCloseTo(-0.05 * 1 * 12.5, 5);
    expect(result.vega).toBeCloseTo(0.2 * 1 * 12.5, 5);
  });

  test("'buy' и 'Buy' дают одинаковый знак (регистронезависимость)", () => {
    const lower = [{ type: 'CALL', strike: 100, action: 'buy', quantity: 1, delta: 0.4, gamma: 0, theta: 0, vega: 0 }];
    const upper = [{ type: 'CALL', strike: 100, action: 'Buy', quantity: 1, delta: 0.4, gamma: 0, theta: 0, vega: 0 }];

    const resultLower = calculateTotalGreeks(lower, 100);
    const resultUpper = calculateTotalGreeks(upper, 100);

    expect(resultLower.delta).toBeCloseTo(resultUpper.delta, 10);
    expect(resultLower.delta).toBeGreaterThan(0); // до фикса 'buy' строчными трактовалось как Sell (знак минус)
  });

  test("'sell' и 'Sell' дают одинаковый (отрицательный от знака дельты) результат", () => {
    const lower = [{ type: 'CALL', strike: 100, action: 'sell', quantity: 1, delta: 0.4, gamma: 0, theta: 0, vega: 0 }];
    const upper = [{ type: 'CALL', strike: 100, action: 'Sell', quantity: 1, delta: 0.4, gamma: 0, theta: 0, vega: 0 }];

    const resultLower = calculateTotalGreeks(lower, 100);
    const resultUpper = calculateTotalGreeks(upper, 100);

    expect(resultLower.delta).toBeCloseTo(resultUpper.delta, 10);
    expect(resultLower.delta).toBeLessThan(0);
  });

  test('отрицательное quantity не инвертирует знак повторно (Math.abs)', () => {
    const positiveQty = [{ type: 'CALL', strike: 100, action: 'Buy', quantity: 3, delta: 0.4, gamma: 0, theta: 0, vega: 0 }];
    const negativeQty = [{ type: 'CALL', strike: 100, action: 'Buy', quantity: -3, delta: 0.4, gamma: 0, theta: 0, vega: 0 }];

    const resultPositive = calculateTotalGreeks(positiveQty, 100);
    const resultNegative = calculateTotalGreeks(negativeQty, 100);

    // Оба должны давать ОДИНАКОВЫЙ (положительный, т.к. Buy) результат — количество всегда по модулю.
    expect(resultNegative.delta).toBeCloseTo(resultPositive.delta, 10);
    expect(resultPositive.delta).toBeGreaterThan(0);
  });

  test('скрытые ноги (visible === false) не учитываются в сумме', () => {
    const options = [
      { type: 'CALL', strike: 100, action: 'Buy', quantity: 1, delta: 0.4, gamma: 0.01, theta: -0.02, vega: 0.1 },
      { type: 'PUT', strike: 90, action: 'Buy', quantity: 1, delta: -0.9, gamma: 0.5, theta: -5, vega: 3, visible: false }
    ];

    const result = calculateTotalGreeks(options, 100);
    const visibleOnly = calculateTotalGreeks([options[0]], 100);

    expect(result.delta).toBeCloseTo(visibleOnly.delta, 10);
    expect(result.gamma).toBeCloseTo(visibleOnly.gamma, 10);
    expect(result.theta).toBeCloseTo(visibleOnly.theta, 10);
    expect(result.vega).toBeCloseTo(visibleOnly.vega, 10);
  });

  test('пустой/отсутствующий массив опционов даёт нулевые греки', () => {
    expect(calculateTotalGreeks([], 100)).toEqual({ delta: 0, gamma: 0, theta: 0, vega: 0 });
    expect(calculateTotalGreeks(undefined, 100)).toEqual({ delta: 0, gamma: 0, theta: 0, vega: 0 });
  });

  test('contractMultiplier по умолчанию — 100 (обратная совместимость со старыми вызовами)', () => {
    const options = [{ type: 'CALL', strike: 100, action: 'Buy', quantity: 1, delta: 0.5, gamma: 0, theta: 0, vega: 0 }];
    const result = calculateTotalGreeks(options);
    expect(result.delta).toBeCloseTo(50, 5);
  });
});
