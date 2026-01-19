"""
Модуль калькуляторов P&L для опционов
ЗАЧЕМ: Разделение логики расчётов для акций и фьючерсов
Затрагивает: Универсальный калькулятор опционов
"""

from .stocks_pl_calculator import StocksPLCalculator
from .futures_pl_calculator import FuturesPLCalculator

__all__ = ['StocksPLCalculator', 'FuturesPLCalculator']
