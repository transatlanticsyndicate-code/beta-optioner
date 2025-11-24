import requests
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

base_url = "https://localhost:5000"
session = requests.Session()
session.verify = False

# 1. Найти conid для AAPL
print("1. Searching for AAPL...")
r = session.get(f"{base_url}/v1/api/iserver/secdef/search", params={"symbol": "AAPL"})
data = r.json()
conid = data[0]['conid']
print(f"Found conid: {conid}")

# 2. Получить strikes для NOV25
print(f"\n2. Getting strikes for NOV25...")
r = session.get(
    f"{base_url}/v1/api/iserver/secdef/strikes",
    params={
        "conid": conid,
        "sectype": "OPT",
        "month": "NOV25",
        "exchange": "SMART"
    }
)
strikes_data = r.json()
call_strikes = strikes_data.get('call', [])
print(f"Sample call strikes: {call_strikes[:5]}")

# 3. Получить информацию о конкретном опционе (ATM страйк)
if call_strikes:
    strike = call_strikes[len(call_strikes)//2]  # Средний страйк
    print(f"\n3. Getting option info for strike {strike}...")
    r = session.get(
        f"{base_url}/v1/api/iserver/secdef/info",
        params={
            "conid": conid,
            "sectype": "OPT",
            "month": "NOV25",
            "strike": strike,
            "right": "C",
            "exchange": "SMART"
        }
    )
    print(f"Status: {r.status_code}")
    if r.status_code == 200:
        opt_data = r.json()
        print(f"Number of contracts: {len(opt_data)}")
        for i, contract in enumerate(opt_data[:5]):  # Первые 5
            print(f"\nContract {i+1}:")
            print(f"  conid: {contract.get('conid')}")
            print(f"  symbol: {contract.get('symbol')}")
            print(f"  maturityDate: {contract.get('maturityDate')}")
            print(f"  lastTradingDay: {contract.get('lastTradingDay')}")
            print(f"  expirationDate: {contract.get('expirationDate')}")
