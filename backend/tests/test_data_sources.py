import os
import asyncio
from dotenv import load_dotenv

# Загружаем переменные окружения из .env файла
load_dotenv()

# Убедимся, что PYTHONPATH настроен для импорта из app
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '.')))

from app.services.data_source_factory import DataSourceFactory

async def test_ticker(ticker):
    print(f'\n---\n🧪 Тестирование тикера: {ticker}\n---')

    # --- Тест Polygon.io ---
    print("\n[1] 📡 Запрос к Polygon.io...")
    try:
        os.environ["OPTIONS_DATA_SOURCE"] = "polygon"
        client_polygon = DataSourceFactory.get_client()
        
        print("  - Получение цены акции...")
        stock_price = await asyncio.to_thread(client_polygon.get_stock_price, ticker)
        print(f"    ✅ Цена акции: {stock_price}")
        
        print("  - Получение цепочки опционов...")
        options_chain = await asyncio.to_thread(client_polygon.get_options_chain, ticker)
        if options_chain:
            print(f"    ✅ Найдено опционов: {len(options_chain)}")
            print("    -- Структура первого опциона Polygon --")
            print(options_chain[0])
        else:
            print("    ⚠️ Опционы не найдены.")
            
    except Exception as e:
        print(f"    ❌ Ошибка Polygon.io: {e}")

    # --- Тест Yahoo Finance ---
    print("\n[2] 📡 Запрос к Yahoo Finance...")
    try:
        os.environ["OPTIONS_DATA_SOURCE"] = "yahoo"
        client_yahoo = DataSourceFactory.get_client()
        
        print("  - Получение цены акции...")
        stock_price_yahoo = await asyncio.to_thread(client_yahoo.get_stock_price, ticker)
        print(f"    ✅ Цена акции: {stock_price_yahoo}")
        
        print("  - Получение цепочки опционов...")
        # Вывести все даты экспирации
        expirations = await asyncio.to_thread(client_yahoo.get_expiration_dates, ticker)
        print(f"    ✅ Доступные даты экспирации: {expirations}")
        
        # Протестировать конкретную дату
        test_date = '2025-11-07'
        print(f"\n  - Получение цепочки опционов для {test_date}...")
        options_chain_yahoo = await asyncio.to_thread(client_yahoo.get_options_chain, ticker, expiration_date=test_date)
        if options_chain_yahoo:
            print(f"    ✅ Найдено опционов: {len(options_chain_yahoo)}")
            print("    -- Структура первого опциона Yahoo --")
            print(options_chain_yahoo[0])
        else:
            print("    ⚠️ Опционы не найдены.")

    except Exception as e:
        print(f"    ❌ Ошибка Yahoo Finance: {e}")

if __name__ == "__main__":
    # Тикер для теста
    ticker_to_test = "GC1!"
    
    # Запускаем асинхронный тест
    asyncio.run(test_ticker(ticker_to_test))
