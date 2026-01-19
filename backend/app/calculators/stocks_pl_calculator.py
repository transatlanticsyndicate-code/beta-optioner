"""
Калькулятор P&L для опционов на акции
ЗАЧЕМ: Содержит полную математику расчёта прибыли/убытка для опционов на акции
Затрагивает: Универсальный калькулятор опционов (режим "Акции")

Особенности расчётов для акций:
- Множитель контракта: 100 (стандартный для акций)
- Учитываются дивиденды (модель Black-Scholes-Merton)
- Используется безрисковая ставка
- Применяется IV Surface для точного прогнозирования
- Полный расчёт Greeks (Delta, Gamma, Theta, Vega)
"""

from typing import Dict, List, Optional, Tuple
from datetime import datetime, date
import math


class StocksPLCalculator:
    """
    Калькулятор P&L для опционов на акции
    ЗАЧЕМ: Инкапсулирует всю логику расчётов для режима "Акции"
    """
    
    # Стандартный множитель для опционов на акции
    CONTRACT_MULTIPLIER = 100
    
    def __init__(self, risk_free_rate: float = 0.05, dividend_yield: float = 0.0):
        """
        Инициализация калькулятора
        
        Args:
            risk_free_rate: Безрисковая ставка (по умолчанию 5%)
            dividend_yield: Дивидендная доходность (по умолчанию 0%)
        """
        self.risk_free_rate = risk_free_rate
        self.dividend_yield = dividend_yield
    
    def calculate_option_pl(
        self,
        option_type: str,
        position_type: str,
        strike: float,
        premium: float,
        quantity: int,
        current_price: float,
        target_price: float,
        days_to_expiry: int,
        iv: float,
        target_days: Optional[int] = None
    ) -> Dict:
        """
        Рассчитать P&L для одной опционной позиции
        ЗАЧЕМ: Основной метод расчёта прибыли/убытка
        
        Args:
            option_type: 'call' или 'put'
            position_type: 'long' или 'short'
            strike: Цена страйка
            premium: Премия опциона (цена входа)
            quantity: Количество контрактов
            current_price: Текущая цена базового актива
            target_price: Целевая цена для расчёта P&L
            days_to_expiry: Дней до экспирации
            iv: Implied Volatility (в десятичном формате, например 0.25 для 25%)
            target_days: Целевое количество дней (для расчёта временного распада)
            
        Returns:
            Dict с результатами расчёта P&L
        """
        # Определяем направление позиции
        is_long = position_type.lower() == 'long'
        direction = 1 if is_long else -1
        
        # Рассчитываем внутреннюю стоимость на экспирации
        if option_type.lower() == 'call':
            intrinsic_value = max(0, target_price - strike)
        else:  # put
            intrinsic_value = max(0, strike - target_price)
        
        # P&L на экспирации (без временной стоимости)
        pl_at_expiry = (intrinsic_value - premium) * direction * quantity * self.CONTRACT_MULTIPLIER
        
        # Если указаны целевые дни, рассчитываем с учётом временной стоимости
        if target_days is not None and target_days > 0:
            # Рассчитываем теоретическую цену опциона на целевую дату
            theoretical_price = self._calculate_theoretical_price(
                option_type=option_type,
                strike=strike,
                underlying_price=target_price,
                days_to_expiry=target_days,
                iv=iv
            )
            
            # P&L с учётом временной стоимости
            pl_with_time = (theoretical_price - premium) * direction * quantity * self.CONTRACT_MULTIPLIER
        else:
            pl_with_time = pl_at_expiry
            theoretical_price = intrinsic_value
        
        # Рассчитываем Greeks
        greeks = self._calculate_greeks(
            option_type=option_type,
            strike=strike,
            underlying_price=current_price,
            days_to_expiry=days_to_expiry,
            iv=iv
        )
        
        # Применяем направление к Greeks
        adjusted_greeks = {
            'delta': greeks['delta'] * direction * quantity * self.CONTRACT_MULTIPLIER,
            'gamma': greeks['gamma'] * quantity * self.CONTRACT_MULTIPLIER,
            'theta': greeks['theta'] * direction * quantity * self.CONTRACT_MULTIPLIER,
            'vega': greeks['vega'] * direction * quantity * self.CONTRACT_MULTIPLIER
        }
        
        return {
            'pl_at_expiry': round(pl_at_expiry, 2),
            'pl_with_time': round(pl_with_time, 2),
            'theoretical_price': round(theoretical_price, 4),
            'intrinsic_value': round(intrinsic_value, 4),
            'greeks': adjusted_greeks,
            'max_profit': self._calculate_max_profit(option_type, position_type, strike, premium, quantity),
            'max_loss': self._calculate_max_loss(option_type, position_type, strike, premium, quantity),
            'breakeven': self._calculate_breakeven(option_type, strike, premium, position_type)
        }
    
    def calculate_portfolio_pl(
        self,
        positions: List[Dict],
        current_price: float,
        target_price: float,
        target_days: Optional[int] = None
    ) -> Dict:
        """
        Рассчитать суммарный P&L для портфеля позиций
        ЗАЧЕМ: Расчёт P&L для сложных стратегий (Iron Condor, Butterfly и т.д.)
        
        Args:
            positions: Список позиций с параметрами
            current_price: Текущая цена базового актива
            target_price: Целевая цена
            target_days: Целевое количество дней
            
        Returns:
            Dict с суммарным P&L и деталями по каждой позиции
        """
        total_pl_at_expiry = 0
        total_pl_with_time = 0
        total_greeks = {'delta': 0, 'gamma': 0, 'theta': 0, 'vega': 0}
        position_details = []
        
        for pos in positions:
            result = self.calculate_option_pl(
                option_type=pos.get('option_type', 'call'),
                position_type=pos.get('position_type', 'long'),
                strike=pos.get('strike', 0),
                premium=pos.get('premium', 0),
                quantity=pos.get('quantity', 1),
                current_price=current_price,
                target_price=target_price,
                days_to_expiry=pos.get('days_to_expiry', 30),
                iv=pos.get('iv', 0.25),
                target_days=target_days
            )
            
            total_pl_at_expiry += result['pl_at_expiry']
            total_pl_with_time += result['pl_with_time']
            
            for greek in total_greeks:
                total_greeks[greek] += result['greeks'][greek]
            
            position_details.append({
                'position': pos,
                'result': result
            })
        
        return {
            'total_pl_at_expiry': round(total_pl_at_expiry, 2),
            'total_pl_with_time': round(total_pl_with_time, 2),
            'total_greeks': {k: round(v, 4) for k, v in total_greeks.items()},
            'position_details': position_details
        }
    
    def generate_pl_curve(
        self,
        positions: List[Dict],
        current_price: float,
        price_range_percent: float = 0.2,
        num_points: int = 100,
        target_days: Optional[int] = None
    ) -> List[Dict]:
        """
        Генерировать кривую P&L для диапазона цен
        ЗАЧЕМ: Для построения графика P&L
        
        Args:
            positions: Список позиций
            current_price: Текущая цена
            price_range_percent: Диапазон цен в процентах от текущей
            num_points: Количество точек на графике
            target_days: Целевое количество дней
            
        Returns:
            Список точек {price, pl}
        """
        min_price = current_price * (1 - price_range_percent)
        max_price = current_price * (1 + price_range_percent)
        step = (max_price - min_price) / num_points
        
        curve = []
        for i in range(num_points + 1):
            price = min_price + i * step
            result = self.calculate_portfolio_pl(
                positions=positions,
                current_price=current_price,
                target_price=price,
                target_days=target_days
            )
            curve.append({
                'price': round(price, 2),
                'pl': result['total_pl_with_time'] if target_days else result['total_pl_at_expiry']
            })
        
        return curve
    
    def _calculate_theoretical_price(
        self,
        option_type: str,
        strike: float,
        underlying_price: float,
        days_to_expiry: int,
        iv: float
    ) -> float:
        """
        Рассчитать теоретическую цену опциона по модели Black-Scholes-Merton
        ЗАЧЕМ: Для расчёта P&L с учётом временной стоимости
        """
        if days_to_expiry <= 0:
            # На экспирации — только внутренняя стоимость
            if option_type.lower() == 'call':
                return max(0, underlying_price - strike)
            else:
                return max(0, strike - underlying_price)
        
        # Время до экспирации в годах
        t = days_to_expiry / 365.0
        
        # Параметры модели
        s = underlying_price
        k = strike
        r = self.risk_free_rate
        q = self.dividend_yield
        sigma = iv
        
        # Защита от нулевой волатильности
        if sigma <= 0:
            sigma = 0.0001
        
        # Расчёт d1 и d2
        d1 = (math.log(s / k) + (r - q + 0.5 * sigma ** 2) * t) / (sigma * math.sqrt(t))
        d2 = d1 - sigma * math.sqrt(t)
        
        # Кумулятивная функция нормального распределения
        if option_type.lower() == 'call':
            price = s * math.exp(-q * t) * self._norm_cdf(d1) - k * math.exp(-r * t) * self._norm_cdf(d2)
        else:  # put
            price = k * math.exp(-r * t) * self._norm_cdf(-d2) - s * math.exp(-q * t) * self._norm_cdf(-d1)
        
        return max(0, price)
    
    def _calculate_greeks(
        self,
        option_type: str,
        strike: float,
        underlying_price: float,
        days_to_expiry: int,
        iv: float
    ) -> Dict[str, float]:
        """
        Рассчитать Greeks для опциона
        ЗАЧЕМ: Для оценки рисков и чувствительности позиции
        """
        if days_to_expiry <= 0 or iv <= 0:
            return {'delta': 0, 'gamma': 0, 'theta': 0, 'vega': 0}
        
        t = days_to_expiry / 365.0
        s = underlying_price
        k = strike
        r = self.risk_free_rate
        q = self.dividend_yield
        sigma = iv
        
        sqrt_t = math.sqrt(t)
        d1 = (math.log(s / k) + (r - q + 0.5 * sigma ** 2) * t) / (sigma * sqrt_t)
        d2 = d1 - sigma * sqrt_t
        
        # PDF нормального распределения для d1
        pdf_d1 = math.exp(-0.5 * d1 ** 2) / math.sqrt(2 * math.pi)
        
        # Delta
        if option_type.lower() == 'call':
            delta = math.exp(-q * t) * self._norm_cdf(d1)
        else:
            delta = -math.exp(-q * t) * self._norm_cdf(-d1)
        
        # Gamma (одинаковая для call и put)
        gamma = math.exp(-q * t) * pdf_d1 / (s * sigma * sqrt_t)
        
        # Theta (в долларах в день)
        term1 = -s * pdf_d1 * sigma * math.exp(-q * t) / (2 * sqrt_t)
        if option_type.lower() == 'call':
            term2 = -r * k * math.exp(-r * t) * self._norm_cdf(d2)
            term3 = q * s * math.exp(-q * t) * self._norm_cdf(d1)
        else:
            term2 = r * k * math.exp(-r * t) * self._norm_cdf(-d2)
            term3 = -q * s * math.exp(-q * t) * self._norm_cdf(-d1)
        theta = (term1 + term2 + term3) / 365.0
        
        # Vega (на 1% изменения IV)
        vega = s * math.exp(-q * t) * pdf_d1 * sqrt_t / 100.0
        
        return {
            'delta': round(delta, 4),
            'gamma': round(gamma, 6),
            'theta': round(theta, 4),
            'vega': round(vega, 4)
        }
    
    def _norm_cdf(self, x: float) -> float:
        """
        Кумулятивная функция нормального распределения
        ЗАЧЕМ: Используется в формуле Black-Scholes
        """
        return 0.5 * (1 + math.erf(x / math.sqrt(2)))
    
    def _calculate_max_profit(
        self,
        option_type: str,
        position_type: str,
        strike: float,
        premium: float,
        quantity: int
    ) -> float:
        """
        Рассчитать максимальную прибыль
        ЗАЧЕМ: Для отображения метрик риска
        """
        is_long = position_type.lower() == 'long'
        
        if is_long:
            if option_type.lower() == 'call':
                # Long Call: неограниченная прибыль (используем None для JSON совместимости)
                return None  # Означает "неограничено"
            else:
                # Long Put: максимум = strike - premium (если цена = 0)
                return (strike - premium) * quantity * self.CONTRACT_MULTIPLIER
        else:
            # Short позиции: максимум = полученная премия
            return premium * quantity * self.CONTRACT_MULTIPLIER
    
    def _calculate_max_loss(
        self,
        option_type: str,
        position_type: str,
        strike: float,
        premium: float,
        quantity: int
    ) -> float:
        """
        Рассчитать максимальный убыток
        ЗАЧЕМ: Для отображения метрик риска
        """
        is_long = position_type.lower() == 'long'
        
        if is_long:
            # Long позиции: максимум = уплаченная премия
            return premium * quantity * self.CONTRACT_MULTIPLIER
        else:
            if option_type.lower() == 'call':
                # Short Call: неограниченный убыток (используем None для JSON совместимости)
                return None  # Означает "неограничено"
            else:
                # Short Put: максимум = strike - premium (если цена = 0)
                return (strike - premium) * quantity * self.CONTRACT_MULTIPLIER
    
    def _calculate_breakeven(
        self,
        option_type: str,
        strike: float,
        premium: float,
        position_type: str
    ) -> float:
        """
        Рассчитать точку безубыточности
        ЗАЧЕМ: Для отображения на графике и в метриках
        """
        if option_type.lower() == 'call':
            return strike + premium
        else:  # put
            return strike - premium
