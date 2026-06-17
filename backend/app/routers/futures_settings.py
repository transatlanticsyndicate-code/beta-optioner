"""
API роутер для общей таблицы настроек фьючерсов.

ЗАЧЕМ: До этого таблица жила в localStorage у каждого пользователя — разъезжалась
между устройствами и браузерами. Теперь сервер хранит единый список для всей
команды, любой пользователь правит, остальные подтягивают свежие данные.

Модель сохранения — ПО-СТРОЧНАЯ (POST/PUT/DELETE по одной записи), ключ = ticker.
ЗАЧЕМ так: раньше любая правка слала всю таблицу целиком (delete-all-then-insert,
last-write-wins). Клиент со старым кэшем затирал чужие правки и «воскрешал»
удалённые строки. По-строчные операции структурно исключают это: клиент трогает
только ту строку, которую реально менял.

Конкурентность: оптимистичная блокировка через updated_at. Клиент присылает
expectedUpdatedAt (строку, которую получил при загрузке) — если на сервере строка
уже изменилась, возвращаем 409, клиент пере-синхронизируется. Токен сравниваем
КАК НЕПРОЗРАЧНУЮ СТРОКУ (не парсим в datetime) — иначе на стыке SQLite/Postgres
ловим баги точности и таймзон.

Auth: сейчас отключён глобально в проекте, кто знает ссылку — тот пишет.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, Field

from app.database import get_db
from app.models.futures_setting import FuturesSetting

router = APIRouter(prefix="/api/futures-settings", tags=["futures_settings"])


# ===== Pydantic-модели =====

class FuturesSettingIn(BaseModel):
    """Одна запись фьючерса (создание)."""
    ticker: str = Field(..., min_length=1, max_length=16)
    name: str = Field(..., min_length=1, max_length=128)
    pointValue: float = Field(..., gt=0)
    marginPerContract: Optional[float] = Field(default=None, ge=0)


class FuturesSettingUpdate(FuturesSettingIn):
    """Обновление строки: те же поля + ожидаемый токен версии (updated_at).

    ticker в теле может отличаться от ticker в пути — это переименование.
    expectedUpdatedAt опционален: если не прислан, проверка конкурентности
    пропускается (форс-перезапись).
    """
    expectedUpdatedAt: Optional[str] = None


class FuturesSettingsReplaceIn(BaseModel):
    """Полный список — ТОЛЬКО для первичного посева пустой таблицы."""
    futures: List[FuturesSettingIn]


def _norm(ticker: str) -> str:
    """Нормализация тикера — единая для path и body, чтобы поиск и
    проверка переименования были устойчивы к регистру/пробелам."""
    return (ticker or "").strip().upper()


def _conflict(code: str, message: str):
    """409 с машиночитаемым кодом, чтобы фронт различал сценарии:
    stale (изменено другим), ticker_taken (тикер занят), duplicate (уже есть)."""
    raise HTTPException(status_code=409, detail={"code": code, "message": message})


# ===== Эндпойнты =====

@router.get("/")
async def list_futures_settings(db: Session = Depends(get_db)):
    """Вернуть все настройки фьючерсов."""
    try:
        rows = db.query(FuturesSetting).order_by(FuturesSetting.id).all()
        return {"status": "success", "data": [r.to_dict() for r in rows]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка чтения настроек фьючерсов: {e}")


@router.put("/")
async def seed_futures_settings(
    payload: FuturesSettingsReplaceIn,
    db: Session = Depends(get_db),
):
    """Первичный посев пустой таблицы целым списком.

    ВАЖНО: это НЕ замена «всей таблицы разом». Если таблица уже непуста —
    отказываем (409). ЗАЧЕМ: в окне деплоя старые кэшированные бандлы продолжат
    слать полный PUT — раньше это и воскрешало удалённые строки. Теперь такой
    запрос проходит только на холодный старт (таблица пуста), иначе игнорируется.
    """
    try:
        if db.query(FuturesSetting).count() > 0:
            _conflict("not_empty", "Таблица уже инициализирована — полная замена запрещена")

        tickers = [_norm(f.ticker) for f in payload.futures]
        if len(tickers) != len(set(tickers)):
            raise HTTPException(status_code=400, detail="В payload'е есть дубли по полю ticker")

        for f in payload.futures:
            db.add(FuturesSetting(
                ticker=_norm(f.ticker),
                name=f.name.strip(),
                point_value=f.pointValue,
                margin_per_contract=f.marginPerContract,
            ))
        db.commit()
        rows = db.query(FuturesSetting).order_by(FuturesSetting.id).all()
        return {"status": "success", "data": [r.to_dict() for r in rows]}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка посева настроек фьючерсов: {e}")


@router.post("/")
async def create_futures_setting(
    payload: FuturesSettingIn,
    db: Session = Depends(get_db),
):
    """Создать одну запись. 409 если тикер уже существует."""
    try:
        ticker = _norm(payload.ticker)
        if db.query(FuturesSetting).filter(FuturesSetting.ticker == ticker).first():
            _conflict("duplicate", f"Фьючерс {ticker} уже есть в списке")

        row = FuturesSetting(
            ticker=ticker,
            name=payload.name.strip(),
            point_value=payload.pointValue,
            margin_per_contract=payload.marginPerContract,
        )
        db.add(row)
        try:
            db.commit()
        except IntegrityError:
            # Гонка: между проверкой и commit кто-то создал тот же тикер.
            db.rollback()
            _conflict("duplicate", f"Фьючерс {ticker} уже есть в списке")
        db.refresh(row)
        return {"status": "success", "data": row.to_dict()}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка создания фьючерса: {e}")


@router.put("/{old_ticker}")
async def update_futures_setting(
    old_ticker: str,
    payload: FuturesSettingUpdate,
    db: Session = Depends(get_db),
):
    """Обновить одну запись (в т.ч. переименовать тикер).

    Порядок проверок: нет строки → 404; устаревший токен → 409 stale;
    переименование на уже существующий тикер → 409 ticker_taken.
    """
    try:
        old = _norm(old_ticker)
        new = _norm(payload.ticker)
        row = db.query(FuturesSetting).filter(FuturesSetting.ticker == old).first()
        if not row:
            raise HTTPException(status_code=404, detail=f"Фьючерс {old} не найден")

        # Оптимистичная блокировка: сравниваем токены строкой.
        if payload.expectedUpdatedAt is not None:
            current_token = row.updated_at.isoformat() if row.updated_at else None
            if current_token != payload.expectedUpdatedAt:
                _conflict("stale", "Запись изменена другим пользователем")

        # Переименование на занятый тикер — конфликт.
        if new != old and db.query(FuturesSetting).filter(FuturesSetting.ticker == new).first():
            _conflict("ticker_taken", f"Тикер {new} уже занят")

        row.ticker = new
        row.name = payload.name.strip()
        row.point_value = payload.pointValue
        row.margin_per_contract = payload.marginPerContract
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
        raise HTTPException(status_code=500, detail=f"Ошибка обновления фьючерса: {e}")


@router.delete("/{ticker}")
async def delete_futures_setting(ticker: str, db: Session = Depends(get_db)):
    """Удалить одну запись. Идемпотентно: если строки нет — это и есть нужный
    результат, возвращаем success (фронт не показывает ошибку)."""
    try:
        t = _norm(ticker)
        row = db.query(FuturesSetting).filter(FuturesSetting.ticker == t).first()
        if row:
            db.delete(row)
            db.commit()
        return {"status": "success", "deleted": t}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка удаления фьючерса: {e}")
