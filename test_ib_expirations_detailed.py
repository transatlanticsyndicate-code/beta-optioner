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

# 2. Попробовать получить детальные экспирации через /secdef/info
print(f"\n2. Getting detailed contract info...")
r = session.get(
    f"{base_url}/v1/api/iserver/secdef/info",
    params={
        "conid": conid,
        "sectype": "OPT",
        "month": "NOV25",
        "exchange": "SMART"
    }
)
print(f"Status: {r.status_code}")
print(f"Response: {r.json()}")

# 3. Попробовать получить strikes для NOV25 (может там будут даты?)
print(f"\n3. Getting strikes for NOV25...")
r = session.get(
    f"{base_url}/v1/api/iserver/secdef/strikes",
    params={
        "conid": conid,
        "sectype": "OPT",
        "month": "NOV25",
        "exchange": "SMART"
    }
)
print(f"Status: {r.status_code}")
strikes_data = r.json()
print(f"Keys: {strikes_data.keys()}")
if 'expirations' in strikes_data:
    print(f"Expirations: {strikes_data['expirations']}")

# 4. Попробовать получить futures через другой endpoint
print(f"\n4. Trying /trsrv/secdef endpoint...")
r = session.post(
    f"{base_url}/v1/api/trsrv/secdef",
    json={
        "conid": conid,
        "sectype": "OPT"
    }
)
print(f"Status: {r.status_code}")
if r.status_code == 200:
    print(f"Response: {r.json()}")
