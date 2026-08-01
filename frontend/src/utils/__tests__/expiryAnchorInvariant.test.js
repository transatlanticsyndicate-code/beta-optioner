/**
 * Числовой тест-инвариант для гарда экспирации в формуле якоря Fact P&L
 * (блок ИТОГО OptionsTableV3.jsx, применяет applyFactPLAnchor из factPLAnchor.js).
 *
 * КОНТЕКСТ (см. tasks/fix-expiry-anchor-total/diagnose.md):
 * Логика якоря — «P&L = введённый пользователем Fact P&L + (теоретическая P&L на
 * целевую дату − теоретическая P&L на дату ввода Fact P&L)» — была продублирована
 * в семи местах кодовой базы (см. заголовок frontend/src/utils/factPLAnchor.js).
 * В блоке суммирования ИТОГО (OptionsTableV3.jsx) защиты «на экспирации якорь не
 * применяем» не было — баг воспроизводился на проде (сделка dbConfig=2a797da0-fba4-4332-bbb5-
 * cb95fd482f23, MKTX: 4 CALL 130 @3.97 + 2 PUT 115 @8.02, премия $3192): на
 * экспирации строки показывали корректные -1588 / -1604, а ИТОГО было -4210,
 * что невозможно для купленной позиции (максимальный убыток = премия).
 *
 * ДО РЕФАКТОРИНГА (задача refactor/fact-pl-anchor) этот тест МОДЕЛИРОВАЛ формулу
 * якоря копией (см. git-историю файла) — теперь он вызывает РЕАЛЬНУЮ функцию
 * applyFactPLAnchor поверх РЕАЛЬНОГО движка ценообразования (calculateOptionPLValue),
 * поэтому это настоящий регрессионный тест, а не копия формулы: если гард
 * экспирации внутри applyFactPLAnchor сломают, тест упадёт без ручной синхронизации.
 */

import { calculateOptionPLValue } from '../optionPricing';
import { applyFactPLAnchor } from '../factPLAnchor';

// --- Данные MKTX-репро ---
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

const OLDEST_ENTRY = new Date('2026-01-01T00:00:00Z');

const TOTAL_PREMIUM =
  CALL_LEG.ask * CALL_LEG.quantity * CALL_LEG.contractSize +
  PUT_LEG.ask * PUT_LEG.quantity * PUT_LEG.contractSize; // 1588 + 1604 = 3192

// Цена базового актива на экспирации — между страйками, обе ноги истекают без
// внутренней стоимости (ровно репро-сценарий: -1588 / -1604 по строкам).
const PRICE_AT_EXPIRY = 120;
const DAYS_REMAINING_AT_EXPIRY = 0;

/**
 * Применяет якорную формулу С ГАРДОМ, ровно как это делает реальный код
 * (applyFactPLAnchor c targetDaysRemaining <= 0 → якорь не применяется).
 */
function applyGuarded({ option, theoreticalPL, targetDaysRemaining, targetDaysPassed, anchorVolatility, anchorPrice, currentQuantity }) {
  return applyFactPLAnchor({
    option,
    theoreticalPL,
    targetDaysRemaining,
    targetDaysPassed,
    oldestEntry: OLDEST_ENTRY,
    anchorVolatility,
    anchorPrice,
    currentQuantity,
    computeTheoreticalPL: (price, days, vol) => calculateOptionPLValue(option, price, price, days, vol),
  }).pl;
}

/**
 * Применяет якорную формулу БЕЗ ГАРДА — воспроизводит поведение ДО фикса
 * (когда защита targetDaysRemaining > 0 отсутствовала), напрямую по формуле,
 * а не через applyFactPLAnchor (которая гард убрать не позволяет — он теперь
 * встроенный инвариант функции).
 */
function applyUnguarded({ pl, plAtAnchor, actualPL, anchorRatio }) {
  return actualPL * anchorRatio + (pl - plAtAnchor);
}

describe('Инвариант якоря Fact P&L на дату экспирации (ИТОГО, OptionsTableV3 → applyFactPLAnchor)', () => {
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

  it('(а) с гардом (реальный код): якорь на экспирации не применяется, ИТОГО = сумме строк = -премия', () => {
    // CALL: якорь не вводился — actualPL/actualPLDate отсутствуют.
    const finalCall = applyGuarded({
      option: { ...CALL_LEG, actualPL: null, actualPLDate: null, actualPLQuantity: null, quantity: CALL_LEG.quantity },
      theoreticalPL: plCallExpiry,
      targetDaysRemaining: DAYS_REMAINING_AT_EXPIRY,
      targetDaysPassed: 260,
      anchorVolatility: ANCHOR_IV,
      anchorPrice: ANCHOR_PRICE,
      currentQuantity: CALL_LEG.quantity,
    });

    // PUT: якорь введён (actualPL = -900 на дату, дающую anchorDaysPassed = 30 от OLDEST_ENTRY),
    // но целевая точка — экспирация (targetDaysRemaining = 0) → гард должен отключить якорь.
    const anchorDateStr = new Date(OLDEST_ENTRY.getTime() + 30 * 86400000).toISOString().slice(0, 10);
    const finalPut = applyGuarded({
      option: { ...PUT_LEG, actualPL: ACTUAL_PL_PUT, actualPLDate: anchorDateStr, actualPLQuantity: PUT_LEG.quantity, quantity: PUT_LEG.quantity },
      theoreticalPL: plPutExpiry,
      targetDaysRemaining: DAYS_REMAINING_AT_EXPIRY,
      targetDaysPassed: 260,
      anchorVolatility: ANCHOR_IV,
      anchorPrice: ANCHOR_PRICE,
      currentQuantity: PUT_LEG.quantity,
    });

    const total = finalCall + finalPut;

    // Якорь отключён на экспирации → чистая формула, строки не меняются.
    expect(finalCall).toBeCloseTo(plCallExpiry, 6);
    expect(finalPut).toBeCloseTo(plPutExpiry, 6);
    // ИТОГО = сумме строк = -премия (максимально возможный убыток купленной позиции).
    expect(total).toBeCloseTo(finalCall + finalPut, 6);
    expect(total).toBeCloseTo(-TOTAL_PREMIUM, 2);
  });

  it('(б) инвариант |ИТОГО| <= премия держится с гардом (реальный код) и НАРУШАЕТСЯ без него (баг до фикса)', () => {
    const anchorDateStr = new Date(OLDEST_ENTRY.getTime() + 30 * 86400000).toISOString().slice(0, 10);

    const totalGuarded =
      applyGuarded({
        option: { ...CALL_LEG, actualPL: null, actualPLDate: null, actualPLQuantity: null, quantity: CALL_LEG.quantity },
        theoreticalPL: plCallExpiry,
        targetDaysRemaining: DAYS_REMAINING_AT_EXPIRY,
        targetDaysPassed: 260,
        anchorVolatility: ANCHOR_IV,
        anchorPrice: ANCHOR_PRICE,
        currentQuantity: CALL_LEG.quantity,
      }) +
      applyGuarded({
        option: { ...PUT_LEG, actualPL: ACTUAL_PL_PUT, actualPLDate: anchorDateStr, actualPLQuantity: PUT_LEG.quantity, quantity: PUT_LEG.quantity },
        theoreticalPL: plPutExpiry,
        targetDaysRemaining: DAYS_REMAINING_AT_EXPIRY,
        targetDaysPassed: 260,
        anchorVolatility: ANCHOR_IV,
        anchorPrice: ANCHOR_PRICE,
        currentQuantity: PUT_LEG.quantity,
      });

    // Код ДО фикса (без гарда) — формула применена напрямую, минуя applyFactPLAnchor
    // (сама функция больше не позволяет отключить гард — это её встроенный инвариант).
    const totalUnguarded =
      applyUnguarded({ pl: plCallExpiry, plAtAnchor: plCallExpiry, actualPL: plCallExpiry, anchorRatio: 1 }) +
      applyUnguarded({ pl: plPutExpiry, plAtAnchor: plPutAtAnchor, actualPL: ACTUAL_PL_PUT, anchorRatio: 1 });

    // С гардом (текущий код после фикса, через applyFactPLAnchor) инвариант держится —
    // максимум это равенство (весь убыток = премии), превышения быть не может.
    expect(Math.abs(totalGuarded)).toBeLessThanOrEqual(TOTAL_PREMIUM + 1e-6);

    // Без гарда (код ИТОГО до фикса) на этих данных инвариант нарушается —
    // именно это и было причиной прод-бага (-4210 вместо максимум -3192).
    expect(Math.abs(totalUnguarded)).toBeGreaterThan(TOTAL_PREMIUM);
  });
});
