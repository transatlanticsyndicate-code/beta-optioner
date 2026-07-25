/**
 * Числовой тест-инвариант для формулы «якоря Fact P&L» из OptionsTableV3.jsx.
 *
 * КОНТЕКСТ (см. tasks/fix-expiry-anchor-total/diagnose.md):
 * Логика якоря — «P&L = введённый пользователем Fact P&L + (теоретическая P&L на
 * целевую дату − теоретическая P&L на дату ввода Fact P&L)» — была продублирована
 * в 4 местах компонента OptionsTableV3.jsx. В 3 из них есть защита
 * `optionDaysRemaining > 0` (или `optDaysRemaining > 0`), которая на дату экспирации
 * ОТКЛЮЧАЕТ якорь — там P&L обязана считаться чистой формулой
 * intrinsic_value − премия, иначе итог перестаёт быть физически ограничен
 * максимальным убытком купленной позиции (суммой премий).
 *
 * В блоке суммирования ИТОГО (~строки 220-246 OptionsTableV3.jsx) этой защиты не
 * было — баг воспроизводился на проде (сделка dbConfig=2a797da0-fba4-4332-bbb5-
 * cb95fd482f23, MKTX: 4 CALL 130 @3.97 + 2 PUT 115 @8.02, премия $3192): на
 * экспирации строки показывали корректные -1588 / -1604, а ИТОГО было -4210,
 * что невозможно для купленной позиции (максимальный убыток = премия).
 *
 * Этот тест НЕ рендерит компонент (он требует слишком много контекста/пропсов —
 * ivSurface, calculatorMode, стейт таблицы и т.д.), а моделирует ДВА варианта той
 * же формулы якоря (с защитой — как сейчас в коде после фикса, и без защиты — как
 * было до фикса) поверх РЕАЛЬНОЙ функции ценообразования calculateOptionPLValue
 * (тот же движок BSM, что использует компонент), на данных MKTX-репро.
 *
 * ВАЖНО: если формулу якоря в блоке ИТОГО OptionsTableV3.jsx изменят — этот тест
 * нужно поправить синхронно, иначе он перестанет отражать реальный код.
 */

import { calculateOptionPLValue } from '../optionPricing';

// --- Данные MKTX-репро ---
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

// Цена базового актива на экспирации — между страйками, обе ноги истекают без
// внутренней стоимости (ровно репро-сценарий: -1588 / -1604 по строкам).
const PRICE_AT_EXPIRY = 120;
const DAYS_REMAINING_AT_EXPIRY = 0;

/**
 * Применяет формулу якоря Fact P&L ровно так, как она реализована в
 * OptionsTableV3.jsx (блок ИТОГО, ~строки 220-246 / блок строки, ~строка 1320).
 *
 * @param {object} params
 * @param {number} params.pl - теоретическая P&L на целевую дату (без якоря)
 * @param {number} params.plAtAnchor - теоретическая P&L на дату ввода Fact P&L
 * @param {number} params.actualPL - введённый пользователем Fact P&L
 * @param {number} params.anchorRatio - currentQty / anchorQty (обычно 1)
 * @param {number} params.daysRemaining - дни до экспирации на целевую дату
 * @param {boolean} params.withGuard - применять ли защиту `daysRemaining > 0`
 */
function applyAnchorFormula({ pl, plAtAnchor, actualPL, anchorRatio, daysRemaining, withGuard }) {
  const anchorApplies = withGuard ? daysRemaining > 0 : true;
  if (!anchorApplies) return pl;
  return actualPL * anchorRatio + (pl - plAtAnchor);
}

describe('Инвариант якоря Fact P&L на дату экспирации (ИТОГО, OptionsTableV3)', () => {
  // Чистая P&L на экспирации (без якоря) — реальный движок компонента.
  const plCallExpiry = calculateOptionPLValue(CALL_LEG, PRICE_AT_EXPIRY, PRICE_AT_EXPIRY, DAYS_REMAINING_AT_EXPIRY);
  const plPutExpiry = calculateOptionPLValue(PUT_LEG, PRICE_AT_EXPIRY, PRICE_AT_EXPIRY, DAYS_REMAINING_AT_EXPIRY);

  it('репро: чистая P&L строк на экспирации совпадает с данными с прода (-1588 / -1604)', () => {
    expect(plCallExpiry).toBeCloseTo(-1588, 2);
    expect(plPutExpiry).toBeCloseTo(-1604, 2);
  });

  // Якорь Fact P&L введён только на ноге PUT (пользователь зафиксировал реальный
  // P&L на промежуточную дату, например через "Fact IV"). Теоретическая P&L на
  // момент якоря считается тем же движком, что и в компоненте.
  // Значения близки к прод-репро: там пользователь выставил Fact IV пута = 100%
  // (manualIvOverride), что на промежуточную (не экспирационную) дату сильно
  // завышает теоретическую P&L на момент якоря относительно чистой цены входа —
  // и именно это расхождение (pl - plAtAnchor) без защиты «утекает» в ИТОГО.
  const ANCHOR_PRICE = 125;
  const ANCHOR_DAYS_REMAINING = 30;
  const ANCHOR_IV = 100; // %, Fact IV (manualIvOverride) на момент ввода Fact P&L — как в репро
  const ACTUAL_PL_PUT = -900; // Fact P&L, введённый пользователем вручную

  const plPutAtAnchor = calculateOptionPLValue(PUT_LEG, ANCHOR_PRICE, ANCHOR_PRICE, ANCHOR_DAYS_REMAINING, ANCHOR_IV);

  it('(а) с защитой: якорь на экспирации не применяется, ИТОГО = сумме строк = -премия', () => {
    const finalCall = applyAnchorFormula({
      pl: plCallExpiry,
      plAtAnchor: plCallExpiry, // якорь на CALL не вводился
      actualPL: plCallExpiry,
      anchorRatio: 1,
      daysRemaining: DAYS_REMAINING_AT_EXPIRY,
      withGuard: true,
    });

    const finalPut = applyAnchorFormula({
      pl: plPutExpiry,
      plAtAnchor: plPutAtAnchor,
      actualPL: ACTUAL_PL_PUT,
      anchorRatio: 1,
      daysRemaining: DAYS_REMAINING_AT_EXPIRY,
      withGuard: true,
    });

    const total = finalCall + finalPut;

    // Якорь отключён на экспирации → чистая формула, строки не меняются.
    expect(finalCall).toBeCloseTo(plCallExpiry, 6);
    expect(finalPut).toBeCloseTo(plPutExpiry, 6);
    // ИТОГО = сумме строк = -премия (максимально возможный убыток купленной позиции).
    expect(total).toBeCloseTo(finalCall + finalPut, 6);
    expect(total).toBeCloseTo(-TOTAL_PREMIUM, 2);
  });

  it('(б) инвариант |ИТОГО| <= премия держится с защитой и НАРУШАЕТСЯ без неё (баг до фикса)', () => {
    const totalGuarded =
      applyAnchorFormula({
        pl: plCallExpiry,
        plAtAnchor: plCallExpiry,
        actualPL: plCallExpiry,
        anchorRatio: 1,
        daysRemaining: DAYS_REMAINING_AT_EXPIRY,
        withGuard: true,
      }) +
      applyAnchorFormula({
        pl: plPutExpiry,
        plAtAnchor: plPutAtAnchor,
        actualPL: ACTUAL_PL_PUT,
        anchorRatio: 1,
        daysRemaining: DAYS_REMAINING_AT_EXPIRY,
        withGuard: true,
      });

    const totalUnguarded =
      applyAnchorFormula({
        pl: plCallExpiry,
        plAtAnchor: plCallExpiry,
        actualPL: plCallExpiry,
        anchorRatio: 1,
        daysRemaining: DAYS_REMAINING_AT_EXPIRY,
        withGuard: false,
      }) +
      applyAnchorFormula({
        pl: plPutExpiry,
        plAtAnchor: plPutAtAnchor,
        actualPL: ACTUAL_PL_PUT,
        anchorRatio: 1,
        daysRemaining: DAYS_REMAINING_AT_EXPIRY,
        withGuard: false,
      });

    // С защитой (текущий код после фикса) инвариант держится — максимум это
    // равенство (весь убыток = премии), превышения быть не может.
    expect(Math.abs(totalGuarded)).toBeLessThanOrEqual(TOTAL_PREMIUM + 1e-6);

    // Без защиты (код ИТОГО до фикса) на этих данных инвариант нарушается —
    // именно это и было причиной прод-бага (-4210 вместо максимум -3192).
    expect(Math.abs(totalUnguarded)).toBeGreaterThan(TOTAL_PREMIUM);
  });
});
