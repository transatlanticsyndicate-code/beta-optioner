"""
Database configuration and session management
"""
import os
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Загрузить переменные окружения
load_dotenv()

# URL подключения к БД
DATABASE_URL = os.getenv("DATABASE_URL")

# Если DATABASE_URL не установлен - используем SQLite локально
if not DATABASE_URL:
    print("⚠️ DATABASE_URL не найден. Используем SQLite для разработки.")
    DATABASE_URL = "sqlite:///./optioner.db"

# Создать engine
if DATABASE_URL.startswith("sqlite"):
    # SQLite не нужны параметры пула
    # ВАЖНО: Включаем WAL режим для улучшения производительности при одновременных запросах
    # ЗАЧЕМ: WAL (Write-Ahead Logging) позволяет одновременные чтения без блокировок
    engine = create_engine(
        DATABASE_URL,
        connect_args={
            "check_same_thread": False,
            "timeout": 30  # Увеличиваем таймаут до 30 секунд для избежания блокировок
        }
    )
    
    # Включаем WAL режим для улучшения производительности
    from sqlalchemy import event
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")  # Баланс между производительностью и надёжностью
        cursor.execute("PRAGMA wal_autocheckpoint=100")  # ЗАЧЕМ: Чаще сливаем WAL в основной файл (каждые ~400KB)
        cursor.execute("PRAGMA cache_size=-64000")  # 64MB кэш
        cursor.execute("PRAGMA temp_store=MEMORY")  # Временные таблицы в памяти
        cursor.close()
    
    print(f"✅ Используем SQLite с WAL режимом: {DATABASE_URL}")
else:
    # PostgreSQL с параметрами пула
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,  # Проверять соединение перед использованием
        pool_size=5,         # Размер пула соединений
        max_overflow=10      # Максимум дополнительных соединений
    )
    print(f"✅ Используем PostgreSQL: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else 'unknown'}")

# Создать session maker
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class для моделей
Base = declarative_base()


def get_db():
    """
    Dependency для получения database session
    Использование в FastAPI:
    
    @app.get("/endpoint")
    def endpoint(db: Session = Depends(get_db)):
        ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """
    Инициализация базы данных
    Создает все таблицы если их нет
    """
    from app.models import analysis_history  # Import models
    from app.models import user  # Import user models
    from app.models import crypto_rating  # Import crypto rating models
    from app.models import saved_configuration  # Import saved configurations
    from app.models import futures_setting  # Import shared futures settings
    Base.metadata.create_all(bind=engine)

    # ЗАЧЕМ: Принудительный checkpoint при старте — сливаем все данные из WAL в основной .db файл
    # Защита от потери данных при внезапном перезапуске или деплое
    if DATABASE_URL and DATABASE_URL.startswith("sqlite"):
        try:
            with engine.connect() as conn:
                conn.execute(text("PRAGMA wal_checkpoint(TRUNCATE)"))
                conn.commit()
            print("✅ WAL checkpoint completed")
        except Exception as e:
            print(f"⚠️ WAL checkpoint failed: {e}")

    print("✅ Database tables created successfully")
