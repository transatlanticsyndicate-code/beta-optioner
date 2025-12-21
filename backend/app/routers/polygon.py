from fastapi import APIRouter, HTTPException
from app.services.options_service import OptionsService
from app.services.polygon_client import PolygonClient

router = APIRouter(prefix="/api/polygon", tags=["polygon"])
options_service = OptionsService()
polygon_client = PolygonClient()

# УДАЛЕНО: Эндпоинт /ticker/{ticker} перенесён в main.py с rate limiting и кэшированием
# ЗАЧЕМ: Избежать дублирования и обеспечить единую точку входа с защитой от DoS

@router.get("/ticker/{ticker}/expirations")
async def get_ticker_expirations(ticker: str):
    try:
        expirations = options_service.get_option_expirations(ticker.upper())
        return {
            "status": "success",
            "ticker": ticker.upper(),
            "dates": expirations
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/ticker/{ticker}/options")
async def get_ticker_options(ticker: str, expiration_date: str = None):
    try:
        options = options_service.get_options_chain(ticker.upper(), expiration_date)
        return {
            "status": "success",
            "ticker": ticker.upper(),
            "options": options
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/ticker/{ticker}/option-details")
async def get_option_details(ticker: str, expiration_date: str, strike: float, option_type: str):
    """
    Получить детальную информацию (bid/ask/volume/oi) для конкретного опциона
    
    Parameters:
    - ticker: Тикер актива (например, AAPL)
    - expiration_date: Дата экспирации в формате YYYY-MM-DD
    - strike: Страйк цена
    - option_type: Тип опциона (CALL или PUT)
    """
    try:
        details = options_service.get_option_details(
            ticker.upper(), 
            expiration_date, 
            strike, 
            option_type.upper()
        )
        return {
            "status": "success",
            "ticker": ticker.upper(),
            "details": details
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/historical-data/{ticker}")
async def get_historical_data(ticker: str, period: str = "1mo", interval: str = "1h"):
    """
    Получить исторические данные (OHLC) для графика
    
    Parameters:
    - ticker: Тикер актива (например, SPY)
    - period: Период данных (1d, 5d, 1mo, 3mo, 6mo, 1y)
    - interval: Интервал свечей (1m, 5m, 15m, 30m, 1h, 1d)
    """
    try:
        data = polygon_client.get_historical_data(ticker.upper(), period, interval)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/current-price/{ticker}")
async def get_current_price(ticker: str):
    """
    Получить текущую цену тикера для обновления графика
    """
    try:
        price_data = polygon_client.get_stock_price(ticker.upper())
        return {
            "ticker": ticker.upper(),
            "price": price_data.get("price"),
            "timestamp": price_data.get("timestamp")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# IV SURFACE ENDPOINT
# ЗАЧЕМ: Загрузка IV для нескольких дат экспирации для точного прогнозирования
# ============================================================================

@router.get("/iv-surface/{ticker}")
async def get_iv_surface(ticker: str, num_expirations: int = 5):
    """
    Получить IV Surface для тикера — IV для нескольких дат экспирации
    ЗАЧЕМ: Для точного прогнозирования IV при симуляции времени
    
    Parameters:
    - ticker: Тикер актива (например, SPY)
    - num_expirations: Количество дат экспирации для загрузки (по умолчанию 5)
    
    Returns:
    - surface: Словарь { strike: { days_to_expiration: iv, ... }, ... }
    - expirations: Список загруженных дат экспирации
    - data_points: Общее количество точек данных
    """
    try:
        result = options_service.get_iv_surface(ticker.upper(), num_expirations)
        return {
            "status": "success",
            "ticker": ticker.upper(),
            **result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/dividend-yield/{ticker}")
async def get_dividend_yield(ticker: str):
    """
    Получить дивидендную доходность акции
    ЗАЧЕМ: Для модели Black-Scholes-Merton, которая учитывает дивиденды
    
    Parameters:
    - ticker: Тикер актива (например, AAPL)
    
    Returns:
    - dividend_yield: Дивидендная доходность в десятичном формате (0.0052 = 0.52%)
    - annual_dividend: Годовой дивиденд на акцию
    - last_dividend: Последний дивиденд
    - frequency: Частота выплат в год
    - ex_dividend_date: Дата последней ex-dividend
    """
    try:
        result = polygon_client.get_dividend_yield(ticker.upper())
        return {
            "status": "success",
            **result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
