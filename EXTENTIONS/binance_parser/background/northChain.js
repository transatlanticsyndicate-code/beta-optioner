/**
 * Background Module: сборка данных для стратегии «Север GPT» (крипта / Binance).
 * ЗАЧЕМ: поп-ап «Север GPT» в калькуляторе ждёт от расширения список экспираций
 * (tvc_expirations_list) и полную цепочку опционов одной экспирации (tvc_full_chain) —
 * ровно как их отдаёт расширение TradingView. Здесь мы формируем те же два объекта,
 * но из публичного API Binance (eapi.binance.com).
 *
 * ПОЧЕМУ В ФОНЕ И БЕЗ ВКЛАДКИ BINANCE: данные публичные, у service worker есть
 * host-разрешение на eapi.binance.com, поэтому забираем доску напрямую fetch'ем —
 * пользователю НЕ нужно держать открытой страницу Binance.
 *
 * Формат tvc_full_chain — ПЛОСКИЙ (по записи на каждый CALL и PUT), идентичный
 * EXTENTIONS/OptionsCPbuttons/src/parser.js → dumpFullChain(). IV — в ПРОЦЕНТАХ
 * (как у TradingView): фронт делит на 100, если значение > 1.5.
 */

const EAPI_BASE = 'https://eapi.binance.com/eapi/v1';

async function _northFetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Binance API HTTP ' + r.status);
  return r.json();
}

// Тикер калькулятора (напр. BTCUSDT) → параметр underlying для eapi.
function _northUnderlying(ticker) {
  return (ticker || '').toUpperCase().trim();
}

// Базовый актив из тикера: BTCUSDT → BTC, ETHUSDT → ETH.
// ЗАЧЕМ: эндпоинты /mark и /ticker ИГНОРИРУЮТ параметр underlying и отдают доску по
// ВСЕМ активам сразу (BTC + ETH + …). Поэтому отбираем нужный базовый актив сами,
// сравнивая префикс символа (как делает src/parser.js в существующем расширении).
function _northBase(ticker) {
  return _northUnderlying(ticker).replace(/(USDT|USDC|BUSD|USD)$/, '');
}

// Символ опциона Binance: BTC-250117-95000-C → { base, code, strike, type }
function _northParseSymbol(symbol) {
  const m = symbol && symbol.match(/^([A-Z]+)-(\d{6})-(\d+(?:\.\d+)?)-([CP])$/);
  if (!m) return null;
  return { base: m[1], code: m[2], strike: parseFloat(m[3]), type: m[4] === 'C' ? 'CALL' : 'PUT' };
}

// YYMMDD → YYYY-MM-DD
function _northIsoFromCode(code) {
  const m = String(code).match(/^(\d{2})(\d{2})(\d{2})$/);
  return m ? `20${m[1]}-${m[2]}-${m[3]}` : null;
}

// Дней до экспирации от сегодня (UTC).
function _northDaysUntil(iso) {
  const target = new Date(iso + 'T00:00:00Z').getTime();
  const now = new Date();
  const t0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - t0) / 86400000);
}

// IV из доли (0.45 / 1.049) в проценты, как в цепочке TradingView. Невалидное (≤0, "-1.0") → 0.
function _northIvPct(v) {
  const n = parseFloat(v);
  if (!isFinite(n) || n <= 0) return 0;
  return n * 100;
}

async function _northFetchMarkMap(underlying) {
  const data = await _northFetchJson(`${EAPI_BASE}/mark?underlying=${underlying}`);
  const map = {};
  for (const it of data || []) map[it.symbol] = it;
  return map;
}

async function _northFetchTickerMap(underlying) {
  const data = await _northFetchJson(`${EAPI_BASE}/ticker?underlying=${underlying}`);
  const map = {};
  for (const it of data || []) map[it.symbol] = it;
  return map;
}

/**
 * north_init: собрать список всех доступных экспираций и записать tvc_expirations_list.
 */
async function buildNorthExpirationsList(ticker) {
  const underlying = _northUnderlying(ticker);
  const base = _northBase(ticker);
  const mark = await _northFetchMarkMap(underlying);

  const codes = new Set();
  for (const sym of Object.keys(mark)) {
    const p = _northParseSymbol(sym);
    if (p && p.base === base) codes.add(p.code);
  }
  const expirations = Array.from(codes)
    .map((code) => _northIsoFromCode(code))
    .filter(Boolean)
    .sort()
    .map((iso) => ({ date: iso, days: _northDaysUntil(iso), expanded: true }));

  await chrome.storage.local.set({
    tvc_expirations_list: { ticker, expirations, timestamp: Date.now() },
  });
  console.log('[Binance/north] tvc_expirations_list:', ticker, expirations.length, 'экспираций');
  return { ok: true, count: expirations.length };
}

/**
 * north_expand_expiration: собрать полную цепочку одной экспирации и записать tvc_full_chain.
 * Берём только контракты с ask > 0 (как TradingView — без котировки расчёт бесполезен).
 */
async function buildNorthFullChain(ticker, targetIso) {
  const underlying = _northUnderlying(ticker);
  const base = _northBase(ticker);
  const [mark, tick] = await Promise.all([
    _northFetchMarkMap(underlying),
    _northFetchTickerMap(underlying),
  ]);

  const options = [];
  for (const sym of Object.keys(mark)) {
    const p = _northParseSymbol(sym);
    if (!p || p.base !== base) continue;
    const iso = _northIsoFromCode(p.code);
    if (iso !== targetIso) continue;

    const m = mark[sym] || {};
    const t = tick[sym] || {};
    const ask = parseFloat(t.askPrice) || 0;
    if (ask <= 0) continue;

    const bid = parseFloat(t.bidPrice) || 0;
    const last = parseFloat(t.lastPrice) || 0;
    const markIv = _northIvPct(m.markIV);

    options.push({
      ticker,
      strike: p.strike,
      expirationISO: iso,
      date: iso,
      type: p.type,
      bid,
      ask,
      last,
      price: last || ((bid + ask) / 2) || parseFloat(m.markPrice) || 0,
      volume: parseFloat(t.volume) || 0,
      iv: markIv,
      impliedVolatility: markIv,
      askIV: _northIvPct(m.askIV),
      bidIV: _northIvPct(m.bidIV),
      delta: parseFloat(m.delta) || 0,
      gamma: parseFloat(m.gamma) || 0,
      theta: parseFloat(m.theta) || 0,
      vega: parseFloat(m.vega) || 0,
      rho: 0,
    });
  }
  options.sort((a, b) => (a.strike - b.strike) || a.type.localeCompare(b.type));

  await chrome.storage.local.set({
    tvc_full_chain: { ticker, options, timestamp: Date.now() },
  });
  console.log('[Binance/north] tvc_full_chain:', ticker, targetIso, options.length, 'опционов');
  return { ok: true, count: options.length, date: targetIso };
}

self.northChain = { buildNorthExpirationsList, buildNorthFullChain };

console.log('[Binance/north] northChain.js загружен');
