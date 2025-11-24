from fastapi.testclient import TestClient
from app.main import app
import sys
import os

# Add project root to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

client = TestClient(app)

print("\n--- Testing Stock Endpoint (SPY) ---")
response = client.get("/api/polygon/ticker/SPY?type=STOCK")
print(f"Status: {response.status_code}")
print(f"Response: {response.json()}")

print("\n--- Testing Future Endpoint (ESZ4) ---")
response = client.get("/api/polygon/ticker/ESZ4?type=FUTURE")
print(f"Status: {response.status_code}")
print(f"Response: {response.json()}")

print("\n--- Testing Expirations (ESZ4) ---")
response = client.get("/api/polygon/ticker/ESZ4/expirations?type=FUTURE")
print(f"Status: {response.status_code}")
data = response.json()
if 'dates' in data:
    print(f"Dates found: {len(data['dates'])}")
    print(f"Sample: {data['dates'][:3]}")
else:
    print(f"Response: {data}")
