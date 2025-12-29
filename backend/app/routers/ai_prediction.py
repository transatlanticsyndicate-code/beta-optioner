from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
import logging

from app.services.ai_prediction_service import ai_service

router = APIRouter(
    prefix="/api/ai",
    tags=["AI Prediction"]
)

logger = logging.getLogger(__name__)

class PredictionRequest(BaseModel):
    ticker: str = Field(..., description="Тикер актива, например AAPL")
    type: str = Field(..., description="Тип опциона: CALL или PUT")
    stockPrice: float = Field(..., description="Цена базового актива (Target Price)")
    strike: float = Field(..., description="Страйк опциона")
    ttm: float = Field(..., description="Время до экспирации в годах (Time To Maturity)")
    currentIv: float = Field(..., description="Текущая рыночная IV (используется как база)")

class PredictionResponse(BaseModel):
    success: bool
    iv: float
    used_ai: bool
    ticker: str

@router.post("/predict-iv", response_model=PredictionResponse)
async def predict_iv(request: PredictionRequest):
    """
    Прогнозирование Implied Volatility (IV) с помощью AI модели.
    Если модель недоступна или тикер не поддерживается, возвращает исходную IV.
    """
    try:
        # Валидация входных данных
        if request.stockPrice <= 0 or request.strike <= 0:
            return PredictionResponse(
                success=True,
                iv=request.currentIv,
                used_ai=False,
                ticker=request.ticker
            )

        # Вызов сервиса
        predicted_iv = await ai_service.predict_iv(
            ticker=request.ticker,
            type_str=request.type,
            stock_price=request.stockPrice,
            strike=request.strike,
            ttm=request.ttm,
            current_iv=request.currentIv
        )

        # Проверяем, использовался ли AI (если returned != currentIv или тикер поддерживается)
        # Технически predict_iv возвращает current_iv если AI не сработал.
        # Для флага used_ai проверим поддержку тикера
        is_supported = ai_service.is_ticker_supported(request.ticker)
        
        return PredictionResponse(
            success=True,
            iv=predicted_iv,
            used_ai=is_supported,
            ticker=request.ticker
        )

    except Exception as e:
        logger.error(f"Error in predict-iv endpoint: {e}")
        # Fallback на исходную IV при любой ошибке
        return PredictionResponse(
            success=False,
            iv=request.currentIv,
            used_ai=False,
            ticker=request.ticker
        )
