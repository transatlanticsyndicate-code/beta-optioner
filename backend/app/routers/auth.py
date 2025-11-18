from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import os
import asyncio

from app.database import get_db
from app.models.user import User
from app.services.telegram_auth import AuthService
from app.services.telegram_bot import TelegramBotService

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Инициализируем AuthService
def get_auth_service(db: Session = Depends(get_db)) -> AuthService:
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    jwt_secret = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
    return AuthService(db, bot_token, jwt_secret)


class TelegramAuthRequest(BaseModel):
    """Данные от Telegram Login Widget"""
    id: int
    first_name: str
    last_name: Optional[str] = None
    username: Optional[str] = None
    photo_url: Optional[str] = None
    auth_date: int
    hash: str


class AuthResponse(BaseModel):
    """Ответ авторизации"""
    token: Optional[str] = None
    status: str  # 'approved', 'pending', 'rejected', 'error'
    user_id: Optional[int] = None
    message: str


class UserResponse(BaseModel):
    """Информация о пользователе"""
    id: int
    telegram_id: int
    telegram_username: Optional[str]
    first_name: Optional[str]
    last_name: Optional[str]
    photo_url: Optional[str]
    status: str
    role: str
    
    class Config:
        from_attributes = True


@router.post("/telegram", response_model=AuthResponse)
async def authenticate_telegram(
    auth_data: TelegramAuthRequest,
    request: Request,
    db: Session = Depends(get_db),
    auth_service: AuthService = Depends(get_auth_service)
):
    """
    Аутентификация через Telegram Login Widget
    
    Получает данные от Telegram и возвращает JWT токен или статус
    """
    
    # Получаем IP и User-Agent
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    # Конвертируем в словарь
    telegram_data = auth_data.model_dump()
    
    # DEBUG: Логируем полученные данные от Telegram
    print(f"🔍 Telegram Login данные:")
    print(f"  - ID: {auth_data.id}")
    print(f"  - First Name: {auth_data.first_name}")
    print(f"  - Last Name: {auth_data.last_name}")
    print(f"  - Username: {auth_data.username}")
    print(f"  - Photo URL: {auth_data.photo_url}")
    print(f"  - Auth Date: {auth_data.auth_date}")
    
    # Аутентифицируем
    token, status = auth_service.authenticate_telegram_user(
        telegram_data,
        ip_address=ip_address,
        user_agent=user_agent
    )
    
    # Получаем пользователя для ответа
    user = db.query(User).filter(User.telegram_id == auth_data.id).first()
    user_id = user.id if user else None
    
    # Если новый пользователь (pending) → отправляем уведомление боту
    if status == 'pending' and user:
        try:
            bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
            admin_id = int(os.getenv("TELEGRAM_ADMIN_ID", 0))
            
            if bot_token and admin_id:
                bot_service = TelegramBotService(bot_token, admin_id)
                # Отправляем уведомление админу асинхронно
                asyncio.create_task(
                    bot_service.on_new_user_registered(
                        user.telegram_id,
                        user.telegram_username or f"user_{user.telegram_id}",
                        user.first_name or "Пользователь",
                        user.last_name
                    )
                )
        except Exception as e:
            print(f"Ошибка отправки уведомления боту: {e}")
    
    # Формируем сообщение
    messages = {
        'approved': 'Авторизация успешна',
        'pending': 'Ожидание одобрения администратора',
        'rejected': 'Доступ запрещен',
        'error': 'Ошибка авторизации'
    }
    
    return AuthResponse(
        token=token,
        status=status,
        user_id=user_id,
        message=messages.get(status, 'Неизвестная ошибка')
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user(
    token: str = None,
    db: Session = Depends(get_db),
    auth_service: AuthService = Depends(get_auth_service)
):
    """
    Получить информацию о текущем пользователе
    
    Требует JWT токен в заголовке Authorization: Bearer <token>
    """
    
    if not token:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    
    # Проверяем токен
    payload = auth_service.jwt_manager.verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Неверный или истекший токен")
    
    # Получаем пользователя
    user = auth_service.get_user_by_id(payload['sub'])
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    # Проверяем статус пользователя
    if user.status != 'approved':
        if user.status == 'pending':
            raise HTTPException(status_code=403, detail="Ожидание модерации администратора")
        elif user.status == 'rejected':
            raise HTTPException(status_code=403, detail="Доступ запрещен администратором")
        else:
            raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    return user


@router.post("/logout")
async def logout(token: str = None):
    """
    Выход из системы
    
    На фронтенде нужно удалить JWT из localStorage
    """
    return {"message": "Успешный выход"}
