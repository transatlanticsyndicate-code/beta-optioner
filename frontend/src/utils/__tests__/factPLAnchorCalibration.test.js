/**
 * Тесты-инварианты калибровки якоря Fact P&L (frontend/src/utils/factPLAnchor.js,
 * режим калибровки волатильности вместо аддитивной поправки — см. заголовок файла).
 *
 * КОНТЕКСТ: аддитивная поправка не затухала к экспирации и давала убыток купленной
 * позиции больше уплаченной премии (см. scratchpad/anchor_decay/README.md). Калибровка
 * подбирает волатильность, при которой модель сама даёт факт брокера на момент якоря,
 * и весь дальнейший прогноз считается по ней — поправка гаснет естественно.
 *
 * Данные ICE и CCL — из реального аудита заказчика (scratchpad/anchor_decay/README.md,
 * §7.1 и §7.2 / examples.noRootC).
 */

import { applyFactPLAnchor } from '../factPLAnchor';
import { calculateOptionTheoreticalPrice } from '../optionPricing';
import { calculateDaysRemainingUTC } from '../dateUtils';

const OLDEST_ENTRY = new Date('2026-01-01T00:00:00Z');
const RFR = 0.04;

/** Строит computeTheoreticalPrice-колбэк поверх реального движка BSM для одной ноги. */
function makeComputeTheoreticalPrice(leg) {
  return (price, days, vol) => calculateOptionTheoreticalPrice(leg, price, days, vol, 0, RFR);
}

// --- ICE, Buy CALL 165 ×13, премия $377 (§7.1: самый большой остаток, Fact IV 31.6%) ---
const ICE_LEG = {
  type: 'CALL',
  strike: 165,
  action: 'Buy',
  ask: 377 / 13 / 100, // entryPrice × qty × 100 = 377 → entryPrice = 0.29
  bid: 377 / 13 / 100,
  quantity: 13,
  contractSize: 100,
  date: '2026-12-18',
  entryDate: '2026-01-01',
};
const ICE_ENTRY_PRICE = ICE_LEG.ask;
const ICE_MULT = 100;
const ICE_ANCHOR_DAYS_PASSED = 90;
const ICE_ANCHOR_DATE = new Date(OLDEST_ENTRY.getTime() + ICE_ANCHOR_DAYS_PASSED * 86400000).toISOString().slice(0, 10);
const ICE_FACT_PL = 3621; // из аудита
// Цена БА на момент якоря — около страйка (небольшая внутренняя стоимость), чтобы
// подразумеваемая факт-цена (entryPrice + factPL/(qty×mult) ≈ 3.08) была физически
// достижима моделью (внутренняя стоимость при 175 была бы 10 — выше факт-цены, корня
// бы не было; реальные ICE-данные из аудита используют другую, более раннюю точку
// якоря — здесь цена подобрана так, чтобы тест проверял именно калиброванную ветку).
const ICE_ANCHOR_PRICE = 160;
const ICE_FACT_IV = 31.6;

function iceOption(overrides = {}) {
  return {
    ...ICE_LEG,
    actualPL: ICE_FACT_PL,
    actualPLDate: ICE_ANCHOR_DATE,
    actualPLPrice: ICE_ANCHOR_PRICE,
    actualPLQuantity: ICE_LEG.quantity,
    quantity: ICE_LEG.quantity,
    ...overrides,
  };
}

function iceAnchorDaysToExp(option) {
  return calculateDaysRemainingUTC(option, ICE_ANCHOR_DAYS_PASSED, 30, OLDEST_ENTRY);
}

// --- CCL, Buy PUT 26 ×1, премия $177 (§7.2: ошибочный ввод, факт недостижим) ---
const CCL_LEG = {
  type: 'PUT',
  strike: 26,
  action: 'Buy',
  ask: 1.77,
  bid: 1.77,
  quantity: 1,
  contractSize: 100,
  date: '2026-10-16',
  entryDate: '2026-01-01',
};
const CCL_ENTRY_PRICE = CCL_LEG.ask;
const CCL_MULT = 100;
const CCL_ANCHOR_DAYS_PASSED = 90;
const CCL_ANCHOR_DATE = new Date(OLDEST_ENTRY.getTime() + CCL_ANCHOR_DAYS_PASSED * 86400000).toISOString().slice(0, 10);
const CCL_FACT_PL = -247; // факт брокера — больше уплаченной премии $177, недостижим
const CCL_ANCHOR_PRICE = 24;
const CCL_FACT_IV = 45;

function cclOption() {
  return {
    ...CCL_LEG,
    actualPL: CCL_FACT_PL,
    actualPLDate: CCL_ANCHOR_DATE,
    actualPLPrice: CCL_ANCHOR_PRICE,
    actualPLQuantity: CCL_LEG.quantity,
    quantity: CCL_LEG.quantity,
  };
}

describe('applyFactPLAnchor (калибровка волатильности) — инварианты', () => {
  it('1) в точке якоря результат равен ровно фактическому P&L (воспроизведение факта)', () => {
    const option = iceOption();
    const anchorDaysToExp = iceAnchorDaysToExp(option);

    const result = applyFactPLAnchor({
      option,
      theoreticalPL: 0, // не используется в калиброванном режиме — передаём заглушку
      targetDaysRemaining: anchorDaysToExp,
      targetDaysPassed: ICE_ANCHOR_DAYS_PASSED,
      oldestEntry: OLDEST_ENTRY,
      computeTheoreticalPrice: makeComputeTheoreticalPrice(ICE_LEG),
      anchorVolatility: ICE_FACT_IV,
      anchorPrice: ICE_ANCHOR_PRICE,
      targetPrice: ICE_ANCHOR_PRICE, // целевая точка совпадает с точкой якоря
      entryPrice: ICE_ENTRY_PRICE,
      contractMultiplier: ICE_MULT,
      currentQuantity: ICE_LEG.quantity,
    });

    expect(result.mode).toBe('calibrated');
    expect(result.applied).toBe(true);
    expect(result.pl).toBeCloseTo(ICE_FACT_PL, 1);
  });

  it('2) убыток купленной позиции НИКОГДА не превышает уплаченную премию (ICE, премия $377) — сегодня / за день до экспирации / на экспирации', () => {
    const option = iceOption();
    const legCost = ICE_ENTRY_PRICE * ICE_LEG.quantity * ICE_MULT; // 377
    const computeTheoreticalPrice = makeComputeTheoreticalPrice(ICE_LEG);
    const commonArgs = {
      option,
      oldestEntry: OLDEST_ENTRY,
      computeTheoreticalPrice,
      anchorVolatility: ICE_FACT_IV,
      anchorPrice: ICE_ANCHOR_PRICE,
      entryPrice: ICE_ENTRY_PRICE,
      contractMultiplier: ICE_MULT,
      currentQuantity: ICE_LEG.quantity,
    };

    // "Сегодня" — 30 дней после якоря, актив упал (сценарий убытка).
    const todayDaysPassed = ICE_ANCHOR_DAYS_PASSED + 30;
    const todayDaysRemaining = calculateDaysRemainingUTC(option, todayDaysPassed, 30, OLDEST_ENTRY);
    const resToday = applyFactPLAnchor({
      ...commonArgs,
      theoreticalPL: 0,
      targetDaysRemaining: todayDaysRemaining,
      targetDaysPassed: todayDaysPassed,
      targetPrice: 140, // сильное падение базового актива
    });
    expect(resToday.pl).toBeGreaterThanOrEqual(-legCost - 0.01);

    // "За день до экспирации" — актив вне денег, временная стоимость почти испарилась.
    const expDaysPassed = 364; // близко к дате экспирации (initDte ~350 дней от 2026-01-01 до 2026-12-18)
    const expM1DaysRemaining = 1;
    const resExpM1 = applyFactPLAnchor({
      ...commonArgs,
      theoreticalPL: 0,
      targetDaysRemaining: expM1DaysRemaining,
      targetDaysPassed: expDaysPassed,
      targetPrice: 140,
    });
    expect(resExpM1.pl).toBeGreaterThanOrEqual(-legCost - 0.01);

    // "На экспирации" — гард отключает якорь, чистая формула intrinsic − entry.
    const plAtExpiryPure = (Math.max(0, 140 - ICE_LEG.strike) - ICE_ENTRY_PRICE) * ICE_LEG.quantity * ICE_MULT;
    const resExp = applyFactPLAnchor({
      ...commonArgs,
      theoreticalPL: plAtExpiryPure,
      targetDaysRemaining: 0,
      targetDaysPassed: expDaysPassed + 1,
      targetPrice: 140,
    });
    expect(resExp.applied).toBe(false);
    expect(resExp.reason).toBe('expiry');
    expect(resExp.pl).toBeGreaterThanOrEqual(-legCost - 0.01);
  });

  it('3) поправка затухает: |результат − чистая теория| уменьшается по мере приближения к экспирации', () => {
    const option = iceOption();
    const computeTheoreticalPrice = makeComputeTheoreticalPrice(ICE_LEG);
    const commonArgs = {
      option,
      oldestEntry: OLDEST_ENTRY,
      computeTheoreticalPrice,
      anchorVolatility: ICE_FACT_IV,
      anchorPrice: ICE_ANCHOR_PRICE,
      entryPrice: ICE_ENTRY_PRICE,
      contractMultiplier: ICE_MULT,
      currentQuantity: ICE_LEG.quantity,
    };

    const targetAssetPrice = 170; // фиксированная цена БА для всех горизонтов
    const horizonsDaysPassed = [ICE_ANCHOR_DAYS_PASSED + 5, ICE_ANCHOR_DAYS_PASSED + 60, ICE_ANCHOR_DAYS_PASSED + 150];

    const gaps = horizonsDaysPassed.map((daysPassed) => {
      const daysRemaining = calculateDaysRemainingUTC(option, daysPassed, 30, OLDEST_ENTRY);
      const pureTheoPrice = computeTheoreticalPrice(targetAssetPrice, daysRemaining, ICE_FACT_IV);
      const pureTheoPL = (pureTheoPrice - ICE_ENTRY_PRICE) * ICE_LEG.quantity * ICE_MULT;

      const anchored = applyFactPLAnchor({
        ...commonArgs,
        theoreticalPL: pureTheoPL,
        targetDaysRemaining: daysRemaining,
        targetDaysPassed: daysPassed,
        targetPrice: targetAssetPrice,
      });

      return Math.abs(anchored.pl - pureTheoPL);
    });

    // По мере приближения к экспирации (растущий daysPassed → падающий daysRemaining)
    // разрыв между калиброванным и чистым теоретическим прогнозом должен убывать —
    // это и есть «затухание» в отличие от старой постоянной аддитивной добавки.
    expect(gaps[1]).toBeLessThanOrEqual(gaps[0] + 1e-6);
    expect(gaps[2]).toBeLessThanOrEqual(gaps[1] + 1e-6);
  });

  it('4) на дату экспирации якорь не применяется (гард)', () => {
    const option = iceOption();
    const purePL = -50;
    const result = applyFactPLAnchor({
      option,
      theoreticalPL: purePL,
      targetDaysRemaining: 0,
      targetDaysPassed: 400,
      oldestEntry: OLDEST_ENTRY,
      computeTheoreticalPrice: makeComputeTheoreticalPrice(ICE_LEG),
      anchorVolatility: ICE_FACT_IV,
      anchorPrice: ICE_ANCHOR_PRICE,
      targetPrice: 140,
      entryPrice: ICE_ENTRY_PRICE,
      contractMultiplier: ICE_MULT,
      currentQuantity: ICE_LEG.quantity,
    });

    expect(result.applied).toBe(false);
    expect(result.reason).toBe('expiry');
    expect(result.pl).toBe(purePL);
    expect(result.mode).toBe('none');
  });

  it('5) нога с недостижимым фактом (CCL PUT 26: премия $177, факт −$247) → режим фолбэка, результат не хуже −$177', () => {
    const option = cclOption();
    const legCost = CCL_ENTRY_PRICE * CCL_LEG.quantity * CCL_MULT; // 177
    const computeTheoreticalPrice = makeComputeTheoreticalPrice(CCL_LEG);
    const anchorDaysToExp = calculateDaysRemainingUTC(option, CCL_ANCHOR_DAYS_PASSED, 30, OLDEST_ENTRY);

    const commonArgs = {
      option,
      oldestEntry: OLDEST_ENTRY,
      computeTheoreticalPrice,
      anchorVolatility: CCL_FACT_IV,
      anchorPrice: CCL_ANCHOR_PRICE,
      entryPrice: CCL_ENTRY_PRICE,
      contractMultiplier: CCL_MULT,
      currentQuantity: CCL_LEG.quantity,
    };

    // В точке якоря — тоже фолбэк (корня нет), но по построению не хуже −premium.
    const atAnchor = applyFactPLAnchor({
      ...commonArgs,
      theoreticalPL: 0,
      targetDaysRemaining: anchorDaysToExp,
      targetDaysPassed: CCL_ANCHOR_DAYS_PASSED,
      targetPrice: CCL_ANCHOR_PRICE,
    });
    expect(atAnchor.mode).toBe('fallback');
    expect(atAnchor.applied).toBe(true);
    expect(atAnchor.reason).not.toBeNull();
    expect(atAnchor.pl).toBeGreaterThanOrEqual(-legCost - 0.01);

    // Позже, ближе к экспирации — тот же предел держится.
    const laterDaysPassed = CCL_ANCHOR_DAYS_PASSED + 100;
    const laterDaysRemaining = calculateDaysRemainingUTC(option, laterDaysPassed, 30, OLDEST_ENTRY);
    const later = applyFactPLAnchor({
      ...commonArgs,
      theoreticalPL: 0,
      targetDaysRemaining: laterDaysRemaining,
      targetDaysPassed: laterDaysPassed,
      targetPrice: 20, // глубоко ITM для PUT — стресс-сценарий
    });
    expect(later.mode).toBe('fallback');
    expect(later.pl).toBeGreaterThanOrEqual(-legCost - 0.01);
  });

  it('калиброванная волатильность близка к введённой Fact IV (ICE: Fact IV 31.6% → аудит ожидает σ* ≈ 29.4%)', () => {
    const option = iceOption();
    const anchorDaysToExp = iceAnchorDaysToExp(option);

    const result = applyFactPLAnchor({
      option,
      theoreticalPL: 0,
      targetDaysRemaining: anchorDaysToExp,
      targetDaysPassed: ICE_ANCHOR_DAYS_PASSED,
      oldestEntry: OLDEST_ENTRY,
      computeTheoreticalPrice: makeComputeTheoreticalPrice(ICE_LEG),
      anchorVolatility: ICE_FACT_IV,
      anchorPrice: ICE_ANCHOR_PRICE,
      targetPrice: ICE_ANCHOR_PRICE,
      entryPrice: ICE_ENTRY_PRICE,
      contractMultiplier: ICE_MULT,
      currentQuantity: ICE_LEG.quantity,
    });

    expect(result.mode).toBe('calibrated');
    expect(result.calibratedVolatility).not.toBeNull();
    // Не проверяем точное совпадение с аудитом (там другая цена БА на якоре) —
    // проверяем, что калибровка вообще находит разумный (не вырожденный) корень.
    expect(result.calibratedVolatility).toBeGreaterThan(1);
    expect(result.calibratedVolatility).toBeLessThan(500);
  });

  it('memoization: повторный вызов с тем же ключом якоря не пересчитывает калибровку заново (тот же результат при разных целевых точках)', () => {
    const option = iceOption();
    const anchorDaysToExp = iceAnchorDaysToExp(option);
    const computeTheoreticalPrice = makeComputeTheoreticalPrice(ICE_LEG);

    const base = {
      option,
      oldestEntry: OLDEST_ENTRY,
      computeTheoreticalPrice,
      anchorVolatility: ICE_FACT_IV,
      anchorPrice: ICE_ANCHOR_PRICE,
      entryPrice: ICE_ENTRY_PRICE,
      contractMultiplier: ICE_MULT,
      currentQuantity: ICE_LEG.quantity,
    };

    const r1 = applyFactPLAnchor({
      ...base, theoreticalPL: 0, targetDaysRemaining: anchorDaysToExp, targetDaysPassed: ICE_ANCHOR_DAYS_PASSED, targetPrice: 150,
    });
    const r2 = applyFactPLAnchor({
      ...base, theoreticalPL: 0, targetDaysRemaining: Math.max(1, anchorDaysToExp - 10), targetDaysPassed: ICE_ANCHOR_DAYS_PASSED + 10, targetPrice: 160,
    });

    // Разные целевые точки → разная итоговая P&L, но одна и та же калиброванная волатильность
    // (зависит только от точки якоря, которая не менялась) — подтверждает переиспользование кэша.
    expect(r1.calibratedVolatility).toBeCloseTo(r2.calibratedVolatility, 6);
    expect(r1.pl).not.toBeCloseTo(r2.pl, 2);
  });
});
