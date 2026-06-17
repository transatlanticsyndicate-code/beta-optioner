"""
API роутер для общих «значений по умолчанию» стратегий «Север» и «Север GPT».

ЗАЧЕМ: дефолты экрана подбора (диапазон P&L, маржин, допуск, мин. доля акции,
дни до даты расчёта) задаются в настройках сайта и хранятся на сервере единым
документом — одинаково на всех устройствах. Фронт держит локальный кэш для
синхронного чтения при открытии форм и пушит сюда изменения.

Это НЕ коллекция строк, а один документ, поэтому по-строчных операций тут нет.
Защита от потери данных — оптимистичная блокировка: GET отдаёт updatedAt (токен
версии), PUT требует expectedUpdatedAt. Если документ успели изменить другим
сохранением — возвращаем 409, фронт пере-синхронизируется и предлагает сохранить
заново. Токен сравниваем как непрозрачную строку (см. futures_settings.py).

Auth: сейчас отключён глобально, кто знает ссылку — тот пишет.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.database import get_db
from app.models.strategy_default_setting import StrategyDefaultSetting

router = APIRouter(prefix="/api/strategy-defaults", tags=["strategy_defaults"])

_DOC_ID = "global"


# ===== Pydantic-модели =====

class StrategyDefaults(BaseModel):
    """Пять полей экрана подбора «Север GPT» (один набор: акции, крипта или фьючерсы)."""
    plTolerance: float = Field(..., ge=0)
    margin: float = Field(..., ge=0)
    marginTolerance: float = Field(..., ge=0)
    minStockMarginPct: float = Field(..., ge=0, le=100)
    calcDays: int = Field(..., ge=0)


# Заводской набор — фолбэк для блока, отсутствующего в присланном документе
# (старые клиенты слали только stocks+crypto; futures появился позже).
_FACTORY_BLOCK = {
    "plTolerance": 200,
    "margin": 4000,
    "marginTolerance": 500,
    "minStockMarginPct": 40,
    "calcDays": 30,
}


class StrategyDefaultsReplaceIn(BaseModel):
    """Полный документ — три независимых набора «Севера GPT»: акции, крипта, фьючерсы.

    futures — необязательный (обратная совместимость со старыми клиентами).
    expectedUpdatedAt — токен версии для оптимистичной блокировки; опционален
    (None → проверка пропускается, например при первичном посеве).
    """
    stocks: StrategyDefaults
    crypto: StrategyDefaults
    futures: Optional[StrategyDefaults] = Field(default_factory=lambda: StrategyDefaults(**_FACTORY_BLOCK))
    expectedUpdatedAt: Optional[str] = None


def _token(row) -> Optional[str]:
    """Строковый токен версии документа из updated_at."""
    return row.updated_at.isoformat() if row and row.updated_at else None


# ===== Эндпойнты =====

@router.get("/")
async def get_strategy_defaults(db: Session = Depends(get_db)):
    """Вернуть значения по умолчанию + токен версии (updatedAt).

    data = null означает, что документ ещё не инициализирован — фронт в этом
    случае посеет его своим текущим набором первым PUT'ом.
    """
    try:
        row = db.query(StrategyDefaultSetting).filter(
            StrategyDefaultSetting.id == _DOC_ID).first()
        return {
            "status": "success",
            "data": row.content if row else None,
            "updatedAt": _token(row),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка чтения значений по умолчанию: {e}")


@router.put("/")
async def replace_strategy_defaults(
    payload: StrategyDefaultsReplaceIn,
    db: Session = Depends(get_db),
):
    """Заменить документ значений по умолчанию.

    Оптимистичная блокировка: если документ уже существует и expectedUpdatedAt
    прислан, но не совпадает с текущим токеном — 409 (кто-то сохранил раньше).
    """
    try:
        content = payload.model_dump(exclude={"expectedUpdatedAt"})
        row = db.query(StrategyDefaultSetting).filter(
            StrategyDefaultSetting.id == _DOC_ID).first()

        if row:
            if payload.expectedUpdatedAt is not None and _token(row) != payload.expectedUpdatedAt:
                raise HTTPException(
                    status_code=409,
                    detail={"code": "stale", "message": "Значения изменены другим пользователем"},
                )
            row.content = content
        else:
            row = StrategyDefaultSetting(id=_DOC_ID, content=content)
            db.add(row)

        db.commit()
        db.refresh(row)
        return {"status": "success", "data": content, "updatedAt": _token(row)}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка записи значений по умолчанию: {e}")
