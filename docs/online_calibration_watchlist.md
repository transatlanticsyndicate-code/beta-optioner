# Техническая инструкция: файл `calibration_watchlist.json`

## Что это за файл

Файл `calibration_watchlist.json` — это технический server config для онлайн-калибровки.

В нём хранятся:

- включение или отключение online scheduler
- пути к `ThetaTerminal` и `creds.txt`
- cleanup policy
- параметры режимов `standard`, `recent`, `weighted`
- cron-расписание

Список тикеров больше **не хранится** в этом файле.

Теперь тикеры лежат отдельно в:

```text
backend/app/config/calibration_tickers.json
```

## Где файл должен лежать на сервере

Файл должен лежать внутри серверной копии проекта по пути:

```text
backend/app/config/calibration_watchlist.json
```

### Пример

Если проект на сервере развернут в:

```text
/opt/beta.optioner.online
```

то файл должен лежать здесь:

```text
/opt/beta.optioner.online/backend/app/config/calibration_watchlist.json
```

## Минимальный рабочий пример

```json
{
  "enabled": true,
  "theta": {
    "jar_path": "/opt/theta/ThetaTerminalv3.jar",
    "creds_file": "/etc/optioner/creds.txt"
  },
  "cleanup": {
    "enabled": true,
    "auto_cleanup_after_run": true,
    "options_max_age_days": 45,
    "results_max_age_days": 90,
    "history_max_entries": 200,
    "delete_orphan_options": true,
    "delete_orphan_results": false
  },
  "modes": {
    "recent": {
      "enabled": true,
      "recent_days": 14,
      "hold_days": 7,
      "cron": [
        "0 16 * 1-3,11-12 *",
        "0 15 * 4-10 *"
      ]
    }
  }
}
```

## Полная рекомендуемая структура

```json
{
  "enabled": true,
  "theta": {
    "jar_path": "/opt/theta/ThetaTerminalv3.jar",
    "creds_file": "/etc/optioner/creds.txt"
  },
  "cleanup": {
    "enabled": true,
    "auto_cleanup_after_run": true,
    "options_max_age_days": 45,
    "results_max_age_days": 90,
    "history_max_entries": 200,
    "delete_orphan_options": true,
    "delete_orphan_results": false
  },
  "modes": {
    "standard": {
      "enabled": true,
      "months": 6,
      "hold_days": 14,
      "cron": [
        "0 16 1 1-3,11-12 *",
        "0 15 1 4-10 *"
      ]
    },
    "recent": {
      "enabled": true,
      "recent_days": 14,
      "hold_days": 7,
      "cron": [
        "0 16 * 1-3,11-12 *",
        "0 15 * 4-10 *"
      ]
    },
    "weighted": {
      "enabled": true,
      "months": 6,
      "hold_days": 14,
      "cron": [
        "0 16 * 1-3,11-12 0",
        "0 15 * 4-10 0"
      ]
    }
  },
  "updated_at": "2026-03-09T20:24:05.736913"
}
```

## Что означает каждый блок

### `enabled`

Глобальный переключатель online-калибровки.

- `true` — scheduler может запускать задания по расписанию
- `false` — scheduler не запускает online-калибровку

### `theta`

Пути на сервере:

- `jar_path` — путь к `ThetaTerminalv3.jar`
- `creds_file` — путь к `creds.txt`

### `cleanup`

Определяет, как сервер будет удалять старые неактуальные данные.

### `modes`

Содержит настройки режимов:

- `standard`
- `recent`
- `weighted`

## Откуда теперь берутся тикеры

Список тикеров для online scheduler читается не из этого файла, а из:

```text
backend/app/config/calibration_tickers.json
```

## Что нельзя путать

- `calibration_watchlist.json` — технические server-настройки
- `calibration_tickers.json` — только список тикеров

## Проверочный список

Перед scheduled run нужно убедиться, что:

- файл лежит именно на сервере
- файл находится по пути `backend/app/config/calibration_watchlist.json`
- `enabled = true`
- пути к `ThetaTerminalv3.jar` и `creds.txt` актуальны
- cron-расписание корректное
- backend действительно запущен с этим проектом

## Связанный файл

Для списка тикеров используйте отдельную инструкцию:

```text
docs/online_calibration_tickers.md
```
