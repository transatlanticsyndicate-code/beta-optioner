"""
Калькулятор P&L для опционов на фьючерсы
ЗАЧЕМ: Содержит полную математику расчёта прибыли/убытка для опционов на фьючерсы (модель Black-76)
Затрагивает: Универсальный калькулятор опционов (режим "Фьючерсы")

Особенности расчётов для фьючерсов:
- Модель: Black-76 (стандарт для опционов на фьючерсы)
- Множитель контракта: pointValue из настроек (вместо фиксированного 100)
- Дивиденды: Не используются
- Базовый актив: Цена фьючерса (Futures Price)
"""

from typing import Dict, List, Optional
import math


class FuturesPLCalculator:
    """
    Калькулятор P&L для опционов на фьючерсы
    ЗАЧЕМ: Инкапсулирует всю логику расчётов для режима "Фьючерсы"
    """
    
    def __init__(self, point_value: float = 50, risk_free_rate: float = 0.05):
        """
        Инициализация калькулятора
        
        Args:
            point_value: Цена пункта фьючерса (из настроек)
            risk_free_rate: Безрисковая ставка
        """
        self.point_value = point_value
        self.risk_free_rate = risk_free_rate
    
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
        Рассчитать P&L для одной опционной позиции на фьючерс
        ЗАЧЕМ: Основной метод расчёта прибыли/убытка
        
        Args:
            option_type: 'call' или 'put'
            position_type: 'long' или 'short'
            strike: Цена страйка
            premium: Премия опциона (цена входа)
            quantity: Количество контрактов
            current_price: Текущая цена фьючерса
            target_price: Целевая цена для расчёта P&L
            days_to_expiry: Дней до экспирации
            iv: Implied Volatility
            target_days: Целевое количество дней (оставшихся)
            
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
        
        # P&L на экспирации с использованием point_value
        # Formula: (Intrinsic - Premium) * Direction * Qty * PointValue
        pl_at_expiry = (intrinsic_value - premium) * direction * quantity * self.point_value
        
        # Если указаны целевые дни, рассчитываем с учётом временной стоимости по Black-76
        if target_days is not None and target_days > 0:
            theoretical_price = self._calculate_theoretical_price(
                option_type=option_type,
                strike=strike,
                futures_price=target_price,
                days_to_expiry=target_days,
                iv=iv
            )
            pl_with_time = (theoretical_price - premium) * direction * quantity * self.point_value
        else:
            pl_with_time = pl_at_expiry
            theoretical_price = intrinsic_value
        
        # Рассчитываем Greeks
        greeks = self._calculate_greeks(
            option_type=option_type,
            strike=strike,
            futures_price=current_price,
            days_to_expiry=days_to_expiry,
            iv=iv
        )
        
        # Применяем направление, количество и point_value к Greeks
        adjusted_greeks = {
            'delta': greeks['delta'] * direction * quantity * self.point_value,
            'gamma': greeks['gamma'] * quantity * self.point_value,
            'theta': greeks['theta'] * direction * quantity * self.point_value,
            'vega': greeks['vega'] * direction * quantity * self.point_value
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
        Рассчитать суммарный P&L для портфеля позиций на фьючерсы
        ЗАЧЕМ: Расчёт P&L для сложных стратегий
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
        futures_price: float,
        days_to_expiry: int,
        iv: float
    ) -> float:
        """
        Рассчитать теоретическую цену опциона по модели Black-76
        ЗАЧЕМ: Для расчёта P&L с учётом временной стоимости и волатильности
        """
        if days_to_expiry <= 0:
            if option_type.lower() == 'call':
                return max(0, futures_price - strike)
            else:
                return max(0, strike - futures_price)
        
        t = days_to_expiry / 365.0
        f = futures_price
        k = strike
        r = self.risk_free_rate
        sigma = iv
        
        if sigma <= 0:
            sigma = 0.0001
            
        sqrt_t = math.sqrt(t)
        d1 = (math.log(f / k) + (0.5 * sigma ** 2) * t) / (sigma * sqrt_t)
        d2 = d1 - sigma * sqrt_t
        
        discount = math.exp(-r * t)
        
        if option_type.lower() == 'call':
            price = discount * (f * self._norm_cdf(d1) - k * self._norm_cdf(d2))
        else:
            price = discount * (k * self._norm_cdf(-d2) - f * self._norm_cdf(-d1))
            
        return max(0, price)
    
    def _calculate_greeks(
        self,
        option_type: str,
        strike: float,
        futures_price: float,
        days_to_expiry: int,
        iv: float
    ) -> Dict[str, float]:
        """
        Рассчитать Greeks по модели Black-76
        ЗАЧЕМ: Для оценки рисков
        """
        if days_to_expiry <= 0 or iv <= 0:
            return {'delta': 0, 'gamma': 0, 'theta': 0, 'vega': 0}
            
        t = days_to_expiry / 365.0
        f = futures_price
        k = strike
        r = self.risk_free_rate
        sigma = iv
        
        sqrt_t = math.sqrt(t)
        d1 = (math.log(f / k) + (0.5 * sigma ** 2) * t) / (sigma * sqrt_t)
        d2 = d1 - sigma * sqrt_t
        
        pdf_d1 = math.exp(-0.5 * d1 ** 2) / math.sqrt(2 * math.pi)
        discount = math.exp(-r * t)
        
        # Delta
        if option_type.lower() == 'call':
            delta = discount * self._norm_cdf(d1)
        else:
            delta = -discount * self._norm_cdf(-d1)
            
        # Gamma
        gamma = (discount * pdf_d1) / (f * sigma * sqrt_t)
        
        # Vega (per 1% volatility change)
        vega = f * discount * pdf_d1 * sqrt_t / 100.0
        
        # Theta (per day)
        # Black-76 Theta formula
        term1 = -(f * sigma * discount * pdf_d1) / (2 * sqrt_t)
        
        if option_type.lower() == 'call':
            term2 = r * k * discount * self._norm_cdf(d2) - r * f * discount * self._norm_cdf(d1)
        else:
            term2 = r * k * discount * self._norm_cdf(-d2) - r * f * discount * self._norm_cdf(-d1)
            
        theta = (term1 + term2) / 365.0
        
        return {
            'delta': round(delta, 4),
            'gamma': round(gamma, 6),
            'theta': round(theta, 4),
            'vega': round(vega, 4)
        }
    
    def _norm_cdf(self, x: float) -> float:
        """Кумулятивная функция нормального распределения"""
        return 0.5 * (1 + math.erf(x / math.sqrt(2)))
        
    def _calculate_max_profit(
        self,
        option_type: str,
        position_type: str,
        strike: float,
        premium: float,
        quantity: int
    ) -> float:
        """Рассчитать максимальную прибыль"""
        is_long = position_type.lower() == 'long'
        
        if is_long:
            if option_type.lower() == 'call':
                return None  # Неограничено
            else:
                return (strike - premium) * quantity * self.point_value
        else:
            return premium * quantity * self.point_value
    
    def _calculate_max_loss(
        self,
        option_type: str,
        position_type: str,
        strike: float,
        premium: float,
        quantity: int
    ) -> float:
        """Рассчитать максимальный убыток"""
        is_long = position_type.lower() == 'long'
        
        if is_long:
            return premium * quantity * self.point_value
        else:
            if option_type.lower() == 'call':
                return None  # Неограничено
            else:
                return (strike - premium) * quantity * self.point_value
    
    def _calculate_breakeven(
        self,
        option_type: str,
        strike: float,
        premium: float,
        position_type: str
    ) -> float:
        """Рассчитать точку безубыточности"""
        if option_type.lower() == 'call':
            return strike + premium
        else:
            return strike - premium
