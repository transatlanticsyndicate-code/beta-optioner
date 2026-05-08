import asyncio
import json
import os
import random
import sys
import logging
from aiohttp import web
from ib_insync import *
from logging.handlers import RotatingFileHandler

# Configure Logging
log_path = os.path.expanduser("~/Library/Logs/IBKRBridge.log")
os.makedirs(os.path.dirname(log_path), exist_ok=True)

logger = logging.getLogger("IBKRBridge")
logger.setLevel(logging.INFO)

# Formatter
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')

# Console Handler
ch = logging.StreamHandler()
ch.setFormatter(formatter)
logger.addHandler(ch)

# File Handler (10MB limit, 3 backups)
fh = RotatingFileHandler(log_path, maxBytes=10*1024*1024, backupCount=3)
fh.setFormatter(formatter)
logger.addHandler(fh)

# Override print to use logger for simplicity during migration
def print(*args, **kwargs):
    msg = " ".join(map(str, args))
    logger.info(msg)

# Initialize IB globally
ib = IB()

# In-memory cache for conIds
CACHE = {}

# Global variable for account mode
ACCOUNT_MODE = 'demo'

def parse_quantity(value, default=1, min_val=1, max_val=10000):
    """
    Safely parse and validate quantity parameter
    Returns value clamped between min_val and max_val
    """
    try:
        qty = int(value)
        return max(min_val, min(qty, max_val))
    except (ValueError, TypeError):
        return default

def load_config():
    # If frozen (PyInstaller), use the executable's directory
    if getattr(sys, 'frozen', False):
        base_dir = os.path.dirname(sys.executable)
    else:
        # Development mode
        base_dir = os.path.dirname(__file__)
        
    CONFIG_PATH = os.path.join(base_dir, 'config.json')
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error reading config.json: {e}")
    return {}

# ─── CORS Middleware ───
async def cors_middleware(app, handler):
    async def middleware(request):
        if request.method == 'OPTIONS':
            return web.Response(status=204, headers={
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            })
        response = await handler(request)
        response.headers['Access-Control-Allow-Origin'] = '*'
        return response
    return middleware

# ─── Handlers ───
async def handle_ping(request):
    return web.Response(text="pong")

async def handle_open(request):
    con_id = request.query.get('conid')
    symbol = request.query.get('symbol')
    expiry = request.query.get('expiry')
    strike = request.query.get('strike')
    right = request.query.get('right')
    sec_type = request.query.get('secType', 'STK').upper()

    action = request.query.get('action', 'BUY').upper()
    if action not in ['BUY', 'SELL']: action = 'BUY'

    quantity = parse_quantity(request.query.get('quantity', '1'))

    # LIMIT-цена. Для пути из калькулятора (symbol/expiry/strike/right) обязательна.
    # Для пути из TradingView (conid без price) сохраняется старое поведение MKT.
    price_raw = request.query.get('price')
    limit_price = None
    if price_raw is not None and price_raw != '':
        try:
            parsed = float(price_raw)
            if parsed > 0:
                limit_price = parsed
        except (ValueError, TypeError):
            limit_price = None

    # Признак закрытия позиции по акции: secType=STK + symbol, без expiry/strike/right.
    # Для этого пути цена в URL необязательна — backend сам возьмёт live bid/ask из TWS.
    is_stock_close = (sec_type == 'STK' and symbol and not expiry and not strike and not right)

    # Для калькуляторного пути (без conid) цена обязательна — кроме закрытия акций (там её добываем сами).
    if not con_id and not is_stock_close and limit_price is None:
        print(f"!!! REJECTING: /open from calculator without valid price: price={price_raw!r}")
        return web.Response(text="Missing or invalid price for limit order", status=400)

    print(f"\n[HTTP] /open parameters: conid={con_id}, symbol={symbol}, expiry={expiry}, strike={strike}, right={right}, action={action}, secType={sec_type}, quantity={quantity}, price={limit_price}, stock_close={is_stock_close}")

    # ─── Stock-close path: STK + symbol, без опционных полей ───
    if is_stock_close:
        try:
            stock_contract = Stock(symbol, 'SMART', 'USD')
            details = await ib.reqContractDetailsAsync(stock_contract)
            if not details:
                print(f"!!! FAIL: Stock contract not found: {symbol}")
                return web.json_response({"status": "error", "error": f"Stock contract not found: {symbol}"}, status=404)
            full_contract = details[0].contract
            print(f"    SUCCESS qualified stock: {full_contract.symbol} on {full_contract.exchange}")

            # Запрашиваем live bid/ask (snapshot). Таймаут — чтобы не висеть, если рынок закрыт/нет подписки.
            print(f"    Requesting live bid/ask for {symbol}...")
            try:
                tickers = await asyncio.wait_for(ib.reqTickersAsync(full_contract), timeout=2.5)
            except asyncio.TimeoutError:
                print(f"!!! Market data timeout for {symbol}")
                return web.json_response({"status": "error", "error": "Market data timeout — нет live-котировок (рынок закрыт или нет подписки)"}, status=503)

            if not tickers:
                return web.json_response({"status": "error", "error": "No market data received"}, status=503)

            t = tickers[0]
            bid = t.bid if (t.bid is not None and t.bid > 0) else None
            ask = t.ask if (t.ask is not None and t.ask > 0) else None

            # SELL → закрываем LONG → берём bid (цена, по которой можно продать).
            # BUY  → закрываем SHORT → берём ask (цена, по которой можно выкупить).
            live_price = bid if action == 'SELL' else ask
            if live_price is None:
                side_name = 'bid' if action == 'SELL' else 'ask'
                print(f"!!! No live {side_name} for {symbol} (bid={bid}, ask={ask})")
                return web.json_response({"status": "error", "error": f"Нет live-{side_name} для {symbol} — рынок закрыт или нет подписки"}, status=503)

            order = Order(
                action=action,
                totalQuantity=quantity,
                orderType='LMT',
                lmtPrice=live_price,
                tif='DAY',
                transmit=False,
            )
            order_contract = Contract(conId=full_contract.conId, exchange=full_contract.exchange or 'SMART')
            print(f"    Placing staged STK LMT {action} {quantity} {symbol} @ {live_price}...")
            trade = ib.placeOrder(order_contract, order)
            await asyncio.sleep(0.5)
            return web.json_response({
                "status": "success",
                "symbol": full_contract.symbol,
                "conId": full_contract.conId,
                "orderStatus": trade.orderStatus.status,
                "limitPrice": live_price,
            })
        except Exception as e:
            print(f"!!! ERROR handling stock-close /open: {e}")
            return web.json_response({"status": "error", "error": str(e)}, status=500)

    try:
        if con_id:
            print(f">>> RECEIVED {action} REQUEST for conId: {con_id}")
            contract = Contract(conId=int(con_id))
        elif symbol and expiry and strike and right:
            print(f">>> RECEIVED DETAILS {action} REQUEST: {symbol} {expiry} {strike} {right}")
            # Solve for conId using existing mapping logic
            mapping = await get_mapping_logic(symbol, sec_type, expiry)
            # Try multiple strike formats: "177.5", "177.50", "178"
            strike_str = str(strike)
            resolved_conid = None
            if mapping:
                for s in [strike_str, strike_str + '0', str(float(strike_str))]:
                    if s in mapping and right in mapping[s]:
                        resolved_conid = mapping[s][right]
                        print(f"    Resolved strike '{strike_str}' (matched as '{s}') to conId: {resolved_conid}")
                        break
                if not resolved_conid:
                    # Show nearby strikes for debugging
                    try:
                        sv = float(strike_str)
                        nearby = sorted([k for k in mapping.keys() if abs(float(k) - sv) <= 10])
                        print(f"    Strike '{strike_str}' NOT in mapping. Nearby: {nearby[:15]}")
                    except: pass
            if resolved_conid:
                contract = Contract(conId=resolved_conid)
            elif sec_type == 'FUT':
                # Futures options (FOP) need special handling
                contract = Contract(symbol=symbol, secType='FOP', lastTradeDateOrContractMonth=expiry, strike=float(strike), right=right, exchange='GLOBEX')
                print(f"    Using direct FOP contract: {symbol} {expiry} {strike} {right} on GLOBEX")
            else:
                # Fallback: create contract from details directly for qualification
                contract = Option(symbol, expiry, float(strike), right, 'SMART')
        else:
            print(f"!!! REJECTING: Missing parameters in /open")
            return web.Response(text="Missing conid or contract details", status=400)
            
        print(f"    Qualifying contract...")
        details = await ib.reqContractDetailsAsync(contract)
        
        # Fallback: if conId from cache failed, try direct contract construction
        if not details and symbol and expiry and strike and right:
            if sec_type == 'FUT':
                print(f"    conId lookup failed, retrying with direct FOP({symbol}, {expiry}, {strike}, {right})...")
                for ex in ['GLOBEX', 'CME', 'NYMEX', 'COMEX', 'CBOT', '']:
                    contract = Contract(symbol=symbol, secType='FOP', lastTradeDateOrContractMonth=expiry, strike=float(strike), right=right, exchange=ex)
                    details = await ib.reqContractDetailsAsync(contract)
                    if details:
                        print(f"    Found FOP on exchange: {ex}")
                        break
            else:
                print(f"    conId lookup failed, retrying with direct Option({symbol}, {expiry}, {strike}, {right})...")
                # Try exact date first, then nearby dates (+/- 1-4 days) for date mismatches
                from datetime import datetime, timedelta
                base_date = datetime.strptime(expiry, '%Y%m%d')
                dates_to_try = [expiry]
                for delta in range(1, 5):
                    dates_to_try.append((base_date - timedelta(days=delta)).strftime('%Y%m%d'))
                    dates_to_try.append((base_date + timedelta(days=delta)).strftime('%Y%m%d'))
                for try_date in dates_to_try:
                    contract = Option(symbol, try_date, float(strike), right, 'SMART')
                    details = await ib.reqContractDetailsAsync(contract)
                    if details:
                        if try_date != expiry:
                            print(f"    Date fuzzy match: {expiry} -> {try_date}")
                        break
        
        if details:
            full_contract = details[0].contract
            print(f"    SUCCESS: Found {full_contract.localSymbol} ({full_contract.secType} on {full_contract.exchange})")
            
            # Use localSymbol for FOPs or when we found it via details to be safe
            if full_contract.secType in ['FOP', 'OPT']:
                print(f"    Using explicit identification for order placement: {full_contract.localSymbol}")
                order_contract = Contract(
                    secType=full_contract.secType,
                    symbol=full_contract.symbol,
                    localSymbol=full_contract.localSymbol,
                    exchange=full_contract.exchange,
                    currency=full_contract.currency
                )
            else:
                order_contract = Contract(conId=full_contract.conId, exchange=full_contract.exchange)
            
            # Если задана LIMIT-цена — выставляем LMT, иначе оставляем MKT (TradingView-путь без price).
            if limit_price is not None:
                order = Order(
                    action=action,
                    totalQuantity=quantity,
                    orderType='LMT',
                    lmtPrice=limit_price,
                    tif='DAY',
                    transmit=False
                )
                print(f"    Placing staged LMT order @ {limit_price}...")
            else:
                order = Order(
                    action=action,
                    totalQuantity=quantity,
                    orderType='MKT',
                    tif='DAY',
                    transmit=False
                )
                print(f"    Placing staged MKT order...")
            trade = ib.placeOrder(order_contract, order)
            
            # Wait a bit for status to update
            await asyncio.sleep(0.5)
            
            return web.json_response({
                "status": "success", 
                "symbol": full_contract.localSymbol,
                "conId": full_contract.conId,
                "orderStatus": trade.orderStatus.status
            })
        else:
            print(f"!!! FAIL: Contract details not found for {contract}")
            return web.json_response({"status": "error", "error": "Contract details not found"}, status=404)
            
    except Exception as e:
        print(f"!!! ERROR handling /open: {e}")
        return web.json_response({"status": "error", "error": str(e)}, status=500)

async def handle_positions(request):
    try:
        positions = ib.positions()
        result = []
        for p in positions:
            c = p.contract
            if c.secType not in ('OPT', 'FOP', 'STK'):
                continue
            qty = float(p.position)
            if qty == 0:
                continue
            entry = {
                'symbol': c.symbol,
                'secType': c.secType,
                'quantity': abs(qty),
                'side': 'LONG' if qty > 0 else 'SHORT',
            }
            if c.secType in ('OPT', 'FOP'):
                entry['expiry'] = c.lastTradeDateOrContractMonth
                entry['strike'] = c.strike
                entry['right'] = c.right
            result.append(entry)
        return web.json_response(result)
    except Exception as e:
        print(f"!!! ERROR /positions: {e}")
        return web.json_response({"error": str(e)}, status=500)

async def handle_get_mapping(request):
    symbol = request.query.get('symbol')
    sec_type = request.query.get('type', 'STK')
    date = request.query.get('date')
    exchange = request.query.get('exchange', '')
    
    if not symbol or not date:
        return web.json_response({"error": "Missing symbol or date"}, status=400)
        
    try:
        mapping = await get_mapping_logic(symbol, sec_type, date, exchange)
        if mapping:
            return web.json_response(mapping)
        else:
            print(f"  [404] No mapping could be generated for {symbol} {date}")
            return web.json_response({"error": "No mapping found"}, status=404)
    except Exception as e:
        print(f"Error in /get_mapping: {e}")
        return web.json_response({"error": str(e)}, status=500)

async def handle_get_mode(request):
    return web.json_response({"mode": ACCOUNT_MODE})

async def handle_set_mode(request):
    global ACCOUNT_MODE
    mode = request.query.get('mode', 'demo')
    if mode not in ['demo', 'live']:
        return web.json_response({"error": "Invalid mode"}, status=400)
    
    ACCOUNT_MODE = mode
    port = 7496 if mode == 'live' else 7497
    
    # Reconnect with new port
    if ib.isConnected():
        ib.disconnect()
    
    config = load_config()
    client_id = random.randint(500, 999)
    ib_config = config.get('ib_connection', {'host': '127.0.0.1'})
    
    try:
        await ib.connectAsync(ib_config.get('host', '127.0.0.1'), port, client_id)
        if mode == 'live':
            print(f"⚠️  SWITCHED TO LIVE MODE - Port {port} - Real money account!")
        else:
            print(f"📝 SWITCHED TO DEMO MODE - Port {port} - Paper trading")
        return web.json_response({"status": "success", "mode": mode, "port": port})
    except Exception as e:
        print(f"Failed to reconnect: {e}")
        return web.json_response({"error": str(e)}, status=500)

# ─── Dynamic Mapping Logic ───
async def get_mapping_logic(symbol, sec_type, date, tv_exchange = ''):
    cache_key = (symbol, sec_type, date)
    if cache_key in CACHE:
        print(f"Cache HIT for {symbol} ({sec_type}) on {date}")
        return CACHE[cache_key]

    print(f"\n--- Mapping Request: {symbol} ({sec_type}) {date} (TV: {tv_exchange}) ---")
    
    # 0. Symbol Translation (TV to IBKR)
    SYMBOL_MAP = {
        '6E': 'EUR',
        '6B': 'GBP',
        '6A': 'AUD',
        '6C': 'CAD',
        '6J': 'JPY',
        '6M': 'MXN',
        '6S': 'CHF',
        '6N': 'NZD',
        'BTC': 'BTC', # BTC is often correct in IBKR for CME
        'ETH': 'ETH'
    }
    if symbol in SYMBOL_MAP:
        old_sym = symbol
        symbol = SYMBOL_MAP[symbol]
        print(f"  Translated symbol: {old_sym} -> {symbol}")

    # 1. Prepare search parameters
    opt_sec_type = 'FOP' if sec_type == 'FUT' else 'OPT'
    
    # Map common exchanges
    potential_exchanges = []
    if tv_exchange in ['CME', 'CME_MINI']:
        potential_exchanges = ['CME', 'GLOBEX']
    elif tv_exchange == 'CBOT':
        potential_exchanges = ['CBOT']
    elif tv_exchange == 'NYMEX':
        potential_exchanges = ['NYMEX']
    elif tv_exchange == 'COMEX':
        potential_exchanges = ['COMEX']
    else:
        potential_exchanges = [tv_exchange, 'SMART', '']

    # 2. Try Direct Fetch (much more robust for futures)
    target_date_int = int(date)
    for ex in potential_exchanges + ['']:
        try:
            print(f"  Attempting direct fetch on '{ex}'...")
            # We first try the exact date, then if it fails, we might need a broader search
            template = Contract(symbol=symbol, secType=opt_sec_type, lastTradeDateOrContractMonth=date, exchange=ex)
            details = await ib.reqContractDetailsAsync(template)
            
            if details:
                print(f"  SUCCESS: Found {len(details)} {opt_sec_type} contracts directly on '{ex}'")
                return build_mapping_from_details(details, cache_key)
        except Exception as e:
            pass

    print(f"  Direct fetch failed. Falling back to underlying qualification...")

    # 3. Fallback: Qualify Underlying -> Get Chain -> Select -> Fetch (Old Method)
    try:
        if sec_type == 'STK':
            contract = Stock(symbol, 'SMART', 'USD')
        elif sec_type == 'IND':
            contract = Index(symbol, '', 'USD')
        elif sec_type == 'FUT':
            contract = Future(symbol)
        else:
            return None

        # More aggressive qualification for futures/indices
        und_details = await ib.reqContractDetailsAsync(contract)
        
        # If bare symbol fails for FUT, try common exchanges explicitly
        if not und_details and sec_type == 'FUT':
            for ex_try in potential_exchanges + ['CME', 'GLOBEX', 'NYMEX', 'CBOT', 'ICE']:
                if not ex_try: continue
                print(f"    Trying underlying {symbol} on '{ex_try}'...")
                contract.exchange = ex_try
                und_details = await ib.reqContractDetailsAsync(contract)
                if und_details: break
        
        if not und_details:
            print(f"  No underlying found for {symbol} after aggressive search")
            return None
            
        # Check MORE underlying expiries (up to 15) to find far-out options
        for und_item in und_details[:15]:
            und = und_item.contract
            print(f"  Checking underlying: {und.localSymbol} ({und.conId})")
            
            chains = await ib.reqSecDefOptParamsAsync(und.symbol, und.exchange if sec_type == 'FUT' else '', und.secType, und.conId)
            if not chains: continue
            
            # Find a chain and look for the date (allowing fuzzy match for futures)
            for c in chains:
                # Fuzzy match: TradingView might say 20270317, IBKR might say 20270316
                matched_date = None
                if date in c.expirations:
                    matched_date = date
                else:
                    # Try fuzzy match (+/- 3 days) only for FUTURES
                    if sec_type == 'FUT':
                        for exp in c.expirations:
                            if abs(int(exp) - target_date_int) <= 3:
                                matched_date = exp
                                print(f"    Fuzzy match: TV date {date} -> IBKR date {exp}")
                                break
                
                if matched_date:
                    print(f"  Found chain on {c.exchange} with date {matched_date}")
                    search_template = Contract(
                        symbol=und.symbol, secType=opt_sec_type, 
                        lastTradeDateOrContractMonth=matched_date, exchange=c.exchange
                    )
                    opt_details = await ib.reqContractDetailsAsync(search_template)
                    if opt_details:
                        return build_mapping_from_details(opt_details, cache_key)
                    
    except Exception as e:
        print(f"  Fallback failed: {e}")

    return None

def build_mapping_from_details(details, cache_key):
    mapping = {}
    for d in details:
        c = d.contract
        strike = str(c.strike)
        if strike.endswith('.0'): strike = strike[:-2]
        right = c.right
        if strike not in mapping: mapping[strike] = {}
        mapping[strike][right] = c.conId
    
    CACHE[cache_key] = mapping
    print(f"  Cached {len(mapping)} strikes for {cache_key}")
    return mapping

# ─── App Setup ───
async def init_app():
    app = web.Application(middlewares=[cors_middleware])
    app.router.add_get('/ping', handle_ping)
    app.router.add_get('/open', handle_open)
    app.router.add_get('/get_mapping', handle_get_mapping)
    app.router.add_get('/get_mode', handle_get_mode)
    app.router.add_get('/set_mode', handle_set_mode)
    app.router.add_get('/positions', handle_positions)
    return app

async def main():
    global ACCOUNT_MODE
    config = load_config()
    client_id = random.randint(500, 999)
    ib_config = config.get('ib_connection', {'host': '127.0.0.1'})
    
    # Determine port based on account mode (default to demo)
    port = 7497 if ACCOUNT_MODE == 'demo' else 7496
    
    # 1. Start Web Server IMMEDIATELY
    app = await init_app()
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, 'localhost', 5001).start()
    print("Bridge Server running on http://localhost:5001")
    
    if ACCOUNT_MODE == 'live':
        print(f"⚠️  LIVE MODE - Port {port} - Real money account!")
    else:
        print(f"📝 DEMO MODE - Port {port} - Paper trading")
    
    print(f"Connecting to IBKR {ib_config.get('host', '127.0.0.1')}:{port} (ClientId: {client_id})...")

    # 2. Connection Loop Task
    async def connection_loop():
        while True:
            try:
                if not ib.isConnected():
                    # Use current ACCOUNT_MODE to determine port
                    current_port = 7496 if ACCOUNT_MODE == 'live' else 7497
                    await ib.connectAsync(ib_config.get('host', '127.0.0.1'), current_port, client_id)
                    print("Connected to IBKR!")
            except Exception as e:
                # Silently retry if connection refused, logger already handles the repeating messages
                pass
            await asyncio.sleep(5)

    # 3. Keep app alive
    await connection_loop()
    
    while True:
        await asyncio.sleep(1)

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
