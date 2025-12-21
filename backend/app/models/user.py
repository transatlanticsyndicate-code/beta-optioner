from sqlalchemy import Column, Integer, String, Boolean, DateTime, BigInteger, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()


class User(Base):
    """Модель пользователя с авторизацией через Telegram"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    
    # Telegram данные
    telegram_id = Column(BigInteger, unique=True, nullable=False, index=True)
    telegram_username = Column(String(255), nullable=True)
    first_name = Column(String(255), nullable=True)
    last_name = Column(String(255), nullable=True)
    photo_url = Column(String(500), nullable=True)
    
    # Статус: 'pending', 'approved', 'rejected'
    status = Column(String(50), default='pending', index=True)
    
    # Роли: 'user', 'admin'
    role = Column(String(50), default='user')
    
    # Домен: 'test' или 'prod' - сохраняем с какого домена пришёл пользователь
    domain = Column(String(50), default='prod', nullable=True)
    
    # Даты
    created_at = Column(DateTime, default=datetime.utcnow)
    approved_at = Column(DateTime, nullable=True)
    approved_by_user_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    
    last_login = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)


class AuthLog(Base):
    """Логи авторизации и действий пользователей"""
    __tablename__ = "auth_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True, index=True)
    
    # Действие: 'login', 'logout', 'approved', 'rejected'
    action = Column(String(50), nullable=False)
    
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
