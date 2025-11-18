"""
Options Router
API эндпоинты для работы с опционами
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from pydantic import BaseModel

from app.services.options_service import OptionsService

router = APIRouter(prefix="/api/options", tags=["options"])

# Инициализация сервиса
options_service = OptionsService()


class Position(BaseModel):
    """Модель опционной позиции"""
    strike: float
    type: str  # "call" или "put"
    expiration: str
    direction: str  # "buy" или "sell"
    size: int
    price: float
    commission: float = 0.65


class CalculatePLRequest(BaseModel):
    """Запрос на расчет P&L"""
    positions: List[Position]
    price_range: Optional[tuple] = None
    num_points: int = 200


@router.get("/expirations")
async def get_expirations(ticker: str = Query(..., description="Тикер акции")):
    """
    Получить доступные даты экспирации для тикера
    
    Args:
        ticker: Тикер акции (например, SPY)
        
    Returns:
        {
            "status": "success",
            "ticker": "SPY",
            "expirations": ["2024-10-18", "2024-10-25", ...]
        }
    """
    try:
        expirations = options_service.get_option_expirations(ticker.upper())
        
        return {
            "status": "success",
            "ticker": ticker.upper(),
            "expirations": expirations
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chain")
async def get_options_chain(
    ticker: str = Query(..., description="Тикер акции"),
    expiration_date: Optional[str] = Query(None, description="Дата экспирации (YYYY-MM-DD)")
):
    """
    Получить опционную цепочку для тикера
    
    Args:
        ticker: Тикер акции
        expiration_date: Дата экспирации (опционально)
        
    Returns:
        {
            "status": "success",
            "ticker": "SPY",
            "expiration_date": "2024-10-18",
            "options": [
                {
                    "strike": 432.5,
                    "type": "call",
                    "expiration": "2024-10-18",
                    "ticker": "O:SPY241018C00432500",
                    "price": 24.47,
                    "bid": 24.40,
                    "ask": 24.55,
                    "volume": 1234,
                    "open_interest": 5678,
                    "iv": 0.28
                },
                ...
            ]
        }
    """
    try:
        options = options_service.get_options_chain(
            ticker.upper(),
            expiration_date
        )
        
        return {
            "status": "success",
            "ticker": ticker.upper(),
            "expiration_date": expiration_date,
            "options": options
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/calculate-pl")
async def calculate_pl(request: CalculatePLRequest):
    """
    Рассчитать P&L для портфеля опционов
    
    Args:
        request: Данные позиций и параметры расчета
        
    Returns:
        {
            "status": "success",
            "prices": [400, 401, 402, ...],
            "pl_values": [-1000, -950, -900, ...],
            "breakeven_points": [435.15, 427.85],
            "max_profit": 1200,
            "max_loss": -800,
            "max_profit_price": 450,
            "max_loss_price": 420
        }
    """
    try:
        # Конвертируем Pydantic модели в dict
        positions = [pos.dict() for pos in request.positions]
        
        result = options_service.calculate_pl(
            positions,
            request.price_range,
            request.num_points
        )
        
        return {
            "status": "success",
            **result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
