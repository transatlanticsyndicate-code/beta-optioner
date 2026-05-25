"""
SQLAlchemy-модель для общей таблицы настроек ETF.

ЗАЧЕМ: По образцу futures_settings — нужен общий, единый для всех клиентов
список ETF (тикер + название). По наличию тикера в этой таблице калькулятор
понимает, что инструмент относится к ETF, а не к обычной акции, и применяет
соответствующее визуальное оформление (синий бейдж). Математика расчётов
у ETF идентична акциям, отличается только UI-маркер.

Авторизации сейчас нет — кто знает ссылку, тот пишет.
"""
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func

from app.database import Base


class EtfSetting(Base):
    __tablename__ = "etf_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # ticker — уникальный код ETF (SPY, QQQ, IWM, VOO, DIA, ARKK, ...).
    ticker = Column(String(16), unique=True, nullable=False, index=True)
    name = Column(String(128), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "ticker": self.ticker,
            "name": self.name,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }
