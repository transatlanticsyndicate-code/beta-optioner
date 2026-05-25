"""
API роутер для общей таблицы настроек ETF.

ЗАЧЕМ: Сервер хранит единый для всей команды список ETF (тикер + название).
По наличию тикера в этой таблице фронт определяет, что инструмент — ETF,
и применяет соответствующее визуальное оформление (синий бейдж).
Любой пользователь правит список — остальные подтягивают свежие данные
на загрузке страницы.

Auth: сейчас отключён глобально в проекте, кто знает ссылку — тот пишет.
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.database import get_db
from app.models.etf_setting import EtfSetting

router = APIRouter(prefix="/api/etf-settings", tags=["etf_settings"])


# ===== Pydantic-модели =====

class EtfSettingIn(BaseModel):
    """Одна запись ETF в payload'е PUT."""
    ticker: str = Field(..., min_length=1, max_length=16)
    name: str = Field(..., min_length=1, max_length=128)


class EtfSettingsReplaceIn(BaseModel):
    """Полный список ETF — заменяет содержимое таблицы целиком."""
    etfs: List[EtfSettingIn]


# ===== Эндпойнты =====

@router.get("/")
async def list_etf_settings(db: Session = Depends(get_db)):
    """Вернуть все настройки ETF.

    Пустой массив data — значит таблица не инициализирована. Фронт в этом
    случае пушит сюда содержимое своего localStorage первым PUT'ом.
    """
    try:
        rows = db.query(EtfSetting).order_by(EtfSetting.id).all()
        return {
            "status": "success",
            "data": [r.to_dict() for r in rows],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка чтения настроек ETF: {e}")


@router.put("/")
async def replace_etf_settings(
    payload: EtfSettingsReplaceIn,
    db: Session = Depends(get_db),
):
    """Заменить весь список ETF целиком.

    Простой last-write-wins: входящий массив становится новым содержимым таблицы.
    Используется как для первичного посева (фронт пушит свой localStorage),
    так и для последующих правок.
    """
    try:
        # ticker должен быть уникальным в payload'е — иначе UNIQUE-индекс упадёт
        tickers = [e.ticker.strip().upper() for e in payload.etfs]
        if len(tickers) != len(set(tickers)):
            raise HTTPException(
                status_code=400,
                detail="В payload'е есть дубли по полю ticker"
            )

        # Стираем старое содержимое и пишем новое. Целостность важнее производительности —
        # таблица маленькая, это десятки миллисекунд.
        db.query(EtfSetting).delete()
        for e in payload.etfs:
            db.add(EtfSetting(
                ticker=e.ticker.strip().upper(),
                name=e.name.strip(),
            ))
        db.commit()

        # Возвращаем актуальное состояние таблицы (с присвоенными id и updated_at)
        rows = db.query(EtfSetting).order_by(EtfSetting.id).all()
        return {
            "status": "success",
            "data": [r.to_dict() for r in rows],
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка записи настроек ETF: {e}")
