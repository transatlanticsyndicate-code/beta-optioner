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


def _ensure_north_gpt_prompt_mode():
    """
    Дотянуть колонку `mode` в north_gpt_prompts, если её ещё нет.

    ЗАЧЕМ: библиотека промптов «Север GPT» разделена на три набора по режимам
    стратегии. Существующие промпты получают режим 'options_only' — тот, в котором
    библиотека и наполнялась до разделения. Полный текст миграции с пояснениями:
    migrations/add_mode_to_north_gpt_prompts.sql (и ..._sqlite.sql).

    Идемпотентно: при наличии колонки не делает ничего.
    """
    from sqlalchemy import inspect

    try:
        inspector = inspect(engine)
        if "north_gpt_prompts" not in inspector.get_table_names():
            return  # таблицы ещё нет — create_all создаст её сразу с колонкой
        columns = {c["name"] for c in inspector.get_columns("north_gpt_prompts")}
        if "mode" in columns:
            return
        with engine.connect() as conn:
            conn.execute(text(
                "ALTER TABLE north_gpt_prompts "
                "ADD COLUMN mode VARCHAR(20) NOT NULL DEFAULT 'options_only'"
            ))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_north_gpt_prompts_mode "
                "ON north_gpt_prompts (mode)"
            ))
            conn.commit()
        print("✅ north_gpt_prompts.mode добавлена (все промпты → options_only)")
    except Exception as e:
        print(f"⚠️ Не удалось добавить north_gpt_prompts.mode: {e}")


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
    from app.models import etf_setting  # Import shared ETF settings
    from app.models import north_gpt_prompt  # Import «Север GPT» prompts
    from app.models import crypto_app_state  # Import crypto cloud state
    from app.models import strategy_default_setting  # Import «Север»/«Север GPT» defaults
    Base.metadata.create_all(bind=engine)

    # ЗАЧЕМ: create_all создаёт только отсутствующие ТАБЛИЦЫ и не добавляет колонки
    # в уже существующие. Деплой-скрипты SQL-миграции не запускают, а забытая
    # миграция кладёт всю библиотеку промптов в 500. Поэтому — идемпотентная
    # доводка схемы при старте. SQL-файлы в migrations/ остаются как документация
    # и как способ накатить изменение заранее, до деплоя бэкенда.
    _ensure_north_gpt_prompt_mode()

    # ЗАЧЕМ: Сидинг таблицы etf_settings при первом запуске —
    # если таблица пуста, наполняем её 5 популярными ETF (SPY, QQQ, IWM, VOO, DIA).
    # Идемпотентно: если в таблице уже есть записи, сидинг не выполняется.
    try:
        from app.models.etf_setting import EtfSetting
        with SessionLocal() as db:
            if db.query(EtfSetting).count() == 0:
                db.add_all([
                    EtfSetting(ticker="SPY", name="SPDR S&P 500 ETF Trust"),
                    EtfSetting(ticker="QQQ", name="Invesco QQQ Trust"),
                    EtfSetting(ticker="IWM", name="iShares Russell 2000 ETF"),
                    EtfSetting(ticker="VOO", name="Vanguard S&P 500 ETF"),
                    EtfSetting(ticker="DIA", name="SPDR Dow Jones Industrial Average ETF"),
                ])
                db.commit()
                print("✅ ETF settings seeded with 5 default tickers")
    except Exception as e:
        print(f"⚠️ ETF seeding skipped: {e}")

    # ЗАЧЕМ: Сидинг таблицы futures_settings при первом запуске.
    # Раньше дефолты фьючерсов жили только во фронте и сервер наполнялся «посевом»
    # от первого пользователя. Теперь сервер — источник правды, поэтому сам сидит
    # заводской набор. Идемпотентно: при непустой таблице сидинг пропускается.
    try:
        from app.models.futures_setting import FuturesSetting, DEFAULT_FUTURES_SEED
        with SessionLocal() as db:
            if db.query(FuturesSetting).count() == 0:
                db.add_all([
                    FuturesSetting(
                        ticker=f["ticker"],
                        name=f["name"],
                        point_value=f["point_value"],
                        margin_per_contract=None,
                    )
                    for f in DEFAULT_FUTURES_SEED
                ])
                db.commit()
                print(f"✅ Futures settings seeded with {len(DEFAULT_FUTURES_SEED)} default tickers")
    except Exception as e:
        print(f"⚠️ Futures seeding skipped: {e}")

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
