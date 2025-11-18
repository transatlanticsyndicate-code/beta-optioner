# SYNDICATE Platform - Frontend

React приложение для платформы финансовых инструментов.

## Структура

```
frontend/
├── src/
│   ├── App.js                      # Главный компонент с роутингом
│   ├── index.js                    # Entry point
│   ├── index.css                   # Глобальные стили
│   ├── components/
│   │   └── Layout/                 # Layout компоненты
│   │       ├── Layout.js           # Главный layout
│   │       ├── Header.js           # Шапка с навигацией
│   │       └── *.css
│   └── pages/
│       ├── HomePage.js             # Главная страница
│       └── OptionsAnalyzer/        # Options Analyzer инструмент
│           ├── index.js
│           └── OptionsAnalyzer.css
└── package.json
```

## Запуск

```bash
# Установить зависимости
npm install

# Запустить dev сервер
npm start

# Открыть http://localhost:3000
```

## Роуты

- `/` - Главная страница с карточками инструментов
- `/tools/options-analyzer` - Options Flow AI Analyzer

## Технологии

- **React 18** - UI библиотека
- **React Router 6** - Роутинг
- **Axios** - HTTP клиент (для API)
- **CSS** - Стилизация (TailwindCSS-like утилиты)

## Цветовая схема

```css
--bg-primary: #0a0e1a      /* Фон страницы */
--bg-secondary: #1a1f2e    /* Фон header/footer */
--bg-card: #1e2433         /* Фон карточек */
--text-primary: #e5e7eb    /* Основной текст */
--text-secondary: #9ca3af  /* Вторичный текст */
--primary: #3b82f6         /* Акцентный цвет */
--success: #10b981         /* Успех */
--danger: #ef4444          /* Ошибка */
```

## API Integration

Backend API: `http://localhost:8000`

Proxy настроен в `package.json`:
```json
"proxy": "http://localhost:8000"
```

Endpoints:
- `POST /api/options/analyze?ticker=SPY` - Анализ опционов

## Следующие шаги

- [ ] Интеграция с Backend API
- [ ] Отображение метрик
- [ ] AI анализ в спойлере
- [ ] TradingView график
- [ ] Обработка ошибок
- [ ] Loading states
- [ ] Адаптивный дизайн

## Разработка

```bash
# Запустить с backend
# Terminal 1:
cd backend && source venv/bin/activate && uvicorn app.main:app --reload

# Terminal 2:
cd frontend && npm start
```
