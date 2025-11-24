import requests
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

base_url = "https://localhost:5000"

print("1. Checking auth status...")
try:
    r = requests.get(f"{base_url}/v1/api/iserver/auth/status", verify=False, timeout=5)
    print(f"Status: {r.status_code}")
    print(f"Response: {r.json()}")
except Exception as e:
    print(f"Error: {e}")

print("\n2. Searching for SPY contract...")
try:
    r = requests.get(f"{base_url}/v1/api/iserver/secdef/search", params={"symbol": "SPY"}, verify=False, timeout=5)
    print(f"Status: {r.status_code}")
    print(f"Response: {r.json()}")
except Exception as e:
    print(f"Error: {e}")

print("\n3. Searching for MSTR contract...")
try:
    r = requests.get(f"{base_url}/v1/api/iserver/secdef/search", params={"symbol": "MSTR"}, verify=False, timeout=5)
    print(f"Status: {r.status_code}")
    print(f"Response: {r.json()}")
except Exception as e:
    print(f"Error: {e}")
