/**
 * Сборка тела запроса «Проверка сделки» (POST /api/deal/precheck) из уже
 * посчитанных данных экрана результатов «Север GPT».
 *
 * ЗАЧЕМ: внешний сервис оценивает УЖЕ собранную конструкцию — ничего заново не
 * считаем, только переупаковываем существующие block/ctx/formParams в форму ТЗ.
 * Ограничения размера (легов ≤50, цепочки ≤2000, тикер ≤10, биржа ≤20 симв.) —
 * защита от раздутого запроса на стороне сервиса.
 *
 * ВНИМАНИЕ — известное расхождение единиц измерения IV, ОСТАВЛЕНО ОСОЗНАННО:
 *   - legs[].iv — в ДОЛЯХ (0.49 = 49%). Источник — p.impliedVolatility, уже
 *     нормализованное в доли: сначала бэкенд-валидатором при подборе сделки
 *     (backend/app/services/north_gpt_validator.py, функция _norm_iv), затем
 *     повторно на фронте в enrichNorthGptCombination (northGptStrategy/enrich.js).
 *   - chain[].iv — в ПРОЦЕНТАХ (49.2 = 49.2%). Источник — row.impliedVolatility
 *     / row.iv из плоской цепочки (chainRef.current), как пришло от расширения
 *     TradingView, без нормализации.
 *   Это дефект внутри самой функции (появилась 28.07.2026), но формат отлажен
 *   вживую с внешним сервисом именно в таком виде — МЕНЯТЬ НЕЛЬЗЯ без
 *   согласования контракта с владельцем сервиса. Не «исправлять» унификацией
 *   единиц при рефакторинге.
 */

const MAX_LEGS = 50;
const MAX_CHAIN = 2000;

const daysBetween = (fromIso, toIso) => {
  if (!fromIso || !toIso) return null;
  const a = new Date(`${fromIso}T00:00:00Z`).getTime();
  const b = new Date(`${toIso}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
};

const todayIso = () => new Date().toISOString().split('T')[0];

const finiteOrUndefined = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);

/**
 * @param {object} block — обогащённый блок комбинации (positions/cost/criteria из enrichNorthGptCombination)
 * @param {object} ctx — { entry, currentPrice, topPrice, bottomPrice, expirationDate }
 * @param {object} formParams — параметры формы «Север GPT» (margin, marginTolerance, plTolerance,
 *                               calcDate, callStrikeMin/Max, putStrikeMin/Max)
 * @param {Array} chain — плоская цепочка (chainRef.current), опционально
 * @param {{ ticker?: string, exchange?: string }} meta
 */
export const buildPrecheckRequest = (block, ctx, formParams, chain, meta = {}) => {
  const today = todayIso();
  const positions = Array.isArray(block?.positions) ? block.positions.slice(0, MAX_LEGS) : [];

  const legs = positions.map((p) => ({
    option_type: (p.type || '').toUpperCase(),
    action: (p.action || 'Buy').toUpperCase(),
    strike: finiteOrUndefined(p.strike),
    quantity: finiteOrUndefined(p.quantity),
    expiration: p.date || null,
    dte: daysBetween(today, p.date),
    bid: finiteOrUndefined(p.bid),
    ask: finiteOrUndefined(p.ask),
    volume: finiteOrUndefined(p.volume),
    iv: finiteOrUndefined(p.impliedVolatility),
    delta: finiteOrUndefined(p.delta),
    gamma: finiteOrUndefined(p.gamma),
    theta: finiteOrUndefined(p.theta),
    vega: finiteOrUndefined(p.vega),
    open_interest: finiteOrUndefined(p.oi) ?? null,
  }));

  const chainForExpiration = Array.isArray(chain)
    ? chain.filter((row) => !ctx?.expirationDate || row.date === ctx.expirationDate)
    : [];
  const compactChain = chainForExpiration.slice(0, MAX_CHAIN).map((row) => {
    const expiration = row.date || ctx?.expirationDate || null;
    return {
      // Сервис проверяет ряды chain по той же строгой схеме, что и legs —
      // все поля обязательны (проверено вживую: 422 без dte/volume/gamma/theta/vega).
      option_type: (row.type || '').toUpperCase(),
      strike: finiteOrUndefined(row.strike),
      expiration,
      dte: daysBetween(today, expiration),
      bid: finiteOrUndefined(row.bid),
      ask: finiteOrUndefined(row.ask),
      volume: finiteOrUndefined(row.volume) ?? 0,
      iv: finiteOrUndefined(row.impliedVolatility ?? row.iv),
      delta: finiteOrUndefined(row.delta),
      gamma: finiteOrUndefined(row.gamma) ?? 0,
      theta: finiteOrUndefined(row.theta) ?? 0,
      vega: finiteOrUndefined(row.vega) ?? 0,
    };
  });

  const payload = {
    ticker: String(meta.ticker || '').toUpperCase().slice(0, 10),
    exchange: meta.exchange ? String(meta.exchange).slice(0, 20) : undefined,
    stock_price: finiteOrUndefined(ctx?.currentPrice),
    entry_price: finiteOrUndefined(ctx?.entry),
    target_price: finiteOrUndefined(ctx?.topPrice),
    stop_price: finiteOrUndefined(ctx?.bottomPrice),
    calculation_day: daysBetween(today, formParams?.calcDate),
    margin_limit: finiteOrUndefined(formParams?.margin),
    margin_tolerance: finiteOrUndefined(formParams?.marginTolerance),
    // В проекте нет коротких ног и настройки блокировки по DTE — всегда только BUY.
    allow_short_legs: false,
    dte_short_blocks: false,
    pnl_stop_tolerance: finiteOrUndefined(formParams?.plTolerance),
    // Режим «без Put»: диапазона Put нет — ключ не отправляем вовсе, чтобы сервис
    // не пытался искать Put там, где их в сделке нет.
    strike_ranges: {
      call: { from: finiteOrUndefined(formParams?.callStrikeMin), to: finiteOrUndefined(formParams?.callStrikeMax) },
      put: formParams?.withoutPut
        ? undefined
        : { from: finiteOrUndefined(formParams?.putStrikeMin), to: finiteOrUndefined(formParams?.putStrikeMax) },
    },
    calculator: {
      margin_used: finiteOrUndefined(block?.cost?.marginUsed),
      pnl_target: finiteOrUndefined(block?.criteria?.topTotal),
      pnl_stop: finiteOrUndefined(block?.criteria?.bottomMetric),
    },
    legs,
    chain: compactChain.length > 0 ? compactChain : undefined,
    include_news: true,
  };

  return JSON.parse(JSON.stringify(payload));
};

export default buildPrecheckRequest;
