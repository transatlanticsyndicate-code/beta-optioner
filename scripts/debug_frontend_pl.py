import math
from datetime import datetime

# Black-76
def normal_cdf(x):
    return (1.0 + math.erf(x / math.sqrt(2.0))) / 2.0

def black76_price(F, K, T, r, sigma, option_type):
    if T <= 0: return max(0, F - K) if option_type == 'call' else max(0, K - F)
    
    d1 = (math.log(F / K) + (0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)
    discount = math.exp(-r * T)
    
    if option_type == 'call':
        return discount * (F * normal_cdf(d1) - K * normal_cdf(d2))
    else:
        return discount * (K * normal_cdf(-d2) - F * normal_cdf(-d1))

def bsm_price(S, K, T, r, sigma, option_type):
    if T <= 0: return max(0, S - K) if option_type == 'call' else max(0, K - S)
    
    d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)
    
    if option_type == 'call':
        return S * normal_cdf(d1) - K * math.exp(-r * T) * normal_cdf(d2)
    else:
        return K * math.exp(-r * T) * normal_cdf(-d2) - S * normal_cdf(-d1)

def implied_volatility(price, F, K, T, r, option_type):
    low = 0.001
    high = 5.0
    for i in range(100):
        mid = (low + high) / 2
        p = black76_price(F, K, T, r, mid, option_type)
        if abs(p - price) < 0.0001:
            return mid
        if p < price:
            low = mid
        else:
            high = mid
    return (low + high) / 2

# Deals from CSV
deals = [
    {
        "ticker": "NGQ2026",
        "entry_date": "2026-01-30",
        "exit_date": "2026-02-05",
        "expiry_date": "2026-07-28",
        "entry_price": 4.37,
        "exit_price": 3.79,
        "strike": 4.0,
        "option_price": 0.78,
        "type": "call",
        "multiplier": 10000,
        "forecast_pl": -1469
    },
    {
        "ticker": "HGN2026",
        "entry_date": "2026-01-28",
        "exit_date": "2026-02-05",
        "expiry_date": "2026-05-06",
        "entry_price": 6.03,
        "exit_price": 5.9,
        "strike": 7.0,
        "option_price": 0.15,
        "type": "call",
        "multiplier": 25000,
        "forecast_pl": -1330
    }
]

RISK_FREE_RATE = 0.05 # Assuming default 5%

def days_between(d1, d2):
    date_format = "%Y-%m-%d"
    a = datetime.strptime(d1, date_format)
    b = datetime.strptime(d2, date_format)
    return (b - a).days

print("=== CHECKING FRONTEND CALCULATIONS ===")

for deal in deals:
    print(f"\nTicker: {deal['ticker']}")
    
    # Time to Expiry at Entry
    days_total = days_between(deal['entry_date'], deal['expiry_date'])
    T_entry = days_total / 365.0
    
    # 1. Back out IV from Entry Price
    iv = implied_volatility(deal['option_price'], deal['entry_price'], deal['strike'], T_entry, RISK_FREE_RATE, deal['type'])
    print(f"  Entry IV: {iv:.2%}")
    
    # 2. Calculate Forecast Price at Exit (keeping IV constant)
    days_held = days_between(deal['entry_date'], deal['exit_date'])
    days_remaining = days_total - days_held
    T_exit = days_remaining / 365.0
    
    forecast_price = black76_price(deal['exit_price'], deal['strike'], T_exit, RISK_FREE_RATE, iv, deal['type'])
    
    # 3. Calculate P&L
    pl_per_unit = forecast_price - deal['option_price']
    calc_pl = pl_per_unit * deal['multiplier']
    
    print(f"  Forecast Exit Price (Const IV): {forecast_price:.4f}")
    print(f"  Calculated P&L (Black-76): {calc_pl:.2f}")
    
    # 4. Check BSM
    bsm_p = bsm_price(deal['exit_price'], deal['strike'], T_exit, RISK_FREE_RATE, iv, deal['type'])
    bsm_pl = (bsm_p - deal['option_price']) * deal['multiplier']
    print(f"  Calculated P&L (BSM): {bsm_pl:.2f}")
    
    print(f"  CSV Forecast P&L: {deal['forecast_pl']}")
    print(f"  Difference (Black-76): {calc_pl - deal['forecast_pl']:.2f}")
    
    # 5. Reverse engineer IV required for CSV Forecast
    # ForecastPL = (ExitP - EntryP) * M
    # ExitP = ForecastPL/M + EntryP
    target_exit_price = (deal['forecast_pl'] / deal['multiplier']) + deal['option_price']
    if target_exit_price > 0:
        target_iv = implied_volatility(target_exit_price, deal['exit_price'], deal['strike'], T_exit, RISK_FREE_RATE, deal['type'])
        print(f"  IV needed for CSV Forecast: {target_iv:.2%}")

