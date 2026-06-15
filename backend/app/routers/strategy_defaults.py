"""
API роутер для общих «значений по умолчанию» стратегий «Север» и «Север GPT».

ЗАЧЕМ: дефолты экрана подбора (диапазон P&L, маржин, допуск, мин. доля акции,
дни до даты расчёта) теперь задаются в настройках сайта и хранятся на сервере
единым документом — одинаково на всех устройствах. Фронт держит локальный кэш
(localStorage) для синхронного чтения при открытии форм и пушит сюда изменения.

Auth: сейчас отключён глобально, кто знает ссылку — тот пишет.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.database import get_db
from app.models.strategy_default_setting import StrategyDefaultSetting

router = APIRouter(prefix="/api/strategy-defaults", tags=["strategy_defaults"])

_DOC_ID = "global"


# ===== Pydantic-модели =====

class StrategyDefaults(BaseModel):
    """Пять полей экрана подбора «Север GPT» (один набор: акции или крипта)."""
    plTolerance: float = Field(..., ge=0)
    margin: float = Field(..., ge=0)
    marginTolerance: float = Field(..., ge=0)
    minStockMarginPct: float = Field(..., ge=0, le=100)
    calcDays: int = Field(..., ge=0)


class StrategyDefaultsReplaceIn(BaseModel):
    """Полный документ — заменяет содержимое целиком (last-write-wins).

    Два независимых набора «Севера GPT»: для акций и для крипты.
    """
    stocks: StrategyDefaults
    crypto: StrategyDefaults


# ===== Эндпойнты =====

@router.get("/")
async def get_strategy_defaults(db: Session = Depends(get_db)):
    """Вернуть значения по умолчанию.

    data = null означает, что документ ещё не инициализирован — фронт в этом
    случае посеет его своим текущим набором (заводскими дефолтами) первым PUT'ом.
    """
    try:
        row = db.query(StrategyDefaultSetting).filter(
            StrategyDefaultSetting.id == _DOC_ID).first()
        return {"status": "success", "data": row.content if row else None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка чтения значений по умолчанию: {e}")


@router.put("/")
async def replace_strategy_defaults(
    payload: StrategyDefaultsReplaceIn,
    db: Session = Depends(get_db),
):
    """Заменить документ значений по умолчанию целиком."""
    try:
        content = payload.model_dump()
        row = db.query(StrategyDefaultSetting).filter(
            StrategyDefaultSetting.id == _DOC_ID).first()
        if row:
            row.content = content
        else:
            row = StrategyDefaultSetting(id=_DOC_ID, content=content)
            db.add(row)
        db.commit()
        return {"status": "success", "data": content}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка записи значений по умолчанию: {e}")
