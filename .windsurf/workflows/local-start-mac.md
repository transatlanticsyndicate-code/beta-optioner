---
description: Запуск backend и frontend серверов на macOS
---

# Запуск локальных серверов (macOS)

Этот workflow запускает серверы backend (FastAPI) и frontend (React) для локальной разработки.

## Шаги выполнения

1. **Подготовка backend**
   - Создание виртуального окружения (если не существует)
   - Установка зависимостей Python

2. **Запуск backend сервера**
   - Сервер запускается на http://localhost:8000
   - API документация доступна на http://localhost:8000/docs

3. **Подготовка frontend**
   - Установка Node.js (требуется ручная установка)
   - Установка зависимостей npm

4. **Запуск frontend сервера**
   - Сервер запускается на http://localhost:3000
   - Проксирует API запросы на backend

## Команды для выполнения

### Backend
```bash
# Создание venv (если нужно)
cd backend && python3 -m venv venv

# Активация venv и установка зависимостей
cd backend && source venv/bin/activate && pip install -r requirements.txt

# Запуск сервера
cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
# Установка Node.js (выполнить вручную)
brew install node

# Установка зависимостей
cd frontend && npm install

# Запуск сервера
cd frontend && PORT=3000 npm start
```

## Проверка работы
- Backend: http://localhost:8000/health
- Frontend: http://localhost:3000
- API Docs: http://localhost:8000/docs
