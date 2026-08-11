-- Миграция (SQLite / local dev): добавить колонку `mode` в таблицу north_gpt_prompts
-- ЗАЧЕМ: см. add_mode_to_north_gpt_prompts.sql — тот же смысл, отдельный файл нужен
-- потому, что SQLite НЕ поддерживает `ADD COLUMN IF NOT EXISTS` (падает с syntax error).
--
-- Перед применением проверить, есть ли колонка уже:
--   PRAGMA table_info(north_gpt_prompts);
-- Если mode в выводе есть — шаг 1 пропустить, выполнить только 2 и 3.

-- 1. Добавить колонку. SQLite разрешает ADD COLUMN ... NOT NULL только при непустом
--    DEFAULT — он у нас есть, поэтому все существующие строки сразу получают
--    'options_only'.
ALTER TABLE north_gpt_prompts ADD COLUMN mode VARCHAR(20) NOT NULL DEFAULT 'options_only';

-- 2. Страховка на случай, если колонка уже существовала с пустыми значениями.
UPDATE north_gpt_prompts SET mode = 'options_only' WHERE mode IS NULL OR mode = '';

-- 3. Индекс на mode (имя совпадает с тем, что создаёт SQLAlchemy для index=True).
CREATE INDEX IF NOT EXISTS ix_north_gpt_prompts_mode ON north_gpt_prompts (mode);

-- Проверка после применения:
-- SELECT mode, COUNT(*) FROM north_gpt_prompts GROUP BY mode;
