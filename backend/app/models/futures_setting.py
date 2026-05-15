"""
SQLAlchemy-модель для общей таблицы настроек фьючерсов.

ЗАЧЕМ: До этой таблицы каждый пользователь хранил список фьючерсов
(тикеры, point value, margin per contract) у себя в localStorage. Это
расходилось между браузерами/устройствами и не позволяло заполнить
актуальные маржины для всей команды сразу. Теперь источник правды — сервер,
любой пользователь правит общую таблицу, остальные подхватывают на ближайшей
загрузке страницы.

Авторизации сейчас нет — кто знает ссылку, тот пишет.
"""
from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func

from app.database import Base


class FuturesSetting(Base):
    __tablename__ = "futures_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # ticker — уникальный «базовый» код контракта (ES, NQ, 6E, BTC, ...).
    # Полный тикер с месяцем (ESH26) на фронте отсекается до базы.
    ticker = Column(String(16), unique=True, nullable=False, index=True)
    name = Column(String(128), nullable=False)
    point_value = Column(Float, nullable=False)
    # null = «не задано», калькулятор показывает предупреждение и просит заполнить.
    margin_per_contract = Column(Float, nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "ticker": self.ticker,
            "name": self.name,
            "pointValue": self.point_value,
            "marginPerContract": self.margin_per_contract,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }
