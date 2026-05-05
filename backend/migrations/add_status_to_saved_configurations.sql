-- Миграция: добавить колонку `status` в таблицу saved_configurations
-- ЗАЧЕМ: Различать предварительные планы сделок («В ожидании») от реально открытых
-- позиций («Зафиксирована»). При открытии «В ожидании» калькулятор подтягивает
-- свежие котировки от расширения TradingView; «Зафиксирована» открывается с
-- замороженными датами входа и без обновления.
--
-- Решение: ВСЕ существующие записи помечаются как 'standard' (Зафиксирована),
-- независимо от прежнего значения is_locked. Статус 'pending' появляется только
-- у новых сохранений, если пользователь явно выбрал «В ожидании» в диалоге.
-- Дефолт колонки тоже 'standard' — чтобы любая запись без явного статуса
-- создавалась как зафиксированная (поведение «как раньше»).
--
-- Совместимость: PostgreSQL (prod) и SQLite (local dev).
--
-- Перед применением: убедиться, что бэкенд остановлен или новая колонка добавлена
-- атомарно. Для prod — выполнить под user = postgres c доступом на запись к БД.

-- 1. Добавить колонку (PostgreSQL и SQLite оба поддерживают `IF NOT EXISTS`).
--    DEFAULT 'standard' — для всех будущих INSERT'ов без явного status.
ALTER TABLE saved_configurations
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'standard';

-- 2. Backfill ВСЕХ существующих записей в 'standard'.
-- ЗАЧЕМ: По задаче — все ранее созданные позиции считаются зафиксированными
-- (это привычное поведение калькулятора до внедрения статусов). Записи с
-- is_locked=false тоже получают status='standard' и одновременно is_locked=true,
-- чтобы статус и техническая блокировка дат были согласованы.
UPDATE saved_configurations
   SET status = 'standard',
       is_locked = TRUE
 WHERE status IS NULL OR status <> 'standard';

-- 3. Индекс на status для быстрой фильтрации в списке сохранений.
CREATE INDEX IF NOT EXISTS idx_saved_config_status
  ON saved_configurations (status);

-- Проверка после применения:
-- SELECT status, COUNT(*) FROM saved_configurations GROUP BY status;
-- Ожидаемый результат: одна строка status='standard', count=<все существующие>.
