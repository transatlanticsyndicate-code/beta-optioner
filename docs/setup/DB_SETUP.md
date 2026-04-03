# 🗄️ Подключение к PostgreSQL

## 📍 Локальная разработка (через SSH туннель)

### 1. Запусти SSH туннель

```bash
./scripts/db-tunnel.sh
```

Это создаст безопасное подключение к PostgreSQL на сервере через SSH.

**Что происходит:**
- Локальный порт `5432` → Удаленный порт `5432` на сервере
- Все данные шифруются через SSH
- PostgreSQL доступен как `localhost:5432`

### 2. Проверь подключение

```bash
# В другом терминале
psql postgresql://postgres:[YOUR_POSTGRES_PASSWORD]@localhost:5432/optioner
```

Или через pgAdmin:
- Host: `localhost`
- Port: `5432`
- Database: `optioner`
- Username: `postgres`
- Password: `[YOUR_POSTGRES_PASSWORD]`

### 3. Запусти backend

```bash
cd backend
source venv/bin/activate
python -m uvicorn app.main:app --reload
```

Backend автоматически подключится к БД через туннель.

## 🚀 Продакшен (на сервере)

На сервере PostgreSQL доступен напрямую на `localhost:5432`.

```bash
# На сервере
DATABASE_URL=postgresql://postgres:[YOUR_POSTGRES_PASSWORD]@localhost:5432/optioner
```

## 🔧 Переменные окружения

### Локальная разработка (`.env`)
```bash
DATABASE_URL=postgresql://postgres:[YOUR_POSTGRES_PASSWORD]@localhost:5432/optioner
BASE_URL=http://localhost:3000
```

### Продакшен (`.env.production`)
```bash
DATABASE_URL=postgresql://postgres:[YOUR_POSTGRES_PASSWORD]@localhost:5432/optioner
BASE_URL=https://optioner.online
```

## 📊 Полезные команды

### Подключиться к БД
```bash
# Через SSH туннель (локально)
psql postgresql://postgres:[YOUR_POSTGRES_PASSWORD]@localhost:5432/optioner

# На сервере
ssh root@89.117.52.143
sudo -u postgres psql -d optioner
```

### Посмотреть таблицы
```sql
\dt
```

### Посмотреть данные
```sql
SELECT * FROM analysis_history LIMIT 10;
```

### Очистить таблицу
```sql
TRUNCATE TABLE analysis_history;
```

## 🛡️ Безопасность

- ✅ SSH туннель шифрует все данные
- ✅ PostgreSQL не доступен из интернета
- ✅ Пароли в `.env` (не коммитятся в git)
- ✅ Только localhost подключения

## ❓ Troubleshooting

### Ошибка: "Connection refused"
1. Проверь что SSH туннель запущен
2. Проверь что PostgreSQL работает на сервере:
   ```bash
   ssh root@89.117.52.143 "systemctl status postgresql"
   ```

### Ошибка: "Authentication failed"
Проверь пароль в `.env` файле

### Туннель обрывается
Используй `autossh` для автоматического переподключения:
```bash
brew install autossh
autossh -M 0 -N -L 5432:localhost:5432 root@89.117.52.143
```

## 📚 Дополнительно

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [SSH Tunneling Guide](https://www.ssh.com/academy/ssh/tunneling)
- [SQLAlchemy ORM](https://docs.sqlalchemy.org/)
