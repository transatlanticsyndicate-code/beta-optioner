"""
Тест интеграции с Supabase
"""
import os
import sys
from dotenv import load_dotenv

# Загрузить .env
load_dotenv()

# Добавить app в путь
sys.path.insert(0, os.path.dirname(__file__))

from app.services.supabase_client import SupabaseClient


def test_supabase():
    """Тест подключения и основных операций"""
    
    print("🧪 Тестирование Supabase...")
    print(f"URL: {os.getenv('SUPABASE_URL')}")
    print(f"Key: {os.getenv('SUPABASE_ANON_KEY')[:20]}...")
    
    try:
        # Создать клиент
        print("\n1️⃣ Создание клиента...")
        client = SupabaseClient()
        print("✅ Клиент создан")
        
        # Тестовые данные
        test_data = {
            "ticker": "TEST",
            "stock_data": {"price": 100.0, "change": 1.5},
            "metrics": {"max_pain": 95.0, "put_call_ratio": 0.85},
            "ai_model": "gemini",
            "ai_analysis": "Тестовый анализ для проверки Supabase",
            "ai_provider": "Gemini AI",
            "ip_address": "127.0.0.1",
            "user_agent": "Test Script",
            "execution_time_ms": 5000
        }
        
        # Сохранить анализ
        print("\n2️⃣ Сохранение тестового анализа...")
        result = client.save_analysis(**test_data)
        print(f"✅ Анализ сохранен")
        print(f"   ID: {result['id']}")
        print(f"   URL: {result['url']}")
        
        analysis_id = result['id']
        
        # Получить анализ
        print(f"\n3️⃣ Получение анализа по ID: {analysis_id}...")
        data = client.get_analysis(analysis_id)
        if data:
            print(f"✅ Анализ получен")
            print(f"   Ticker: {data['ticker']}")
            print(f"   Created: {data['created_at']}")
            print(f"   AI Model: {data['ai_model']}")
        else:
            print("❌ Анализ не найден")
            return False
        
        # Получить историю
        print("\n4️⃣ Получение истории анализов...")
        history = client.get_history(limit=5)
        print(f"✅ История получена: {len(history)} записей")
        for i, item in enumerate(history[:3], 1):
            print(f"   {i}. {item['ticker']} - {item['created_at']}")
        
        # Статистика
        print("\n5️⃣ Получение статистики...")
        stats = client.get_stats()
        print(f"✅ Статистика получена")
        print(f"   Всего анализов: {stats.get('total_analyses', 0)}")
        
        print("\n✅ Все тесты пройдены успешно!")
        return True
        
    except Exception as e:
        print(f"\n❌ Ошибка: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = test_supabase()
    sys.exit(0 if success else 1)
