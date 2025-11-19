#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Простой тест подключения к TWS через SSH туннель (Андрей, clientId=102)

Использование:
1. Открыть SSH туннель: ./connect_to_prod_tws_andrey.sh
2. Запустить этот скрипт: python test_tws_connection_andrey.py
"""

from ib_insync import IB, Stock
import os
from datetime import datetime

# Цвета для вывода
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
RESET = "\033[0m"


def print_section(title):
    print(f"\n{BLUE}{'=' * 80}{RESET}")
    print(f"{BLUE}{title.center(80)}{RESET}")
    print(f"{BLUE}{'=' * 80}{RESET}\n")


def test_connection():
    """Тест 1: Проверка подключения"""
    print_section("ТЕСТ 1: Подключение к TWS")
    
    ib = IB()
    
    try:
        print("Подключаюсь к TWS...")
        ib.connect('127.0.0.1', 4002, clientId=102, timeout=10)
        
        print(f"{GREEN}✓ Успешно подключен!{RESET}")
        print(f"  Host: 127.0.0.1:4002")
        print(f"  Client ID: {ib.client.clientId}")
        print(f"  Время: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        return ib, True
        
    except Exception as e:
        print(f"{RED}✗ Ошибка подключения: {e}{RESET}")
        print(f"\n{YELLOW}Проверь:{RESET}")
        print("  1. SSH туннель открыт? (lsof -i :4002)")
        print("  2. TWS запущен на проде?")
        return None, False


def test_market_data(ib):
    """Тест 2: Получение рыночных данных"""
    print_section("ТЕСТ 2: Получение рыночных данных (SPY)")
    
    try:
        # Создать контракт SPY
        spy = Stock('SPY', 'SMART', 'USD')
        ib.qualifyContracts(spy)
        
        print(f"Контракт: {spy.symbol} ({spy.exchange})")
        
        # Запросить рыночные данные
        ticker = ib.reqMktData(spy, '', False, False, [])
        ib.sleep(2)  # Подождать данные
        
        print(f"{GREEN}✓ Данные получены:{RESET}")
        print(f"  Bid: ${ticker.bid if ticker.bid and ticker.bid > 0 else 'N/A'}")
        print(f"  Ask: ${ticker.ask if ticker.ask and ticker.ask > 0 else 'N/A'}")
        print(f"  Last: ${ticker.last if ticker.last and ticker.last > 0 else 'N/A'}")
        print(f"  Volume: {ticker.volume if ticker.volume else 0}")
        print(f"  Market Data Type: {ticker.marketDataType} (1=real-time, 2=frozen, 3=delayed)")
        
        # Отменить подписку
        ib.cancelMktData(spy)
        
        return True
        
    except Exception as e:
        print(f"{RED}✗ Ошибка получения данных: {e}{RESET}")
        return False


def test_option_chain(ib):
    """Тест 3: Получение опционной цепочки"""
    print_section("ТЕСТ 3: Получение опционной цепочки (SPY)")
    
    try:
        # Создать контракт SPY
        spy = Stock('SPY', 'SMART', 'USD')
        ib.qualifyContracts(spy)
        
        # Запросить параметры опционной цепочки
        chains = ib.reqSecDefOptParams(spy.symbol, '', spy.secType, spy.conId)
        
        if not chains:
            print(f"{YELLOW}⚠ Цепочки не найдены{RESET}")
            return False
        
        chain = chains[0]  # Первая цепочка (обычно самая ликвидная)
        
        print(f"{GREEN}✓ Опционная цепочка получена:{RESET}")
        print(f"  Exchange: {chain.exchange}")
        print(f"  Trading Class: {chain.tradingClass}")
        print(f"  Multiplier: {chain.multiplier}")
        print(f"  Экспираций: {len(chain.expirations)}")
        print(f"  Страйков: {len(chain.strikes)}")
        print(f"  Ближайшие экспирации: {', '.join(chain.expirations[:5])}")
        
        return True
        
    except Exception as e:
        print(f"{RED}✗ Ошибка получения цепочки: {e}{RESET}")
        return False


def main():
    """Главная функция"""
    print(f"\n{GREEN}{'=' * 80}{RESET}")
    print(f"{GREEN}ТЕСТ ПОДКЛЮЧЕНИЯ К TWS API (Андрей, clientId=102){RESET}")
    print(f"{GREEN}{'=' * 80}{RESET}")
    
    # Тест 1: Подключение
    ib, connected = test_connection()
    
    if not connected:
        print(f"\n{RED}❌ ТЕСТЫ ПРЕРВАНЫ: Не удалось подключиться{RESET}\n")
        return
    
    # Тест 2: Рыночные данные
    data_ok = test_market_data(ib)
    
    # Тест 3: Опционная цепочка
    chain_ok = test_option_chain(ib)
    
    # Отключиться
    print_section("Отключение")
    ib.disconnect()
    print(f"{GREEN}✓ Отключен от TWS{RESET}")
    
    # Итоги
    print_section("РЕЗУЛЬТАТЫ")
    
    tests = [
        ("Подключение к TWS", connected),
        ("Получение рыночных данных", data_ok),
        ("Получение опционной цепочки", chain_ok)
    ]
    
    for test_name, result in tests:
        status = f"{GREEN}✓ PASS{RESET}" if result else f"{RED}✗ FAIL{RESET}"
        print(f"  {test_name:<40} {status}")
    
    all_passed = all(result for _, result in tests)
    
    if all_passed:
        print(f"\n{GREEN}✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ! Подключение работает корректно.{RESET}")
        print(f"\n{BLUE}Теперь можешь:{RESET}")
        print("  • Разрабатывать скрипты с ib_insync локально")
        print("  • Работать в Jupyter notebooks")
        print("  • Тестировать опционные стратегии")
    else:
        print(f"\n{YELLOW}⚠️  Некоторые тесты не прошли. Проверь подписки на рыночные данные.{RESET}")
    
    print(f"\n{BLUE}{'=' * 80}{RESET}\n")


if __name__ == "__main__":
    main()
