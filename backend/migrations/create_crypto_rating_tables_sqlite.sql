-- Миграция для создания таблиц функционала рейтинга криптовалют (SQLite версия)
-- ЗАЧЕМ: Хранение снимков топ-400 криптовалют и результатов анализа
-- Дата создания: 2025-11-24

-- Таблица для запланированных задач мониторинга
CREATE TABLE IF NOT EXISTS crypto_scheduled_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    day_of_week VARCHAR(20) NOT NULL,
    time VARCHAR(10) NOT NULL,
    interval_value INTEGER NOT NULL,
    interval_unit VARCHAR(10) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    last_run_at TIMESTAMP,
    next_run_at TIMESTAMP,
    scheduler_job_id VARCHAR(255)
);

-- Таблица для снимков топ-400 криптовалют
CREATE TABLE IF NOT EXISTS crypto_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    crypto_list TEXT NOT NULL,
    task_id INTEGER REFERENCES crypto_scheduled_tasks(id) ON DELETE SET NULL
);

-- Таблица для результатов анализа
CREATE TABLE IF NOT EXISTS crypto_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_snapshot_id INTEGER NOT NULL REFERENCES crypto_snapshots(id) ON DELETE CASCADE,
    second_snapshot_id INTEGER NOT NULL REFERENCES crypto_snapshots(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    dropped_cryptos TEXT NOT NULL,
    added_cryptos TEXT NOT NULL,
    task_id INTEGER REFERENCES crypto_scheduled_tasks(id) ON DELETE SET NULL
);

-- Индексы для оптимизации запросов
CREATE INDEX IF NOT EXISTS idx_crypto_snapshots_created_at ON crypto_snapshots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crypto_snapshots_task_id ON crypto_snapshots(task_id);
CREATE INDEX IF NOT EXISTS idx_crypto_analyses_created_at ON crypto_analyses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crypto_analyses_task_id ON crypto_analyses(task_id);
CREATE INDEX IF NOT EXISTS idx_crypto_scheduled_tasks_is_active ON crypto_scheduled_tasks(is_active);
