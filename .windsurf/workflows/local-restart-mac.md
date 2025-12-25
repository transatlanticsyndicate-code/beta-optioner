---
description: Перезапуск backend и frontend серверов на macOS
---

# Перезапуск локальных серверов (macOS)

Этот workflow останавливает и перезапускает серверы backend (FastAPI) и frontend (React).

## Шаги выполнения

1. **Остановка серверов**
   - Поиск и остановка процессов на портах 8000 (backend) и 3000 (frontend)

2. **Запуск backend сервера**
   - Сервер запускается на http://localhost:8000
   - API документация доступна на http://localhost:8000/docs

3. **Запуск frontend сервера**
   - Сервер запускается на http://localhost:3000
   - Проксирует API запросы на backend

## Команды для выполнения

### Остановка серверов
```bash
# Остановка backend (порт 8000)
lsof -ti:8000 | xargs kill -9 2>/dev/null || true

# Остановка frontend (порт 3000)
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Ожидание освобождения портов
sleep 2
```

### Запуск backend
```bash
# Запуск backend сервера
cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8000
```

### Запуск frontend
```bash
# Запуск frontend сервера
cd frontend && PORT=3000 npm start
```

## Альтернативный способ остановки (если lsof недоступен)
```bash
# Найти PID процессов
ps aux | grep -E "(uvicorn|react-scripts)" | grep -v grep

# Остановить по PID (замените PID на реальные значения)
kill -9 <PID_backend>
kill -9 <PID_frontend>
```

## Проверка работы
- Backend (локально): http://localhost:8000/health
- Frontend (локально): http://localhost:3000
- API Docs (локально): http://localhost:8000/docs
- Beta сервер: https://beta.optioner.online
- Тестовый сервер: https://test.optioner.online
