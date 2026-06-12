"""
SQLAlchemy модель для облачного состояния приложения crypto.
ЗАЧЕМ: заменяет таблицу Supabase app_state — храним единый JSON-документ
(id='global') в нашей базе, чтобы не зависеть от внешнего сервиса.
"""
from sqlalchemy import Column, String, JSON, TIMESTAMP
from sqlalchemy.sql import func

from app.database import Base


class CryptoAppState(Base):
    __tablename__ = "crypto_app_state"

    # Единственная строка-документ. id всегда 'global'.
    id = Column(String(64), primary_key=True, default="global")
    # Весь стейт приложения как JSON (финансы, недельная статистика, настройки, активы).
    content = Column(JSON, nullable=False)
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self):
        return f"<CryptoAppState(id={self.id})>"
