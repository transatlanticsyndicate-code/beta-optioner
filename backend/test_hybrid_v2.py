from app.services.hybrid_client import HybridClient
import sys
import os

# Add project root to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

print("Initializing HybridClient...")
try:
    client = HybridClient()
    print("✅ HybridClient initialized")
except Exception as e:
    print(f"❌ Failed to initialize HybridClient: {e}")
    sys.exit(1)

print("\n--- Testing Stock (SPY) ---")
try:
    spy = client.get_stock_price("SPY", instrument_type="STOCK")
    print(f"SPY Price: {spy}")
except Exception as e:
    print(f"❌ SPY Error: {e}")

print("\n--- Testing Future (ESZ4) ---")
try:
    es = client.get_stock_price("ESZ4", instrument_type="FUTURE")
    print(f"ESZ4 Price: {es}")
except Exception as e:
    print(f"❌ ESZ4 Error: {e}")
