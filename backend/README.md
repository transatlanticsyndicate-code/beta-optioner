# Backend - Options Flow AI Analyzer

FastAPI сервер для анализа опционного рынка

## Быстрый старт

### 1. Установка зависимостей

```bash
cd backend

# Создать виртуальное окружение
python3.12 -m venv venv

# Активировать
source venv/bin/activate  # Mac/Linux
# или
venv\Scripts\activate  # Windows

# Установить библиотеки
pip install -r requirements.txt
```

### 2. Настроить .env

```bash
# Скопировать шаблон
cp .env.example .env

# Открыть и заполнить API ключи
nano .env
```

Минимально нужны:
- `POLYGON_API_KEY` - от Polygon.io
- `GEMINI_API_KEY` - от Google AI Studio

### 3. Запустить сервер

```bash
uvicorn app.main:app --reload --port 8000
```

Сервер запустится на http://localhost:8000

## Проверка работы

### Health check
```bash
curl http://localhost:8000/health
```

### API документация
Открыть в браузере: http://localhost:8000/docs

## Структура

```
backend/
├── app/
│   ├── main.py              # FastAPI приложение
│   ├── services/            # Бизнес-логика
│   │   ├── polygon_client.py   # Polygon.io API
│   │   ├── ai_analyzer.py      # Общий интерфейс AI
│   │   ├── gemini_client.py    # Gemini AI
│   │   ├── claude_client.py    # Claude AI
│   │   └── calculations.py     # Расчет метрик
│   ├── prompts/             # Промпты для AI
│   │   └── analysis_v1.txt
│   ├── models/              # Pydantic модели
│   └── api/                 # API endpoints
├── .env                     # Переменные окружения (не в git)
├── .env.example             # Шаблон .env
└── requirements.txt         # Python зависимости
```

## Разработка

### Добавить новый endpoint

1. Создать файл в `app/api/`
2. Импортировать в `app/main.py`
3. Документация обновится автоматически

### Тестирование

```bash
# Запустить с автоперезагрузкой
uvicorn app.main:app --reload

# Проверить endpoints
curl http://localhost:8000/
```

## Переменные окружения

См. файл `ENV_SETUP.md` для подробной инструкции

Основные:
- `POLYGON_API_KEY` - API ключ Polygon.io
- `AI_PROVIDER` - gemini или claude
- `GEMINI_API_KEY` - API ключ Google Gemini
- `CLAUDE_API_KEY` - API ключ Anthropic Claude (опционально)
- `ENVIRONMENT` - development или production
- `PORT` - порт сервера (по умолчанию 8000)

## Troubleshooting

### Ошибка: "POLYGON_API_KEY не найден"
- Проверь что файл `.env` существует
- Проверь что ключ указан без пробелов
- Перезапусти сервер

### Ошибка: "ModuleNotFoundError"
```bash
pip install -r requirements.txt
```

### Порт занят
```bash
# Использовать другой порт
uvicorn app.main:app --reload --port 8001
```
