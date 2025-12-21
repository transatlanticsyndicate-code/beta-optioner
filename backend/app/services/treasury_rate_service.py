"""
Сервис для получения безрисковой ставки (Risk-Free Rate) из FRED API
ЗАЧЕМ: Обеспечивает точный расчёт цен опционов по модели Black-Scholes

Источник: Federal Reserve Economic Data (FRED)
Серия: DGS3MO - 3-месячные Treasury Bills (стандарт для опционов)
"""

import os
import time
import requests
from typing import Optional
from functools import lru_cache

# Константы
FRED_BASE_URL = "https://api.stlouisfed.org/fred/series/observations"
TREASURY_SERIES_ID = "DGS3MO"  # 3-месячные Treasury Bills
CACHE_TTL_SECONDS = 3600  # Кэш на 1 час (ставка меняется редко)
DEFAULT_RATE = 0.045  # 4.5% - fallback если API недоступен

# Глобальный кэш для ставки
_rate_cache = {
    "rate": None,
    "timestamp": 0
}


def get_fred_api_key() -> Optional[str]:
    """
    Получить FRED API ключ из переменных окружения
    ЗАЧЕМ: Безопасное хранение ключа, не в коде
    """
    return os.getenv("FRED_API_KEY")


def fetch_treasury_rate_from_fred() -> Optional[float]:
    """
    Получить актуальную безрисковую ставку из FRED API
    ЗАЧЕМ: Точные данные от Federal Reserve для расчётов Black-Scholes
    
    Returns:
        float: Ставка в десятичном формате (0.045 = 4.5%) или None при ошибке
    """
    api_key = get_fred_api_key()
    
    if not api_key:
        print("⚠️ FRED_API_KEY не установлен, используем fallback ставку")
        return None
    
    try:
        params = {
            "series_id": TREASURY_SERIES_ID,
            "api_key": api_key,
            "file_type": "json",
            "limit": 1,
            "sort_order": "desc"  # Последнее значение первым
        }
        
        response = requests.get(FRED_BASE_URL, params=params, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        observations = data.get("observations", [])
        
        if observations:
            # FRED возвращает ставку в процентах (например, "4.52")
            rate_str = observations[0].get("value", "")
            
            # Проверка на "." - FRED иногда возвращает точку если данных нет
            if rate_str and rate_str != ".":
                rate_percent = float(rate_str)
                rate_decimal = rate_percent / 100  # Конвертируем в десятичный формат
                print(f"✅ FRED Treasury Rate: {rate_percent}% ({rate_decimal})")
                return rate_decimal
        
        print("⚠️ FRED API вернул пустые данные")
        return None
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Ошибка запроса к FRED API: {e}")
        return None
    except (ValueError, KeyError) as e:
        print(f"❌ Ошибка парсинга ответа FRED: {e}")
        return None


def get_risk_free_rate() -> float:
    """
    Получить безрисковую ставку с кэшированием
    ЗАЧЕМ: Минимизировать запросы к API, ставка обновляется раз в час
    
    Returns:
        float: Безрисковая ставка в десятичном формате (0.045 = 4.5%)
    """
    global _rate_cache
    
    current_time = time.time()
    
    # Проверяем кэш
    if _rate_cache["rate"] is not None:
        cache_age = current_time - _rate_cache["timestamp"]
        if cache_age < CACHE_TTL_SECONDS:
            return _rate_cache["rate"]
    
    # Запрашиваем новую ставку
    rate = fetch_treasury_rate_from_fred()
    
    if rate is not None:
        # Обновляем кэш
        _rate_cache["rate"] = rate
        _rate_cache["timestamp"] = current_time
        return rate
    
    # Если API недоступен, используем кэшированное значение или fallback
    if _rate_cache["rate"] is not None:
        print(f"⚠️ Используем кэшированную ставку: {_rate_cache['rate']}")
        return _rate_cache["rate"]
    
    print(f"⚠️ Используем fallback ставку: {DEFAULT_RATE}")
    return DEFAULT_RATE


def get_rate_info() -> dict:
    """
    Получить информацию о текущей ставке для отображения в UI
    ЗАЧЕМ: Прозрачность для пользователя - откуда взята ставка
    
    Returns:
        dict: {rate, source, updated_at}
    """
    global _rate_cache
    
    rate = get_risk_free_rate()
    
    # Определяем источник
    if _rate_cache["rate"] is not None and _rate_cache["timestamp"] > 0:
        source = "FRED API (3-Month Treasury Bill)"
        updated_at = _rate_cache["timestamp"]
    else:
        source = "Default fallback"
        updated_at = None
    
    return {
        "rate": rate,
        "rate_percent": round(rate * 100, 2),
        "source": source,
        "series_id": TREASURY_SERIES_ID,
        "updated_at": updated_at
    }
