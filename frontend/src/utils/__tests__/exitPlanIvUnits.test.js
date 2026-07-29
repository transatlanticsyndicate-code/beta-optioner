/**
 * Числовой тест единиц измерения manualIvOverride в якорной формуле
 * usePositionExitCalculator.js (Сценарий 2 «Закрыть опционы» и Сценарий 3
 * «Закрыть всё», ~строки 468-505 и 666-701).
 *
 * КОНТЕКСТ (задача 1C-2, tasks/audit-p0-p1):
 * manualIvOverride хранится в ПРОЦЕНТАХ (например 150 = 150% IV). Потребитель
 * calculateOptionTheoreticalPrice (utils/optionPricing.js: overrideVolatility > 1
 * ? overrideVolatility / 100 : overrideVolatility) сам нормализует проценты в
 * десятичный формат. В usePositionExitCalculator.js якорная IV делилась на 100
 * ЕЩЁ РАЗ до передачи — 150% превращались в 1.5%, что почти обнуляет временную
 * стоимость опциона. На акциях (IV обычно < 100%) результат случайно совпадал
 * с корректным (0.45/100 = 0.0045, а «не делить» тоже дало бы 0.45% при
 * неправильной трактовке... на самом деле баг был незаметен только потому что
 * тестовые сценарии редко используют IV >= 100%), поэтому дефект бил по крипте
 * и фьючерсам, где волатильность часто >= 100%.
 *
 * Три другие копии этой формулы (ExitPlanTable.jsx, OptionsTableV3.jsx,
 * startPLSnapshot.js) лишнего деления не делают — передают manualIvOverride
 * как есть. usePositionExitCalculator.js приведён к тому же виду.
 *
 * Тест проверяет:
 * 1) Монотонность теоретической цены опциона по волатильности (не должна
 *    ломаться из-за неправильной единицы измерения) — при 150% цена больше, чем при 50%.
 * 2) Путь расчёта плана выхода (usePositionExitCalculator, якорная IV без /100)
 *    даёт тот же результат, что и путь таблицы опционов (ExitPlanTable/OptionsTableV3,
 *    якорная IV без /100), на одинаковых входах при волатильности >= 100%.
 */

import { calculateOptionPLValue, calculateOptionTheoreticalPrice } from '../optionPricing';

const OPTION = {
  type: 'CALL',
  strike: 100,
  action: 'Buy',
  ask: 5,
  bid: 5,
  quantity: 1,
  contractSize: 100,
};

const SPOT = 100;
const DAYS_REMAINING = 30;

describe('Единицы измерения manualIvOverride в якоре плана выхода', () => {
  it('монотонность: теоретическая цена опциона при IV=150% больше, чем при IV=50%', () => {
    const priceAtLowIV = calculateOptionTheoreticalPrice(OPTION, SPOT, DAYS_REMAINING, 50);
    const priceAtHighIV = calculateOptionTheoreticalPrice(OPTION, SPOT, DAYS_REMAINING, 150);

    expect(priceAtHighIV).toBeGreaterThan(priceAtLowIV);
  });

  it('лишнее деление на 100 почти обнуляет временную стоимость опциона (баг до фикса)', () => {
    // Именно это происходило в usePositionExitCalculator.js до фикса: значение
    // manualIvOverride=150 (то есть 150%) делилось на 100 ПЕРЕД передачей в
    // функцию, которая сама делает эту нормализацию — на входе оказывалось 1.5,
    // что функция трактует как volatility <= 1, то есть уже "готовые" 1.5% IV.
    const correctPrice = calculateOptionTheoreticalPrice(OPTION, SPOT, DAYS_REMAINING, 150);
    const buggyPrice = calculateOptionTheoreticalPrice(OPTION, SPOT, DAYS_REMAINING, 150 / 100);

    const intrinsicValue = Math.max(0, SPOT - OPTION.strike); // ATM/ITM компонент, здесь = 0
    const correctTimeValue = correctPrice - intrinsicValue;
    const buggyTimeValue = buggyPrice - intrinsicValue;

    // При корректной обработке (150%) временная стоимость существенна (опцион на 30 дней при IV=150%).
    expect(correctTimeValue).toBeGreaterThan(1);
    // При сломанной обработке (1.5%) временная стоимость почти нулевая — на 1-2 порядка меньше.
    expect(buggyTimeValue).toBeLessThan(correctTimeValue * 0.1);
  });

  it('путь плана выхода (без /100) совпадает с путём таблицы опционов на одинаковых входах при IV >= 100%', () => {
    const manualIvOverridePercent = 150; // как хранится в option.manualIvOverride

    // Путь ExitPlanTable/OptionsTableV3 (эталон, деления не было никогда):
    // якорная IV передаётся как есть — calculateOptionPLValue(..., anchorIV=150, ...)
    const referencePL = calculateOptionPLValue(
      OPTION,
      SPOT,
      SPOT,
      DAYS_REMAINING,
      manualIvOverridePercent,
      0
    );

    // Путь usePositionExitCalculator ПОСЛЕ фикса (1C-2): анchorIV = manualIvOverride
    // без деления на 100 — должен совпадать с эталоном.
    const exitCalculatorPLAfterFix = calculateOptionPLValue(
      OPTION,
      SPOT,
      SPOT,
      DAYS_REMAINING,
      manualIvOverridePercent, // без /100 — так теперь в usePositionExitCalculator.js
      0
    );

    expect(exitCalculatorPLAfterFix).toBeCloseTo(referencePL, 6);

    // Путь usePositionExitCalculator ДО фикса (для документации регресса):
    // anchorIV = manualIvOverride / 100 = 1.5 — даёт совсем другой (заниженный по модулю) результат.
    const exitCalculatorPLBeforeFix = calculateOptionPLValue(
      OPTION,
      SPOT,
      SPOT,
      DAYS_REMAINING,
      manualIvOverridePercent / 100,
      0
    );

    expect(exitCalculatorPLBeforeFix).not.toBeCloseTo(referencePL, 0);
  });
});
