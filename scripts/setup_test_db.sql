-- Скрипт для создания тестовой базы данных
-- Выполнить на сервере: sudo -u postgres psql < setup_test_db.sql

-- Создать пользователя для тестовой БД
CREATE USER test_user WITH PASSWORD 'test_password_123';

-- Создать тестовую базу данных
CREATE DATABASE test_optioner OWNER test_user;

-- Дать все права пользователю
GRANT ALL PRIVILEGES ON DATABASE test_optioner TO test_user;

-- Подключиться к тестовой БД
\c test_optioner

-- Дать права на схему public
GRANT ALL ON SCHEMA public TO test_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO test_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO test_user;

-- Установить права по умолчанию для будущих таблиц
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO test_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO test_user;

-- Вывести информацию
\echo 'Тестовая база данных test_optioner создана'
\echo 'Пользователь: test_user'
\echo 'Пароль: test_password_123'
\echo 'Connection string: postgresql://test_user:test_password_123@localhost:5432/test_optioner'
