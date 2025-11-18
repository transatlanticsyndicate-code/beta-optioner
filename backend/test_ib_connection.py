"""
Быстрый тест подключения к IB Client Portal Gateway
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.services.ib_client import IBClient

def main():
    print("="*80)
    print("🧪 TEST IB CLIENT PORTAL GATEWAY CONNECTION")
    print("="*80)
    print()
    
    client = IBClient()
    
    # Test 1: Auth Status
    print("1️⃣ Testing auth status...")
    auth_status = client.get_auth_status()
    print(f"   Result: {auth_status}")
    print()
    
    # Test 2: Search Contract
    print("2️⃣ Testing contract search (SPY)...")
    conid = client.search_contract("SPY")
    print(f"   SPY conid: {conid}")
    print()
    
    # Test 3: Stock Price
    print("3️⃣ Testing stock price (SPY)...")
    try:
        price_data = client.get_stock_price("SPY")
        print(f"   ✅ Price: ${price_data['price']}")
        print(f"   ✅ Bid: ${price_data['bid']}")
        print(f"   ✅ Ask: ${price_data['ask']}")
        print(f"   ✅ Volume: {price_data['volume']}")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    print()
    
    # Test 4: Expiration Dates
    print("4️⃣ Testing expiration dates (SPY)...")
    try:
        expirations = client.get_expiration_dates("SPY")
        print(f"   ✅ Found {len(expirations)} expiration dates")
        if expirations:
            print(f"   First 3: {expirations[:3]}")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    print()
    
    print("="*80)
    print("✅ TEST COMPLETE")
    print("="*80)

if __name__ == "__main__":
    main()
