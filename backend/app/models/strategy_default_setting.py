"""
SQLAlchemy-модель для общих «значений по умолчанию» стратегий «Север» и «Север GPT».

ЗАЧЕМ: набор полей экрана подбора (допустимый диапазон P&L, маржин, допуск,
мин. доля акции, дни до даты расчёта) раньше был зашит в код. Теперь дефолты
задаются на странице настроек сайта и хранятся на сервере единым документом —
видны на любом устройстве/в браузере (как настройки фьючерсов и ETF).

Авторизации в проекте сейчас нет — кто знает ссылку, тот пишет.
"""
from sqlalchemy import Column, String, JSON, TIMESTAMP
from sqlalchemy.sql import func

from app.database import Base


class StrategyDefaultSetting(Base):
    __tablename__ = "strategy_default_settings"

    # Единственная строка-документ, id всегда 'global'.
    id = Column(String(64), primary_key=True, default="global")
    # JSON вида {"north": {...}, "northGpt": {...}} с пятью числовыми полями в каждом блоке.
    content = Column(JSON, nullable=False)
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self):
        return f"<StrategyDefaultSetting(id={self.id})>"
