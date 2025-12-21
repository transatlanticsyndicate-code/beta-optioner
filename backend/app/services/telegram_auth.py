import hmac
import hashlib
import json
import os
from typing import Dict, Optional
from datetime import datetime, timedelta
import jwt
from sqlalchemy.orm import Session
from app.models.user import User, AuthLog


class TelegramAuthValidator:
    """Валидация данных от Telegram Login Widget"""
    
    def __init__(self, bot_token: str):
        self.bot_token = bot_token
    
    def validate_telegram_data(self, data: Dict) -> bool:
        """
        Валидирует подпись от Telegram
        
        Telegram отправляет:
        {
            "id": 123456789,
            "first_name": "John",
            "last_name": "Doe",
            "username": "johndoe",
            "photo_url": "https://...",
            "auth_date": 1234567890,
            "hash": "..."
        }
        """
        if 'hash' not in data:
            return False
        
        received_hash = data.pop('hash')
        
        # Создаем строку для проверки подписи
        data_check_string = '\n'.join(
            f"{k}={v}" for k, v in sorted(data.items())
        )
        
        # Вычисляем ожидаемый hash
        secret_key = hashlib.sha256(self.bot_token.encode()).digest()
        expected_hash = hmac.new(
            secret_key,
            data_check_string.encode(),
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(expected_hash, received_hash)
    
    def check_auth_date(self, auth_date: int, max_age_seconds: int = 86400) -> bool:
        """Проверяет что auth_date не старше max_age_seconds"""
        now = datetime.utcnow().timestamp()
        return (now - auth_date) < max_age_seconds


class JWTManager:
    """Управление JWT токенами"""
    
    def __init__(self, secret_key: str, algorithm: str = "HS256"):
        self.secret_key = secret_key
        self.algorithm = algorithm
        self.token_expiration_days = 30
    
    def create_token(self, user_id: int, telegram_id: int, username: str, role: str, first_name: str = "User", photo_url: str = None) -> str:
        """Создает JWT токен"""
        payload = {
            "sub": user_id,
            "telegram_id": telegram_id,
            "username": username,
            "first_name": first_name,
            "role": role,
            "photo_url": photo_url,
            "exp": datetime.utcnow() + timedelta(days=self.token_expiration_days),
            "iat": datetime.utcnow()
        }
        return jwt.encode(payload, self.secret_key, algorithm=self.algorithm)
    
    def verify_token(self, token: str) -> Optional[Dict]:
        """Проверяет и декодирует JWT токен"""
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            return payload
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None


class AuthService:
    """Сервис авторизации"""
    
    def __init__(self, db: Session, bot_token: str, jwt_secret: str):
        self.db = db
        self.telegram_validator = TelegramAuthValidator(bot_token)
        self.jwt_manager = JWTManager(jwt_secret)
    
    def authenticate_telegram_user(self, telegram_data: Dict, ip_address: str = None, user_agent: str = None) -> tuple[Optional[str], Optional[str]]:
        """
        Аутентифицирует пользователя через Telegram
        
        Возвращает: (jwt_token, status)
        status: 'approved', 'pending', 'rejected', 'error'
        """
        
        # Валидируем подпись
        if not self.telegram_validator.validate_telegram_data(telegram_data.copy()):
            return None, 'error'
        
        # Проверяем auth_date
        auth_date = int(telegram_data.get('auth_date', 0))
        if not self.telegram_validator.check_auth_date(auth_date):
            return None, 'error'
        
        telegram_id = int(telegram_data['id'])
        
        # Ищем или создаем пользователя
        user = self.db.query(User).filter(User.telegram_id == telegram_id).first()
        
        if not user:
            # Новый пользователь
            user = User(
                telegram_id=telegram_id,
                telegram_username=telegram_data.get('username'),
                first_name=telegram_data.get('first_name'),
                last_name=telegram_data.get('last_name'),
                photo_url=telegram_data.get('photo_url'),
                status='pending',
                role='user'
            )
            self.db.add(user)
            self.db.commit()
            self.db.refresh(user)
            
            # Логируем
            self._log_action(user.id, 'login', ip_address, user_agent)
            
            return None, 'pending'
        
        # Существующий пользователь
        if user.status == 'rejected':
            return None, 'rejected'
        
        if user.status == 'pending':
            # Логируем попытку входа
            self._log_action(user.id, 'login', ip_address, user_agent)
            return None, 'pending'
        
        if user.status == 'approved':
            # Обновляем last_login
            user.last_login = datetime.utcnow()
            self.db.commit()
            
            # Логируем успешный вход
            self._log_action(user.id, 'login', ip_address, user_agent)
            
            # Создаем JWT токен
            token = self.jwt_manager.create_token(
                user_id=user.id,
                telegram_id=user.telegram_id,
                username=user.telegram_username or f"user_{user.telegram_id}",
                role=user.role,
                first_name=user.first_name or "User",
                photo_url=user.photo_url
            )
            return token, 'approved'
        
        return None, 'error'
    
    def get_user_by_id(self, user_id: int) -> Optional[User]:
        """Получает пользователя по ID"""
        return self.db.query(User).filter(User.id == user_id).first()
    
    def approve_user(self, user_id: int, approved_by_user_id: int) -> bool:
        """Одобряет пользователя"""
        user = self.get_user_by_id(user_id)
        if not user:
            return False
        
        user.status = 'approved'
        user.approved_at = datetime.utcnow()
        user.approved_by_user_id = approved_by_user_id
        self.db.commit()
        
        # Логируем
        self._log_action(user_id, 'approved', approved_by_user_id=approved_by_user_id)
        
        return True
    
    def reject_user(self, user_id: int, approved_by_user_id: int) -> bool:
        """Отклоняет пользователя"""
        user = self.get_user_by_id(user_id)
        if not user:
            return False
        
        user.status = 'rejected'
        user.approved_by_user_id = approved_by_user_id
        self.db.commit()
        
        # Логируем
        self._log_action(user_id, 'rejected', approved_by_user_id=approved_by_user_id)
        
        return True
    
    def _log_action(self, user_id: int, action: str, ip_address: str = None, user_agent: str = None, approved_by_user_id: int = None):
        """Логирует действие пользователя"""
        log = AuthLog(
            user_id=user_id,
            action=action,
            ip_address=ip_address,
            user_agent=user_agent
        )
        self.db.add(log)
        self.db.commit()
