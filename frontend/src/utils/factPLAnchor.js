// Единая функция «якорной поправки» фактического P&L (Fact P&L).
//
// ЗАЧЕМ: формула была продублирована в семи местах кодовой базы (OptionsTableV3.jsx ×3,
// startPLSnapshot.js, ExitPlanTable.jsx, usePositionExitCalculator.js ×2). Копии успели
// разъехаться и дать реальные баги на проде:
//   - в блоке ИТОГО (OptionsTableV3.jsx) не было защиты «на экспирации якорь не
//     применяем» — убыток купленной позиции превышал уплаченную премию
//     (репро MKTX: ИТОГО −$4210 при премии $3192, см. tasks/fix-expiry-anchor-total);
//   - в usePositionExitCalculator.js (сценарии 2 и 3) якорная волатильность делилась
//     на 100 лишний раз — на крипте/фьючерсах расхождение доходило до $1900 на ногу
//     (см. tasks/fix_crypto_used_percent_over_100.md).
// Оба бага исправлены точечно, но причина — дублирование — оставалась. Эта функция
// сводит формулу в одно место; все семь мест переключены на неё без изменения цифр.
//
// СУТЬ ФОРМУЛЫ: если пользователь ввёл фактический P&L от брокера (actualPL) с датой
// (actualPLDate), ценой актива (actualPLPrice) и количеством (actualPLQuantity), то
// P&L в целевой точке = actualPL × (текущее кол-во / кол-во на якоре)
//                         + (теоретическая P&L в целевой точке − теоретическая P&L в точке якоря).
//
// ЧТО ОСТАЁТСЯ СНАРУЖИ (осознанно, чтобы не унифицировать молча источники, которые
// в разных местах отличаются): резолвинг фолбэков anchorPrice/assetPriceForCalc/
// currentQuantity, выбор движка ценообразования (акции/фьючерсы), группировка
// stockClassification — все эти решения принимает вызывающая сторона и передаёт уже
// готовые значения/колбэк. Функция ничего не «доугадывает» сама.

import { calculateDaysRemainingUTC } from './dateUtils';

/**
 * Применить якорную поправку Fact P&L к теоретической P&L в целевой точке симуляции.
 *
 * @param {object} params
 * @param {object} params.option — нога опциона (нужны actualPL, actualPLDate,
 *   actualPLPrice, actualPLQuantity, quantity — как в state.options/snapshot).
 * @param {number} params.theoreticalPL — теоретическая P&L в целевой точке, БЕЗ якоря.
 *   ВАЖНО: если вызывающая сторона применяет доменные корректировки поверх теоретической
 *   цены (например adjustPLByStockGroup), это значение должно быть УЖЕ скорректировано —
 *   и колбэк computeTheoreticalPL ниже обязан применять ту же корректировку к plAtAnchor,
 *   иначе (theoreticalPL − plAtAnchor) будет сравнивать разнородные величины.
 * @param {number} params.targetDaysRemaining — дни до экспирации в целевой точке
 *   (например optionDaysRemaining/optDaysRemaining/simulatedDaysToExpiration в разных
 *   местах кода — везде одна и та же величина по смыслу).
 * @param {number} params.targetDaysPassed — «дни от oldestEntry» целевой точки
 *   (daysPassed в таблице опционов, stepSimDays в плане выхода). Используется для
 *   сравнения с anchorDaysPassed — якорь применяется только если целевая точка не
 *   раньше даты якоря.
 * @param {Date|null} params.oldestEntry — самая ранняя дата входа среди опционов позиции
 *   (база для calculateDaysRemainingUTC). Передаётся КАК ЕСТЬ (без фолбэка на new Date())
 *   в calculateDaysRemainingUTC — ровно так это делают все семь оригинальных копий;
 *   фолбэк применяется только внутри этой функции для расчёта anchorDaysPassed.
 * @param {(anchorPrice: number, anchorDaysToExpiration: number, anchorVolatility: number) => number} params.computeTheoreticalPL —
 *   колбэк, считающий теоретическую P&L на дату якоря. Инкапсулирует выбор движка
 *   (calculateOptionPLValue для акций/крипто, calculateFuturesOptionPLValue для
 *   фьючерсов), contractMultiplier, dividendYield, riskFreeRate и tempOpt — всё это
 *   у каждого места вызова своё и остаётся в замыкании на стороне вызывающего кода.
 * @param {number} params.anchorVolatility — волатильность на дату якоря, В ПРОЦЕНТАХ
 *   (как manualIvOverride, например 47.84 = 47.84%), НЕ в долях. Нормализация
 *   «значение > 1 → делить на 100» происходит НИЖЕ по стеку, внутри optionPricing.js
 *   и futuresPricing.js (см. `volatility = overrideVolatility > 1 ? overrideVolatility / 100 : ...`).
 *   Сюда передавать уже готовое значение как есть — лишнее деление на 100 здесь было
 *   причиной прод-бага (см. заголовок файла).
 * @param {number} params.anchorPrice — цена актива на дату якоря, используемая как
 *   первый аргумент computeTheoreticalPL. Фолбэк (actualPLPrice || currentPrice, или
 *   actualPLPrice || optAssetPrice в startPLSnapshot) резолвит вызывающая сторона.
 * @param {number} params.currentQuantity — числитель коэффициента масштабирования
 *   (currentQty/anchorQty). В разных местах это option.quantity, step.quantity или
 *   snapshot.quantity — вызывающая сторона передаёт нужное значение явно.
 * @param {number} [params.ratioFallback=1] — что возвращать вместо коэффициента, если
 *   якорное количество (actualPLQuantity/quantity) оказалось <= 0. Везде это 1, КРОМЕ
 *   ExitPlanTable.calculateStepPL, где исторически 0 (шаг без известного якорного
 *   количества не должен получать долю чужого actualPL).
 * @returns {{
 *   pl: number,               // итоговая P&L (с якорем, если применён; иначе == theoreticalPL)
 *   residual: number|null,    // actualPL × ratio − plAtAnchor — остаток поправки якоря
 *                              // поверх теоретической модели (null если якорь не применён)
 *   applied: boolean,         // применён ли якорь
 *   reason: string|null,      // причина неприменения: 'expiry' | 'no-anchor' | 'before-anchor' | null
 *   anchorDaysPassed: number|null, // дни от oldestEntry до даты якоря (null если не вычислялось)
 *   plAtAnchor: number|null,  // теоретическая P&L на дату якоря (для UI-подсказок типа rowPlAtAnchor)
 * }}
 */
export function applyFactPLAnchor({
  option,
  theoreticalPL,
  targetDaysRemaining,
  targetDaysPassed,
  oldestEntry,
  computeTheoreticalPL,
  anchorVolatility,
  anchorPrice,
  currentQuantity,
  ratioFallback = 1,
}) {
  // ГАРД ЭКСПИРАЦИИ — ключевой инвариант: на дату экспирации (targetDaysRemaining <= 0)
  // P&L обязана считаться чистой формулой intrinsic_value − entry_price, полученной
  // выше по стеку и переданной как theoreticalPL. Любая якорная коррекция здесь
  // искажает математически точное значение и может дать убыток больше уплаченной
  // премии (это и был прод-баг в блоке ИТОГО OptionsTableV3.jsx).
  if (!(targetDaysRemaining > 0)) {
    return { pl: theoreticalPL, residual: null, applied: false, reason: 'expiry', anchorDaysPassed: null, plAtAnchor: null };
  }

  const hasAnchor = !!option && option.actualPL !== null && option.actualPL !== undefined && !!option.actualPLDate;
  if (!hasAnchor) {
    return { pl: theoreticalPL, residual: null, applied: false, reason: 'no-anchor', anchorDaysPassed: null, plAtAnchor: null };
  }

  // Дни от oldestEntry до даты ввода Fact P&L. Фолбэк на new Date() — только здесь,
  // для самой разницы дат; ниже в calculateDaysRemainingUTC передаём oldestEntry как есть.
  const anchorDateObj = new Date(option.actualPLDate + 'T00:00:00Z');
  const oldestEntryForDiff = oldestEntry || new Date();
  const anchorDaysPassed = Math.round((anchorDateObj - oldestEntryForDiff) / (1000 * 60 * 60 * 24));

  // Якорь применяется только если целевая точка не раньше даты якоря — до даты
  // ввода Fact P&L показываем обычный теоретический расчёт.
  if (!(targetDaysPassed >= anchorDaysPassed)) {
    return { pl: theoreticalPL, residual: null, applied: false, reason: 'before-anchor', anchorDaysPassed, plAtAnchor: null };
  }

  const anchorDaysToExp = calculateDaysRemainingUTC(option, anchorDaysPassed, 30, oldestEntry);
  const plAtAnchor = computeTheoreticalPL(anchorPrice, anchorDaysToExp, anchorVolatility);

  // Масштабирование по количеству: коэффициент = текущее кол-во / кол-во на якоре.
  const anchorQty = Number(option.actualPLQuantity) > 0
    ? Number(option.actualPLQuantity)
    : (Number(option.quantity) || 1);
  const numeratorQty = Number(currentQuantity) || 0;
  const ratio = anchorQty > 0 ? (numeratorQty / anchorQty) : ratioFallback;

  const pl = option.actualPL * ratio + (theoreticalPL - plAtAnchor);
  const residual = option.actualPL * ratio - plAtAnchor;

  return { pl, residual, applied: true, reason: null, anchorDaysPassed, plAtAnchor };
}
