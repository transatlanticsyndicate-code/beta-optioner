import sys
sys.path.insert(0, 'backend')

from app.services.ib_client import IBClient

client = IBClient()

print("Testing search_contract...")
conid = client.search_contract("MSTR")
print(f"Result: {conid}")
print(f"Type: {type(conid)}")

if conid:
    print(f"\n✅ Found conid: {conid}")
else:
    print(f"\n❌ No conid found")
