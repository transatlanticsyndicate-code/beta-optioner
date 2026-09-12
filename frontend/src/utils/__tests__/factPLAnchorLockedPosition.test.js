/**
 * Якорь Fact P&L у ЗАФИКСИРОВАННОЙ позиции, зафиксированной позже даты входа.
 *
 * РЕПРО С ПРОДА (2026-09-12, ESAB/NRG/ALGM): вход 29.08, фиксация сделки 31.08, выгрузка
 * терминала 12.09. «Сегодня» калькулятора у зафиксированной сделки = 12 дней от фиксации,
 * а якорь считался от даты входа = 14 дней — факт признавался «ещё не наступившим»,
 * колонка P&L показывала теорию (−$26) вместо загруженного Fact P&L (+$161.02).
 */

import { applyFactPLAnchor } from '../factPLAnchor';
import { calculateOptionTheoreticalPrice } from '../optionPricing';
import { calculateDaysRemainingUTC, calculateDaysRemainingPreciseET } from '../dateUtils';

const ESAB_LEG = {
  action: 'Buy',
  type: 'CALL',
  strike: 100,
  date: '2027-01-15',
  quantity: 6,
  ask: 1.15,
  bid: 1.2,
  entryDate: '2026-08-29',
  actualPL: 161.02,
  actualPLDate: '2026-09-12',
  actualPLQuantity: 6,
  actualPLPrice: null,
};

// Как getOldestEntryDate: локальная полночь даты входа.
const OLDEST_ENTRY = new Date(2026, 7, 29);
const PRICE = 68.27;
const FACT_IV = 49.12;

function runAnchor(option, daysPassed) {
  return applyFactPLAnchor({
    option,
    theoreticalPL: -26,
    targetDaysRemaining: calculateDaysRemainingUTC(option, daysPassed, 30, OLDEST_ENTRY),
    targetDaysRemainingPrecise: calculateDaysRemainingPreciseET(option, daysPassed, 30, OLDEST_ENTRY),
    targetDaysPassed: daysPassed,
    oldestEntry: OLDEST_ENTRY,
    computeTheoreticalPrice: (price, days, vol) => calculateOptionTheoreticalPrice(option, price, days, vol, 0, 0.04),
    anchorVolatility: FACT_IV,
    anchorPrice: PRICE,
    targetPrice: PRICE,
    entryPrice: option.ask,
    contractMultiplier: 100,
    currentQuantity: option.quantity,
  });
}

describe('applyFactPLAnchor — зафиксированная позиция (база дней = дата фиксации)', () => {
  it('в день выгрузки P&L равен загруженному факту, а не теории', () => {
    // Фиксация 31.08: до экспирации 15.01.27 — 137 дней; «сегодня» 12.09 = 12 дней от фиксации.
    const locked = { ...ESAB_LEG, id: 'esab-locked', isLockedPosition: true, initialDaysToExpiration: 137 };
    const result = runAnchor(locked, 12);
    expect(result.applied).toBe(true);
    expect(result.anchorDaysPassed).toBe(12);
    expect(result.pl).toBeCloseTo(161.02, 1);
  });

  it('до даты выгрузки якорь по-прежнему не применяется', () => {
    const locked = { ...ESAB_LEG, id: 'esab-locked-before', isLockedPosition: true, initialDaysToExpiration: 137 };
    expect(runAnchor(locked, 11).reason).toBe('before-anchor');
  });

  it('обычная (не зафиксированная) позиция считает якорь от даты входа, как раньше', () => {
    const unlocked = { ...ESAB_LEG, id: 'esab-unlocked' };
    const result = runAnchor(unlocked, 14);
    expect(result.applied).toBe(true);
    expect(result.anchorDaysPassed).toBe(14);
    expect(result.pl).toBeCloseTo(161.02, 1);
  });
});
