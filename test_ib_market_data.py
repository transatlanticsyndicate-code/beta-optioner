import requests
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

base_url = "https://localhost:5000"
session = requests.Session()
session.verify = False

# 1. Найти conid для SPY
print("1. Searching for SPY...")
r = session.get(f"{base_url}/v1/api/iserver/secdef/search", params={"symbol": "SPY"})
data = r.json()
conid = data[0]['conid']
print(f"Found conid: {conid}")

# 2. Получить market data snapshot
print(f"\n2. Getting market data for conid {conid}...")
r = session.get(
    f"{base_url}/v1/api/iserver/marketdata/snapshot",
    params={"conids": conid, "fields": "31,84,86,87,88,82,83,7295"}
)
print(f"Status: {r.status_code}")
print(f"Response: {r.json()}")

# 3. Попробовать без полей
print(f"\n3. Getting market data without fields...")
r = session.get(
    f"{base_url}/v1/api/iserver/marketdata/snapshot",
    params={"conids": conid}
)
print(f"Status: {r.status_code}")
print(f"Response: {r.json()}")
