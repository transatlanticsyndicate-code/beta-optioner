"""
API роутер для классификации акций по группам
ЗАЧЕМ: Предоставляет REST API для фронтенда калькулятора опционов
Затрагивает: NewTikerFinder, OptionsCalculatorBasic, UniversalOptionsCalculator

Эндпоинты:
- GET /api/stock/classify?symbol=AAPL — классификация акции
- GET /api/stock/groups — список доступных групп
"""

from fastapi import APIRouter, Query, HTTPException, Request
from typing import Optional

from slowapi.util import get_remote_address
from slowapi import Limiter

from app.services.stock_classifier import (
    classify_stock,
    get_stock_groups,
    get_group_multipliers,
    clear_cache
)

# ============================================================================
# КОНФИГУРАЦИЯ РОУТЕРА
# ============================================================================

router = APIRouter(prefix="/api/stock", tags=["stock-classifier"])

# Rate limiter для защиты от злоупотреблений
# ЗАЧЕМ: Finnhub имеет лимит 60 запросов/минуту
limiter = Limiter(key_func=get_remote_address)


# ============================================================================
# ЭНДПОИНТЫ
# ============================================================================

@router.get("/classify")
@limiter.limit("30/minute")
async def classify_stock_endpoint(
    request: Request,
    symbol: str = Query(..., min_length=1, max_length=10, description="Тикер акции")
):
    """
    Классифицирует акцию по группам и возвращает коэффициенты корректировки P&L
    ЗАЧЕМ: Фронтенд вызывает при выборе тикера для определения группы
    
    Args:
        symbol: Тикер акции (например, 'AAPL', 'SPOT', 'FRHC')
        
    Returns:
        {
            "symbol": "AAPL",
            "group": "stable",
            "down_mult": 1.0,
            "up_mult": 1.0,
            "label": "Стабильные",
            "description": "Large-cap акции с низкой волатильностью",
            "features": {
                "marketCap": 2800000000000,
                "beta": 1.15,
                "sector": "Technology",
                "daysToEarnings": 45,
                "avgVolume": 85000000
            },
            "cached": false
        }
    """
    try:
        # Очищаем и валидируем символ
        clean_symbol = symbol.upper().strip()
        
        if not clean_symbol.isalpha() and not clean_symbol.replace(".", "").isalpha():
            raise HTTPException(
                status_code=400,
                detail="Некорректный формат тикера"
            )
        
        # Классифицируем акцию
        result = await classify_stock(clean_symbol)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[stock_classifier_router] Ошибка классификации {symbol}: {e}")
        # Возвращаем fallback на growth группу
        # ЗАЧЕМ: Калькулятор должен работать даже при ошибках API
        return {
            "symbol": symbol.upper(),
            "group": "growth",
            "down_mult": 0.75,
            "up_mult": 0.9,
            "label": "Рост/События",
            "description": "Не удалось определить группу, используется значение по умолчанию",
            "features": {},
            "cached": False,
            "error": str(e)
        }


@router.get("/groups")
async def get_groups_endpoint():
    """
    Возвращает список всех доступных групп акций
    ЗАЧЕМ: Для отображения в UI селекторе групп
    
    Returns:
        {
            "stable": {
                "down_mult": 1.0,
                "up_mult": 1.0,
                "label": "Стабильные",
                "description": "Large-cap акции с низкой волатильностью"
            },
            "growth": {...},
            "illiquid": {...}
        }
    """
    return get_stock_groups()


@router.get("/multipliers")
async def get_multipliers_endpoint(
    group: str = Query(..., description="Название группы")
):
    """
    Возвращает коэффициенты корректировки для указанной группы
    ЗАЧЕМ: Для ручного переопределения группы в калькуляторе
    
    Args:
        group: Название группы ('stable', 'growth', 'illiquid')
        
    Returns:
        {
            "down_mult": 1.0,
            "up_mult": 1.0
        }
    """
    valid_groups = ["stable", "growth", "illiquid"]
    
    if group.lower() not in valid_groups:
        raise HTTPException(
            status_code=400,
            detail=f"Неизвестная группа. Доступные: {', '.join(valid_groups)}"
        )
    
    return get_group_multipliers(group.lower())


@router.post("/clear-cache")
@limiter.limit("5/minute")
async def clear_cache_endpoint(
    request: Request,
    symbol: Optional[str] = Query(None, description="Тикер для очистки (или все)")
):
    """
    Очищает кэш классификации
    ЗАЧЕМ: Для принудительного обновления данных при необходимости
    
    Args:
        symbol: Если указан — очищает только этот тикер, иначе весь кэш
        
    Returns:
        {"status": "ok", "cleared": "AAPL" | "all"}
    """
    clear_cache(symbol)
    
    return {
        "status": "ok",
        "cleared": symbol.upper() if symbol else "all"
    }
