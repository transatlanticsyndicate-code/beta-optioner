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


# Заводской набор фьючерсов для серверного сидинга.
# ЗАЧЕМ: раньше дефолты жили только во фронте (DEFAULT_FUTURES в futuresSettings.js)
# и сервер наполнялся «посевом» от первого пользователя. Это хрупко: после демоута
# фронтовых дефолтов до cold-start-фолбэка свежий браузер увидел бы пустой список.
# Поэтому сервер сам сидит этот набор при первом старте (см. init_db). margin не
# задаём (null) — реальный initial margin зависит от брокера, пользователь
# заполняет его вручную в /settings?section=futures.
DEFAULT_FUTURES_SEED = [
    {"ticker": "ES", "name": "E-mini S&P 500", "point_value": 50},
    {"ticker": "NQ", "name": "E-mini Nasdaq-100", "point_value": 20},
    {"ticker": "YM", "name": "E-mini Dow Jones", "point_value": 5},
    {"ticker": "GC", "name": "Gold Futures", "point_value": 100},
    {"ticker": "CL", "name": "Crude Oil Futures", "point_value": 1000},
    {"ticker": "ZC", "name": "Corn Futures", "point_value": 50},
    {"ticker": "ZS", "name": "Soybean Futures", "point_value": 50},
    {"ticker": "ZW", "name": "Wheat Futures", "point_value": 50},
    {"ticker": "ZO", "name": "Oat Futures", "point_value": 50},
    {"ticker": "ZR", "name": "Rough Rice Futures", "point_value": 100},
    {"ticker": "ZL", "name": "Soybean Oil Futures", "point_value": 100},
    {"ticker": "ZM", "name": "Soybean Meal Futures", "point_value": 100},
    {"ticker": "LE", "name": "Live Cattle Futures", "point_value": 400},
    {"ticker": "GF", "name": "Feeder Cattle Futures", "point_value": 500},
    {"ticker": "LH", "name": "Lean Hog Futures", "point_value": 400},
    {"ticker": "NG", "name": "Natural Gas (Henry Hub)", "point_value": 10000},
    {"ticker": "RB", "name": "RBOB Gasoline", "point_value": 42000},
    {"ticker": "HO", "name": "Heating Oil", "point_value": 42000},
    {"ticker": "HG", "name": "Copper", "point_value": 25000},
    {"ticker": "SI", "name": "Silver", "point_value": 5000},
    {"ticker": "PL", "name": "Platinum", "point_value": 50},
    {"ticker": "PA", "name": "Palladium", "point_value": 100},
    {"ticker": "6E", "name": "Euro FX", "point_value": 125000},
    {"ticker": "6B", "name": "British Pound", "point_value": 62500},
    {"ticker": "6A", "name": "Australian Dollar", "point_value": 100000},
    {"ticker": "6C", "name": "Canadian Dollar", "point_value": 100000},
    {"ticker": "6J", "name": "Japanese Yen", "point_value": 125000},
    {"ticker": "6S", "name": "Swiss Franc", "point_value": 125000},
    {"ticker": "BTC", "name": "Bitcoin", "point_value": 5},
    {"ticker": "ETH", "name": "Ether", "point_value": 50},
    {"ticker": "MBT", "name": "Micro Bitcoin", "point_value": 0.1},
    {"ticker": "MET", "name": "Micro Ether", "point_value": 0.50},
    {"ticker": "MES", "name": "Micro E-mini S&P 500", "point_value": 5},
    {"ticker": "MNQ", "name": "Micro E-mini Nasdaq-100", "point_value": 2},
    {"ticker": "MYM", "name": "Micro E-mini Dow", "point_value": 0.5},
    {"ticker": "M2K", "name": "Micro E-mini Russell 2000", "point_value": 5},
    {"ticker": "MGC", "name": "Micro Gold", "point_value": 10},
    {"ticker": "SIL", "name": "Micro Silver", "point_value": 1000},
    {"ticker": "MCL", "name": "Micro Crude Oil", "point_value": 100},
]
