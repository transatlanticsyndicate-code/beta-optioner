import sys
sys.path.insert(0, 'backend')

from app.services.ib_client import IBClient

client = IBClient()

print("Testing get_stock_price for MSTR...")
try:
    result = client.get_stock_price("MSTR")
    print(f"✅ Success: {result}")
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
