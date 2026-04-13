"""
Роутер для получения данных волатильности с barchart.com
ЗАЧЕМ: API эндпоинт для блока волатильности в Универсальном Калькуляторе
"""

from fastapi import APIRouter, HTTPException
from app.services.barchart_client import BarchartClient

router = APIRouter(prefix="/api/barchart", tags=["barchart"])
barchart_client = BarchartClient()


@router.get("/volatility/{ticker}")
async def get_volatility_metrics(ticker: str):
    """
    Получить метрики волатильности для тикера с barchart.com

    Возвращает: IV, HV, IV Rank, IV Percentile, 5D IV Avg, 1M IV Avg
    """
    try:
        result = barchart_client.get_volatility_metrics(ticker.upper())

        if not result:
            raise HTTPException(
                status_code=404,
                detail=f"Данные волатильности для {ticker.upper()} не найдены"
            )

        return {
            "status": "success",
            "ticker": ticker.upper(),
            **result
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
