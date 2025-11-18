from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
import asyncio
import os

from app.database import get_db
from app.models.user import User, AuthLog
from app.services.telegram_auth import AuthService
from app.services.telegram_bot import TelegramBotService

router = APIRouter(prefix="/api/admin", tags=["admin"])


def get_auth_service(db: Session = Depends(get_db)) -> AuthService:
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    jwt_secret = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
    return AuthService(db, bot_token, jwt_secret)


def verify_admin(token: str = None, auth_service: AuthService = Depends(get_auth_service)) -> dict:
    """Проверяет что пользователь админ"""
    if not token:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    
    payload = auth_service.jwt_manager.verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Неверный или истекший токен")
    
    if payload.get('role') != 'admin':
        raise HTTPException(status_code=403, detail="Требуются права администратора")
    
    return payload


class UserApprovalResponse(BaseModel):
    """Ответ при одобрении/отклонении пользователя"""
    success: bool
    message: str
    user_id: int


@router.post("/users/{user_id}/approve", response_model=UserApprovalResponse)
async def approve_user(
    user_id: int,
    token: str = None,
    db: Session = Depends(get_db),
    auth_service: AuthService = Depends(get_auth_service),
    admin_payload: dict = Depends(verify_admin)
):
    """
    Одобрить пользователя
    
    Требует прав администратора
    """
    
    admin_id = admin_payload['sub']
    
    # Проверяем что пользователь существует
    user = auth_service.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    # Одобряем
    success = auth_service.approve_user(user_id, admin_id)
    
    if not success:
        raise HTTPException(status_code=400, detail="Не удалось одобрить пользователя")
    
    # Отправляем ссылку для авторизации пользователю через бота
    try:
        bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
        admin_tg_id = int(os.getenv("TELEGRAM_ADMIN_ID", 0))
        jwt_secret = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
        
        if bot_token and admin_tg_id:
            # Генерируем JWT токен для пользователя
            from app.services.telegram_auth import JWTManager
            jwt_manager = JWTManager(jwt_secret)
            token = jwt_manager.create_token(
                user_id=user.id,
                telegram_id=user.telegram_id,
                username=user.telegram_username or f"user_{user.telegram_id}",
                role=user.role
            )
            
            # Определяем URL сайта
            site_url = os.getenv("SITE_URL", "http://localhost:3000")
            
            bot_service = TelegramBotService(bot_token, admin_tg_id)
            asyncio.create_task(
                bot_service.on_user_approved(
                    user.telegram_id,
                    user.first_name or "Пользователь",
                    token=token,
                    site_url=site_url
                )
            )
    except Exception as e:
        print(f"Ошибка отправки уведомления: {e}")
    
    return UserApprovalResponse(
        success=True,
        message=f"Пользователь {user.telegram_username or user.first_name} одобрен",
        user_id=user_id
    )


@router.post("/users/{user_id}/reject", response_model=UserApprovalResponse)
async def reject_user(
    user_id: int,
    token: str = None,
    db: Session = Depends(get_db),
    auth_service: AuthService = Depends(get_auth_service),
    admin_payload: dict = Depends(verify_admin)
):
    """
    Отклонить пользователя
    
    Требует прав администратора
    """
    
    admin_id = admin_payload['sub']
    
    # Проверяем что пользователь существует
    user = auth_service.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    # Отклоняем
    success = auth_service.reject_user(user_id, admin_id)
    
    if not success:
        raise HTTPException(status_code=400, detail="Не удалось отклонить пользователя")
    
    # Отправляем уведомление пользователю
    try:
        bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
        admin_tg_id = int(os.getenv("TELEGRAM_ADMIN_ID", 0))
        
        if bot_token and admin_tg_id:
            bot_service = TelegramBotService(bot_token, admin_tg_id)
            asyncio.create_task(
                bot_service.on_user_rejected(
                    user.telegram_id,
                    user.first_name or "Пользователь"
                )
            )
    except Exception as e:
        print(f"Ошибка отправки уведомления: {e}")
    
    return UserApprovalResponse(
        success=True,
        message=f"Пользователь {user.telegram_username or user.first_name} отклонен",
        user_id=user_id
    )


class UserListResponse(BaseModel):
    """Информация о пользователе в списке"""
    id: int
    telegram_id: int
    telegram_username: str
    first_name: str
    status: str
    created_at: str
    
    class Config:
        from_attributes = True


@router.get("/users/pending", response_model=List[UserListResponse])
async def get_pending_users(
    token: str = None,
    db: Session = Depends(get_db),
    admin_payload: dict = Depends(verify_admin)
):
    """
    Получить список ожидающих одобрения пользователей
    
    Требует прав администратора
    """
    
    users = db.query(User).filter(User.status == 'pending').all()
    return users


@router.get("/users/all", response_model=List[UserListResponse])
async def get_all_users(
    token: str = None,
    db: Session = Depends(get_db),
    admin_payload: dict = Depends(verify_admin)
):
    """
    Получить список всех пользователей
    
    Требует прав администратора
    """
    
    users = db.query(User).all()
    return users
