"""
Тест подключения к PostgreSQL через SSH туннель
Запуск: python test_db_connection.py
"""
import psycopg2
from psycopg2 import sql
import sys
import os
from dotenv import load_dotenv

load_dotenv()

# Получаем параметры из переменных окружения
DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    print("❌ DATABASE_URL не найден в .env файле")
    print("Добавь DATABASE_URL в .env файл")
    exit(1)

# Парсим DATABASE_URL
# Формат: postgresql://user:password@host:port/database
import re
match = re.match(r'postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)', DATABASE_URL)
if not match:
    print("❌ Неверный формат DATABASE_URL")
    exit(1)

user, password, host, port, database = match.groups()

db_config = {
    'host': host,
    'port': int(port),
    'database': database,
    'user': user,
    'password': password
}

def test_connection():
    """Проверка подключения к PostgreSQL"""
    
    print("🔌 Тестирование подключения к PostgreSQL...")
    print(f"📍 Host: {db_config['host']}:{db_config['port']}")
    print(f"🗄️  Database: {db_config['database']}")
    print(f"👤 User: {db_config['user']}")
    print()
    
    try:
        # Попытка подключения
        print("⏳ Подключаюсь...")
        conn = psycopg2.connect(**db_config)
        print("✅ Подключение успешно!")
        print()
        
        # Создать курсор
        cur = conn.cursor()
        
        # Проверить версию PostgreSQL
        print("📊 Информация о сервере:")
        cur.execute("SELECT version();")
        version = cur.fetchone()[0]
        print(f"   PostgreSQL: {version.split(',')[0]}")
        
        # Проверить текущую базу данных
        cur.execute("SELECT current_database();")
        db_name = cur.fetchone()[0]
        print(f"   Текущая БД: {db_name}")
        
        # Проверить наличие таблицы analysis_history
        print()
        print("🔍 Проверка таблицы analysis_history...")
        cur.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'analysis_history'
            );
        """)
        table_exists = cur.fetchone()[0]
        
        if table_exists:
            print("   ✅ Таблица analysis_history найдена")
            
            # Получить структуру таблицы
            cur.execute("""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'analysis_history'
                ORDER BY ordinal_position;
            """)
            columns = cur.fetchall()
            print(f"   📋 Колонки ({len(columns)}):")
            for col_name, col_type in columns:
                print(f"      - {col_name}: {col_type}")
            
            # Проверить количество записей
            cur.execute("SELECT COUNT(*) FROM analysis_history;")
            count = cur.fetchone()[0]
            print(f"   📊 Записей в таблице: {count}")
        else:
            print("   ⚠️  Таблица analysis_history не найдена")
            print("   💡 Запусти миграцию для создания таблицы")
        
        # Закрыть соединение
        cur.close()
        conn.close()
        
        print()
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("✅ Все проверки пройдены успешно!")
        print("🚀 Можно продолжать разработку")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        return True
        
    except psycopg2.OperationalError as e:
        print("❌ Ошибка подключения!")
        print()
        print("Возможные причины:")
        print("1. SSH туннель не запущен")
        print("   Решение: ./scripts/db-tunnel.sh")
        print()
        print("2. Неверный пароль")
        print("   Решение: проверь пароль в скрипте")
        print()
        print("3. PostgreSQL не запущен на сервере")
        print("   Решение: ssh root@89.117.52.143 'systemctl status postgresql'")
        print()
        print(f"Детали ошибки: {e}")
        return False
        
    except Exception as e:
        print(f"❌ Неожиданная ошибка: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = test_connection()
    sys.exit(0 if success else 1)
