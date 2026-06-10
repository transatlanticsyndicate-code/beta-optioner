"""
Облачное состояние crypto: вход по паролю + чтение/запись единого JSON-документа.
ЗАЧЕМ: замена Supabase на нашу базу. Доступ закрыт токеном-пропуском.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Any

from app.database import get_db
from app.models.crypto_app_state import CryptoAppState
from app.services import crypto_auth

router = APIRouter(prefix="/crypto", tags=["crypto"])

_STATE_ID = "global"


class LoginRequest(BaseModel):
    password: str


class LoginResponse(BaseModel):
    token: str


class StateResponse(BaseModel):
    content: Optional[Any] = None


class StateSaveRequest(BaseModel):
    content: Any


def require_token(authorization: str = Header(default="")) -> None:
    """Зависимость: проверяет токен-пропуск из заголовка Authorization: Bearer <token>."""
    token = authorization.replace("Bearer ", "", 1).strip()
    if not token or not crypto_auth.verify_token(token):
        raise HTTPException(status_code=401, detail="Требуется вход")


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, request: Request):
    ip = request.client.host if request.client else "unknown"
    if crypto_auth.too_many_attempts(ip):
        raise HTTPException(status_code=429, detail="Слишком много попыток, подождите минуту")
    if not crypto_auth.verify_password(body.password):
        crypto_auth.record_attempt(ip)
        raise HTTPException(status_code=401, detail="Неверный пароль")
    return LoginResponse(token=crypto_auth.issue_token())


@router.get("/state", response_model=StateResponse, dependencies=[Depends(require_token)])
def get_state(db: Session = Depends(get_db)):
    row = db.query(CryptoAppState).filter(CryptoAppState.id == _STATE_ID).first()
    return StateResponse(content=row.content if row else None)


@router.put("/state", response_model=StateResponse, dependencies=[Depends(require_token)])
def save_state(body: StateSaveRequest, db: Session = Depends(get_db)):
    try:
        row = db.query(CryptoAppState).filter(CryptoAppState.id == _STATE_ID).first()
        if row:
            row.content = body.content
        else:
            row = CryptoAppState(id=_STATE_ID, content=body.content)
            db.add(row)
        db.commit()
        return StateResponse(content=body.content)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка сохранения: {e}")
