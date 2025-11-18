#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Тест различных типов активов через IB Client Portal Gateway
- Stocks (SPY - уже протестировано)
- Futures (ES, NQ)
- Indices (SPX, NDX)
- Forex (EUR.USD, GBP.USD)
"""

import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app'))

from services.ib_client import IBClient

def test_asset(client, symbol, asset_type, description):
    """Тест конкретного актива"""
    print(f"\n{'='*80}")
    print(f"🧪 ТЕСТ: {asset_type.upper()} - {description}")
    print(f"   Символ: {symbol}")
    print(f"{'='*80}\n")
    
    try:
        # 1. Поиск контракта
        print(f"1️⃣ Поиск контракта...")
        conid = client.search_contract(symbol)
        if conid:
            print(f"   ✅ conid: {conid}")
        else:
            print(f"   ❌ Контракт не найден")
            return
        
        # 2. Получение цены
        print(f"\n2️⃣ Получение цены...")
        try:
            price_data = client.get_stock_price(symbol)
            print(f"   ✅ Данные получены:")
            print(f"      ticker: {price_data.get('ticker')}")
            print(f"      price: ${price_data.get('price', 0):.2f}")
            print(f"      bid: ${price_data.get('bid', 0):.2f}")
            print(f"      ask: ${price_data.get('ask', 0):.2f}")
            print(f"      high: ${price_data.get('high', 0):.2f}")
            print(f"      low: ${price_data.get('low', 0):.2f}")
            print(f"      volume: {price_data.get('volume', 0):,}")
            print(f"      previous_close: ${price_data.get('previous_close', 0):.2f}")
            print(f"      change: ${price_data.get('change', 0):.2f}")
            print(f"      change_percent: {price_data.get('change_percent', 0):.2f}%")
        except Exception as e:
            print(f"   ❌ Ошибка получения цены: {e}")
        
    except Exception as e:
        print(f"   ❌ Общая ошибка: {e}")

def main():
    print("="*80)
    print("🧪 ТЕСТ РАЗЛИЧНЫХ ТИПОВ АКТИВОВ - IB CLIENT PORTAL GATEWAY")
    print("="*80)
    
    # Инициализация клиента
    client = IBClient()
    
    # Проверка авторизации
    print("\n0️⃣ Проверка авторизации...")
    try:
        auth = client.get_auth_status()
        print(f"   authenticated: {auth.get('authenticated')}")
        print(f"   connected: {auth.get('connected')}")
        if not auth.get('authenticated'):
            print("   ❌ Не авторизован! Проверьте Gateway.")
            return
    except Exception as e:
        print(f"   ❌ Ошибка авторизации: {e}")
        return
    
    # Тесты различных типов активов
    
    # 1. STOCKS (для сравнения)
    test_asset(client, "AAPL", "stock", "Apple Inc.")
    
    # 2. FUTURES - E-mini S&P 500
    # Формат для фьючерсов может быть: ES, ESZ4, ESZ2024 (зависит от месяца/года экспирации)
    test_asset(client, "ES", "futures", "E-mini S&P 500 Futures")
    test_asset(client, "ESZ4", "futures", "E-mini S&P 500 Dec 2024")
    test_asset(client, "ESZ2024", "futures", "E-mini S&P 500 Dec 2024 (full)")
    
    # 3. FUTURES - E-mini NASDAQ
    test_asset(client, "NQ", "futures", "E-mini NASDAQ-100 Futures")
    test_asset(client, "NQZ4", "futures", "E-mini NASDAQ-100 Dec 2024")
    
    # 4. INDICES - S&P 500
    test_asset(client, "SPX", "index", "S&P 500 Index")
    test_asset(client, "INX", "index", "S&P 500 Index (alternative)")
    
    # 5. INDICES - NASDAQ
    test_asset(client, "NDX", "index", "NASDAQ-100 Index")
    test_asset(client, "COMP", "index", "NASDAQ Composite")
    
    # 6. FOREX - EUR/USD
    test_asset(client, "EUR.USD", "forex", "Euro / US Dollar")
    test_asset(client, "EURUSD", "forex", "Euro / US Dollar (alternative)")
    
    # 7. FOREX - GBP/USD
    test_asset(client, "GBP.USD", "forex", "British Pound / US Dollar")
    test_asset(client, "GBPUSD", "forex", "British Pound / US Dollar (alternative)")
    
    # 8. FOREX - USD/JPY
    test_asset(client, "USD.JPY", "forex", "US Dollar / Japanese Yen")
    test_asset(client, "USDJPY", "forex", "US Dollar / Japanese Yen (alternative)")
    
    print("\n" + "="*80)
    print("✅ ТЕСТЫ ЗАВЕРШЕНЫ")
    print("="*80)

if __name__ == "__main__":
    main()
