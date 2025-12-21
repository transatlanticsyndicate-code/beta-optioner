"""
API эндпоинты для ML модели прогнозирования цен опционов
ЗАЧЕМ: Интерфейс между фронтендом и ML моделью (VAE + MLP Pricer)
Затрагивает: прогноз цен, построение Vol Surface, информация о модели
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/ml",
    tags=["ML Predictions"]
)


# ============== Pydantic Models ==============

class PredictPriceRequest(BaseModel):
    """
    Запрос на прогноз цены опциона
    ЗАЧЕМ: Валидация входных данных для ML модели
    """
    ticker: str = Field(..., description="Тикер базового актива (SPY, AAPL, etc.)")
    strike: float = Field(..., gt=0, description="Страйк опциона")
    expiration_date: str = Field(..., description="Дата экспирации (YYYY-MM-DD)")
    option_type: str = Field("call", description="Тип опциона: call или put")
    days_forward: Optional[int] = Field(0, ge=0, le=365, description="Через сколько дней прогнозируем")


class PredictPriceResponse(BaseModel):
    """
    Ответ с прогнозом цены
    ЗАЧЕМ: Структурированный ответ для фронтенда
    """
    status: str
    ticker: str
    strike: float
    expiration_date: str
    days_forward: int
    ml_predicted_price: Optional[float] = None
    bs_predicted_price: Optional[float] = None
    current_price: Optional[float] = None
    confidence: float = 0.0
    uncertainty: Optional[float] = None
    model_version: str = "v0.1.0"
    error: Optional[str] = None


class BuildSurfaceRequest(BaseModel):
    """
    Запрос на построение Volatility Surface
    ЗАЧЕМ: Визуализация и отладка Vol Surface
    """
    ticker: str = Field(..., description="Тикер базового актива")
    reference_date: Optional[str] = Field(None, description="Дата для расчёта (по умолчанию сегодня)")


class BuildSurfaceResponse(BaseModel):
    """
    Ответ с построенной поверхностью
    """
    status: str
    ticker: str
    reference_date: str
    surface_shape: List[int]
    k_grid: List[float]
    t_grid: List[float]
    surface_data: Optional[List[List[float]]] = None
    error: Optional[str] = None


class ModelInfoResponse(BaseModel):
    """
    Информация о ML модели
    """
    version: str
    is_loaded: bool
    device: str
    latent_dim: int
    surface_shape: List[int]
    architecture: str
    status: str


# ============== Endpoints ==============

@router.post("/predict-price", response_model=PredictPriceResponse)
async def predict_price(request: PredictPriceRequest):
    """
    Прогноз цены опциона с использованием ML модели
    ЗАЧЕМ: Основной эндпоинт для AI Калькулятора
    
    Возвращает:
    - ml_predicted_price: прогноз от ML модели
    - bs_predicted_price: прогноз от Black-Scholes (для сравнения)
    - current_price: текущая рыночная цена
    - confidence: уверенность модели (0-1)
    """
    logger.info(f"📥 ML predict-price: ticker={request.ticker}, strike={request.strike}, exp={request.expiration_date}, days_forward={request.days_forward}")
    
    try:
        from ml.inference.predictor import get_predictor
        import numpy as np
        
        predictor = get_predictor()
        
        # Пытаемся получить реальные данные из Polygon
        spot_price = None
        try:
            from app.services.polygon_client import PolygonClient
            polygon = PolygonClient()
            stock_data = polygon.get_stock_price(request.ticker.upper())
            spot_price = stock_data.get('price')
        except Exception as e:
            logger.warning(f"⚠️ Polygon недоступен: {e}")
        
        # Если Polygon недоступен — возвращаем ошибку (mock данные убраны)
        # ЗАЧЕМ: Используем только реальные рыночные данные для точных прогнозов
        if not spot_price:
            return PredictPriceResponse(
                status="error",
                ticker=request.ticker.upper(),
                strike=request.strike,
                expiration_date=request.expiration_date,
                days_forward=request.days_forward,
                error="Не удалось получить цену базового актива из Polygon API",
                model_version=predictor.model_version
            )
        
        # Рассчитываем дни до экспирации
        exp_date = datetime.strptime(request.expiration_date, "%Y-%m-%d")
        today = datetime.now()
        days_to_expiry = (exp_date - today).days
        
        if days_to_expiry <= 0:
            return PredictPriceResponse(
                status="error",
                ticker=request.ticker.upper(),
                strike=request.strike,
                expiration_date=request.expiration_date,
                days_forward=request.days_forward,
                error="Опцион уже истёк",
                model_version=predictor.model_version
            )
        
        # Получаем опционы с нескольких дат экспирации для построения Vol Surface
        # ЗАЧЕМ: Для интерполяции нужны точки с разными T (временами до экспирации)
        options_chain = []
        try:
            # Получаем доступные даты экспирации
            expiration_dates = polygon.get_expiration_dates(request.ticker.upper())
            
            # Берём первые 5 дат для разнообразия по T
            for exp_date in expiration_dates[:5]:
                try:
                    chain = polygon.get_options_chain(request.ticker.upper(), expiration_date=exp_date)
                    options_chain.extend(chain)
                except Exception as e:
                    logger.warning(f"⚠️ Ошибка получения опционов для {exp_date}: {e}")
                    continue
            
            logger.info(f"📊 Загружено {len(options_chain)} опционов для {request.ticker.upper()}")
        except Exception as e:
            logger.warning(f"⚠️ Не удалось получить опционную цепочку: {e}")
        
        # Строим реальную Volatility Surface из опционных данных
        surface = None
        if options_chain and spot_price:
            from ml.data.surface_builder import SurfaceBuilder
            builder = SurfaceBuilder()
            surface = builder.build_surface_from_chain(
                options_chain=options_chain,
                spot_price=spot_price,
                reference_date=datetime.now().strftime("%Y-%m-%d")
            )
        
        # Если не удалось построить surface — возвращаем ошибку
        if surface is None:
            return PredictPriceResponse(
                status="error",
                ticker=request.ticker.upper(),
                strike=request.strike,
                expiration_date=request.expiration_date,
                days_forward=request.days_forward,
                error="Недостаточно опционных данных для построения Vol Surface",
                model_version=predictor.model_version
            )
        
        # ML прогноз
        ml_result = predictor.predict_price(
            surface=surface,
            strike=request.strike,
            spot_price=spot_price,
            days_to_expiry=days_to_expiry,
            days_forward=request.days_forward
        )
        
        # Black-Scholes прогноз для сравнения
        bs_price = _calculate_black_scholes(
            spot_price=spot_price,
            strike=request.strike,
            days_to_expiry=days_to_expiry - request.days_forward,
            option_type=request.option_type
        )
        
        # Получаем реальную цену опциона из опционной цепочки
        # ЗАЧЕМ: Сравнение ML прогноза с рыночной ценой
        current_option_price = None
        if options_chain:
            for opt in options_chain:
                details = opt.get("details", {})
                if (details.get("strike_price") == request.strike and 
                    details.get("expiration_date") == request.expiration_date and
                    details.get("contract_type", "").lower() == request.option_type.lower()):
                    # Берём mid price
                    day_data = opt.get("day", {})
                    bid = day_data.get("close") or opt.get("last_quote", {}).get("bid")
                    ask = day_data.get("close") or opt.get("last_quote", {}).get("ask")
                    if bid and ask:
                        current_option_price = (bid + ask) / 2
                    elif bid:
                        current_option_price = bid
                    elif ask:
                        current_option_price = ask
                    break
        
        return PredictPriceResponse(
            status="success",
            ticker=request.ticker.upper(),
            strike=request.strike,
            expiration_date=request.expiration_date,
            days_forward=request.days_forward,
            ml_predicted_price=ml_result.get("predicted_price") if ml_result else None,
            bs_predicted_price=bs_price,
            current_price=current_option_price,
            confidence=ml_result.get("confidence", 0.0) if ml_result else 0.0,
            uncertainty=ml_result.get("uncertainty") if ml_result else None,
            model_version=predictor.model_version if predictor else "v0.1.0"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Ошибка прогноза: {e}")
        return PredictPriceResponse(
            status="error",
            ticker=request.ticker.upper(),
            strike=request.strike,
            expiration_date=request.expiration_date,
            days_forward=request.days_forward,
            error=str(e),
            model_version="v0.1.0"
        )


@router.get("/model-info", response_model=ModelInfoResponse)
async def get_model_info():
    """
    Получить информацию о ML модели
    ЗАЧЕМ: Отображение статуса модели в UI
    """
    try:
        from ml.inference.predictor import get_predictor
        
        predictor = get_predictor()
        info = predictor.get_model_info()
        
        return ModelInfoResponse(
            status="success",
            **info
        )
    except Exception as e:
        logger.error(f"❌ Ошибка получения информации о модели: {e}")
        return ModelInfoResponse(
            status="error",
            version="unknown",
            is_loaded=False,
            device="unknown",
            latent_dim=6,
            surface_shape=[41, 20],
            architecture="VAE + MLP Pricer"
        )


@router.post("/build-surface", response_model=BuildSurfaceResponse)
async def build_surface(request: BuildSurfaceRequest):
    """
    Построить Volatility Surface для тикера
    ЗАЧЕМ: Визуализация и отладка Vol Surface
    """
    try:
        from ml.inference.predictor import get_predictor
        from app.services.polygon_client import PolygonClient
        
        predictor = get_predictor()
        polygon = PolygonClient()
        
        # Дата
        reference_date = request.reference_date or datetime.now().strftime("%Y-%m-%d")
        
        # Получаем данные
        stock_data = polygon.get_stock_price(request.ticker.upper())
        spot_price = stock_data.get('price')
        
        if not spot_price:
            raise HTTPException(status_code=400, detail=f"Не удалось получить цену для {request.ticker}")
        
        options_chain = polygon.get_options_chain(request.ticker.upper())
        
        if not options_chain:
            raise HTTPException(status_code=400, detail=f"Нет опционных данных для {request.ticker}")
        
        # Строим surface
        surface = predictor.build_surface(options_chain, spot_price, reference_date)
        
        if surface is None:
            return BuildSurfaceResponse(
                status="error",
                ticker=request.ticker.upper(),
                reference_date=reference_date,
                surface_shape=[41, 20],
                k_grid=[],
                t_grid=[],
                error="Недостаточно данных для построения surface"
            )
        
        # Конвертируем в списки для JSON
        from ml.data.surface_builder import SurfaceBuilder
        builder = SurfaceBuilder()
        
        return BuildSurfaceResponse(
            status="success",
            ticker=request.ticker.upper(),
            reference_date=reference_date,
            surface_shape=list(surface.shape),
            k_grid=builder.k_grid.tolist(),
            t_grid=builder.t_grid.tolist(),
            surface_data=surface.tolist()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Ошибка построения surface: {e}")
        return BuildSurfaceResponse(
            status="error",
            ticker=request.ticker.upper(),
            reference_date=request.reference_date or datetime.now().strftime("%Y-%m-%d"),
            surface_shape=[41, 20],
            k_grid=[],
            t_grid=[],
            error=str(e)
        )


# ============== Helper Functions ==============

def _calculate_black_scholes(
    spot_price: float,
    strike: float,
    days_to_expiry: int,
    option_type: str = "call",
    volatility: float = 0.25,
    risk_free_rate: float = 0.045
) -> Optional[float]:
    """
    Расчёт цены опциона по Black-Scholes
    ЗАЧЕМ: Сравнение ML прогноза с классической моделью
    """
    try:
        import math
        from scipy.stats import norm
        
        if days_to_expiry <= 0:
            return None
        
        T = days_to_expiry / 365.0
        S = spot_price
        K = strike
        r = risk_free_rate
        sigma = volatility
        
        d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
        d2 = d1 - sigma * math.sqrt(T)
        
        if option_type.lower() == "call":
            price = S * norm.cdf(d1) - K * math.exp(-r * T) * norm.cdf(d2)
        else:
            price = K * math.exp(-r * T) * norm.cdf(-d2) - S * norm.cdf(-d1)
        
        return round(price, 4)
        
    except Exception as e:
        logger.warning(f"Ошибка расчёта Black-Scholes: {e}")
        return None


def _get_current_option_price(
    polygon,
    ticker: str,
    strike: float,
    expiration_date: str,
    option_type: str
) -> Optional[float]:
    """
    Получить текущую рыночную цену опциона
    ЗАЧЕМ: Сравнение прогноза с реальной ценой
    """
    try:
        # Формируем тикер опциона в формате Polygon
        # O:SPY250117C00450000
        exp_parts = expiration_date.split("-")
        exp_formatted = f"{exp_parts[0][2:]}{exp_parts[1]}{exp_parts[2]}"
        option_ticker = f"O:{ticker}{exp_formatted}{option_type[0].upper()}{int(strike * 1000):08d}"
        
        # Получаем данные
        data = polygon.get_option_quote(option_ticker)
        
        if data:
            # Берём mid price
            bid = data.get('bid', 0) or 0
            ask = data.get('ask', 0) or 0
            if bid > 0 and ask > 0:
                return round((bid + ask) / 2, 4)
            return data.get('last_price')
        
        return None
        
    except Exception as e:
        logger.warning(f"Ошибка получения цены опциона: {e}")
        return None
