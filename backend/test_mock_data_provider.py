#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Тест MockDataProvider - проверка работы с mock данными
"""

import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app'))

from services.mock_data_provider import MockDataProvider

def main():
    print("="*80)
    print("🧪 ТЕСТ MOCK DATA PROVIDER")
    print("="*80)
    
    # Инициализация
    print("\n1️⃣ Инициализация MockDataProvider...")
    provider = MockDataProvider()
    print(f"   ✅ Директория mock данных: {provider.mock_data_dir}")
    
    # Тест авторизации
    print("\n2️⃣ Проверка статуса авторизации...")
    auth = provider.get_auth_status()
    print(f"   authenticated: {auth.get('authenticated')}")
    print(f"   connected: {auth.get('connected')}")
    print(f"   mode: {auth.get('mode')}")
    
    # Тест Stock Price - SPY
    print("\n3️⃣ Загрузка stock price (SPY)...")
    try:
        spy_price = provider.get_stock_price("SPY")
        print(f"   ✅ ticker: {spy_price.get('ticker')}")
        print(f"   ✅ price: ${spy_price.get('price'):.2f}")
        print(f"   ✅ bid: ${spy_price.get('bid'):.2f}")
        print(f"   ✅ ask: ${spy_price.get('ask'):.2f}")
        print(f"   ✅ volume: {spy_price.get('volume'):,}")
        print(f"   ✅ change: ${spy_price.get('change'):.2f} ({spy_price.get('change_percent'):.2f}%)")
    except Exception as e:
        print(f"   ❌ Ошибка: {e}")
    
    # Тест Stock Price - AAPL
    print("\n4️⃣ Загрузка stock price (AAPL)...")
    try:
        aapl_price = provider.get_stock_price("AAPL")
        print(f"   ✅ ticker: {aapl_price.get('ticker')}")
        print(f"   ✅ price: ${aapl_price.get('price'):.2f}")
        print(f"   ✅ change: ${aapl_price.get('change'):.2f} ({aapl_price.get('change_percent'):.2f}%)")
    except Exception as e:
        print(f"   ❌ Ошибка: {e}")
    
    # Тест Expiration Dates
    print("\n5️⃣ Загрузка дат экспирации (SPY)...")
    try:
        expirations = provider.get_expiration_dates("SPY")
        print(f"   ✅ Найдено дат: {len(expirations)}")
        print(f"   Даты: {expirations}")
    except Exception as e:
        print(f"   ❌ Ошибка: {e}")
    
    # Тест Options Chain
    print("\n6️⃣ Загрузка options chain (SPY NOV25)...")
    try:
        options = provider.get_options_chain("SPY", "NOV25")
        print(f"   ✅ Найдено опционов: {len(options)}")
        
        if options:
            # Показываем первый CALL и первый PUT
            calls = [o for o in options if o['type'] == 'CALL']
            puts = [o for o in options if o['type'] == 'PUT']
            
            if calls:
                call = calls[0]
                print(f"\n   Пример CALL:")
                print(f"      strike: ${call.get('strike'):.2f}")
                print(f"      bid: ${call.get('bid'):.2f}")
                print(f"      ask: ${call.get('ask'):.2f}")
                print(f"      iv: {call.get('iv'):.3f}")
                print(f"      delta: {call.get('delta'):.3f}")
                print(f"      volume: {call.get('volume'):,}")
                print(f"      open_interest: {call.get('open_interest'):,}")
            
            if puts:
                put = puts[0]
                print(f"\n   Пример PUT:")
                print(f"      strike: ${put.get('strike'):.2f}")
                print(f"      bid: ${put.get('bid'):.2f}")
                print(f"      ask: ${put.get('ask'):.2f}")
                print(f"      iv: {put.get('iv'):.3f}")
                print(f"      delta: {put.get('delta'):.3f}")
    except Exception as e:
        print(f"   ❌ Ошибка: {e}")
    
    # Тест Metrics
    print("\n7️⃣ Загрузка метрик (SPY)...")
    try:
        metrics = provider.get_metrics("SPY")
        print(f"   ✅ iv_rank: {metrics.get('iv_rank')}")
        print(f"   ✅ iv_percentile: {metrics.get('iv_percentile')}")
        print(f"   ✅ put_call_ratio: {metrics.get('put_call_ratio'):.2f}")
        print(f"   ✅ skew: {metrics.get('skew'):.2f}")
        print(f"   ✅ atm_iv: {metrics.get('atm_iv'):.3f}")
        print(f"   ✅ implied_move: {metrics.get('implied_move'):.2f}%")
    except Exception as e:
        print(f"   ❌ Ошибка: {e}")
    
    # Тест Analyzer Data
    print("\n8️⃣ Загрузка analyzer data (AAPL)...")
    try:
        analyzer_data = provider.get_analyzer_data("AAPL")
        print(f"   ✅ ticker: {analyzer_data.get('ticker')}")
        print(f"   ✅ recommendation: {analyzer_data.get('step3_recommendation')}")
        print(f"   ✅ AI analysis preview: {analyzer_data.get('step4_ai_analysis')[:100]}...")
    except Exception as e:
        print(f"   ❌ Ошибка: {e}")
    
    # Тест Contract Search
    print("\n9️⃣ Поиск контракта (SPY)...")
    try:
        conid = provider.search_contract("SPY")
        print(f"   ✅ Mock conid: {conid}")
    except Exception as e:
        print(f"   ❌ Ошибка: {e}")
    
    print("\n" + "="*80)
    print("✅ ТЕСТ ЗАВЕРШЕН")
    print("="*80)

if __name__ == "__main__":
    main()
