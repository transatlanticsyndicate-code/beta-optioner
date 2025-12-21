"""
IB Options Router
API эндпоинты для работы с опционами и ценами через IB Client Portal Gateway
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional, Dict, List

from app.services.ib_client import IBClient

router = APIRouter(prefix="/api/ib", tags=["ib-options"])

ib_client = IBClient()


@router.get("/stock/{ticker}")
async def get_stock_price(ticker: str):
    """Получить текущую цену тикера через IB"""
    try:
        data = ib_client.get_stock_price(ticker.upper())
        return {
            "status": "success",
            "ticker": ticker.upper(),
            **data,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/options/expirations")
async def get_option_expirations(
    ticker: str = Query(..., description="Тикер акции (например, SPY)")
):
    """Получить доступные даты экспирации опционов из IB (формат YYYY-MM-DD).
    
    Возвращает точные даты экспирации включая еженедельные опционы.
    """
    try:
        # Получаем точные даты в формате YYYYMMDD (20251121)
        raw_dates: List[str] = ib_client.get_expiration_dates(ticker.upper(), detailed=True) or []
        
        # Конвертируем в формат YYYY-MM-DD для фронтенда
        formatted_dates = []
        for date_str in raw_dates:
            if len(date_str) == 8:  # YYYYMMDD
                formatted = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}"
                formatted_dates.append(formatted)
        
        return {
            "status": "success",
            "ticker": ticker.upper(),
            "expirations": formatted_dates,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/options/chain")
async def get_options_chain(
    ticker: str = Query(..., description="Тикер акции"),
    expiration: str = Query(..., description="Дата экспирации в формате YYYY-MM-DD (например, 2025-11-21)"),
):
    """Получить опционную цепочку для тикера и даты экспирации через IB.

    Возвращает список опционов с ценами, объёмом и греками.
    """
    try:
        # Конвертируем YYYY-MM-DD в MMMYY для IB API
        from datetime import datetime
        
        # Парсим дату
        date_obj = datetime.strptime(expiration, "%Y-%m-%d")
        
        # Конвертируем в MMMYY (например, NOV25)
        month_names = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", 
                       "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
        month_code = month_names[date_obj.month - 1]
        year_code = str(date_obj.year)[-2:]  # Последние 2 цифры года
        ib_expiration = f"{month_code}{year_code}"
        
        options: List[Dict] = ib_client.get_options_chain(ticker.upper(), ib_expiration)
        
        # Фильтруем опционы по точной дате (maturityDate)
        # Конвертируем YYYY-MM-DD в YYYYMMDD для сравнения
        target_date = expiration.replace("-", "")
        
        filtered_options = []
        for opt in options:
            # Если у опциона есть maturityDate, проверяем его
            if opt.get('maturity_date') == target_date:
                filtered_options.append(opt)
        
        # Если фильтрация не дала результатов, возвращаем все опционы месяца
        if not filtered_options:
            filtered_options = options
        
        return {
            "status": "success",
            "ticker": ticker.upper(),
            "expiration": expiration,
            "options": filtered_options,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/options/details")
async def get_option_details(
    ticker: str = Query(..., description="Тикер акции"),
    expiration: str = Query(..., description="Код экспирации в формате MMMYY (например, NOV25)"),
    strike: float = Query(..., description="Страйк опциона"),
    option_type: str = Query(..., description="Тип опциона: CALL или PUT"),
):
    """Получить детальную информацию для конкретного опциона через IB.

    Для простоты сейчас строится на базе опционной цепочки за указанную экспирацию
    и выборки нужного страйка/типа. OI в IB-обвязке пока недоступен и возвращается как null.
    """
    try:
        options: List[Dict] = ib_client.get_options_chain(ticker.upper(), expiration)
        target_type = option_type.upper()

        match = None
        for opt in options:
            try:
                if opt.get("type", "").upper() == target_type and float(opt.get("strike", 0)) == float(strike):
                    match = opt
                    break
            except Exception:
                continue

        if not match:
            return {
                "status": "not_found",
                "ticker": ticker.upper(),
                "details": None,
            }

        details = {
            "strike": match.get("strike"),
            "type": match.get("type"),
            "bid": match.get("bid", 0.0),
            "ask": match.get("ask", 0.0),
            "premium": match.get("last", 0.0),
            "volume": match.get("volume", 0),
            "open_interest": None,
            "delta": match.get("delta"),
            "gamma": match.get("gamma"),
            "theta": match.get("theta"),
            "vega": match.get("vega"),
            "implied_volatility": match.get("iv"),
        }

        return {
            "status": "success",
            "ticker": ticker.upper(),
            "details": details,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
