"""
API роутер для общей таблицы настроек фьючерсов.

ЗАЧЕМ: До этого таблица жила в localStorage у каждого пользователя — разъезжалась
между устройствами и браузерами. Теперь сервер хранит единый список для всей
команды, любой пользователь правит, остальные подтягивают свежие данные на
загрузке страницы.

Auth: сейчас отключён глобально в проекте, кто знает ссылку — тот пишет.
Когда вернём пользователей, добавим Depends(...) с проверкой роли.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.database import get_db
from app.models.futures_setting import FuturesSetting

router = APIRouter(prefix="/api/futures-settings", tags=["futures_settings"])


# ===== Pydantic-модели =====

class FuturesSettingIn(BaseModel):
    """Одна запись фьючерса в payload'е PUT."""
    ticker: str = Field(..., min_length=1, max_length=16)
    name: str = Field(..., min_length=1, max_length=128)
    pointValue: float = Field(..., gt=0)
    marginPerContract: Optional[float] = Field(default=None, ge=0)


class FuturesSettingsReplaceIn(BaseModel):
    """Полный список фьючерсов — заменяет содержимое таблицы целиком."""
    futures: List[FuturesSettingIn]


# ===== Эндпойнты =====

@router.get("/")
async def list_futures_settings(db: Session = Depends(get_db)):
    """Вернуть все настройки фьючерсов.

    Пустой массив data — значит таблица не инициализирована. Фронт в этом
    случае пушит сюда содержимое своего localStorage первым PUT'ом.
    """
    try:
        rows = db.query(FuturesSetting).order_by(FuturesSetting.id).all()
        return {
            "status": "success",
            "data": [r.to_dict() for r in rows],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка чтения настроек фьючерсов: {e}")


@router.put("/")
async def replace_futures_settings(
    payload: FuturesSettingsReplaceIn,
    db: Session = Depends(get_db),
):
    """Заменить весь список фьючерсов целиком.

    Простой last-write-wins: входящий массив становится новым содержимым таблицы.
    Используется как для первичного посева (фронт пушит свой localStorage),
    так и для последующих правок (любая правка на странице настроек пушит
    свежий массив целиком).
    """
    try:
        # ticker должен быть уникальным в payload'е — иначе UNIQUE-индекс упадёт
        tickers = [f.ticker.strip().upper() for f in payload.futures]
        if len(tickers) != len(set(tickers)):
            raise HTTPException(
                status_code=400,
                detail="В payload'е есть дубли по полю ticker"
            )

        # Стираем старое содержимое и пишем новое. Целостность важнее производительности —
        # таблица маленькая (~40 строк), это десятки миллисекунд.
        db.query(FuturesSetting).delete()
        for f in payload.futures:
            db.add(FuturesSetting(
                ticker=f.ticker.strip().upper(),
                name=f.name.strip(),
                point_value=f.pointValue,
                margin_per_contract=f.marginPerContract,
            ))
        db.commit()

        # Возвращаем актуальное состояние таблицы (с присвоенными id и updated_at)
        rows = db.query(FuturesSetting).order_by(FuturesSetting.id).all()
        return {
            "status": "success",
            "data": [r.to_dict() for r in rows],
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка записи настроек фьючерсов: {e}")
