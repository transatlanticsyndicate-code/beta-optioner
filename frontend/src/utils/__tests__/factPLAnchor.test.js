/**
 * Тесты-инварианты единой функции якорной поправки Fact P&L (frontend/src/utils/factPLAnchor.js).
 *
 * КОНТЕКСТ: формула была продублирована в семи местах кодовой базы (см. заголовок
 * factPLAnchor.js). Копии успели разъехаться и дать реальные баги на проде — эти
 * тесты фиксируют инварианты, отсутствие которых и было причиной багов, поверх
 * РЕАЛЬНОГО движка ценообразования (calculateOptionPLValue/calculateOptionTheoreticalPrice),
 * а не его копии.
 *
 * ОБНОВЛЕНО (2026-08, переход на калибровку волатильности): тесты 3–5 ниже проверяли
 * АДДИТИВНУЮ формулу (pl = actualPL×ratio + (теор.цель − теор.якорь)), которая больше
 * не является поведением applyFactPLAnchor — теперь функция подбирает волатильность,
 * при которой модель сама даёт факт (см. заголовок factPLAnchor.js и
 * frontend/src/utils/__tests__/factPLAnchorCalibration.test.js для полного набора
 * инвариантов калибровки). Тесты 3–5 переписаны под новый контракт (computeTheoreticalPrice/
 * entryPrice/contractMultiplier/targetPrice вместо computeTheoreticalPL), а не удалены —
 * они по-прежнему полезны как регрессия конкретно для этих MKTX/PUT-данных. Тесты 1–2
 * (гард экспирации) поведение не меняют и оставлены как есть.
 */

import { applyFactPLAnchor } from '../factPLAnchor';
import { calculateOptionPLValue, calculateOptionTheoreticalPrice } from '../optionPricing';
import { calculateDaysRemainingUTC, calculateDaysRemainingPreciseET } from '../dateUtils';

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

/**
 * Строит computeTheoreticalPrice-колбэк (сырая цена опциона, без P&L-конвертации) —
 * то, что теперь требует applyFactPLAnchor для калибровки волатильности.
 */
function makeComputeTheoreticalPrice(leg) {
  return (price, days, vol) => calculateOptionTheoreticalPrice(leg, price, days, vol);
}

const PUT_ENTRY_PRICE = PUT_LEG.ask; // 8.02 — Buy → вход по ASK
const PUT_MULT = PUT_LEG.contractSize; // 100

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

  it('3) в точке якоря (targetDaysPassed == anchorDaysPassed, целевая точка == точка якоря) результат равен ровно actualPL × коэффициент количества (калибровка)', () => {
    const anchorDaysPassed = 150; // дней от OLDEST_ENTRY до actualPLDate ниже
    const anchorDateStr = new Date(OLDEST_ENTRY.getTime() + anchorDaysPassed * 86400000)
      .toISOString()
      .slice(0, 10);

    // «Дни до экспирации» на дату якоря — та же утилита, что использует сама
    // applyFactPLAnchor внутри для ГАРДОВ. Раз целевая точка совпадает с точкой якоря
    // (targetDaysPassed === anchorDaysPassed), targetDaysRemaining ДОЛЖЕН равняться
    // этому же значению, иначе точки физически не совпадают.
    const targetDaysRemaining = calculateDaysRemainingUTC(PUT_LEG, anchorDaysPassed, 30, OLDEST_ENTRY);
    // Точная (ET) шкала — так реально вызывают applyFactPLAnchor OptionsTableV3.jsx/
    // ExitPlanTable.jsx/startPLSnapshot.js: ОТДЕЛЬНЫЙ вызов calculateDaysRemainingPreciseET
    // с тем же daysPassed, а не переиспользование targetDaysRemaining. Раньше тест
    // передавал одно и то же целое число в оба параметра (де-факто не передавал
    // targetDaysRemainingPrecise вообще) — из-за чего расхождение шкалы якоря/цели
    // не ловилось этим тестом (см. регрессию 2026-08 в JSDoc applyFactPLAnchor).
    const targetDaysRemainingPrecise = calculateDaysRemainingPreciseET(PUT_LEG, anchorDaysPassed, 30, OLDEST_ENTRY);
    const anchorPrice = 118;
    const anchorVolatility = 47.84; // Fact IV — используется как база для plAtAnchor/фолбэка, не как результат

    const actualPL = -415;
    const actualPLQuantity = 2;
    const currentQuantity = 4; // коэффициент = 4/2 = 2 — проверяем, что масштабирование реально работает

    const result = applyFactPLAnchor({
      option: { ...PUT_LEG, actualPL, actualPLDate: anchorDateStr, actualPLQuantity, quantity: currentQuantity },
      theoreticalPL: 0, // не используется в калиброванном режиме
      targetDaysRemaining,
      targetDaysRemainingPrecise,
      targetDaysPassed: anchorDaysPassed, // === anchorDaysPassed → «точка якоря»
      oldestEntry: OLDEST_ENTRY,
      computeTheoreticalPrice: makeComputeTheoreticalPrice(PUT_LEG),
      anchorVolatility,
      anchorPrice,
      targetPrice: anchorPrice, // целевая точка совпадает с точкой якоря
      entryPrice: PUT_ENTRY_PRICE,
      contractMultiplier: PUT_MULT,
      currentQuantity,
    });

    expect(result.applied).toBe(true);
    expect(result.mode).toBe('calibrated');
    const ratio = currentQuantity / actualPLQuantity;
    // Точность ограничена tolerance бисекции (1e-4 по цене контракта), умноженным на
    // qty×mult (4×100=400) — итоговый допуск в P&L порядка нескольких центов.
    expect(result.pl).toBeCloseTo(actualPL * ratio, 1);
  });

  it('4) вдали от точки якоря результат совпадает с теоретической ценой по КАЛИБРОВАННОЙ волатильности (не по Fact IV)', () => {
    const targetPriceAsset = 122;
    const targetDaysRemaining = 45;
    const anchorPrice = 118;
    const anchorDaysPassed = 100;
    const anchorVolatility = 43.37; // Fact IV, введённая пользователем — НЕ равна калиброванной σ*
    const actualPL = -880;
    const quantity = 2;

    const anchorDateStr = new Date(OLDEST_ENTRY.getTime() + anchorDaysPassed * 86400000)
      .toISOString()
      .slice(0, 10);

    const result = applyFactPLAnchor({
      option: { ...PUT_LEG, actualPL, actualPLDate: anchorDateStr, actualPLQuantity: quantity, quantity },
      theoreticalPL: 0,
      targetDaysRemaining,
      targetDaysPassed: anchorDaysPassed + 30, // позже даты якоря
      oldestEntry: OLDEST_ENTRY,
      computeTheoreticalPrice: makeComputeTheoreticalPrice(PUT_LEG),
      anchorVolatility,
      anchorPrice,
      targetPrice: targetPriceAsset,
      entryPrice: PUT_ENTRY_PRICE,
      contractMultiplier: PUT_MULT,
      currentQuantity: quantity,
    });

    expect(result.applied).toBe(true);
    expect(result.mode).toBe('calibrated');
    expect(result.calibratedVolatility).not.toBeNull();
    // Калиброванная волатильность НЕ обязана совпадать с введённой Fact IV — именно
    // в этом смысл калибровки (модель подстраивается под факт, а не наоборот).
    expect(result.calibratedVolatility).not.toBeCloseTo(anchorVolatility, 1);

    // Итоговая P&L обязана в точности совпадать с прямым пересчётом по калиброванной
    // волатильности — то есть applyFactPLAnchor не подмешивает ничего сверху.
    const expectedPrice = calculateOptionTheoreticalPrice(PUT_LEG, targetPriceAsset, targetDaysRemaining, result.calibratedVolatility);
    const expectedPL = (expectedPrice - PUT_ENTRY_PRICE) * quantity * PUT_MULT; // Buy, ratio=1 (currentQuantity===actualPLQuantity)
    expect(result.pl).toBeCloseTo(expectedPL, 6);
  });

  it('5) волатильность 150 (проценты) передаётся в computeTheoreticalPrice БЕЗ трансформаций — единицы не теряются внутри функции', () => {
    const price = 100;

    // computeTheoreticalPrice получает anchorVolatility БЕЗ каких-либо трансформаций при
    // расчёте «теоретической цены на якоре по Fact IV» (первый вызов в каждом сценарии) —
    // если бы функция случайно делила ещё раз на 100, сюда пришло бы не 150, а 1.5.
    const receivedVolatilities = [];
    const spyComputeTheoreticalPrice = (p, d, vol) => {
      receivedVolatilities.push(vol);
      return calculateOptionTheoreticalPrice(PUT_LEG, p, d, vol);
    };

    // Fact P&L ниже уплаченного в разы (для PUT купленной ноги) — заведомо недостижимо
    // ни при какой волатильности (below-intrinsic либо far below theo), поэтому подбор
    // уходит в фолбэк — а фолбэк-ветка тоже обязана читать anchorVolatility как есть
    // (используется и для расчёта интринсика/теории на якоре по Fact IV, и в фолбэке
    // на цели). Разные значения anchorVolatility → разные ключи кэша, коллизий нет.
    applyFactPLAnchor({
      option: { ...PUT_LEG, actualPL: -1, actualPLDate: '2026-01-15', actualPLQuantity: 2, quantity: 2 },
      theoreticalPL: 0,
      targetDaysRemaining: 30,
      targetDaysPassed: 100,
      oldestEntry: OLDEST_ENTRY,
      computeTheoreticalPrice: spyComputeTheoreticalPrice,
      anchorVolatility: 150,
      anchorPrice: price,
      targetPrice: price,
      entryPrice: PUT_ENTRY_PRICE,
      contractMultiplier: PUT_MULT,
      currentQuantity: 2,
    });

    applyFactPLAnchor({
      option: { ...PUT_LEG, actualPL: -1, actualPLDate: '2026-01-16', actualPLQuantity: 2, quantity: 2 },
      theoreticalPL: 0,
      targetDaysRemaining: 30,
      targetDaysPassed: 100,
      oldestEntry: OLDEST_ENTRY,
      computeTheoreticalPrice: spyComputeTheoreticalPrice,
      anchorVolatility: 50,
      anchorPrice: price,
      targetPrice: price,
      entryPrice: PUT_ENTRY_PRICE,
      contractMultiplier: PUT_MULT,
      currentQuantity: 2,
    });

    // Первый вызов в каждом сценарии — расчёт теоретической цены на якоре по Fact IV
    // (theoAnchorPriceOriginal внутри applyFactPLAnchor), который получает anchorVolatility
    // напрямую как переданное значение.
    expect(receivedVolatilities[0]).toBe(150);
    // Индекс второго набора вызовов зависит от того, сколько итераций сделала бисекция
    // в первом сценарии — ищем первое вхождение 50 после этого, а не по фиксированному индексу.
    expect(receivedVolatilities).toContain(50);
    expect(receivedVolatilities.every((v) => v === 150 || v === 50 || (v > 1 && v <= 500))).toBe(true);

    // (б) сквозная проверка через реальный движок: более высокая IV даёт более дорогую
    // (более щедрую по временной стоимости) теоретическую цену опциона.
    const priceAtVol150 = calculateOptionTheoreticalPrice(PUT_LEG, price, 30, 150);
    const priceAtVol50 = calculateOptionTheoreticalPrice(PUT_LEG, price, 30, 50);
    expect(priceAtVol150).toBeGreaterThan(priceAtVol50);
  });
});
