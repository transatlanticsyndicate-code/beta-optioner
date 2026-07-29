// Снимок формата запроса «Проверка сделки» (buildPrecheckRequest).
//
// ЗАЧЕМ: внешний сервис отлажен вживую именно под текущий формат payload —
// в частности под расхождение единиц IV между legs[] (доли) и chain[]
// (проценты), см. комментарий в шапке buildPrecheckRequest.js. Тест обязан
// ПАДАТЬ, если кто-то в будущем «унифицирует» единицы IV или уронит одно из
// обязательных полей payload — это будет 422 у внешнего сервиса в проде.

import { buildPrecheckRequest } from '../northGptStrategy/buildPrecheckRequest';

// Синтетический вход: 2 ноги (call+put), 2 строки цепочки на ту же дату
// экспирации (+1 строка с другой датой — должна быть отфильтрована) и
// параметры формы «Север GPT».
const block = {
  positions: [
    {
      type: 'call',
      action: 'Buy',
      strike: 100,
      quantity: 1,
      date: '2026-09-18',
      bid: 2.1,
      ask: 2.3,
      volume: 120,
      impliedVolatility: 0.49, // доли — уже нормализовано enrichNorthGptCombination/бэкенд-валидатором
      delta: 0.55,
      gamma: 0.02,
      theta: -0.03,
      vega: 0.12,
      oi: 340,
    },
    {
      type: 'put',
      action: 'Buy',
      strike: 95,
      quantity: 2,
      date: '2026-09-18',
      bid: 1.1,
      ask: 1.3,
      volume: 80,
      impliedVolatility: 0.52,
      delta: -0.35,
      gamma: 0.015,
      theta: -0.02,
      vega: 0.09,
      oi: 210,
    },
  ],
  cost: { marginUsed: 530 },
  criteria: { topTotal: 900, bottomMetric: -300 },
};

const ctx = {
  entry: 500,
  currentPrice: 101.5,
  topPrice: 115,
  bottomPrice: 90,
  expirationDate: '2026-09-18',
};

const formParams = {
  margin: 1000,
  marginTolerance: 0.1,
  plTolerance: 0.2,
  calcDate: '2026-08-15',
  callStrikeMin: 90,
  callStrikeMax: 120,
  putStrikeMin: 80,
  putStrikeMax: 100,
};

const chain = [
  {
    type: 'call',
    strike: 100,
    date: '2026-09-18',
    bid: 2.1,
    ask: 2.3,
    volume: 120,
    impliedVolatility: 49.2, // проценты — как пришло от расширения TradingView
    delta: 0.55,
    gamma: 0.02,
    theta: -0.03,
    vega: 0.12,
  },
  {
    type: 'put',
    strike: 95,
    date: '2026-09-18',
    bid: 1.1,
    ask: 1.3,
    volume: 80,
    impliedVolatility: 52.4,
    delta: -0.35,
    gamma: 0.015,
    theta: -0.02,
    vega: 0.09,
  },
  // Другая дата экспирации — должна быть отфильтрована buildPrecheckRequest
  // (chainForExpiration оставляет только строки с ctx.expirationDate).
  {
    type: 'call',
    strike: 105,
    date: '2026-10-16',
    bid: 1.5,
    ask: 1.7,
    volume: 40,
    impliedVolatility: 44.0,
    delta: 0.4,
    gamma: 0.01,
    theta: -0.02,
    vega: 0.08,
  },
];

const meta = { ticker: 'aapl', exchange: 'nasdaq' };

describe('buildPrecheckRequest — формат payload «Проверка сделки»', () => {
  const result = buildPrecheckRequest(block, ctx, formParams, chain, meta);

  test('legs — непустой массив, iv остаётся в ДОЛЯХ (0.xx)', () => {
    expect(Array.isArray(result.legs)).toBe(true);
    expect(result.legs).toHaveLength(2);

    const [callLeg, putLeg] = result.legs;

    expect(callLeg.option_type).toBe('CALL');
    expect(callLeg.action).toBe('BUY');
    expect(callLeg.strike).toBe(100);
    expect(callLeg.quantity).toBe(1);
    expect(callLeg.expiration).toBe('2026-09-18');
    expect(typeof callLeg.dte).toBe('number');
    expect(Number.isFinite(callLeg.dte)).toBe(true);
    expect(callLeg.bid).toBe(2.1);
    expect(callLeg.ask).toBe(2.3);
    expect(callLeg.volume).toBe(120);
    // КЛЮЧЕВАЯ проверка: legs[].iv в долях, не в процентах.
    expect(callLeg.iv).toBeCloseTo(0.49, 5);
    expect(callLeg.iv).toBeLessThan(1);
    expect(callLeg.delta).toBe(0.55);
    expect(callLeg.gamma).toBe(0.02);
    expect(callLeg.theta).toBe(-0.03);
    expect(callLeg.vega).toBe(0.12);
    expect(callLeg.open_interest).toBe(340);

    expect(putLeg.option_type).toBe('PUT');
    expect(putLeg.strike).toBe(95);
    expect(putLeg.quantity).toBe(2);
    expect(putLeg.iv).toBeCloseTo(0.52, 5);
    expect(putLeg.iv).toBeLessThan(1);
  });

  test('chain — отфильтрован по дате экспирации, iv остаётся в ПРОЦЕНТАХ (xx.x)', () => {
    expect(Array.isArray(result.chain)).toBe(true);
    // Третья строка (другая дата) должна быть отброшена.
    expect(result.chain).toHaveLength(2);

    const [callRow, putRow] = result.chain;

    expect(callRow.option_type).toBe('CALL');
    expect(callRow.strike).toBe(100);
    expect(callRow.expiration).toBe('2026-09-18');
    // КЛЮЧЕВАЯ проверка: chain[].iv в процентах, НЕ в долях — расхождение с
    // legs[].iv осознанное, единицы менять нельзя (см. шапку buildPrecheckRequest.js).
    expect(callRow.iv).toBeCloseTo(49.2, 5);
    expect(callRow.iv).toBeGreaterThan(1);

    expect(putRow.option_type).toBe('PUT');
    expect(putRow.strike).toBe(95);
    expect(putRow.iv).toBeCloseTo(52.4, 5);
    expect(putRow.iv).toBeGreaterThan(1);
  });

  test('корневые поля payload присутствуют и совпадают со входом', () => {
    expect(result.stock_price).toBe(101.5);
    expect(result.entry_price).toBe(500);
    expect(result.target_price).toBe(115);
    expect(result.stop_price).toBe(90);
    expect(result.allow_short_legs).toBe(false);
    expect(result.dte_short_blocks).toBe(false);
    expect(result.ticker).toBe('AAPL');
    // exchange, в отличие от ticker, не приводится к верхнему регистру —
    // так ведёт себя текущий код (meta.exchange только обрезается до 20 симв.).
    expect(result.exchange).toBe('nasdaq');
  });

  test('calculator — margin_used/pnl_target/pnl_stop присутствуют', () => {
    expect(result.calculator).toBeDefined();
    expect(result.calculator.margin_used).toBe(530);
    expect(result.calculator.pnl_target).toBe(900);
    expect(result.calculator.pnl_stop).toBe(-300);
  });
});
