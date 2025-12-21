"""
Модели для функционала рейтинга криптовалют
ЗАЧЕМ: Хранение снимков топ-400 криптовалют и результатов анализа
Затрагивает: БД, API эндпоинты, планировщик задач
"""

from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class CryptoSnapshot(Base):
    """
    Снимок топ-400 криптовалют с CoinMarketCap в определенный момент времени
    """
    __tablename__ = "crypto_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    crypto_list = Column(JSON, nullable=False)  # [{"symbol": "BTC", "name": "Bitcoin"}, ...]
    task_id = Column(Integer, ForeignKey("crypto_scheduled_tasks.id"), nullable=True)
    
    # Связь с задачей
    task = relationship("CryptoScheduledTask", back_populates="snapshots")
    
    # Связи с анализами
    analyses_as_first = relationship("CryptoAnalysis", foreign_keys="CryptoAnalysis.first_snapshot_id", back_populates="first_snapshot")
    analyses_as_second = relationship("CryptoAnalysis", foreign_keys="CryptoAnalysis.second_snapshot_id", back_populates="second_snapshot")


class CryptoAnalysis(Base):
    """
    Результат сравнения двух снимков криптовалют
    """
    __tablename__ = "crypto_analyses"

    id = Column(Integer, primary_key=True, index=True)
    first_snapshot_id = Column(Integer, ForeignKey("crypto_snapshots.id"), nullable=False)
    second_snapshot_id = Column(Integer, ForeignKey("crypto_snapshots.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Результаты сравнения
    dropped_cryptos = Column(JSON, nullable=False)  # Криптовалюты, выпавшие из топа
    added_cryptos = Column(JSON, nullable=False)    # Криптовалюты, вошедшие в топ
    
    # Связи со снимками
    first_snapshot = relationship("CryptoSnapshot", foreign_keys=[first_snapshot_id], back_populates="analyses_as_first")
    second_snapshot = relationship("CryptoSnapshot", foreign_keys=[second_snapshot_id], back_populates="analyses_as_second")
    
    # Связь с задачей
    task_id = Column(Integer, ForeignKey("crypto_scheduled_tasks.id"), nullable=True)
    task = relationship("CryptoScheduledTask", back_populates="analyses")


class CryptoScheduledTask(Base):
    """
    Запланированная задача для циклического мониторинга криптовалют
    """
    __tablename__ = "crypto_scheduled_tasks"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Параметры расписания
    day_of_week = Column(String, nullable=False)  # monday, tuesday, etc.
    time = Column(String, nullable=False)          # HH:MM
    interval_value = Column(Integer, nullable=False)
    interval_unit = Column(String, nullable=False) # hours, days
    
    # Статус задачи
    is_active = Column(Boolean, default=True, nullable=False)
    last_run_at = Column(DateTime, nullable=True)
    next_run_at = Column(DateTime, nullable=True)
    
    # APScheduler job_id
    scheduler_job_id = Column(String, nullable=True)
    
    # Связи
    snapshots = relationship("CryptoSnapshot", back_populates="task")
    analyses = relationship("CryptoAnalysis", back_populates="task")
