// Решатель обратной задачи ценообразования опционов: подбор волатильности,
// при которой теоретическая цена опциона (Black-Scholes-Merton для акций/крипто,
// Black-76 для фьючерсов) равна заданной целевой цене.
//
// ЗАЧЕМ: в проекте не было решателя обратной задачи — getImpliedVolatility в
// optionPricing.js/futuresPricing.js просто ЧИТАЕТ поле IV из объекта опциона,
// это не подбор. Решатель нужен для калибровки якоря Fact P&L (frontend/src/utils/
// factPLAnchor.js) — вместо аддитивной поправки поверх модели мы подбираем такую
// волатильность, при которой модель сама даёт факт брокера, и дальше считаем по ней.
//
// Метод — бисекция: теоретическая цена опциона строго монотонно растёт по волатильности
// (при положительном времени до экспирации вега > 0 у обоих движков), поэтому на
// отрезке [volLow; volHigh] бисекция гарантированно сходится, если целевая цена
// внутри диапазона [цена(volLow); цена(volHigh)].

import { calculateOptionTheoreticalPrice } from './optionPricing';
import { calculateFuturesOptionTheoreticalPrice } from './futuresPricing';

// Границы поиска в ПРОЦЕНТАХ (единая конвенция проекта — см. JSDoc в factPLAnchor.js).
// Нижняя граница СТРОГО больше 1.0, а не ровно 1: calculateOptionTheoreticalPrice/
// calculateFuturesOptionTheoreticalPrice трактуют overrideVolatility > 1 как проценты
// (делят на 100), а <= 1 — как уже готовую долю. Ровно 1 попал бы во вторую ветку и
// был бы прочитан как 100% волатильности, а не 1% — отсюда 1.0001, не 1.
const DEFAULT_VOL_LOW = 1.0001;
const DEFAULT_VOL_HIGH = 500;
const DEFAULT_MAX_ITERATIONS = 60;
// Точность подбора в единицах цены опциона (доллары за контракт, не за позицию).
const DEFAULT_TOLERANCE = 1e-4;

/**
 * Ядро бисекции: находит vol (в процентах) такой, что priceFn(vol) ≈ targetPrice.
 *
 * ЗАЧЕМ отдельно от solveImpliedVolatility: factPLAnchor.js калибрует волатильность
 * поверх УЖЕ готового колбэка ценообразования конкретной ноги (замыкание вызывающей
 * стороны — там уже зашиты option/режим/дивдоходность/ставка, как и у существующего
 * computeTheoreticalPL). Даём общее бисекционное ядро, чтобы не дублировать один и
 * тот же алгоритм в двух местах — solveImpliedVolatility ниже лишь строит priceFn
 * из option/режима и вызывает это ядро.
 *
 * @param {object} params
 * @param {(volPct: number) => number} params.priceFn — цена опциона при данной волатильности (%).
 * @param {number} params.targetPrice — целевая цена опциона.
 * @param {number} [params.volLow=1] — нижняя граница поиска, %.
 * @param {number} [params.volHigh=500] — верхняя граница поиска, %.
 * @param {number} [params.maxIterations=60] — максимум итераций бисекции.
 * @param {number} [params.tolerance=1e-4] — точность по цене (в тех же единицах, что targetPrice).
 * @returns {{ volatility: number|null, converged: boolean, reason: string|null, iterations?: number }}
 */
export function bisectImpliedVolatility({
  priceFn,
  targetPrice,
  volLow = DEFAULT_VOL_LOW,
  volHigh = DEFAULT_VOL_HIGH,
  maxIterations = DEFAULT_MAX_ITERATIONS,
  tolerance = DEFAULT_TOLERANCE,
} = {}) {
  if (typeof priceFn !== 'function') {
    return { volatility: null, converged: false, reason: 'invalid-price-fn' };
  }
  if (!Number.isFinite(targetPrice)) {
    return { volatility: null, converged: false, reason: 'invalid-target' };
  }
  if (!(volHigh > volLow) || !(volLow > 0)) {
    return { volatility: null, converged: false, reason: 'invalid-bounds' };
  }

  const priceAtLow = priceFn(volLow);
  const priceAtHigh = priceFn(volHigh);

  if (!Number.isFinite(priceAtLow) || !Number.isFinite(priceAtHigh)) {
    return { volatility: null, converged: false, reason: 'pricing-error' };
  }

  // Целевая цена ниже минимально достижимой (≈ внутренняя стоимость при почти
  // нулевой волатильности) — корня нет, факт физически недостижим для этой ноги.
  if (targetPrice < priceAtLow - tolerance) {
    return { volatility: null, converged: false, reason: 'below-intrinsic' };
  }
  // Целевая цена выше цены при верхней границе (500% волатильности) — корня нет.
  if (targetPrice > priceAtHigh + tolerance) {
    return { volatility: null, converged: false, reason: 'above-max-volatility' };
  }

  let lo = volLow;
  let hi = volHigh;
  for (let i = 0; i < maxIterations; i++) {
    const mid = (lo + hi) / 2;
    const price = priceFn(mid);
    if (!Number.isFinite(price)) {
      return { volatility: null, converged: false, reason: 'pricing-error' };
    }
    if (Math.abs(price - targetPrice) <= tolerance) {
      return { volatility: mid, converged: true, reason: null, iterations: i + 1 };
    }
    if (price < targetPrice) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  // Достигнут лимит итераций без точного попадания в tolerance — на отрезке
  // [1%; 500%] за 60 бисекций разрешение (500-1)/2^60 исчезающе мало, так что
  // это ветка теоретическая (защита от зависания), а не ожидаемый исход.
  return { volatility: (lo + hi) / 2, converged: true, reason: null, iterations: maxIterations };
}

/**
 * Подобрать implied volatility для опциона: волатильность (%), при которой
 * теоретическая цена опциона равна targetPrice.
 *
 * @param {object} params
 * @param {object} params.option — нога опциона (нужны strike, type — как для
 *   calculateOptionTheoreticalPrice/calculateFuturesOptionTheoreticalPrice).
 * @param {number} params.targetPrice — целевая цена опциона (за контракт).
 * @param {number} params.assetPrice — цена базового актива (спот для акций/крипто,
 *   цена фьючерса для режима 'futures').
 * @param {number} params.daysRemaining — дней до экспирации в точке подбора.
 * @param {number} [params.dividendYield=0] — дивдоходность (десятичная), только для 'stocks'/'crypto'.
 * @param {number|null} [params.riskFreeRate=null] — безрисковая ставка; null → берётся из FRED
 *   внутри calculateOptionTheoreticalPrice (см. optionPricing.js). Для 'futures' не используется —
 *   calculateFuturesOptionTheoreticalPrice сама берёт ставку из getRiskFreeRateSync.
 * @param {'stocks'|'crypto'|'futures'} [params.mode='stocks'] — выбор движка: 'futures' → Black-76
 *   (calculateFuturesOptionTheoreticalPrice), иначе → Black-Scholes-Merton (calculateOptionTheoreticalPrice).
 * @param {number|null} [params.contractMultiplier=null] — множитель контракта. В расчёте ЦЕНЫ
 *   не участвует (цена уже «за контракт», множитель применяется только при переводе в P&L
 *   позиции) — принят в сигнатуре для единообразия и на случай будущих проверок диапазона.
 * @param {number} [params.volLow=1] — нижняя граница поиска, %.
 * @param {number} [params.volHigh=500] — верхняя граница поиска, %.
 * @param {number} [params.maxIterations=60] — максимум итераций.
 * @param {number} [params.tolerance=1e-4] — точность по цене.
 * @returns {{ volatility: number|null, converged: boolean, reason: string|null, iterations?: number }}
 */
export function solveImpliedVolatility({
  option,
  targetPrice,
  assetPrice,
  daysRemaining,
  dividendYield = 0,
  riskFreeRate = null,
  mode = 'stocks',
  // eslint-disable-next-line no-unused-vars
  contractMultiplier = null,
  volLow = DEFAULT_VOL_LOW,
  volHigh = DEFAULT_VOL_HIGH,
  maxIterations = DEFAULT_MAX_ITERATIONS,
  tolerance = DEFAULT_TOLERANCE,
} = {}) {
  // На экспирации (и позже) волатильность не влияет на цену (T=0 → только внутренняя
  // стоимость) — подбор бессмыслен, это не «нет корня», а вырожденная задача.
  if (!(daysRemaining > 0)) {
    return { volatility: null, converged: false, reason: 'expiry' };
  }

  const isFutures = mode === 'futures';
  const priceFn = (volPct) => (
    isFutures
      ? calculateFuturesOptionTheoreticalPrice(option, assetPrice, daysRemaining, volPct)
      : calculateOptionTheoreticalPrice(option, assetPrice, daysRemaining, volPct, dividendYield, riskFreeRate)
  );

  return bisectImpliedVolatility({ priceFn, targetPrice, volLow, volHigh, maxIterations, tolerance });
}

export const IV_SOLVER_CONSTANTS = {
  DEFAULT_VOL_LOW,
  DEFAULT_VOL_HIGH,
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_TOLERANCE,
};
