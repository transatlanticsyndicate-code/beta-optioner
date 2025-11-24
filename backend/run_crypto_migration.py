"""
Скрипт для выполнения миграции таблиц рейтинга криптовалют
"""
import sys
import os

# Добавляем путь к приложению
sys.path.insert(0, os.path.dirname(__file__))

from sqlalchemy import create_engine, text
from app.database import engine
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def run_migration():
    """Выполнить миграцию"""
    try:
        logger.info(f"Using existing database engine...")
        
        # Определяем какой SQL файл использовать
        db_url = str(engine.url)
        if 'sqlite' in db_url:
            migration_filename = 'create_crypto_rating_tables_sqlite.sql'
            logger.info("Using SQLite migration")
        else:
            migration_filename = 'create_crypto_rating_tables.sql'
            logger.info("Using PostgreSQL migration")
        
        # Читаем SQL файл
        migration_file = os.path.join(
            os.path.dirname(__file__),
            'migrations',
            migration_filename
        )
        
        logger.info(f"Reading migration file: {migration_file}")
        with open(migration_file, 'r', encoding='utf-8') as f:
            sql_content = f.read()
        
        # Выполняем миграцию
        logger.info("Executing migration...")
        with engine.connect() as conn:
            # Разбиваем на отдельные команды
            statements = [s.strip() for s in sql_content.split(';') if s.strip()]
            
            for statement in statements:
                if statement:
                    try:
                        conn.execute(text(statement))
                        conn.commit()
                    except Exception as e:
                        logger.warning(f"Statement warning (may be already exists): {str(e)}")
        
        logger.info("✅ Migration completed successfully!")
        
        # Проверяем созданные таблицы
        with engine.connect() as conn:
            if 'sqlite' in str(engine.url):
                # SQLite использует sqlite_master
                result = conn.execute(text("""
                    SELECT name 
                    FROM sqlite_master 
                    WHERE type='table' 
                    AND name LIKE 'crypto_%'
                """))
            else:
                # PostgreSQL использует information_schema
                result = conn.execute(text("""
                    SELECT table_name 
                    FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name LIKE 'crypto_%'
                """))
            
            tables = [row[0] for row in result]
            logger.info(f"Created tables: {', '.join(tables)}")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Migration failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = run_migration()
    sys.exit(0 if success else 1)
