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
// ПЕРЕХОД С АДДИТИВНОЙ ПОПРАВКИ НА КАЛИБРОВКУ ВОЛАТИЛЬНОСТИ (2026-08):
// Раньше формула была P&L = actualPL×ratio + (теор(цель) − теор(якорь)) — фиксированная
// добавка, которая НЕ затухает к экспирации. На проде это давало убыток купленной
// позиции больше уплаченной премии за день до экспирации (82 из 132 ног в аудите
// заказчика) и разрыв в цифре ровно на экспирации (добавка резко пропадает).
// Теперь вместо добавки подбирается волатильность, при которой модель САМА даёт
// ровно фактическую цену опциона на момент якоря (frontend/src/utils/
// impliedVolatilitySolver.js), и весь дальнейший прогноз считается по ней. Поправка
// гаснет естественно (на экспирации цена = внутренняя стоимость, волатильность не
// влияет), предел «убыток ≤ уплаченного» соблюдается по построению (разбор с реальными
// данными — scratchpad/anchor_decay/README.md, раздел «Выбранное решение»).
// Если корня нет (введённый факт физически недостижим для этой ноги даже при 500%
// волатильности или ниже внутренней стоимости — 2 ноги из 132 в аудите, обе оказались
// ошибками ввода) — фолбэк: множитель на ВРЕМЕННУЮ стоимость (внутренняя остаётся точной),
// клип множителя в [0; 3] — это не даёт убытку превысить уплаченную премию даже тогда.
//
// ЧТО ОСТАЁТСЯ СНАРУЖИ (осознанно, чтобы не унифицировать молча источники, которые
// в разных местах отличаются): резолвинг фолбэков anchorPrice/assetPriceForCalc/
// currentQuantity, выбор движка ценообразования (акции/фьючерсы), группировка
// stockClassification — все эти решения принимает вызывающая сторона и передаёт уже
// готовые значения/колбэк. Функция ничего не «доугадывает» сама.
//
// ВАЖНО про stockClassification/adjustPLByStockGroup: калибровка и фолбэк работают
// с СЫРОЙ теоретической ценой опциона (computeTheoreticalPrice), а не с P&L после
// доменной корректировки по группе акции. Причина: adjustPLByStockGroup — нелинейное
// преобразование (делит/множит P&L в зависимости от знака), и если пропустить через
// него калиброванную цену, точка якоря перестанет ТОЧНО воспроизводить factPL —
// а это ключевой инвариант калибровки. Поэтому для ног с якорем групповая
// корректировка не применяется — калиброванная волатильность уже точнее задаёт
// P&L именно этой ноги, чем общий групповой коэффициент.

import { calculateDaysRemainingUTC, calculateDaysRemainingPreciseET } from './dateUtils';
import { bisectImpliedVolatility } from './impliedVolatilitySolver';

// --- Кэш калибровки волатильности ---
// ЗАЧЕМ: подбор волатильности — это до 60 итераций бисекции (каждая — вызов
// Black-Scholes/Black-76) НА КАЖДУЮ ногу. Он зависит ТОЛЬКО от точки якоря
// (нога + дата/цена/факт якоря + цена входа/множитель/Fact IV), а не от целевой
// точки симуляции (цена/дни цели меняются на каждый тик слайдера, при перерисовке
// таблицы — десятки раз в секунду). Поэтому дорогая часть (подбор σ*, и k2 для
// фолбэка) кэшируется по ключу точки якоря; дешёвая часть (цена в целевой точке
// по уже известной σ*) считается заново на каждый вызов — иначе таблица не
// реагировала бы на движение цены/дней.
//
// ГДЕ ЖИВЁТ: модуль-level Map (не React state — не хотим лишних ре-рендеров и хотим,
// чтобы кэш переживал переключение вкладок/размонтирование таблицы). ЧТОБЫ НЕ ТЕК
// МЕЖДУ СДЕЛКАМИ: ключ уже включает id ноги + все параметры точки якоря, поэтому
// коллизия между разными сделками физически исключена (разные сделки — разные id
// ног/даты/цены/факты). Дополнительно ограничиваем размер (LRU по порядку вставки),
// чтобы за длинную сессию с десятками открытых сделок карта не росла бесконечно —
// худший случай при вытеснении — лишний пересчёт, не ошибка.
const CALIBRATION_CACHE = new Map();
const CALIBRATION_CACHE_LIMIT = 1000;

function round(value, digits = 6) {
  const num = Number(value);
  if (!Number.isFinite(num)) return num;
  const mult = 10 ** digits;
  return Math.round(num * mult) / mult;
}

/**
 * Ключ кэша калибровки — id ноги + всё, что определяет точку якоря.
 * Кол-во (для delta task’а «id ноги + дата якоря + цена якоря + значение факта +
 * количество») дополнено ценой входа/множителем/Fact IV: любое из них меняет
 * результат подбора, а без них правка Fact IV или ask задним числом молча вернула
 * бы старую (неверную) калиброванную волатильность из кэша.
 *
 * @param {number} anchorDaysToExpForPricing — ТОЧНАЯ (дробная) шкала дней якоря, та же,
 *   что реально идёт в computeTheoreticalPrice при подборе σ* (см. вызов ниже). Округляем
 *   до 6 знаков (как остальные числовые поля ключа) — округление нужно не потому, что
 *   значение «дрожит» от текущего времени (оно считается от anchorDaysPassed, целого и
 *   зафиксированного на момент ввода факта, а не от `new Date()` на каждый рендер), а
 *   для устойчивости ключа к плавающей арифметике при повторных вызовах с одними и теми
 *   же логическими параметрами.
 */
function buildCalibrationKey(option, anchorDaysToExpForPricing, anchorPrice, entryPrice, contractMultiplier, anchorVolatility, anchorQty) {
  const legId = option?.id ?? `${option?.type}|${option?.strike}|${option?.date}|${option?.entryDate}`;
  return [
    legId,
    option.actualPLDate,
    round(anchorPrice),
    round(option.actualPL),
    round(anchorQty),
    round(anchorDaysToExpForPricing),
    round(entryPrice),
    round(contractMultiplier),
    round(anchorVolatility),
  ].join('|');
}

function memoizeCalibration(key, computeFn) {
  if (CALIBRATION_CACHE.has(key)) {
    const cached = CALIBRATION_CACHE.get(key);
    // Перекладываем в конец Map — простой LRU по порядку вставки/использования,
    // чтобы при вытеснении в первую очередь уходили давно не запрашиваемые ноги.
    CALIBRATION_CACHE.delete(key);
    CALIBRATION_CACHE.set(key, cached);
    return cached;
  }
  const value = computeFn();
  CALIBRATION_CACHE.set(key, value);
  if (CALIBRATION_CACHE.size > CALIBRATION_CACHE_LIMIT) {
    const oldestKey = CALIBRATION_CACHE.keys().next().value;
    CALIBRATION_CACHE.delete(oldestKey);
  }
  return value;
}

/** Цена опциона → P&L позиции: sign×(price − entryPrice)×qty×mult (Buy: sign=+1, Sell: sign=−1). */
function priceToPL(price, entryPrice, sign, qty, mult) {
  return sign * (price - entryPrice) * qty * mult;
}

/**
 * Применить якорную поправку Fact P&L к теоретической P&L в целевой точке симуляции.
 *
 * @param {object} params
 * @param {object} params.option — нога опциона (нужны actualPL, actualPLDate,
 *   actualPLPrice, actualPLQuantity, quantity, action, strike, type — как в state.options/snapshot).
 * @param {number} params.theoreticalPL — теоретическая P&L в целевой точке, БЕЗ якоря.
 *   Используется как есть, когда якорь не применяется (гарды ниже) или входных данных
 *   для калибровки недостаточно (mode: 'none', reason: 'missing-inputs').
 * @param {number} params.targetDaysRemaining — дни до экспирации в целевой точке, ЦЕЛОЕ
 *   число (calculateDaysRemainingUTC) — используется ТОЛЬКО для гарда экспирации
 *   (targetDaysRemaining <= 0) и для сравнения с anchorDaysPassed. НЕ идёт в ценообразование
 *   напрямую — см. targetDaysRemainingPrecise.
 * @param {number} [params.targetDaysRemainingPrecise] — те же дни, но ТОЧНЫЕ (дробные,
 *   до 16:00 ET — calculateDaysRemainingPreciseET), которыми весь остальной калькулятор
 *   считает цену/тету. Используется как аргумент days в computeTheoreticalPrice для
 *   целевой точки в режимах 'calibrated'/'fallback' — если не передан, используется
 *   targetDaysRemaining (целое), что вносит систематическое расхождение в доли дня
 *   (при большом портфеле суммируется в заметную величину, см. scratchpad/anchor_decay/
 *   verify_implementation.md).
 *
 *   ВАЖНО (фикс регрессии 2026-08): точка ЯКОРЯ для ценообразования (подбор σ* и цена
 *   на якоре) считается ТОЙ ЖЕ точной ET-шкалой — calculateDaysRemainingPreciseET, а не
 *   calculateDaysRemainingUTC. Раньше якорь намеренно оставляли целочисленным («дата
 *   ввода факта — календарная, не доли дня»), но это было ошибкой: калибровка подбирает
 *   волатильность так, чтобы модель воспроизвела факт РОВНО в точке якоря, и дальше
 *   прогноз считается по этой же волатильности в целевой точке. Если точка якоря и
 *   целевая точка выражены в разных шкалах времени (целые дни до полуночи UTC vs дробные
 *   до 16:00 ET — разница ~0.83 дня для дат экспирации США), то даже когда пользователь
 *   смотрит «сегодня» сразу после ввода факта (targetDaysPassed === anchorDaysPassed),
 *   цена опциона в целевой точке считается по ДРУГОЙ шкале, чем та, на которой калибровалась
 *   волатильность — результат систематически отличается от введённого факта на величину
 *   порядка дневной теты. Инвариант «в точке якоря результат == введённый факт» держится
 *   только тогда, когда обе точки — якорная и целевая — в ОДНОЙ системе координат.
 *   См. anchorDaysToExpForPricing внутри функции и frontend/src/utils/__tests__/
 *   factPLAnchorCalibration.test.js, тест «воспроизведение факта».
 * @param {number} params.targetDaysPassed — «дни от oldestEntry» целевой точки.
 * @param {Date|null} params.oldestEntry — самая ранняя дата входа среди опционов позиции.
 * @param {(price: number, days: number, vol: number) => number} [params.computeTheoreticalPrice] —
 *   колбэк СЫРОЙ теоретической цены опциона (без P&L-конвертации, без групповой
 *   корректировки) — обёртка над calculateOptionTheoreticalPrice/
 *   calculateFuturesOptionTheoreticalPrice конкретной ноги. Обязателен для калибровки —
 *   без него функция возвращает theoreticalPL как есть (reason: 'missing-inputs').
 * @param {number} [params.entryPrice] — цена входа за контракт (ASK для Buy, BID для Sell,
 *   с учётом ручных правок пользователя — как getEntryPrice в optionPricing.js).
 * @param {number} [params.contractMultiplier] — множитель контракта (100 для акций,
 *   pointValue для фьючерсов, 1 для крипто — как передаётся в остальные движки).
 * @param {number} params.anchorVolatility — волатильность на дату якоря (Fact IV), В ПРОЦЕНТАХ.
 *   Используется как база для «теоретической P&L на якоре» (для подсказки/остатка) и
 *   как волатильность фолбэка, когда калибровка не находит корень.
 * @param {number} params.anchorPrice — цена актива на дату якоря.
 * @param {number} [params.targetPrice] — цена актива в ЦЕЛЕВОЙ точке (для пересчёта цены
 *   опциона по калиброванной волатильности). Обязателен для калибровки.
 * @param {number} params.currentQuantity — «текущее» количество (числитель коэффициента
 *   масштабирования currentQty/anchorQty).
 * @param {number} [params.ratioFallback=1] — что возвращать вместо коэффициента, если
 *   якорное количество оказалось <= 0.
 * @returns {{
 *   pl: number,
 *   residual: number|null,
 *   applied: boolean,
 *   reason: string|null,
 *   anchorDaysPassed: number|null,
 *   plAtAnchor: number|null,
 *   calibratedVolatility: number|null,
 *   mode: 'calibrated'|'fallback'|'none',
 * }}
 */
export function applyFactPLAnchor({
  option,
  theoreticalPL,
  targetDaysRemaining,
  targetDaysRemainingPrecise,
  targetDaysPassed,
  oldestEntry,
  computeTheoreticalPrice,
  anchorVolatility,
  anchorPrice,
  targetPrice,
  entryPrice,
  contractMultiplier,
  currentQuantity,
  ratioFallback = 1,
}) {
  // Дни для ЦЕНООБРАЗОВАНИЯ в целевой точке — точные, если переданы; иначе фолбэк на
  // целочисленные (тот же targetDaysRemaining, что и у гарда) для вызовов, которые ещё
  // не прокинули точное значение.
  const targetDaysForPricing = Number.isFinite(targetDaysRemainingPrecise) ? targetDaysRemainingPrecise : targetDaysRemaining;
  // ГАРД ЭКСПИРАЦИИ — ключевой инвариант: на дату экспирации (targetDaysRemaining <= 0)
  // P&L обязана считаться чистой формулой intrinsic_value − entry_price, полученной
  // выше по стеку и переданной как theoreticalPL. Любая якорная коррекция здесь
  // искажает математически точное значение и может дать убыток больше уплаченной
  // премии (это и был прод-баг в блоке ИТОГО OptionsTableV3.jsx). Калибровка НЕ
  // отменяет этот гард: на T=0 волатильность вообще не влияет на цену, подбор
  // σ* был бы вырожденной задачей — гард остаётся простым и безусловным.
  if (!(targetDaysRemaining > 0)) {
    return { pl: theoreticalPL, residual: null, applied: false, reason: 'expiry', anchorDaysPassed: null, plAtAnchor: null, calibratedVolatility: null, mode: 'none' };
  }

  const hasAnchor = !!option && option.actualPL !== null && option.actualPL !== undefined && !!option.actualPLDate;
  if (!hasAnchor) {
    return { pl: theoreticalPL, residual: null, applied: false, reason: 'no-anchor', anchorDaysPassed: null, plAtAnchor: null, calibratedVolatility: null, mode: 'none' };
  }

  // Дни от oldestEntry до даты ввода Fact P&L. Фолбэк на new Date() — только здесь,
  // для самой разницы дат; ниже в calculateDaysRemainingUTC передаём oldestEntry как есть.
  const anchorDateObj = new Date(option.actualPLDate + 'T00:00:00Z');
  const oldestEntryForDiff = oldestEntry || new Date();
  const anchorDaysPassed = Math.round((anchorDateObj - oldestEntryForDiff) / (1000 * 60 * 60 * 24));

  // Якорь применяется только если целевая точка не раньше даты якоря — до даты
  // ввода Fact P&L показываем обычный теоретический расчёт.
  if (!(targetDaysPassed >= anchorDaysPassed)) {
    return { pl: theoreticalPL, residual: null, applied: false, reason: 'before-anchor', anchorDaysPassed, plAtAnchor: null, calibratedVolatility: null, mode: 'none' };
  }

  // ЦЕЛАЯ шкала — ТОЛЬКО для гардов ниже (anchorDaysToExp > 0 как условие «входные данные
  // валидны», семантика «день или не день»). НЕ идёт в ценообразование — см. пояснение
  // в JSDoc про targetDaysRemainingPrecise и anchorDaysToExpForPricing ниже.
  const anchorDaysToExp = calculateDaysRemainingUTC(option, anchorDaysPassed, 30, oldestEntry);
  // ТОЧНАЯ (дробная, до 16:00 ET) шкала — идёт в ценообразование на точке якоря (подбор
  // σ*, теоретическая цена на якоре). Обязана быть в ТОЙ ЖЕ системе координат, что и
  // targetDaysForPricing целевой точки (тоже calculateDaysRemainingPreciseET, см. вызовы
  // в OptionsTableV3.jsx/ExitPlanTable.jsx/startPLSnapshot.js) — иначе калибровка,
  // подобранная под одну шкалу времени, применяется к цене, посчитанной в другой, и
  // даже при targetDaysPassed === anchorDaysPassed (пользователь смотрит «сегодня» сразу
  // после ввода факта) результат не воспроизводит введённый factPL. Это и была регрессия
  // 2026-08 (анкор по calculateDaysRemainingUTC при цели по calculateDaysRemainingPreciseET).
  const anchorDaysToExpForPricing = calculateDaysRemainingPreciseET(option, anchorDaysPassed, 30, oldestEntry);

  // Масштабирование по количеству: коэффициент = текущее кол-во / кол-во на якоре.
  const anchorQty = Number(option.actualPLQuantity) > 0
    ? Number(option.actualPLQuantity)
    : (Number(option.quantity) || 1);
  const numeratorQty = Number(currentQuantity) || 0;
  const ratio = anchorQty > 0 ? (numeratorQty / anchorQty) : ratioFallback;

  // Входных данных для калибровки недостаточно (старый/непереведённый вызывающий код,
  // либо тест, который специально проверяет только гарды выше) — безопасная деградация:
  // якорь не применяем, отдаём чистую теорию. Никакого краша — но и никакой поправки.
  const hasCalibrationInputs = typeof computeTheoreticalPrice === 'function'
    && Number.isFinite(Number(entryPrice))
    && Number(contractMultiplier) > 0
    && Number.isFinite(Number(targetPrice))
    && anchorDaysToExp > 0;
  if (!hasCalibrationInputs) {
    return { pl: theoreticalPL, residual: null, applied: false, reason: 'missing-inputs', anchorDaysPassed, plAtAnchor: null, calibratedVolatility: null, mode: 'none' };
  }

  const isBuy = String(option.action || 'Buy').toLowerCase() === 'buy';
  const sign = isBuy ? 1 : -1;
  const mult = Number(contractMultiplier);
  const ep = Number(entryPrice);

  const calibrationKey = buildCalibrationKey(option, anchorDaysToExpForPricing, anchorPrice, ep, mult, anchorVolatility, anchorQty);

  const anchor = memoizeCalibration(calibrationKey, () => {
    // Теоретическая цена/P&L на якоре ПО ИСХОДНОЙ (не калиброванной) волатильности —
    // база для «поправки к модели» (residual) в подсказке UI, и опорная точка для
    // фолбэка (B2), если корня для калибровки не найдётся. Точная шкала — см. комментарий
    // у anchorDaysToExpForPricing выше.
    const theoAnchorPriceOriginal = computeTheoreticalPrice(anchorPrice, anchorDaysToExpForPricing, anchorVolatility);

    // Факт-цена опциона на дату якоря — обратный расчёт из брокерского P&L:
    // цена = цена входа + знак×факт / (кол-во на якоре × множитель).
    const factAnchorPrice = ep + sign * option.actualPL / (anchorQty * mult);

    const solverResult = bisectImpliedVolatility({
      priceFn: (vol) => computeTheoreticalPrice(anchorPrice, anchorDaysToExpForPricing, vol),
      targetPrice: factAnchorPrice,
      // Точность подбора σ* по умолчанию (1e-4 $ за контракт) при переводе в P&L позиции
      // умножается на qty×mult — для ног с десятками контрактов это уже заметные центы
      // (репро при фиксе регрессии шкалы дней: qty×mult=6000 → ошибка ~1 цент,
      // qty×mult=500 → ~5 центов), а инвариант «в точке якоря результат == введённый
      // factPL» требует точности до цента независимо от размера позиции. 1e-6 $ по цене
      // контракта сходится за ~29 итераций бисекции (запас — maxIterations=60 по
      // умолчанию), поэтому ужесточение безопасно по производительности.
      tolerance: 1e-6,
    });

    let k2 = null;
    if (!solverResult.converged) {
      // Фолбэк (вариант B2 из исследования): множитель только на ВРЕМЕННУЮ стоимость,
      // внутренняя остаётся точной — поэтому убыток купленной ноги физически не может
      // превысить уплаченную премию даже когда введённый факт недостижим.
      // days=0 форсирует intrinsic-ветку в computeTheoreticalPrice независимо от vol.
      const intrinsicAtAnchor = computeTheoreticalPrice(anchorPrice, 0, anchorVolatility);
      const theoExAtAnchor = theoAnchorPriceOriginal - intrinsicAtAnchor;
      const factExAtAnchor = factAnchorPrice - intrinsicAtAnchor;
      // Если временная стоимость на якоре пренебрежимо мала (глубоко в деньгах или
      // почти на экспирации), множитель численно неустойчив — не корректируем (k2=1).
      k2 = theoExAtAnchor > 1e-9 ? Math.min(Math.max(factExAtAnchor / theoExAtAnchor, 0), 3) : 1;
    }

    return {
      theoAnchorPriceOriginal,
      factAnchorPrice,
      converged: solverResult.converged,
      calibratedVolatility: solverResult.converged ? solverResult.volatility : null,
      reason: solverResult.converged ? null : solverResult.reason,
      k2,
    };
  });

  // «Теоретическая P&L на якоре» для подсказки/остатка — по ИСХОДНОЙ волатильности и
  // ТЕКУЩЕМУ количеству (та же семантика, что была у аддитивной версии: сравнение
  // «что модель думала на момент ввода факта» против самого факта).
  const plAtAnchor = priceToPL(anchor.theoAnchorPriceOriginal, ep, sign, numeratorQty, mult);
  const residual = option.actualPL * ratio - plAtAnchor;

  if (anchor.converged) {
    const targetTheoPrice = computeTheoreticalPrice(targetPrice, targetDaysForPricing, anchor.calibratedVolatility);
    const pl = priceToPL(targetTheoPrice, ep, sign, numeratorQty, mult);
    return { pl, residual, applied: true, reason: null, anchorDaysPassed, plAtAnchor, calibratedVolatility: anchor.calibratedVolatility, mode: 'calibrated' };
  }

  // Фолбэк B2 в целевой точке: та же исходная волатильность, множитель k2 (посчитан
  // и закэширован выше вместе с калибровкой — он тоже зависит только от точки якоря).
  const intrinsicAtTarget = computeTheoreticalPrice(targetPrice, 0, anchorVolatility);
  const theoAtTargetOriginal = computeTheoreticalPrice(targetPrice, targetDaysForPricing, anchorVolatility);
  const fallbackPrice = intrinsicAtTarget + anchor.k2 * Math.max(0, theoAtTargetOriginal - intrinsicAtTarget);
  const pl = priceToPL(fallbackPrice, ep, sign, numeratorQty, mult);

  return { pl, residual, applied: true, reason: anchor.reason, anchorDaysPassed, plAtAnchor, calibratedVolatility: null, mode: 'fallback' };
}
