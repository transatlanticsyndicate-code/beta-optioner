/**
 * Тесты-инварианты единой функции якорной поправки Fact P&L (frontend/src/utils/factPLAnchor.js).
 *
 * КОНТЕКСТ: формула была продублирована в семи местах кодовой базы (см. заголовок
 * factPLAnchor.js). Копии успели разъехаться и дать реальные баги на проде — эти
 * тесты фиксируют инварианты, отсутствие которых и было причиной багов, поверх
 * РЕАЛЬНОГО движка ценообразования (calculateOptionPLValue/calculateOptionTheoreticalPrice),
 * а не его копии.
 */

import { applyFactPLAnchor } from '../factPLAnchor';
import { calculateOptionPLValue, calculateOptionTheoreticalPrice } from '../optionPricing';
import { calculateDaysRemainingUTC } from '../dateUtils';

// --- Данные MKTX-репро (см. также expiryAnchorInvariant.test.js, exitPlanExpiryGuard.test.js) ---
// entryDate = дата OLDEST_ENTRY ниже — чтобы calculateDaysRemainingUTC (используется
// внутри applyFactPLAnchor для anchorDaysToExp) считал дни до экспирации от
// заранее известной точки, а не от фолбэка «сегодня» (без entryDate он берёт
// реальную сегодняшнюю дату, что делает тест зависимым от даты запуска).
const CALL_LEG = {
  type: 'CALL',
  strike: 130,
  action: 'Buy',
  ask: 3.97,
  bid: 3.97,
  quantity: 4,
  contractSize: 100,
  date: '2026-09-18',
  entryDate: '2026-01-01',
};

const PUT_LEG = {
  type: 'PUT',
  strike: 115,
  action: 'Buy',
  ask: 8.02,
  bid: 8.02,
  quantity: 2,
  contractSize: 100,
  date: '2026-09-18',
  entryDate: '2026-01-01',
};

const TOTAL_PREMIUM =
  CALL_LEG.ask * CALL_LEG.quantity * CALL_LEG.contractSize +
  PUT_LEG.ask * PUT_LEG.quantity * PUT_LEG.contractSize; // 1588 + 1604 = 3192

const OLDEST_ENTRY = new Date('2026-01-01T00:00:00Z');

/** Строит computeTheoreticalPL-колбэк поверх реального движка для одной ноги. */
function makeComputeTheoreticalPL(leg) {
  return (price, days, vol) => calculateOptionPLValue(leg, price, price, days, vol);
}

describe('applyFactPLAnchor — инварианты', () => {
  it('1) на дату экспирации (targetDaysRemaining <= 0) якорь НЕ применяется', () => {
    const theoreticalPL = calculateOptionPLValue(PUT_LEG, 120, 120, 0);
    const result = applyFactPLAnchor({
      option: { ...PUT_LEG, actualPL: -900, actualPLDate: '2026-06-01', actualPLQuantity: 2, quantity: 2 },
      theoreticalPL,
      targetDaysRemaining: 0,
      targetDaysPassed: 200,
      oldestEntry: OLDEST_ENTRY,
      anchorVolatility: 100,
      anchorPrice: 125,
      currentQuantity: 2,
      computeTheoreticalPL: makeComputeTheoreticalPL(PUT_LEG),
    });

    expect(result.applied).toBe(false);
    expect(result.reason).toBe('expiry');
    expect(result.pl).toBe(theoreticalPL);
    expect(result.residual).toBeNull();
  });

  it('2) убыток купленной позиции на экспирации не превышает уплаченную премию (MKTX: 4×CALL130@3.97 + 2×PUT115@8.02, премия $3192)', () => {
    const SPOT_AT_EXPIRY = 120; // между страйками — обе ноги истекают без внутренней стоимости
    const plCallExpiry = calculateOptionPLValue(CALL_LEG, SPOT_AT_EXPIRY, SPOT_AT_EXPIRY, 0);
    const plPutExpiry = calculateOptionPLValue(PUT_LEG, SPOT_AT_EXPIRY, SPOT_AT_EXPIRY, 0);

    // Якорь введён только на PUT, на промежуточную (не экспирационную) дату,
    // с высокой Fact IV — ровно репро-сценарий прод-бага (см. expiryAnchorInvariant.test.js).
    const resultCall = applyFactPLAnchor({
      option: { ...CALL_LEG, actualPL: null, actualPLDate: null, actualPLQuantity: null, quantity: 4 },
      theoreticalPL: plCallExpiry,
      targetDaysRemaining: 0,
      targetDaysPassed: 260,
      oldestEntry: OLDEST_ENTRY,
      anchorVolatility: 100,
      anchorPrice: 125,
      currentQuantity: 4,
      computeTheoreticalPL: makeComputeTheoreticalPL(CALL_LEG),
    });

    const resultPut = applyFactPLAnchor({
      option: { ...PUT_LEG, actualPL: -900, actualPLDate: '2026-06-01', actualPLQuantity: 2, quantity: 2 },
      theoreticalPL: plPutExpiry,
      targetDaysRemaining: 0, // экспирация — гард обязан отключить якорь
      targetDaysPassed: 260,
      oldestEntry: OLDEST_ENTRY,
      anchorVolatility: 100,
      anchorPrice: 125,
      currentQuantity: 2,
      computeTheoreticalPL: makeComputeTheoreticalPL(PUT_LEG),
    });

    expect(resultCall.applied).toBe(false);
    expect(resultPut.applied).toBe(false);

    const total = resultCall.pl + resultPut.pl;
    expect(total).toBeCloseTo(-TOTAL_PREMIUM, 2);
    expect(Math.abs(total)).toBeLessThanOrEqual(TOTAL_PREMIUM + 1e-6);
  });

  it('3) в точке якоря (targetDaysPassed == anchorDaysPassed, целевая точка == точка якоря) результат равен ровно actualPL × коэффициент количества', () => {
    const anchorDaysPassed = 150; // дней от OLDEST_ENTRY до actualPLDate ниже
    const anchorDateStr = new Date(OLDEST_ENTRY.getTime() + anchorDaysPassed * 86400000)
      .toISOString()
      .slice(0, 10);

    // «Дни до экспирации» на дату якоря — та же утилита, что использует сама
    // applyFactPLAnchor внутри. Раз целевая точка совпадает с точкой якоря
    // (targetDaysPassed === anchorDaysPassed), targetDaysRemaining ДОЛЖЕН равняться
    // этому же значению, иначе точки физически не совпадают.
    const targetDaysRemaining = calculateDaysRemainingUTC(PUT_LEG, anchorDaysPassed, 30, OLDEST_ENTRY);
    const anchorPrice = 118;
    const anchorVolatility = 47.84;

    // Теоретическая P&L «в целевой точке» здесь численно равна теоретической P&L
    // «в точке якоря» — целевая точка совпадает с точкой ввода якоря (тот же
    // price/days/vol), поэтому (theoreticalPL - plAtAnchor) == 0 по построению.
    const theoreticalPLAtAnchorPoint = calculateOptionPLValue(PUT_LEG, anchorPrice, anchorPrice, targetDaysRemaining, anchorVolatility);

    const actualPL = -415;
    const actualPLQuantity = 2;
    const currentQuantity = 4; // коэффициент = 4/2 = 2 — проверяем, что масштабирование реально работает

    const result = applyFactPLAnchor({
      option: { ...PUT_LEG, actualPL, actualPLDate: anchorDateStr, actualPLQuantity, quantity: currentQuantity },
      theoreticalPL: theoreticalPLAtAnchorPoint,
      targetDaysRemaining,
      targetDaysPassed: anchorDaysPassed, // === anchorDaysPassed → «точка якоря»
      oldestEntry: OLDEST_ENTRY,
      anchorVolatility,
      anchorPrice,
      currentQuantity,
      computeTheoreticalPL: makeComputeTheoreticalPL(PUT_LEG),
    });

    expect(result.applied).toBe(true);
    const ratio = currentQuantity / actualPLQuantity;
    expect(result.pl).toBeCloseTo(actualPL * ratio, 6);
  });

  it('4) при равных количествах коэффициент = 1 и результат = actualPL + (теор.цель − теор.якорь)', () => {
    const targetPrice = 122;
    const targetDaysRemaining = 45;
    const anchorPrice = 118;
    const anchorDaysPassed = 100;
    const anchorVolatility = 43.37;
    const actualPL = -880;
    const quantity = 2;

    const theoreticalPL = calculateOptionPLValue(PUT_LEG, targetPrice, targetPrice, targetDaysRemaining, anchorVolatility);

    const anchorDateStr = new Date(OLDEST_ENTRY.getTime() + anchorDaysPassed * 86400000)
      .toISOString()
      .slice(0, 10);

    // Независимый расчёт «дней на якоре» той же утилитой, что использует сама
    // applyFactPLAnchor — чтобы проверка plAtAnchor не была тавтологией.
    const anchorDaysToExp = calculateDaysRemainingUTC(PUT_LEG, anchorDaysPassed, 30, OLDEST_ENTRY);
    const expectedPlAtAnchor = calculateOptionPLValue(PUT_LEG, anchorPrice, anchorPrice, anchorDaysToExp, anchorVolatility);

    const result = applyFactPLAnchor({
      option: { ...PUT_LEG, actualPL, actualPLDate: anchorDateStr, actualPLQuantity: quantity, quantity },
      theoreticalPL,
      targetDaysRemaining,
      targetDaysPassed: anchorDaysPassed + 30, // позже даты якоря
      oldestEntry: OLDEST_ENTRY,
      anchorVolatility,
      anchorPrice,
      currentQuantity: quantity,
      computeTheoreticalPL: makeComputeTheoreticalPL(PUT_LEG),
    });

    expect(result.applied).toBe(true);
    expect(result.plAtAnchor).toBeCloseTo(expectedPlAtAnchor, 6);
    expect(result.pl).toBeCloseTo(actualPL + (theoreticalPL - result.plAtAnchor), 6);
  });

  it('5) волатильность 150 (проценты) даёт цену дороже, чем 50 — единицы не теряются внутри функции', () => {
    const price = 100;
    const days = 30;

    // (а) computeTheoreticalPL получает anchorVolatility БЕЗ каких-либо трансформаций —
    // проверяем прямым перехватом аргумента (если бы функция случайно делила ещё раз
    // на 100, сюда пришло бы не 150, а 1.5).
    const receivedVolatilities = [];
    const spyComputeTheoreticalPL = (p, d, vol) => {
      receivedVolatilities.push(vol);
      return calculateOptionPLValue(PUT_LEG, p, p, d, vol);
    };

    const baseOption = { ...PUT_LEG, actualPL: -100, actualPLDate: '2026-01-15', actualPLQuantity: 2, quantity: 2 };

    applyFactPLAnchor({
      option: baseOption,
      theoreticalPL: 0,
      targetDaysRemaining: 30,
      targetDaysPassed: 100,
      oldestEntry: OLDEST_ENTRY,
      anchorVolatility: 150,
      anchorPrice: price,
      currentQuantity: 2,
      computeTheoreticalPL: spyComputeTheoreticalPL,
    });

    applyFactPLAnchor({
      option: baseOption,
      theoreticalPL: 0,
      targetDaysRemaining: 30,
      targetDaysPassed: 100,
      oldestEntry: OLDEST_ENTRY,
      anchorVolatility: 50,
      anchorPrice: price,
      currentQuantity: 2,
      computeTheoreticalPL: spyComputeTheoreticalPL,
    });

    expect(receivedVolatilities).toEqual([150, 50]); // ровно то, что передали — без деления внутри applyFactPLAnchor

    // (б) сквозная проверка через реальный движок: более высокая IV даёт более дорогую
    // (более щедрую по временной стоимости) теоретическую цену опциона.
    const priceAtVol150 = calculateOptionTheoreticalPrice(PUT_LEG, price, days, 150);
    const priceAtVol50 = calculateOptionTheoreticalPrice(PUT_LEG, price, days, 50);
    expect(priceAtVol150).toBeGreaterThan(priceAtVol50);
  });
});
