#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Утилита для создания mock данных для нового тикера
Использование: python3 create_mock_data.py MSTR
"""

import sys
import os
import json
from datetime import datetime, timedelta

def create_stock_mock(ticker: str, price: float = 100.0):
    """Создать mock данные для stock price"""
    return {
        "ticker": ticker,
        "price": price,
        "bid": price - 0.05,
        "ask": price + 0.05,
        "high": price + 2.0,
        "low": price - 2.0,
        "volume": 1000000,
        "previous_close": price - 1.0,
        "open": price - 0.5,
        "change": 1.0,
        "change_percent": 1.0,
        "market_cap": None,
        "pe_ratio": None,
        "dividend_yield": None,
        "_source": "Mock template",
        "_captured_at": datetime.now().isoformat() + "Z",
        "_notes": f"Template mock data for {ticker}. Please update with real values."
    }

def create_options_chain_mock(ticker: str, underlying_price: float = 100.0, expiration: str = "DEC25"):
    """Создать mock данные для options chain"""
    exp_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
    
    # Создаем ATM страйки
    strikes = [
        underlying_price - 5,
        underlying_price - 2.5,
        underlying_price,
        underlying_price + 2.5,
        underlying_price + 5
    ]
    
    options = []
    conid_base = abs(hash(ticker)) % 900000 + 100000
    
    for i, strike in enumerate(strikes):
        # CALL
        options.append({
            "strike": strike,
            "type": "CALL",
            "conid": conid_base + i,
            "bid": max(0.1, underlying_price - strike + 2.0),
            "ask": max(0.2, underlying_price - strike + 2.2),
            "last": max(0.15, underlying_price - strike + 2.1),
            "volume": 500,
            "open_interest": 2000,
            "iv": 0.25,
            "delta": 0.5,
            "gamma": 0.05,
            "theta": -0.15,
            "vega": 0.12,
            "rho": 0.05
        })
        
        # PUT
        options.append({
            "strike": strike,
            "type": "PUT",
            "conid": conid_base + 100 + i,
            "bid": max(0.1, strike - underlying_price + 2.0),
            "ask": max(0.2, strike - underlying_price + 2.2),
            "last": max(0.15, strike - underlying_price + 2.1),
            "volume": 450,
            "open_interest": 1800,
            "iv": 0.26,
            "delta": -0.5,
            "gamma": 0.05,
            "theta": -0.14,
            "vega": 0.12,
            "rho": -0.05
        })
    
    return {
        "ticker": ticker,
        "expiration": expiration,
        "expiration_date": exp_date,
        "underlying_price": underlying_price,
        "options": options,
        "_source": "Mock template",
        "_captured_at": datetime.now().isoformat() + "Z",
        "_notes": f"Template mock data for {ticker} options. Please update with real values."
    }

def create_analyzer_mock(ticker: str, price: float = 100.0):
    """Создать mock данные для analyzer"""
    return {
        "ticker": ticker,
        "step1_stock_price": create_stock_mock(ticker, price),
        "step2_metrics": {
            "iv_rank": 50,
            "iv_percentile": 55,
            "put_call_ratio": 0.95,
            "skew": -0.10,
            "atm_iv": 0.25,
            "implied_move": 5.0,
            "vix_level": 18.0
        },
        "step3_recommendation": "NEUTRAL",
        "step4_ai_analysis": f"Автоматически сгенерированный анализ для {ticker}. Требуется обновление с реальными данными.",
        "_source": "Mock template",
        "_captured_at": datetime.now().isoformat() + "Z",
        "_notes": f"Template mock data for {ticker} analyzer. Please update with real values."
    }

def main():
    if len(sys.argv) < 2:
        print("❌ Использование: python3 create_mock_data.py TICKER [PRICE]")
        print("   Пример: python3 create_mock_data.py MSTR 350")
        sys.exit(1)
    
    ticker = sys.argv[1].upper()
    price = float(sys.argv[2]) if len(sys.argv) > 2 else 100.0
    
    base_dir = os.path.dirname(__file__)
    mock_data_dir = os.path.join(base_dir, 'mock_data')
    
    print(f"\n🚀 Создаем mock данные для {ticker} (цена: ${price:.2f})...\n")
    
    # Stock price
    stock_file = os.path.join(mock_data_dir, 'stocks', f'{ticker}.json')
    os.makedirs(os.path.dirname(stock_file), exist_ok=True)
    with open(stock_file, 'w', encoding='utf-8') as f:
        json.dump(create_stock_mock(ticker, price), f, indent=2, ensure_ascii=False)
    print(f"✅ Создан: {stock_file}")
    
    # Options chain
    options_file = os.path.join(mock_data_dir, 'options_chains', f'{ticker}_DEC25.json')
    os.makedirs(os.path.dirname(options_file), exist_ok=True)
    with open(options_file, 'w', encoding='utf-8') as f:
        json.dump(create_options_chain_mock(ticker, price), f, indent=2, ensure_ascii=False)
    print(f"✅ Создан: {options_file}")
    
    # Analyzer
    analyzer_file = os.path.join(mock_data_dir, 'analyzers', f'{ticker}.json')
    os.makedirs(os.path.dirname(analyzer_file), exist_ok=True)
    with open(analyzer_file, 'w', encoding='utf-8') as f:
        json.dump(create_analyzer_mock(ticker, price), f, indent=2, ensure_ascii=False)
    print(f"✅ Создан: {analyzer_file}")
    
    print(f"\n🎉 Mock данные для {ticker} успешно созданы!")
    print(f"\n💡 Следующие шаги:")
    print(f"   1. Проверьте созданные файлы и обновите значения при необходимости")
    print(f"   2. Теперь можно использовать {ticker} в локальной разработке")
    print(f"   3. Запустите тест: python3 test_mock_data_provider.py\n")

if __name__ == "__main__":
    main()
