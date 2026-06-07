"""
API роутер стратегии «Север GPT»
ЗАЧЕМ: библиотека промптов (CRUD) и эндпоинт ИИ-подбора опционных комбинаций
через ChatGPT. Аутентификации в проекте нет — промпты общие для всех.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from sqlalchemy import nullslast
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from app.database import get_db
from app.models.north_gpt_prompt import NorthGptPrompt
from app.services import north_gpt_validator as validator
from app.services.openai_client import OpenAIClient

router = APIRouter(prefix="/api/north-gpt", tags=["north_gpt"])


# ============ Pydantic: промпты ============
class PromptCreate(BaseModel):
    name: str
    text: str


class PromptUpdate(BaseModel):
    name: Optional[str] = None
    text: Optional[str] = None


# ============ CRUD библиотеки промптов ============
@router.get("/prompts")
def list_prompts(db: Session = Depends(get_db)):
    """
    Список промптов. Первым идёт последний использованный
    (last_used_at desc, NULL — в конце), затем по дате обновления.
    ЗАЧЕМ: фронтенд берёт первый элемент как активный по умолчанию.
    """
    items = (
        db.query(NorthGptPrompt)
        .order_by(
            nullslast(NorthGptPrompt.last_used_at.desc()),
            NorthGptPrompt.updated_at.desc(),
        )
        .all()
    )
    return {"status": "success", "data": [p.to_dict() for p in items]}


@router.post("/prompts")
def create_prompt(body: PromptCreate, db: Session = Depends(get_db)):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Название промпта не может быть пустым")
    if not (body.text or "").strip():
        raise HTTPException(status_code=400, detail="Текст промпта не может быть пустым")
    prompt = NorthGptPrompt(name=name, text=body.text)
    db.add(prompt)
    db.commit()
    db.refresh(prompt)
    return {"status": "success", "data": prompt.to_dict()}


@router.put("/prompts/{prompt_id}")
def update_prompt(prompt_id: str, body: PromptUpdate, db: Session = Depends(get_db)):
    prompt = db.query(NorthGptPrompt).filter(NorthGptPrompt.id == prompt_id).first()
    if not prompt:
        raise HTTPException(status_code=404, detail="Промпт не найден")
    if body.name is not None:
        new_name = body.name.strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Название промпта не может быть пустым")
        prompt.name = new_name
    if body.text is not None:
        prompt.text = body.text
    db.commit()
    db.refresh(prompt)
    return {"status": "success", "data": prompt.to_dict()}


@router.delete("/prompts/{prompt_id}")
def delete_prompt(prompt_id: str, db: Session = Depends(get_db)):
    prompt = db.query(NorthGptPrompt).filter(NorthGptPrompt.id == prompt_id).first()
    if not prompt:
        raise HTTPException(status_code=404, detail="Промпт не найден")
    db.delete(prompt)
    db.commit()
    return {"status": "success"}


@router.post("/prompts/{prompt_id}/touch")
def touch_prompt(prompt_id: str, db: Session = Depends(get_db)):
    """Отметить промпт как последний использованный (обновить last_used_at)."""
    prompt = db.query(NorthGptPrompt).filter(NorthGptPrompt.id == prompt_id).first()
    if not prompt:
        raise HTTPException(status_code=404, detail="Промпт не найден")
    prompt.last_used_at = func.now()
    db.commit()
    db.refresh(prompt)
    return {"status": "success", "data": prompt.to_dict()}


# ============ Pydantic: подбор комбинаций ============
class NorthGptParams(BaseModel):
    expirationDate: Optional[str] = None
    calcDate: Optional[str] = None
    topPrice: Optional[float] = None
    bottomPrice: Optional[float] = None
    callStrikeMin: Optional[float] = None
    callStrikeMax: Optional[float] = None
    putStrikeMin: Optional[float] = None
    putStrikeMax: Optional[float] = None
    plTolerance: Optional[float] = None
    margin: Optional[float] = None
    marginTolerance: Optional[float] = None
    minStockMarginPct: Optional[float] = None

    class Config:
        extra = "allow"


class NorthGptContext(BaseModel):
    entryPrice: float
    assetQuantity: Optional[float] = None
    leverage: Optional[float] = 1.0
    currentPrice: Optional[float] = None
    calculatorMode: Optional[str] = None
    dividendYield: Optional[float] = None
    ticker: Optional[str] = None

    class Config:
        extra = "allow"


class NorthGptSelectRequest(BaseModel):
    params: NorthGptParams
    prompt: str = ""
    chain: List[Dict[str, Any]] = []
    context: NorthGptContext
    promptId: Optional[str] = None


# ЗАЧЕМ: фабрика клиента вынесена отдельно, чтобы тесты могли подменить её мок-объектом
def get_openai_client():
    return OpenAIClient()


def _friendly_openai_error(e):
    """Понятное русское сообщение по типу ошибки OpenAI."""
    name = type(e).__name__
    msg = str(e)
    low = msg.lower()
    if name == "AuthenticationError" or "api key" in low or "OPENAI_API_KEY" in msg:
        return "ChatGPT не настроен: отсутствует или неверный ключ API"
    if name == "APITimeoutError" or "timeout" in low or "timed out" in low:
        return "ChatGPT не ответил вовремя, попробуйте ещё раз"
    if name == "RateLimitError" or "rate limit" in low:
        return "Слишком много запросов к ChatGPT, подождите немного"
    return f"Ошибка ChatGPT: {msg}"


def _filter_chain(chain, expiration):
    """Оставить только выбранную экспирацию (защита, фронт уже фильтрует)."""
    out = []
    for row in chain or []:
        d = row.get("date")
        if expiration and d and d != expiration:
            continue
        out.append(row)
    return out


def _compact_chain(chain):
    """Компактная цепочка для промпта (меньше токенов): модели не нужны греки кроме delta."""
    compact = []
    for row in chain:
        compact.append({
            "type": (row.get("type") or "").upper(),
            "strike": row.get("strike"),
            "bid": row.get("bid"),
            "ask": row.get("ask"),
            "iv": row.get("impliedVolatility", row.get("iv")),
            "delta": row.get("delta"),
        })
    return compact


def _build_block(combo, chain_index, ranges, context):
    """Собрать один блок ответа: валидация ног + стоимость + режим."""
    combo = combo or {}
    rationale = combo.get("rationale", "")
    res = validator.validate_combination(
        legs=combo.get("legs", []),
        stock_quantity=combo.get("stock_quantity", 0),
        chain_index=chain_index, ranges=ranges)
    if not res["positions"]:
        return {"error": "ChatGPT не собрал валидную комбинацию из доступных страйков",
                "rationale": rationale}
    cost = validator.compute_cost(
        res["positions"], res["qtyStock"],
        context.get("entryPrice"), context.get("leverage", 1.0))
    kind = "withStock" if res["qtyStock"] > 0 else "optionsOnly"
    return {"kind": kind, "positions": res["positions"], "calls": res["calls"],
            "puts": res["puts"], "qtyStock": res["qtyStock"], "cost": cost,
            "rationale": rationale}


@router.post("/select")
def select(req: NorthGptSelectRequest, db: Session = Depends(get_db)):
    """
    Подобрать две комбинации через ChatGPT и проверить их по реальной цепочке.
    Возвращает {status, withAsset, optionsOnly} или {status:'error', error}.
    """
    try:
        p = req.params
        ranges = {"call": (p.callStrikeMin, p.callStrikeMax),
                  "put": (p.putStrikeMin, p.putStrikeMax)}
        ctx = req.context.model_dump()
        full_chain = _filter_chain(req.chain, p.expirationDate)
        idx = validator.build_chain_index(full_chain, ctx.get("entryPrice"))
        compact = _compact_chain(full_chain)
        # ЗАЧЕМ: даём модели позиционный контекст (вход, текущая цена, плечо).
        # Без них ИИ не может корректно считать P&L всей позиции на низу и
        # подобрать размер акции. Тикер намеренно НЕ передаём (обезличенность).
        constraints = p.model_dump()
        constraints["entryPrice"] = ctx.get("entryPrice")
        constraints["currentPrice"] = ctx.get("currentPrice")
        constraints["leverage"] = ctx.get("leverage")
        result = get_openai_client().select_combinations(
            req.prompt, constraints, compact)
        response = {
            "status": "success",
            "withAsset": _build_block(result.get("with_asset"), idx, ranges, ctx),
            "optionsOnly": _build_block(result.get("options_only"), idx, ranges, ctx),
        }
        # отметить выбранный промпт как последний использованный (единый для всех)
        if req.promptId:
            prompt = db.query(NorthGptPrompt).filter(
                NorthGptPrompt.id == req.promptId).first()
            if prompt:
                prompt.last_used_at = func.now()
                db.commit()
        return response
    except Exception as e:
        return {"status": "error", "error": _friendly_openai_error(e)}
