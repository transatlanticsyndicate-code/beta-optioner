/**
 * Числовой тест-инвариант для гарда экспирации в формуле якоря плана выхода
 * (ExitPlanTable.jsx, функция calculateStepPL, ~строки 472-607).
 *
 * КОНТЕКСТ (задача 1C-1, tasks/audit-p0-p1):
 * Формула якоря «P&L = введённый пользователем Fact P&L × доля_шага +
 * (теоретическая P&L на дату выхода шага − теоретическая P&L на дату ввода
 * Fact P&L)» продублирована в 4 местах кодовой базы (ExitPlanTable.jsx,
 * OptionsTableV3.jsx ×2, usePositionExitCalculator.js ×2). В ExitPlanTable.jsx
 * защиты `optionDaysRemaining > 0` не было — на дату экспирации якорь
 * применялся, хотя там P&L обязана считаться чистой формулой
 * intrinsic_value − премия. Это позволяло шагу плана выхода, назначенному на
 * дату экспирации, показать убыток БОЛЬШЕ максимально возможного (реальное
 * репро: MKTX, премия $3192, план выхода показывал −$4210).
 *
 * Этот тест НЕ рендерит компонент (см. подход exsting expiryAnchorInvariant.test.js),
 * а моделирует формулу шага плана выхода поверх РЕАЛЬНОЙ функции
 * calculateOptionPLValue (тот же движок BSM, что использует ExitPlanTable),
 * на прод-репро данных MKTX.
 *
 * ВАЖНО: если формулу якоря в calculateStepPL (ExitPlanTable.jsx) изменят —
 * этот тест нужно поправить синхронно, иначе он перестанет отражать реальный код.
 */

import { calculateOptionPLValue } from '../optionPricing';

// --- Данные MKTX-репро (см. также expiryAnchorInvariant.test.js) ---
const CALL_LEG = {
  type: 'CALL',
  strike: 130,
  action: 'Buy',
  ask: 3.97,
  bid: 3.97,
  quantity: 4,
  contractSize: 100,
};

const PUT_LEG = {
  type: 'PUT',
  strike: 115,
  action: 'Buy',
  ask: 8.02,
  bid: 8.02,
  quantity: 2,
  contractSize: 100,
};

const TOTAL_PREMIUM =
  CALL_LEG.ask * CALL_LEG.quantity * CALL_LEG.contractSize +
  PUT_LEG.ask * PUT_LEG.quantity * PUT_LEG.contractSize; // 1588 + 1604 = 3192

// Спот на дату экспирации из репро — между страйками, обе ноги истекают
// без внутренней стоимости (максимальный убыток купленной позиции = премия).
const SPOT_AT_EXPIRY = 116.69;
const DAYS_REMAINING_AT_EXPIRY = 0;

/**
 * Применяет якорную формулу шага ExitPlanTable ровно так, как она реализована
 * в calculateStepPL (ExitPlanTable.jsx, ~строка 561-592):
 *   if (optionDaysRemaining > 0 && actualPL ...) { pl = actualPL * anchorRatio + (pl - plAtAnchor) }
 *
 * @param {object} params
 * @param {number} params.pl - теоретическая P&L шага на дату выхода (без якоря)
 * @param {number} params.plAtAnchor - теоретическая P&L на дату ввода Fact P&L
 * @param {number} params.actualPL - введённый пользователем Fact P&L (за всю позицию на момент ввода)
 * @param {number} params.anchorRatio - stepQty / actualPLQuantity
 * @param {number} params.optionDaysRemaining - дни от даты выхода шага до экспирации
 * @param {boolean} params.withGuard - применять ли защиту optionDaysRemaining > 0 (текущий код после фикса)
 */
function applyStepAnchorFormula({ pl, plAtAnchor, actualPL, anchorRatio, optionDaysRemaining, withGuard }) {
  const anchorApplies = withGuard ? optionDaysRemaining > 0 : true;
  if (!anchorApplies) return pl;
  return actualPL * anchorRatio + (pl - plAtAnchor);
}

describe('Гард экспирации в якорной формуле плана выхода (ExitPlanTable.calculateStepPL)', () => {
  // Чистая P&L шага на дату экспирации (без якоря) — реальный движок компонента.
  const plCallAtExpiry = calculateOptionPLValue(CALL_LEG, SPOT_AT_EXPIRY, SPOT_AT_EXPIRY, DAYS_REMAINING_AT_EXPIRY);
  const plPutAtExpiry = calculateOptionPLValue(PUT_LEG, SPOT_AT_EXPIRY, SPOT_AT_EXPIRY, DAYS_REMAINING_AT_EXPIRY);

  it('репро: чистая P&L шага на экспирации совпадает с максимальным убытком купленной позиции (−премия)', () => {
    // Обе ноги без внутренней стоимости на споте между страйками — весь убыток = уплаченная премия.
    expect(plCallAtExpiry).toBeCloseTo(-1588, 2);
    expect(plPutAtExpiry).toBeCloseTo(-1604, 2);
    expect(plCallAtExpiry + plPutAtExpiry).toBeCloseTo(-TOTAL_PREMIUM, 2);
  });

  // Якорь Fact P&L введён на ноге PUT на промежуточную (не экспирационную) дату —
  // как в прод-репро, где пользователь зафиксировал Fact P&L при высокой Fact IV.
  const ANCHOR_PRICE = 120;
  const ANCHOR_DAYS_REMAINING = 25;
  const ANCHOR_IV = 100; // %, Fact IV на момент ввода Fact P&L (как manualIvOverride в репро)
  const ACTUAL_PL_PUT = -900; // Fact P&L, введённый пользователем вручную за всю ногу (2 контракта)

  const plPutAtAnchor = calculateOptionPLValue(PUT_LEG, ANCHOR_PRICE, ANCHOR_PRICE, ANCHOR_DAYS_REMAINING, ANCHOR_IV);

  it('шаг плана на дату экспирации: с гардом якорь не применяется, убыток = чистой формуле', () => {
    const stepPlCall = applyStepAnchorFormula({
      pl: plCallAtExpiry,
      plAtAnchor: plCallAtExpiry, // якорь на CALL не вводился
      actualPL: plCallAtExpiry,
      anchorRatio: 1,
      optionDaysRemaining: DAYS_REMAINING_AT_EXPIRY,
      withGuard: true,
    });

    const stepPlPut = applyStepAnchorFormula({
      pl: plPutAtExpiry,
      plAtAnchor: plPutAtAnchor,
      actualPL: ACTUAL_PL_PUT,
      anchorRatio: 1, // шаг закрывает всю ногу (2 из 2 контрактов, actualPLQuantity = 2)
      optionDaysRemaining: DAYS_REMAINING_AT_EXPIRY,
      withGuard: true,
    });

    // Якорь отключён на экспирации → чистая формула, значения не искажены.
    expect(stepPlCall).toBeCloseTo(plCallAtExpiry, 6);
    expect(stepPlPut).toBeCloseTo(plPutAtExpiry, 6);

    const stepTotal = stepPlCall + stepPlPut;
    // Сумма убытка шага плана выхода на экспирации НЕ ПРЕВЫШАЕТ уплаченную премию —
    // это физический инвариант купленной позиции (максимальный убыток = премия).
    expect(Math.abs(stepTotal)).toBeLessThanOrEqual(TOTAL_PREMIUM + 1e-6);
    expect(stepTotal).toBeCloseTo(-TOTAL_PREMIUM, 2);
  });

  it('без гарда (код до фикса) якорь применяется на экспирации и инвариант нарушается', () => {
    const stepPlCallUnguarded = applyStepAnchorFormula({
      pl: plCallAtExpiry,
      plAtAnchor: plCallAtExpiry,
      actualPL: plCallAtExpiry,
      anchorRatio: 1,
      optionDaysRemaining: DAYS_REMAINING_AT_EXPIRY,
      withGuard: false,
    });

    const stepPlPutUnguarded = applyStepAnchorFormula({
      pl: plPutAtExpiry,
      plAtAnchor: plPutAtAnchor,
      actualPL: ACTUAL_PL_PUT,
      anchorRatio: 1,
      optionDaysRemaining: DAYS_REMAINING_AT_EXPIRY,
      withGuard: false,
    });

    const stepTotalUnguarded = stepPlCallUnguarded + stepPlPutUnguarded;

    // Без гарда якорь «утекает» на экспирацию и убыток шага плана выхода
    // превышает физически возможный максимум (уплаченную премию) — это и есть баг,
    // который воспроизводился на MKTX (план выхода показывал −$4210 при премии $3192).
    expect(Math.abs(stepTotalUnguarded)).toBeGreaterThan(TOTAL_PREMIUM);
  });
});
