"""
Test ТОЛЬКО IB Client Portal Gateway
Проверяем данные ТОЛЬКО от IB, без HybridClient/Yahoo/Polygon
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.services.ib_client import IBClient

def main():
    print("="*80)
    print("🧪 TEST IB CLIENT PORTAL GATEWAY - ТОЛЬКО IB ДАННЫЕ")
    print("="*80)
    print()
    
    client = IBClient()
    
    # Test 1: Auth Status
    print("1️⃣ Auth Status...")
    auth = client.get_auth_status()
    print(f"   authenticated: {auth.get('authenticated', False)}")
    print(f"   connected: {auth.get('connected', False)}")
    print()
    
    if not auth.get('authenticated'):
        print("❌ NOT AUTHENTICATED! Gateway не авторизован.")
        return
    
    # Test 2: Search Contract (SPY)
    print("2️⃣ Search Contract (SPY)...")
    conid = client.search_contract("SPY")
    print(f"   conid: {conid}")
    print()
    
    if not conid:
        print("❌ Contract не найден!")
        return
    
    # Test 3: Stock Price
    print("3️⃣ Stock Price (SPY)...")
    try:
        price_data = client.get_stock_price("SPY")
        print(f"   ✅ ticker: {price_data['ticker']}")
        print(f"   ✅ price: ${price_data['price']}")
        print(f"   ✅ bid: ${price_data['bid']}")
        print(f"   ✅ ask: ${price_data['ask']}")
        print(f"   ✅ volume: {price_data['volume']}")
        print(f"   ✅ high: ${price_data['high']}")
        print(f"   ✅ low: ${price_data['low']}")
        print(f"   ✅ previous_close: ${price_data['previous_close']}")
        print()
        
        # Проверим что все поля присутствуют
        required_fields = ['ticker', 'price', 'bid', 'ask', 'volume', 'high', 'low', 'previous_close']
        missing = [f for f in required_fields if f not in price_data]
        if missing:
            print(f"   ⚠️ Отсутствующие поля: {missing}")
        else:
            print(f"   ✅ Все требуемые поля присутствуют!")
        print()
    except Exception as e:
        print(f"   ❌ Error: {e}")
        print()
    
    # Test 4: Expiration Dates
    print("4️⃣ Expiration Dates (SPY)...")
    try:
        expirations = client.get_expiration_dates("SPY")
        print(f"   ✅ Найдено дат экспирации: {len(expirations)}")
        if expirations:
            print(f"   Первые 5 дат: {expirations[:5]}")
        print()
    except Exception as e:
        print(f"   ❌ Error: {e}")
        print()
    
    # Test 5: Options Chain (первая дата)
    print("5️⃣ Options Chain (SPY - первая дата)...")
    try:
        if expirations and len(expirations) > 0:
            exp_date = expirations[0]
            print(f"   Дата экспирации: {exp_date}")
            options = client.get_options_chain("SPY", exp_date)
            print(f"   ✅ Найдено опционов: {len(options)}")
            
            if options and len(options) > 0:
                opt = options[0]
                print(f"   Пример опциона:")
                print(f"     strike: {opt.get('strike', 'N/A')}")
                print(f"     type: {opt.get('type', 'N/A')}")
                print(f"     bid: ${opt.get('bid', 'N/A')}")
                print(f"     ask: ${opt.get('ask', 'N/A')}")
                print(f"     last: ${opt.get('last', 'N/A')}")
                print(f"     volume: {opt.get('volume', 'N/A')}")
                print(f"     iv: {opt.get('iv', 'N/A')}")
                print(f"     delta: {opt.get('delta', 'N/A')}")
                print(f"     gamma: {opt.get('gamma', 'N/A')}")
                print(f"     theta: {opt.get('theta', 'N/A')}")
                print(f"     vega: {opt.get('vega', 'N/A')}")
        else:
            print(f"   ⚠️ Нет дат экспирации для теста")
        print()
    except Exception as e:
        print(f"   ❌ Error: {e}")
        print()
    
    print("="*80)
    print("✅ TEST COMPLETE")
    print("="*80)

if __name__ == "__main__":
    main()
