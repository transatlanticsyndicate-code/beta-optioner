# Инструкция для коллег: файл `calibration_tickers.json`

## Что это за файл

Файл `calibration_tickers.json` содержит только список тикеров для серверной онлайн-калибровки.

Это отдельный рабочий файл для коллег.

Его задача простая:

- передать список тикеров для online scheduler
- не трогать другие server-файлы

## Где файл должен лежать на сервере

Файл должен лежать внутри серверной копии проекта по пути:

```text
backend/app/config/calibration_tickers.json
```

### Пример

Если проект на сервере развернут в:

```text
/opt/beta.optioner.online
```

то файл должен лежать здесь:

```text
/opt/beta.optioner.online/backend/app/config/calibration_tickers.json
```

## Какой формат нужен

```json
{
  "tickers": ["AAPL", "NVDA", "MSFT", "META"],
  "updated_at": "2026-03-09T20:52:00"
}
```

## Правила заполнения

- тикеры должны быть в верхнем регистре
- тикеры должны быть строками
- не добавлять комментарии внутрь JSON
- не оставлять лишние запятые
- если тикер не нужен, его нужно удалить из массива

## Минимальный рабочий пример

```json
{
  "tickers": ["AAPL", "NVDA", "MSFT"],
  "updated_at": null
}
```

## Что произойдет дальше

Когда online scheduler запустится по расписанию, backend прочитает тикеры именно из:

```text
backend/app/config/calibration_tickers.json
```

и будет калибровать этот список.

## Проверочный список

Перед scheduled run нужно убедиться, что:

- файл находится именно на сервере
- файл лежит по пути `backend/app/config/calibration_tickers.json`
- JSON валиден
- `tickers` заполнен
- тикеры указаны в верхнем регистре

## Краткий ответ

Если коллеги заранее обновили server-файл:

```text
backend/app/config/calibration_tickers.json
```

то online scheduler при следующем запуске возьмёт тикеры именно из него.
