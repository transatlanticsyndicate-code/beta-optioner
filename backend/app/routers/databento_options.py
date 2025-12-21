"""
Databento Options Router
API эндпоинты для работы с опционами на фьючерсы через Databento
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List

from app.services.databento_client import DatabentoClient

router = APIRouter(prefix="/api/databento", tags=["databento-options"])

databento_client = DatabentoClient()


@router.get("/futures/price")
async def get_futures_price(
    symbol: str = Query(..., description="Символ фьючерса (например, ESZ4)"),
    date: Optional[str] = Query(None, description="Дата в формате YYYY-MM-DD")
):
    """Получить цену фьючерса через Databento"""
    try:
        price_data = databento_client.get_futures_price(symbol, date)
        if price_data:
            return {
                "status": "success",
                "symbol": symbol,
                **price_data
            }
        else:
            return {
                "status": "not_found",
                "symbol": symbol,
                "message": "Цена не найдена"
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/options/expirations")
async def get_options_expirations(
    underlying: str = Query(..., description="Базовый актив (например, ES)")
):
    """Получить доступные даты экспирации опционов на фьючерсы"""
    try:
        expirations = databento_client.get_expirations(underlying)
        return {
            "status": "success",
            "underlying": underlying,
            "expirations": expirations
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/options/chain")
async def get_options_chain(
    underlying: str = Query(..., description="Базовый актив (например, ES)"),
    expiration: Optional[str] = Query(None, description="Дата экспирации (YYYY-MM-DD)")
):
    """Получить цепочку опционов на фьючерсы"""
    try:
        options = databento_client.get_options_chain(underlying, expiration)

        # Фильтрация по expiration если указана
        if expiration:
            options = [opt for opt in options if opt.get('expiration') == expiration.replace('-', '')]

        return {
            "status": "success",
            "underlying": underlying,
            "expiration": expiration,
            "options": options
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/options/price")
async def get_option_price(
    symbol: str = Query(..., description="Символ опциона (например, ESZ4 C4000)")
):
    """Получить цену опциона через Databento"""
    try:
        price_data = databento_client.get_option_price(symbol)
        if price_data:
            return {
                "status": "success",
                "symbol": symbol,
                **price_data
            }
        else:
            return {
                "status": "not_found",
                "symbol": symbol,
                "message": "Цена не найдена"
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
