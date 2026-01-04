"""
SQLAlchemy model for analysis_history table
"""
from sqlalchemy import Column, String, Text, Integer, TIMESTAMP, Index, JSON
from sqlalchemy.sql import func
import uuid

from app.database import Base


class AnalysisHistory(Base):
    """
    Модель для хранения истории анализов опционов
    """
    __tablename__ = "analysis_history"
    
    # Primary key - Используем String для совместимости с SQLite, сохраняя UUID логику
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Основные данные
    ticker = Column(String(10), nullable=False, index=True)
    created_at = Column(TIMESTAMP, server_default=func.now(), index=True)
    
    # Исходные данные (JSON для кросс-платформенности)
    stock_data = Column(JSON, nullable=False)
    metrics = Column(JSON, nullable=False)
    
    # AI анализ
    ai_model = Column(String(20), nullable=False, index=True)
    ai_analysis = Column(Text, nullable=False)
    ai_provider = Column(String(50))
    
    # Метаданные
    ip_address = Column(String(45))
    user_agent = Column(Text)
    execution_time_ms = Column(Integer)
    
    def __repr__(self):
        return f"<AnalysisHistory(id={self.id}, ticker={self.ticker}, created_at={self.created_at})>"
    
    def to_dict(self):
        """Конвертировать модель в словарь для JSON ответа"""
        return {
            "id": str(self.id),
            "ticker": self.ticker,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "stock_data": self.stock_data,
            "metrics": self.metrics,
            "ai_model": self.ai_model,
            "ai_analysis": self.ai_analysis,
            "ai_provider": self.ai_provider,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "execution_time_ms": self.execution_time_ms
        }


# Создать индексы
Index('idx_ticker', AnalysisHistory.ticker)
Index('idx_created_at', AnalysisHistory.created_at.desc())
Index('idx_ai_model', AnalysisHistory.ai_model)
