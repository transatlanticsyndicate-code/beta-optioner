"""
API роутер «Проверка сделки» (precheck) для окна «Подбор СЕВЕР GPT».
ЗАЧЕМ: тонкая авторизованная переотправка уже собранной конструкции во внешний
сервис news.optioner.online — ключ живёт только здесь, во фронтенд не попадает.
Вся оценка риска считается на стороне внешнего сервиса.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from app.services.deal_precheck_client import DealPrecheckClient

router = APIRouter(prefix="/api/deal", tags=["deal_precheck"])


class StrikeRanges(BaseModel):
    call: Optional[Dict[str, Any]] = None
    put: Optional[Dict[str, Any]] = None

    class Config:
        extra = "allow"


class CalculatorResult(BaseModel):
    margin_used: Optional[float] = None
    pnl_target: Optional[float] = None
    pnl_stop: Optional[float] = None

    class Config:
        extra = "allow"


class DealPrecheckRequest(BaseModel):
    ticker: str
    exchange: Optional[str] = None
    stock_price: Optional[float] = None
    entry_price: Optional[float] = None
    target_price: Optional[float] = None
    stop_price: Optional[float] = None
    calculation_day: Optional[int] = None
    margin_limit: Optional[float] = None
    margin_tolerance: Optional[float] = None
    allow_short_legs: Optional[bool] = False
    dte_short_blocks: Optional[bool] = False
    pnl_stop_tolerance: Optional[float] = None
    two_year_min: Optional[float] = None
    strike_ranges: Optional[StrikeRanges] = None
    calculator: Optional[CalculatorResult] = None
    legs: List[Dict[str, Any]] = []
    chain: Optional[List[Dict[str, Any]]] = None
    exit_plan: Optional[List[Dict[str, Any]]] = None
    include_news: Optional[bool] = True

    class Config:
        extra = "allow"


# ЗАЧЕМ: фабрика клиента вынесена отдельно, чтобы тесты могли подменить её мок-объектом
def get_precheck_client():
    return DealPrecheckClient()


@router.post("/precheck")
def precheck(req: DealPrecheckRequest):
    """
    Переслать собранную конструкцию на проверку риска во внешний сервис.
    Информационный вызов: при любом сбое возвращает {status:'unavailable', message},
    никогда не 500 — фронтенд должен показать конструкцию независимо от результата.
    """
    payload = req.model_dump(exclude_none=True)
    return get_precheck_client().precheck(payload)
