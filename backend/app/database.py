"""
Database configuration and session management
"""
import os
from sqlalchemy import create_engine
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
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
    print(f"✅ Используем SQLite: {DATABASE_URL}")
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
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables created successfully")
