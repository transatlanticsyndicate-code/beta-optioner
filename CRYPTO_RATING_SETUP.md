# Инструкция по настройке функционала "Рейтинг криптовалют"

## Описание функционала

Автоматический мониторинг топ-400 криптовалют с CoinMarketCap:
- Циклический сбор данных по расписанию
- Сравнение снимков и выявление изменений
- Email уведомления о завершении анализа
- Web-интерфейс для просмотра результатов

## 1. Миграция базы данных

Выполните SQL миграцию для создания необходимых таблиц:

```bash
psql -U your_username -d your_database -f backend/migrations/create_crypto_rating_tables.sql
```

Или через pgAdmin:
1. Откройте файл `backend/migrations/create_crypto_rating_tables.sql`
2. Выполните SQL скрипт в вашей базе данных

## 2. Установка зависимостей

### Backend

```bash
cd backend
.\venv\Scripts\Activate.ps1
pip install APScheduler==3.10.4
```

APScheduler уже добавлен в `requirements.txt`.

### Frontend

Все необходимые зависимости уже установлены (React, Lucide icons).

## 3. Настройка Email уведомлений (опционально)

Для отправки email уведомлений нужно настроить SMTP:

1. Откройте файл `backend/app/services/email_service.py`
2. Найдите строку `SENDER_PASSWORD = ""`
3. Добавьте пароль приложения Gmail:
   - Перейдите в настройки Google Account
   - Безопасность → Двухфакторная аутентификация
   - Пароли приложений → Создать новый
   - Скопируйте пароль в `SENDER_PASSWORD`

**Примечание:** Без настройки email уведомления будут логироваться в консоль, но не отправляться.

## 4. Проверка API ключа CoinMarketCap

API ключ уже настроен в `backend/app/services/coinmarketcap_service.py`:
```python
CMC_API_KEY = "REMOVED_API_KEY"
```

Проверить работу API можно через эндпоинт:
```
GET http://localhost:8000/api/crypto-rating/test-connection
```

## 5. Запуск приложения

### Backend

```bash
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

При запуске автоматически:
- Восстановятся активные задачи планировщика из БД
- Запустится APScheduler в фоновом режиме

### Frontend

```bash
cd frontend
npm start
```

Откройте http://localhost:3000/tools/crypto-rating

## 6. Использование

### Создание задачи мониторинга

1. Откройте страницу "Рейтинг криптовалют"
2. Заполните параметры:
   - **День недели**: когда создавать первый снимок
   - **Время**: во сколько создавать первый снимок (UTC)
   - **Интервал**: через сколько создавать второй снимок
3. Нажмите "Запустить мониторинг"

### Как работает мониторинг

1. **Первый снимок** создается в указанный день недели и время
2. **Второй снимок** создается через указанный интервал
3. **Анализ** автоматически генерируется после второго снимка
4. **Email уведомление** отправляется на transatlanticsyndicate@gmail.com
5. **Цикл повторяется** каждую неделю в указанный день

### Просмотр результатов

- Список всех анализов отображается на странице
- Клик по анализу раскрывает детали:
  - Криптовалюты, выпавшие из топ-400
  - Криптовалюты, вошедшие в топ-400
  - Даты снимков

## 7. API эндпоинты

### POST /api/crypto-rating/schedule
Создать задачу мониторинга

**Request:**
```json
{
  "day_of_week": "monday",
  "time": "10:00",
  "interval_value": 24,
  "interval_unit": "hours"
}
```

### GET /api/crypto-rating/analyses
Получить список всех анализов

### GET /api/crypto-rating/analyses/{id}
Получить детали конкретного анализа

### POST /api/crypto-rating/fetch-now
Создать снимок вручную (для тестирования)

### GET /api/crypto-rating/test-connection
Проверить подключение к CoinMarketCap API

### DELETE /api/crypto-rating/tasks/{id}
Остановить задачу мониторинга

## 8. Структура БД

### crypto_scheduled_tasks
Запланированные задачи мониторинга

### crypto_snapshots
Снимки топ-400 криптовалют

### crypto_analyses
Результаты сравнения снимков

## 9. Troubleshooting

### Задачи не выполняются после перезапуска сервера
- Проверьте логи при запуске: должно быть "✅ Crypto scheduler задачи восстановлены"
- Убедитесь, что задачи в БД имеют `is_active = true`

### Email не отправляются
- Проверьте настройку `SENDER_PASSWORD` в `email_service.py`
- Проверьте логи: email контент должен логироваться в консоль

### Ошибка подключения к CoinMarketCap
- Проверьте API ключ в `coinmarketcap_service.py`
- Проверьте лимиты API (бесплатный план: 333 запроса/день)

### Ошибки в планировщике
- Проверьте логи APScheduler в консоли backend
- Убедитесь, что время указано в формате HH:MM

## 10. Файлы проекта

### Backend
- `app/models/crypto_rating.py` - модели БД
- `app/services/coinmarketcap_service.py` - работа с CoinMarketCap API
- `app/services/crypto_analysis_service.py` - логика анализа
- `app/services/crypto_scheduler.py` - планировщик задач
- `app/services/email_service.py` - отправка email
- `app/routers/crypto_rating.py` - API эндпоинты
- `migrations/create_crypto_rating_tables.sql` - SQL миграция

### Frontend
- `src/pages/CryptoRating.jsx` - страница рейтинга криптовалют

## 11. Дополнительная информация

- **Лимиты CoinMarketCap API**: 333 запроса/день (бесплатный план)
- **Формат времени**: UTC (учитывайте часовой пояс)
- **Email получатель**: transatlanticsyndicate@gmail.com
- **Топ криптовалют**: 400 (можно изменить в `coinmarketcap_service.py`)

---

**Дата создания**: 24.11.2025  
**Версия**: 1.0
