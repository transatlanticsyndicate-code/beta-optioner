"""
SQLAlchemy модель для сохранённых конфигураций универсального калькулятора
ЗАЧЕМ: Хранение позиций в БД для доступа всем пользователям и надёжности
"""
from sqlalchemy import Column, String, Text, Boolean, TIMESTAMP, JSON, Index
from sqlalchemy.sql import func
import uuid

from app.database import Base


class SavedConfiguration(Base):
    """
    Модель для хранения сохранённых конфигураций универсального калькулятора опционов
    ЗАЧЕМ: Позволяет пользователям сохранять и делиться позициями через БД вместо localStorage
    """
    __tablename__ = "saved_configurations"
    
    # Primary key - UUID для уникальности
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Основные данные конфигурации
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    author = Column(String(100), nullable=False, index=True)
    ticker = Column(String(20), nullable=False, index=True)
    
    # Временные метки
    created_at = Column(TIMESTAMP, server_default=func.now(), nullable=False, index=True)
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Дата входа в позицию (минимальная из всех опционов)
    # ЗАЧЕМ: Используется для расчёта дней, прошедших с момента входа
    entry_date = Column(TIMESTAMP, nullable=True)
    
    # Флаг фиксации позиции
    # ЗАЧЕМ: Если true — данные не обновляются при загрузке, позиция "заморожена"
    is_locked = Column(Boolean, default=False, nullable=False)
    
    # Полное состояние калькулятора (JSON)
    # ЗАЧЕМ: Сохраняет опционы, позиции, настройки графика, режим калькулятора
    # Структура: {selectedTicker, currentPrice, priceChange, options[], positions[], 
    #             selectedExpirationDate, daysPassed, showOptionLines, showProbabilityZones,
    #             chartDisplayMode, calculatorMode}
    state = Column(JSON, nullable=False)
    
    # Настройки таба "Сделка" (JSON, опционально)
    # ЗАЧЕМ: Восстанавливает целевую цену, шаги, план выхода при загрузке
    deal_settings = Column(JSON, nullable=True)
    
    # Информация о сделке (JSON, опционально)
    # ЗАЧЕМ: Метаданные сделки (если конфигурация связана со сделкой)
    deal_info = Column(JSON, nullable=True)
    
    # ID автора из Supabase (опционально, для будущего функционала авторизации)
    # ЗАЧЕМ: Позволит ограничить удаление/редактирование только автором
    user_id = Column(String(100), nullable=True, index=True)
    
    def __repr__(self):
        return f"<SavedConfiguration(id={self.id}, name={self.name}, ticker={self.ticker}, author={self.author})>"
    
    def to_dict(self):
        """
        Конвертировать модель в словарь для JSON ответа
        ЗАЧЕМ: Удобная сериализация для API эндпоинтов
        """
        return {
            "id": str(self.id),
            "name": self.name,
            "description": self.description,
            "author": self.author,
            "ticker": self.ticker,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
            "entryDate": self.entry_date.isoformat() if self.entry_date else None,
            "isLocked": self.is_locked,
            "state": self.state,
            "dealSettings": self.deal_settings,
            "dealInfo": self.deal_info,
            "userId": self.user_id
        }


# Создать индексы для быстрого поиска
Index('idx_saved_config_ticker', SavedConfiguration.ticker)
Index('idx_saved_config_author', SavedConfiguration.author)
Index('idx_saved_config_created_at', SavedConfiguration.created_at.desc())
Index('idx_saved_config_user_id', SavedConfiguration.user_id)
