#!/usr/bin/env python3

"""
Тестовый скрипт для подключения к Databento API
ЗАЧЕМ: Проверить API ключ и получить sample данные по опционам на фьючерсы
Затрагивает: Databento integration для калькулятора опционов
"""

import databento as db
from datetime import datetime, timedelta

# API ключ
API_KEY = 'db-8dab9P3JkpHg7YyVxjEKHveFetrac'

# Создаем клиент
client = db.Historical(API_KEY)

print("Подключение к Databento...")

# Получить список доступных датасетов
try:
    datasets = client.metadata.list_datasets()
    print(f"Доступные датасеты: {len(datasets)} шт.")
    print("Примеры:", datasets[:5])
except Exception as e:
    print(f"Ошибка получения датасетов: {e}")

# Получить список символов для GLBX.MDP3
try:
    schema_info = client.metadata.get_dataset_schema(dataset='GLBX.MDP3')
    print("Информация о схеме GLBX.MDP3:")
    print(schema_info)
except Exception as e:
    print(f"Ошибка получения схемы: {e}")

# Получить sample данные по CME futures/options
try:
    # Определения инструментов для опционов на ES futures
    data = client.timeseries.get_range(
        dataset='GLBX.MDP3',
        schema='definition',
        symbols=['ESZ4'],  # ES Dec 2024 futures
        start='2024-01-01T00:00:00Z',
        end='2024-01-02T00:00:00Z',
        limit=10
    )
    print("Определения инструментов:")
    print(data)
except Exception as e:
    print(f"Ошибка получения определений: {e}")

# Получить trades данные
try:
    data = client.timeseries.get_range(
        dataset='GLBX.MDP3',
        schema='trades',
        symbols=['ESZ4'],  # Конкретный контракт ES Dec 2024
        start='2024-01-01T00:00:00Z',
        end='2024-01-02T00:00:00Z',
        limit=5
    )
    print("Торговые данные:")
    print(data)
except Exception as e:
    print(f"Ошибка получения trades: {e}")

print("Тест завершен.")
