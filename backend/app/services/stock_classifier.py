"""
Сервис классификации акций по группам для корректировки P&L прогнозов
ЗАЧЕМ: Разные типы акций ведут себя по-разному, требуют разных коэффициентов корректировки
Затрагивает: калькулятор опционов, расчёт P&L, прогнозирование

Группы:
- stable: Large-cap стабильные акции (AAPL, MSFT, JPM)
- growth: Growth/event-driven акции (SPOT, DUOL, ZS)
- illiquid: Неликвидные/высоковолатильные (FRHC, мелкие тикеры)
"""

import httpx
from typing import Dict, Optional, Any
from datetime import datetime, timedelta
import asyncio
import os
import json

# ============================================================================
# КОНСТАНТЫ И КОНФИГУРАЦИЯ
# ============================================================================

# Finnhub API ключ (тот же, что используется в finnhub_proxy.py)
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY", "d59oil1r01qgqlm1ilq0d59oil1r01qgqlm1ilqg")
FINNHUB_BASE_URL = "https://finnhub.io/api/v1"

# Путь к файлу настроек
SETTINGS_FILE = os.path.join(os.path.dirname(__file__), "..", "config", "stock_groups_settings.json")

# Кэш настроек (перезагружается при каждом вызове для актуальности)
_settings_cache: Optional[Dict] = None
_settings_cache_time: float = 0
SETTINGS_CACHE_TTL = 60  # Перечитывать файл раз в минуту


def _load_settings_from_file() -> Dict[str, Any]:
    """
    Загружает настройки из JSON файла
    ЗАЧЕМ: Позволяет менять настройки без перезапуска сервера
    """
    global _settings_cache, _settings_cache_time
    
    import time as time_module
    current_time = time_module.time()
    
    # Используем кэш если он свежий
    if _settings_cache and (current_time - _settings_cache_time) < SETTINGS_CACHE_TTL:
        return _settings_cache
    
    try:
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                _settings_cache = json.load(f)
                _settings_cache_time = current_time
                return _settings_cache
    except Exception as e:
        print(f"[stock_classifier] Ошибка загрузки настроек: {e}")
    
    # Возвращаем дефолтные значения если файл не найден
    return _get_default_settings()


def _get_default_settings() -> Dict[str, Any]:
    """Возвращает настройки по умолчанию"""
    return {
        "groups": {
            "stable": {
                "label": "Стабильные",
                "description": "Large-cap акции с низкой волатильностью",
                "multipliers": {"down": 1.0, "up": 1.0}
            },
            "growth": {
                "label": "Рост/События",
                "description": "Growth-акции, event-driven, высокая IV",
                "multipliers": {"down": 0.75, "up": 0.9}
            },
            "illiquid": {
                "label": "Неликвидные",
                "description": "Small-cap, низкий объём, высокий beta",
                "multipliers": {"down": 1.0, "up": 1.2}
            }
        },
        "thresholds": {
            "stable_min_cap": 100,
            "stable_max_beta": 1.2,
            "illiquid_max_cap": 5,
            "illiquid_min_beta": 2.0,
            "illiquid_max_volume": 2,
            "mega_cap_threshold": 50,
            "high_volume_threshold": 10,
            "earnings_proximity_days": 14,
            "event_driven_down_mult": 0.9,
            "event_driven_up_mult": 0.95
        }
    }


def get_stock_groups_config() -> Dict[str, Any]:
    """
    Получает конфигурацию групп акций из настроек
    ЗАЧЕМ: Единая точка доступа к настройкам групп
    """
    settings = _load_settings_from_file()
    groups = settings.get("groups", {})
    
    # Преобразуем формат для совместимости с остальным кодом
    result = {}
    for key, group in groups.items():
        multipliers = group.get("multipliers", {})
        result[key] = {
            "down_mult": multipliers.get("down", 1.0),
            "up_mult": multipliers.get("up", 1.0),
            "label": group.get("label", key),
            "description": group.get("description", "")
        }
    return result


def get_thresholds_config() -> Dict[str, Any]:
    """
    Получает пороги классификации из настроек
    ЗАЧЕМ: Единая точка доступа к порогам
    """
    settings = _load_settings_from_file()
    thresholds = settings.get("thresholds", {})
    
    # Конвертируем значения из UI формата (миллиарды/миллионы) в абсолютные
    return {
        "stable_min_cap": thresholds.get("stable_min_cap", 100) * 1_000_000_000,
        "stable_max_beta": thresholds.get("stable_max_beta", 1.2),
        "illiquid_max_cap": thresholds.get("illiquid_max_cap", 5) * 1_000_000_000,
        "illiquid_min_beta": thresholds.get("illiquid_min_beta", 2.0),
        "illiquid_max_volume": thresholds.get("illiquid_max_volume", 2) * 1_000_000,
        "mega_cap_threshold": thresholds.get("mega_cap_threshold", 50) * 1_000_000_000,
        "high_volume_threshold": thresholds.get("high_volume_threshold", 10) * 1_000_000,
        "earnings_proximity_days": thresholds.get("earnings_proximity_days", 14),
        "high_iv_threshold": thresholds.get("high_iv_threshold", 45),
        "event_driven_down_mult": thresholds.get("event_driven_down_mult", 0.9),
        "event_driven_up_mult": thresholds.get("event_driven_up_mult", 0.95),
    }


# Для обратной совместимости — динамические геттеры
def get_STOCK_GROUPS():
    return get_stock_groups_config()

def get_CLASSIFICATION_THRESHOLDS():
    return get_thresholds_config()

# Секторы, характерные для stable акций
# ВАЖНО: Используем точное совпадение, не подстроку
STABLE_SECTORS = [
    "consumer cyclical",
    "financial services",
    "healthcare",
    "consumer defensive",
    "industrials",
    "utilities",
    "basic materials",
    "energy"
]

# Секторы, характерные для growth акций (НЕ stable даже при low beta)
# ЗАЧЕМ: Technology и Communication Services — это growth по определению
GROWTH_SECTORS = [
    "technology",
    "communication services",
    "consumer discretionary"
]

# In-memory кэш для результатов классификации
# ЗАЧЕМ: Избегаем частых запросов к Finnhub API (лимит 60/мин)
_classification_cache: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 3600  # 1 час


# ============================================================================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ============================================================================

def _is_cache_valid(cache_entry: Dict) -> bool:
    """
    Проверяет, не истёк ли TTL кэша
    ЗАЧЕМ: Данные о компании меняются редко, кэшируем на 1 час
    """
    if not cache_entry or "timestamp" not in cache_entry:
        return False
    
    cache_time = cache_entry["timestamp"]
    now = datetime.now()
    return (now - cache_time).total_seconds() < CACHE_TTL_SECONDS


def _get_from_cache(symbol: str) -> Optional[Dict]:
    """
    Получает результат классификации из кэша
    ЗАЧЕМ: Минимизируем запросы к API
    """
    cache_key = symbol.upper()
    if cache_key in _classification_cache:
        entry = _classification_cache[cache_key]
        if _is_cache_valid(entry):
            return entry["data"]
    return None


def _save_to_cache(symbol: str, data: Dict) -> None:
    """
    Сохраняет результат классификации в кэш
    ЗАЧЕМ: Повторные запросы того же тикера берутся из кэша
    """
    cache_key = symbol.upper()
    _classification_cache[cache_key] = {
        "data": data,
        "timestamp": datetime.now()
    }


# ============================================================================
# FINNHUB API ФУНКЦИИ
# ============================================================================

async def _fetch_company_profile(symbol: str, client: httpx.AsyncClient) -> Optional[Dict]:
    """
    Получает профиль компании из Finnhub API
    ЗАЧЕМ: Содержит marketCap, sector, industry
    
    Эндпоинт: /stock/profile2?symbol=AAPL
    """
    try:
        url = f"{FINNHUB_BASE_URL}/stock/profile2"
        params = {"symbol": symbol, "token": FINNHUB_API_KEY}
        response = await client.get(url, params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            # Finnhub возвращает пустой объект {} если тикер не найден
            if data and data.get("ticker"):
                return data
        return None
    except Exception as e:
        print(f"[stock_classifier] Ошибка получения профиля {symbol}: {e}")
        return None


async def _fetch_basic_financials(symbol: str, client: httpx.AsyncClient) -> Optional[Dict]:
    """
    Получает финансовые метрики из Finnhub API
    ЗАЧЕМ: Содержит beta, 52-week volatility, volume
    
    Эндпоинт: /stock/metric?symbol=AAPL&metric=all
    """
    try:
        url = f"{FINNHUB_BASE_URL}/stock/metric"
        params = {"symbol": symbol, "metric": "all", "token": FINNHUB_API_KEY}
        response = await client.get(url, params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            return data.get("metric", {})
        return None
    except Exception as e:
        print(f"[stock_classifier] Ошибка получения метрик {symbol}: {e}")
        return None


async def _fetch_earnings_calendar(symbol: str, client: httpx.AsyncClient) -> Optional[int]:
    """
    Получает дни до следующего earnings из Finnhub API
    ЗАЧЕМ: Близость к earnings влияет на классификацию (growth)
    
    Эндпоинт: /calendar/earnings?symbol=AAPL
    """
    try:
        # Запрашиваем earnings на ближайшие 60 дней
        today = datetime.now()
        from_date = today.strftime("%Y-%m-%d")
        to_date = (today + timedelta(days=60)).strftime("%Y-%m-%d")
        
        url = f"{FINNHUB_BASE_URL}/calendar/earnings"
        params = {
            "symbol": symbol,
            "from": from_date,
            "to": to_date,
            "token": FINNHUB_API_KEY
        }
        response = await client.get(url, params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            earnings_list = data.get("earningsCalendar", [])
            
            if earnings_list:
                # Берём ближайшую дату earnings
                next_earnings = earnings_list[0].get("date")
                if next_earnings:
                    earnings_date = datetime.strptime(next_earnings, "%Y-%m-%d")
                    days_to_earnings = (earnings_date - today).days
                    return max(0, days_to_earnings)
        return None
    except Exception as e:
        print(f"[stock_classifier] Ошибка получения earnings {symbol}: {e}")
        return None


async def _fetch_quote(symbol: str, client: httpx.AsyncClient) -> Optional[Dict]:
    """
    Получает текущую котировку из Finnhub API
    ЗАЧЕМ: Содержит текущий объём торгов
    
    Эндпоинт: /quote?symbol=AAPL
    """
    try:
        url = f"{FINNHUB_BASE_URL}/quote"
        params = {"symbol": symbol, "token": FINNHUB_API_KEY}
        response = await client.get(url, params=params, timeout=10)
        
        if response.status_code == 200:
            return response.json()
        return None
    except Exception as e:
        print(f"[stock_classifier] Ошибка получения котировки {symbol}: {e}")
        return None


# ============================================================================
# ОСНОВНАЯ ЛОГИКА КЛАССИФИКАЦИИ
# ============================================================================

def _classify_by_features(features: Dict) -> Dict[str, Any]:
    """
    Определяет группу акции на основе её характеристик
    ЗАЧЕМ: Применяет критерии классификации к полученным данным
    
    Приоритет проверок:
    1. Illiquid (критично для защиты от неликвидных акций)
       - ИСКЛЮЧЕНИЕ: Mega-cap с высоким объёмом (TSLA, NVDA) не попадают в illiquid
    2. Stable (large-cap с низким beta)
    3. Growth (по умолчанию)
       - Event-driven усиление: если близко к earnings или высокая IV
    
    Args:
        features: Словарь с характеристиками акции
        
    Returns:
        Словарь с группой, коэффициентами и причиной:
        {"group": str, "down_mult": float, "up_mult": float, "reason": str}
    """
    market_cap = features.get("marketCap", 0) or 0
    beta = features.get("beta", 1.0) or 1.0
    sector = (features.get("sector", "") or "").lower()
    avg_volume = features.get("avgVolume", 0) or 0
    days_to_earnings = features.get("daysToEarnings")
    
    # Диагностическое логирование входных данных
    symbol = features.get("symbol", "UNKNOWN")
    print(f"[DEBUG] Classifying {symbol}: sector='{sector}', cap=${market_cap:,.0f}, beta={beta:.2f}")
    
    # Загружаем настройки из файла конфигурации
    thresholds = get_thresholds_config()
    stock_groups = get_stock_groups_config()
    
    # Форматирование для reason
    cap_b = market_cap / 1_000_000_000  # В миллиардах
    vol_m = avg_volume / 1_000_000       # В миллионах
    
    # ПРИОРИТЕТ 1: Tech-Growth (HUBS, ZS, DDOG и подобные)
    # ЗАЧЕМ: Tech-акции должны проверяться ПЕРВЫМИ, до illiquid
    # ВАЖНО: Пороги в JSON хранятся в миллиардах, конвертируем в доллары
    tech_growth_min_cap = thresholds.get("tech_growth_min_cap", 10) * 1_000_000_000
    tech_growth_max_cap = thresholds.get("tech_growth_max_cap", 200) * 1_000_000_000
    is_tech_sector = "technology" in sector
    is_tech_growth_cap = tech_growth_min_cap <= market_cap <= tech_growth_max_cap
    
    # Диагностическое логирование для отладки
    print(f"[DEBUG] Tech-Growth check: sector='{sector}', is_tech={is_tech_sector}, cap={cap_b:.1f}B, min={tech_growth_min_cap/1e9:.0f}B, max={tech_growth_max_cap/1e9:.0f}B, in_range={is_tech_growth_cap}")
    
    if is_tech_sector and is_tech_growth_cap:
        reason = f"tech-growth ({sector}, cap:{cap_b:.0f}B)"
        return {
            "group": "tech-growth",
            "down_mult": stock_groups.get("tech-growth", {}).get("down_mult", 0.75),
            "up_mult": stock_groups.get("tech-growth", {}).get("up_mult", 1.1),
            "reason": reason
        }
    
    # Mega-cap исключение для illiquid (TSLA, NVDA, COIN)
    # ЗАЧЕМ: Mega-cap с высоким объёмом не должны попадать в illiquid даже при высоком beta
    # ВАЖНО: Пороги в thresholds уже сконвертированы в абсолютные значения в get_thresholds_config()
    mega_cap_threshold = thresholds["mega_cap_threshold"]
    high_volume_threshold = thresholds["high_volume_threshold"]
    is_mega_cap = market_cap > mega_cap_threshold
    is_high_volume = avg_volume > high_volume_threshold
    
    # Проверка "истинной" неликвидности (высокий beta БЕЗ mega-cap защиты)
    is_truly_illiquid_by_beta = beta > thresholds["illiquid_min_beta"] and not is_mega_cap and not is_high_volume
    
    # Пороги для illiquid (уже в абсолютных значениях)
    illiquid_max_volume = thresholds["illiquid_max_volume"]
    illiquid_max_cap = thresholds["illiquid_max_cap"]
    
    # ПРИОРИТЕТ 2: Illiquid (проверяем после tech-growth)
    # ЗАЧЕМ: Неликвидные акции имеют непредсказуемое поведение
    # ВАЖНО: Исключаем tech-акции с капитализацией 10-200B из illiquid по объёму
    is_tech_growth_range = is_tech_sector and is_tech_growth_cap
    
    if (
        (avg_volume < illiquid_max_volume and not is_tech_growth_range) or
        market_cap < illiquid_max_cap or
        is_truly_illiquid_by_beta
    ):
        reason = f"vol:{vol_m:.1f}M cap:{cap_b:.1f}B beta:{beta:.2f}"
        return {
            "group": "illiquid",
            "down_mult": stock_groups.get("illiquid", {}).get("down_mult", 1.0),
            "up_mult": stock_groups.get("illiquid", {}).get("up_mult", 1.2),
            "reason": reason
        }
    
    # ПРИОРИТЕТ 3: Stable (все условия должны выполняться)
    # ЗАЧЕМ: Large-cap стабильные акции — наиболее предсказуемые
    # ВАЖНО: Порог уже в абсолютном значении
    stable_min_cap = thresholds["stable_min_cap"]
    is_large_cap = market_cap > stable_min_cap
    is_low_beta = beta < thresholds["stable_max_beta"]
    
    # Проверяем сектор: stable только если НЕ growth-сектор И входит в stable-секторы
    is_growth_sector = any(s in sector for s in GROWTH_SECTORS)
    is_stable_sector = any(s in sector for s in STABLE_SECTORS) and not is_growth_sector
    
    if is_large_cap and is_low_beta and is_stable_sector:
        reason = f"mega-cap stable sector ({sector})"
        return {
            "group": "stable",
            "down_mult": stock_groups.get("stable", {}).get("down_mult", 1.0),
            "up_mult": stock_groups.get("stable", {}).get("up_mult", 1.0),
            "reason": reason
        }
    
    # ПРИОРИТЕТ 4: Growth (по умолчанию)
    # ЗАЧЕМ: Всё остальное — growth/event-driven акции
    base_down = stock_groups.get("growth", {}).get("down_mult", 0.75)
    base_up = stock_groups.get("growth", {}).get("up_mult", 0.9)
    reason = "growth default"
    
    # Event-driven усиление (если близко к earnings)
    # ЗАЧЕМ: Перед earnings волатильность выше, нужна более агрессивная коррекция
    is_event_driven = False
    if days_to_earnings is not None and days_to_earnings <= thresholds["earnings_proximity_days"]:
        is_event_driven = True
        reason += f" +event(days:{days_to_earnings})"
    
    # Применяем event-driven множители
    if is_event_driven:
        down_mult = base_down * thresholds["event_driven_down_mult"]
        up_mult = base_up * thresholds["event_driven_up_mult"]
    else:
        down_mult = base_down
        up_mult = base_up
    
    return {
        "group": "growth",
        "down_mult": down_mult,
        "up_mult": up_mult,
        "reason": reason
    }


async def classify_stock(symbol: str) -> Dict[str, Any]:
    """
    Основная функция классификации акции
    ЗАЧЕМ: Определяет группу акции и возвращает коэффициенты корректировки
    
    Args:
        symbol: Тикер акции (например, 'AAPL')
        
    Returns:
        Словарь с результатом классификации:
        {
            "symbol": "AAPL",
            "group": "stable",
            "down_mult": 1.0,
            "up_mult": 1.0,
            "label": "Стабильные",
            "features": {...},
            "cached": False
        }
    """
    symbol = symbol.upper().strip()
    
    # Кэширование отключено — всегда запрашиваем свежие данные
    # ЗАЧЕМ: Классификация должна обновляться при изменении логики/порогов
    
    # Получаем данные из Finnhub API параллельно
    # ЗАЧЕМ: Минимизируем время ожидания
    async with httpx.AsyncClient() as client:
        profile_task = _fetch_company_profile(symbol, client)
        metrics_task = _fetch_basic_financials(symbol, client)
        earnings_task = _fetch_earnings_calendar(symbol, client)
        quote_task = _fetch_quote(symbol, client)
        
        profile, metrics, days_to_earnings, quote = await asyncio.gather(
            profile_task, metrics_task, earnings_task, quote_task
        )
    
    # Собираем features из полученных данных
    features = {
        "marketCap": profile.get("marketCapitalization", 0) * 1_000_000 if profile else 0,  # Finnhub возвращает в миллионах
        "beta": metrics.get("beta") if metrics else None,
        "sector": profile.get("finnhubIndustry", "") if profile else "",
        "avgVolume": metrics.get("10DayAverageTradingVolume", 0) * 1_000_000 if metrics else 0,  # В миллионах
        "daysToEarnings": days_to_earnings,
        "currentVolume": quote.get("v", 0) if quote else 0,
        "companyName": profile.get("name", "") if profile else "",
        "exchange": profile.get("exchange", "") if profile else "",
    }
    
    # Классифицируем по features (теперь возвращает словарь с group, down_mult, up_mult, reason)
    classification = _classify_by_features(features)
    group = classification["group"]
    
    # Получаем конфигурацию группы из настроек
    stock_groups = get_stock_groups_config()
    group_config = stock_groups.get(group, stock_groups.get("growth", {}))
    
    # Формируем результат
    # ВАЖНО: Используем коэффициенты из classification (могут быть модифицированы event-driven)
    result = {
        "symbol": symbol,
        "group": group,
        "down_mult": classification["down_mult"],
        "up_mult": classification["up_mult"],
        "label": group_config.get("label", "Unknown"),
        "description": group_config.get("description", ""),
        "reason": classification["reason"],  # Причина классификации для отладки
        "features": features,
        "cached": False
    }
    
    # Кэширование отключено
    # _save_to_cache(symbol, result)
    
    print(f"[stock_classifier] {symbol} → {group} ({classification['reason']}) down:{classification['down_mult']:.2f} up:{classification['up_mult']:.2f}")
    
    return result


def get_stock_groups() -> Dict[str, Dict]:
    """
    Возвращает список всех доступных групп акций
    ЗАЧЕМ: Для отображения в UI селекторе
    """
    return get_stock_groups_config()


def get_group_multipliers(group: str) -> Dict[str, float]:
    """
    Возвращает коэффициенты для указанной группы
    ЗАЧЕМ: Для применения корректировки P&L
    
    Args:
        group: Название группы ('stable', 'growth', 'illiquid')
        
    Returns:
        {'down_mult': float, 'up_mult': float}
    """
    stock_groups = get_stock_groups_config()
    if group in stock_groups:
        return {
            "down_mult": stock_groups[group]["down_mult"],
            "up_mult": stock_groups[group]["up_mult"]
        }
    # Fallback на growth
    return {
        "down_mult": stock_groups.get("growth", {}).get("down_mult", 0.75),
        "up_mult": stock_groups.get("growth", {}).get("up_mult", 0.9)
    }


def clear_cache(symbol: Optional[str] = None) -> None:
    """
    Очищает кэш классификации
    ЗАЧЕМ: Для принудительного обновления данных
    
    Args:
        symbol: Если указан — очищает только этот тикер, иначе весь кэш
    """
    global _classification_cache
    
    if symbol:
        cache_key = symbol.upper()
        if cache_key in _classification_cache:
            del _classification_cache[cache_key]
    else:
        _classification_cache = {}
