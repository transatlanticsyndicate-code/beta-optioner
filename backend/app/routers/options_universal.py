"""
Роутер для Универсального Калькулятора Опционов
ЗАЧЕМ: API эндпоинты для работы с универсальным калькулятором (акции + фьючерсы)
Затрагивает: Frontend UniversalOptionsCalculator, TradingView Extension

Эндпоинты:
- POST /tradingview/receive - приём данных от TradingView Extension
- GET /tradingview/chain/{ticker} - получение опционной цепочки
- GET /tradingview/status - статус подключения к расширению
- POST /calculate/pl - расчёт P&L для позиций
- POST /calculate/curve - генерация кривой P&L
- POST /tradingview/mock/{ticker} - генерация тестовых данных
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Literal
from datetime import datetime

from app.services.tradingview_service import get_tradingview_service
from app.calculators import StocksPLCalculator, FuturesPLCalculator

router = APIRouter(prefix="/api/universal", tags=["Universal Calculator"])


# === Pydantic модели для запросов/ответов ===

class OptionsChainData(BaseModel):
    """Модель данных опционной цепочки от TradingView Extension"""
    ticker: str = Field(..., description="Тикер инструмента")
    underlying_price: Optional[float] = Field(None, alias="price")
    expirations: Optional[List[str]] = None
    options: Optional[List[Dict]] = None
    chain: Optional[List[Dict]] = None  # Альтернативное имя для options


class PositionData(BaseModel):
    """Модель данных одной опционной позиции"""
    option_type: Literal["call", "put"] = Field(..., description="Тип опциона")
    position_type: Literal["long", "short"] = Field(..., description="Направление позиции")
    strike: float = Field(..., description="Цена страйка")
    premium: float = Field(..., description="Премия опциона")
    quantity: int = Field(1, description="Количество контрактов")
    days_to_expiry: int = Field(30, description="Дней до экспирации")
    iv: float = Field(0.25, description="Implied Volatility")


class PLCalculationRequest(BaseModel):
    """Запрос на расчёт P&L"""
    mode: Literal["stocks", "futures"] = Field("stocks", description="Режим калькулятора")
    positions: List[PositionData] = Field(..., description="Список позиций")
    current_price: float = Field(..., description="Текущая цена базового актива")
    target_price: float = Field(..., description="Целевая цена")
    target_days: Optional[int] = Field(None, description="Целевое количество дней")
    point_value: Optional[float] = Field(None, description="Цена пункта (для фьючерсов)")
    risk_free_rate: float = Field(0.05, description="Безрисковая ставка")
    dividend_yield: float = Field(0.0, description="Дивидендная доходность (для акций)")


class PLCurveRequest(BaseModel):
    """Запрос на генерацию кривой P&L"""
    mode: Literal["stocks", "futures"] = Field("stocks", description="Режим калькулятора")
    positions: List[PositionData] = Field(..., description="Список позиций")
    current_price: float = Field(..., description="Текущая цена базового актива")
    price_range_percent: float = Field(0.2, description="Диапазон цен в процентах")
    num_points: int = Field(100, description="Количество точек")
    target_days: Optional[int] = Field(None, description="Целевое количество дней")
    point_value: Optional[float] = Field(None, description="Цена пункта (для фьючерсов)")
    risk_free_rate: float = Field(0.05, description="Безрисковая ставка")
    dividend_yield: float = Field(0.0, description="Дивидендная доходность")


class MockDataRequest(BaseModel):
    """Запрос на генерацию тестовых данных"""
    current_price: float = Field(..., description="Текущая цена")


# === Эндпоинты для TradingView Extension ===

@router.post("/tradingview/receive")
async def receive_tradingview_data(data: OptionsChainData):
    """
    Принять опционную цепочку от TradingView Extension
    ЗАЧЕМ: Основной эндпоинт для получения данных от браузерного расширения
    """
    service = get_tradingview_service()
    
    # Преобразуем Pydantic модель в dict
    data_dict = data.model_dump(by_alias=True)
    
    result = service.receive_options_chain(data.ticker, data_dict)
    
    if result['status'] == 'error':
        raise HTTPException(status_code=400, detail=result['error'])
    
    return result


@router.get("/tradingview/chain/{ticker}")
async def get_options_chain(ticker: str):
    """
    Получить опционную цепочку из кэша
    ЗАЧЕМ: Для использования в калькуляторе
    """
    service = get_tradingview_service()
    
    data = service.get_options_chain(ticker)
    
    if data is None:
        raise HTTPException(
            status_code=404,
            detail=f"Опционная цепочка для {ticker} не найдена. Отправьте данные через TradingView Extension."
        )
    
    return {
        'status': 'success',
        'data': data
    }


@router.get("/tradingview/expirations/{ticker}")
async def get_expirations(ticker: str):
    """
    Получить список дат экспирации
    ЗАЧЕМ: Для выбора экспирации в UI калькулятора
    """
    service = get_tradingview_service()
    
    expirations = service.get_expirations(ticker)
    
    return {
        'status': 'success',
        'ticker': ticker.upper(),
        'expirations': expirations
    }


@router.get("/tradingview/strikes/{ticker}/{expiration}")
async def get_strikes(ticker: str, expiration: str):
    """
    Получить список страйков для экспирации
    ЗАЧЕМ: Для выбора страйка в UI калькулятора
    """
    service = get_tradingview_service()
    
    strikes = service.get_strikes(ticker, expiration)
    
    return {
        'status': 'success',
        'ticker': ticker.upper(),
        'expiration': expiration,
        'strikes': strikes
    }


@router.get("/tradingview/quote/{ticker}/{expiration}/{strike}/{option_type}")
async def get_option_quote(
    ticker: str,
    expiration: str,
    strike: float,
    option_type: str
):
    """
    Получить котировку конкретного опциона
    ЗАЧЕМ: Для получения премии и Greeks при выборе опциона
    """
    service = get_tradingview_service()
    
    quote = service.get_option_quote(ticker, expiration, strike, option_type)
    
    if quote is None:
        raise HTTPException(
            status_code=404,
            detail=f"Опцион {ticker} {expiration} {strike} {option_type} не найден"
        )
    
    return {
        'status': 'success',
        'quote': quote
    }


@router.get("/tradingview/status")
async def get_tradingview_status():
    """
    Получить статус сервиса TradingView
    ЗАЧЕМ: Для отображения статуса подключения в UI
    """
    service = get_tradingview_service()
    return service.get_status()


@router.post("/tradingview/mock/{ticker}")
async def generate_mock_data(ticker: str, request: MockDataRequest):
    """
    Генерировать тестовые данные для разработки
    ЗАЧЕМ: Позволяет тестировать калькулятор без реального расширения
    """
    service = get_tradingview_service()
    
    data = service.generate_mock_data(ticker, request.current_price)
    
    return {
        'status': 'success',
        'message': f'Тестовые данные для {ticker} сгенерированы',
        'contracts_count': len(data.get('options', [])),
        'expirations': data.get('expirations', [])
    }


# === Эндпоинты для расчёта P&L ===

@router.post("/calculate/pl")
async def calculate_pl(request: PLCalculationRequest):
    """
    Рассчитать P&L для позиций
    ЗАЧЕМ: Основной эндпоинт для расчёта прибыли/убытка
    """
    # Выбираем калькулятор в зависимости от режима
    if request.mode == "stocks":
        calculator = StocksPLCalculator(
            risk_free_rate=request.risk_free_rate,
            dividend_yield=request.dividend_yield
        )
    else:  # futures
        point_value = request.point_value or 50  # По умолчанию ES
        calculator = FuturesPLCalculator(
            point_value=point_value,
            risk_free_rate=request.risk_free_rate
        )
    
    # Преобразуем позиции в формат калькулятора
    positions = [pos.model_dump() for pos in request.positions]
    
    # Рассчитываем P&L
    result = calculator.calculate_portfolio_pl(
        positions=positions,
        current_price=request.current_price,
        target_price=request.target_price,
        target_days=request.target_days
    )
    
    return {
        'status': 'success',
        'mode': request.mode,
        'result': result
    }


@router.post("/calculate/curve")
async def calculate_pl_curve(request: PLCurveRequest):
    """
    Генерировать кривую P&L
    ЗАЧЕМ: Для построения графика P&L в UI
    """
    # Выбираем калькулятор в зависимости от режима
    if request.mode == "stocks":
        calculator = StocksPLCalculator(
            risk_free_rate=request.risk_free_rate,
            dividend_yield=request.dividend_yield
        )
    else:  # futures
        point_value = request.point_value or 50
        calculator = FuturesPLCalculator(
            point_value=point_value,
            risk_free_rate=request.risk_free_rate
        )
    
    # Преобразуем позиции
    positions = [pos.model_dump() for pos in request.positions]
    
    # Генерируем кривую
    curve = calculator.generate_pl_curve(
        positions=positions,
        current_price=request.current_price,
        price_range_percent=request.price_range_percent,
        num_points=request.num_points,
        target_days=request.target_days
    )
    
    return {
        'status': 'success',
        'mode': request.mode,
        'curve': curve
    }


# === Вспомогательные эндпоинты ===

@router.get("/health")
async def health_check():
    """
    Проверка работоспособности API
    ЗАЧЕМ: Для мониторинга и диагностики
    """
    return {
        'status': 'ok',
        'service': 'Universal Options Calculator API',
        'timestamp': datetime.now().isoformat()
    }
