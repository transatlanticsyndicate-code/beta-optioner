"""
API роутер для общей таблицы настроек ETF.

ЗАЧЕМ: Сервер хранит единый для всей команды список ETF (тикер + название).
По наличию тикера в этой таблице фронт определяет, что инструмент — ETF,
и применяет синий бейдж. Любой пользователь правит список — остальные подтягивают
свежие данные на загрузке страницы.

Модель сохранения — ПО-СТРОЧНАЯ (POST/PUT/DELETE по одной записи), ключ = ticker.
Оптимистичная блокировка через updated_at (см. подробности в futures_settings.py).
Раньше любая правка слала всю таблицу целиком и клиент со старым кэшем затирал
чужие правки / воскрешал удалённые строки — по-строчные операции это исключают.

Auth: сейчас отключён глобально в проекте, кто знает ссылку — тот пишет.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, Field

from app.database import get_db
from app.models.etf_setting import EtfSetting

router = APIRouter(prefix="/api/etf-settings", tags=["etf_settings"])


# ===== Pydantic-модели =====

class EtfSettingIn(BaseModel):
    """Одна запись ETF (создание)."""
    ticker: str = Field(..., min_length=1, max_length=16)
    name: str = Field(..., min_length=1, max_length=128)


class EtfSettingUpdate(EtfSettingIn):
    """Обновление строки: те же поля + ожидаемый токен версии (updated_at).
    ticker в теле может отличаться от пути — это переименование."""
    expectedUpdatedAt: Optional[str] = None


class EtfSettingsReplaceIn(BaseModel):
    """Полный список — ТОЛЬКО для первичного посева пустой таблицы."""
    etfs: List[EtfSettingIn]


def _norm(ticker: str) -> str:
    return (ticker or "").strip().upper()


def _conflict(code: str, message: str):
    raise HTTPException(status_code=409, detail={"code": code, "message": message})


# ===== Эндпойнты =====

@router.get("/")
async def list_etf_settings(db: Session = Depends(get_db)):
    """Вернуть все настройки ETF."""
    try:
        rows = db.query(EtfSetting).order_by(EtfSetting.id).all()
        return {"status": "success", "data": [r.to_dict() for r in rows]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка чтения настроек ETF: {e}")


@router.put("/")
async def seed_etf_settings(
    payload: EtfSettingsReplaceIn,
    db: Session = Depends(get_db),
):
    """Первичный посев пустой таблицы. Если таблица непуста — отказ (409).
    ЗАЧЕМ: гасит вектор «воскрешения» от старых кэшированных бандлов в окне деплоя
    (см. futures_settings.py)."""
    try:
        if db.query(EtfSetting).count() > 0:
            _conflict("not_empty", "Таблица уже инициализирована — полная замена запрещена")

        tickers = [_norm(e.ticker) for e in payload.etfs]
        if len(tickers) != len(set(tickers)):
            raise HTTPException(status_code=400, detail="В payload'е есть дубли по полю ticker")

        for e in payload.etfs:
            db.add(EtfSetting(ticker=_norm(e.ticker), name=e.name.strip()))
        db.commit()
        rows = db.query(EtfSetting).order_by(EtfSetting.id).all()
        return {"status": "success", "data": [r.to_dict() for r in rows]}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка посева настроек ETF: {e}")


@router.post("/")
async def create_etf_setting(payload: EtfSettingIn, db: Session = Depends(get_db)):
    """Создать одну запись. 409 если тикер уже существует."""
    try:
        ticker = _norm(payload.ticker)
        if db.query(EtfSetting).filter(EtfSetting.ticker == ticker).first():
            _conflict("duplicate", f"ETF {ticker} уже есть в списке")

        row = EtfSetting(ticker=ticker, name=payload.name.strip())
        db.add(row)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            _conflict("duplicate", f"ETF {ticker} уже есть в списке")
        db.refresh(row)
        return {"status": "success", "data": row.to_dict()}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка создания ETF: {e}")


@router.put("/{old_ticker}")
async def update_etf_setting(
    old_ticker: str,
    payload: EtfSettingUpdate,
    db: Session = Depends(get_db),
):
    """Обновить одну запись (в т.ч. переименовать). 404 → нет строки;
    409 stale → устаревший токен; 409 ticker_taken → тикер занят."""
    try:
        old = _norm(old_ticker)
        new = _norm(payload.ticker)
        row = db.query(EtfSetting).filter(EtfSetting.ticker == old).first()
        if not row:
            raise HTTPException(status_code=404, detail=f"ETF {old} не найден")

        if payload.expectedUpdatedAt is not None:
            current_token = row.updated_at.isoformat() if row.updated_at else None
            if current_token != payload.expectedUpdatedAt:
                _conflict("stale", "Запись изменена другим пользователем")

        if new != old and db.query(EtfSetting).filter(EtfSetting.ticker == new).first():
            _conflict("ticker_taken", f"Тикер {new} уже занят")

        row.ticker = new
        row.name = payload.name.strip()
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            _conflict("ticker_taken", f"Тикер {new} уже занят")
        db.refresh(row)
        return {"status": "success", "data": row.to_dict()}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка обновления ETF: {e}")


@router.delete("/{ticker}")
async def delete_etf_setting(ticker: str, db: Session = Depends(get_db)):
    """Удалить одну запись. Идемпотентно: нет строки → всё равно success."""
    try:
        t = _norm(ticker)
        row = db.query(EtfSetting).filter(EtfSetting.ticker == t).first()
        if row:
            db.delete(row)
            db.commit()
        return {"status": "success", "deleted": t}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка удаления ETF: {e}")
