-- Миграция для создания таблиц функционала рейтинга криптовалют
-- ЗАЧЕМ: Хранение снимков топ-400 криптовалют и результатов анализа
-- Дата создания: 2025-11-24

-- Таблица для запланированных задач мониторинга
CREATE TABLE IF NOT EXISTS crypto_scheduled_tasks (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    day_of_week VARCHAR(20) NOT NULL,
    time VARCHAR(10) NOT NULL,
    interval_value INTEGER NOT NULL,
    interval_unit VARCHAR(10) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMP,
    next_run_at TIMESTAMP,
    scheduler_job_id VARCHAR(255)
);

-- Таблица для снимков топ-400 криптовалют
CREATE TABLE IF NOT EXISTS crypto_snapshots (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    crypto_list JSONB NOT NULL,
    task_id INTEGER REFERENCES crypto_scheduled_tasks(id) ON DELETE SET NULL
);

-- Таблица для результатов анализа
CREATE TABLE IF NOT EXISTS crypto_analyses (
    id SERIAL PRIMARY KEY,
    first_snapshot_id INTEGER NOT NULL REFERENCES crypto_snapshots(id) ON DELETE CASCADE,
    second_snapshot_id INTEGER NOT NULL REFERENCES crypto_snapshots(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    dropped_cryptos JSONB NOT NULL,
    added_cryptos JSONB NOT NULL,
    task_id INTEGER REFERENCES crypto_scheduled_tasks(id) ON DELETE SET NULL
);

-- Индексы для оптимизации запросов
CREATE INDEX IF NOT EXISTS idx_crypto_snapshots_created_at ON crypto_snapshots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crypto_snapshots_task_id ON crypto_snapshots(task_id);
CREATE INDEX IF NOT EXISTS idx_crypto_analyses_created_at ON crypto_analyses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crypto_analyses_task_id ON crypto_analyses(task_id);
CREATE INDEX IF NOT EXISTS idx_crypto_scheduled_tasks_is_active ON crypto_scheduled_tasks(is_active);

-- Комментарии к таблицам
COMMENT ON TABLE crypto_scheduled_tasks IS 'Запланированные задачи для циклического мониторинга криптовалют';
COMMENT ON TABLE crypto_snapshots IS 'Снимки топ-400 криптовалют с CoinMarketCap';
COMMENT ON TABLE crypto_analyses IS 'Результаты сравнения двух снимков криптовалют';
