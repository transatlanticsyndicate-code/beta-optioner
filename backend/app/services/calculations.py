"""
Options Calculations
Расчет метрик: Max Pain, Put/Call Ratio, Greeks и т.д.
"""

from typing import List, Dict, Tuple, Optional
from datetime import datetime, date
import pandas as pd


def calculate_max_pain(options_data: List[Dict]) -> float:
    """
    Рассчитать Max Pain - цену при которой опционные продавцы несут минимальные убытки
    
    Max Pain - это цена страйка, при которой суммарная стоимость всех опционов 
    (calls + puts) минимальна для покупателей опционов (максимальна для продавцов).
    
    Args:
        options_data: Список опционных контрактов с OI
        
    Returns:
        Цена Max Pain
    """
    if not options_data:
        return 0.0
    
    # Собрать все уникальные страйки
    strikes = sorted(set(opt['strike'] for opt in options_data))
    
    if not strikes:
        return 0.0
    
    min_pain = float('inf')
    max_pain_strike = strikes[0]
    
    # Для каждого страйка рассчитать суммарную боль
    for strike in strikes:
        total_pain = 0
        
        for option in options_data:
            oi = option.get('open_interest', 0)
            opt_strike = option['strike']
            opt_type = option['option_type']
            
            if oi == 0:
                continue
            
            # Рассчитать внутреннюю стоимость опциона при данном страйке
            if opt_type == 'call':
                # Call опцион в деньгах если цена > страйк
                intrinsic_value = max(0, strike - opt_strike)
            else:  # put
                # Put опцион в деньгах если цена < страйк
                intrinsic_value = max(0, opt_strike - strike)
            
            # Суммарная боль = OI * внутренняя стоимость
            total_pain += oi * intrinsic_value
        
        # Найти страйк с минимальной болью
        if total_pain < min_pain:
            min_pain = total_pain
            max_pain_strike = strike
    
    return float(max_pain_strike)


def calculate_put_call_ratio(options_data: List[Dict]) -> Dict[str, float]:
    """
    Рассчитать Put/Call Ratio по объему и Open Interest
    
    Args:
        options_data: Список опционных контрактов
        
    Returns:
        Dict с P/C Ratio по volume и OI
        {
            'volume_ratio': 0.85,
            'oi_ratio': 0.92,
            'total_call_volume': 123456,
            'total_put_volume': 104838,
            'total_call_oi': 234567,
            'total_put_oi': 215881
        }
    """
    if not options_data:
        return {
            'volume_ratio': 0.0,
            'oi_ratio': 0.0,
            'total_call_volume': 0,
            'total_put_volume': 0,
            'total_call_oi': 0,
            'total_put_oi': 0
        }
    
    total_call_volume = 0
    total_put_volume = 0
    total_call_oi = 0
    total_put_oi = 0
    
    for option in options_data:
        volume = option.get('volume', 0)
        oi = option.get('open_interest', 0)
        opt_type = option['option_type']
        
        if opt_type == 'call':
            total_call_volume += volume
            total_call_oi += oi
        else:  # put
            total_put_volume += volume
            total_put_oi += oi
    
    # Рассчитать соотношения
    volume_ratio = total_put_volume / total_call_volume if total_call_volume > 0 else 0
    oi_ratio = total_put_oi / total_call_oi if total_call_oi > 0 else 0
    
    return {
        'volume_ratio': round(volume_ratio, 2),
        'oi_ratio': round(oi_ratio, 2),
        'total_call_volume': total_call_volume,
        'total_put_volume': total_put_volume,
        'total_call_oi': total_call_oi,
        'total_put_oi': total_put_oi
    }


def calculate_gamma_exposure(options_data: List[Dict], current_price: float) -> Dict[str, float]:
    """
    Рассчитать Gamma Exposure (упрощенный вариант)
    
    GEX показывает как маркет-мейкеры будут хеджировать свои позиции при движении цены.
    Положительный GEX → стабилизирующий эффект
    Отрицательный GEX → дестабилизирующий эффект (больше волатильности)
    
    Args:
        options_data: Список опционных контрактов
        current_price: Текущая цена акции
        
    Returns:
        Dict с GEX метриками
    """
    if not options_data or current_price == 0:
        return {
            'total_gamma': 0.0,
            'call_gamma': 0.0,
            'put_gamma': 0.0,
            'net_gamma': 0.0
        }
    
    total_call_gamma = 0
    total_put_gamma = 0
    
    for option in options_data:
        gamma = option.get('gamma', 0)
        oi = option.get('open_interest', 0)
        opt_type = option['option_type']
        
        if gamma == 0 or oi == 0:
            continue
        
        # Gamma exposure = Gamma * OI * 100 (множитель контракта)
        gamma_exp = gamma * oi * 100
        
        if opt_type == 'call':
            total_call_gamma += gamma_exp
        else:  # put
            total_put_gamma += gamma_exp
    
    # Net Gamma (положительный = стабилизирующий)
    net_gamma = total_call_gamma - total_put_gamma
    total_gamma = total_call_gamma + total_put_gamma
    
    return {
        'total_gamma': round(total_gamma, 2),
        'call_gamma': round(total_call_gamma, 2),
        'put_gamma': round(total_put_gamma, 2),
        'net_gamma': round(net_gamma, 2)
    }


def find_key_levels(options_data: List[Dict], current_price: float) -> Dict[str, List[Dict]]:
    """
    Найти ключевые уровни поддержки и сопротивления на основе OI
    
    Args:
        options_data: Список опционных контрактов
        current_price: Текущая цена акции
        
    Returns:
        Dict с уровнями поддержки и сопротивления
        {
            'support_levels': [{'strike': 458, 'oi': 15000, 'strength': 'strong'}, ...],
            'resistance_levels': [{'strike': 462, 'oi': 12000, 'strength': 'medium'}, ...],
            'max_oi_strike': 460
        }
    """
    if not options_data or current_price == 0:
        return {
            'support_levels': [],
            'resistance_levels': [],
            'max_oi_strike': 0
        }
    
    # Агрегировать OI по страйкам и типам
    strike_data = {}
    
    for option in options_data:
        strike = option['strike']
        oi = option.get('open_interest', 0)
        opt_type = option['option_type']
        
        if strike not in strike_data:
            strike_data[strike] = {'call_oi': 0, 'put_oi': 0, 'total_oi': 0}
        
        if opt_type == 'call':
            strike_data[strike]['call_oi'] += oi
        else:
            strike_data[strike]['put_oi'] += oi
        
        strike_data[strike]['total_oi'] += oi
    
    # Найти страйк с максимальным OI
    max_oi_strike = max(strike_data.items(), key=lambda x: x[1]['total_oi'])[0] if strike_data else 0
    
    # Определить силу уровня
    max_total_oi = max(data['total_oi'] for data in strike_data.values()) if strike_data else 1
    
    def get_strength(oi: int) -> str:
        ratio = oi / max_total_oi if max_total_oi > 0 else 0
        if ratio > 0.7:
            return 'strong'
        elif ratio > 0.4:
            return 'medium'
        else:
            return 'weak'
    
    # Проверить наличие put и call опционов
    has_puts = any(opt.get('option_type') == 'put' for opt in options_data)
    has_calls = any(opt.get('option_type') == 'call' for opt in options_data)

    # Найти уровни поддержки (PUT OI ниже текущей цены)
    support_levels = []
    if has_puts:
        for strike, data in strike_data.items():
            if strike < current_price and data['put_oi'] > 0:
                support_levels.append({
                    'strike': strike,
                    'oi': data['put_oi'],
                    'strength': get_strength(data['put_oi'])
                })
    else:
        support_levels.append({'strike': 'N/A', 'oi': 'Нет данных по PUT опционам'})

    # Найти уровни сопротивления (CALL OI выше текущей цены)
    resistance_levels = []
    if has_calls:
        for strike, data in strike_data.items():
            if strike > current_price and data['call_oi'] > 0:
                resistance_levels.append({
                    'strike': strike,
                    'oi': data['call_oi'],
                    'strength': get_strength(data['call_oi'])
                })
    else:
        resistance_levels.append({'strike': 'N/A', 'oi': 'Нет данных по CALL опционам'})
    
    # Сортировать по OI (сильнейшие первыми)
    support_levels.sort(key=lambda x: x['oi'], reverse=True)
    resistance_levels.sort(key=lambda x: x['oi'], reverse=True)
    
    # Взять топ-5 уровней
    support_levels = support_levels[:5]
    resistance_levels = resistance_levels[:5]
    
    return {
        'support_levels': support_levels,
        'resistance_levels': resistance_levels,
        'max_oi_strike': float(max_oi_strike)
    }


def calculate_days_to_expiry(options_data: List[Dict]) -> int:
    """
    Рассчитать дни до экспирации (берем ближайшую дату)
    
    Args:
        options_data: Список опционных контрактов
        
    Returns:
        Количество дней до ближайшей экспирации
    """
    if not options_data:
        return 0
    
    # Собрать все даты экспирации
    exp_dates = []
    for option in options_data:
        exp_date_str = option.get('expiration_date')
        if exp_date_str:
            try:
                # Формат: "2025-10-10"
                exp_date = datetime.strptime(exp_date_str, "%Y-%m-%d").date()
                exp_dates.append(exp_date)
            except (ValueError, TypeError):
                continue
    
    if not exp_dates:
        return 0
    
    # Найти ближайшую дату
    nearest_exp = min(exp_dates)
    today = date.today()
    
    days_to_exp = (nearest_exp - today).days
    return max(0, days_to_exp)  # Не может быть отрицательным


def calculate_delta_distribution(options_data: List[Dict]) -> Dict[str, float]:
    """
    Рассчитать распределение Delta (суммарная дельта экспозиция)
    
    Args:
        options_data: Список опционных контрактов
        
    Returns:
        Dict с Delta метриками
        {
            'total_call_delta': 123456,
            'total_put_delta': -98765,
            'net_delta': 24691,
            'delta_ratio': 0.8
        }
    """
    if not options_data:
        return {
            'total_call_delta': 0,
            'total_put_delta': 0,
            'net_delta': 0,
            'delta_ratio': 0
        }
    
    total_call_delta = 0
    total_put_delta = 0
    
    for option in options_data:
        delta = option.get('delta', 0)
        oi = option.get('open_interest', 0)
        opt_type = option['option_type']
        
        if delta == 0 or oi == 0:
            continue
        
        # Delta exposure = Delta * OI * 100 (множитель контракта)
        delta_exp = delta * oi * 100
        
        if opt_type == 'call':
            total_call_delta += delta_exp
        else:  # put
            # PUT delta отрицательная
            total_put_delta += delta_exp
    
    # Net Delta (положительный = бычий, отрицательный = медвежий)
    net_delta = total_call_delta + total_put_delta  # PUT delta уже отрицательная
    
    # Ratio (насколько преобладает одна сторона)
    delta_ratio = abs(total_put_delta) / total_call_delta if total_call_delta > 0 else 0
    
    return {
        'total_call_delta': round(total_call_delta, 2),
        'total_put_delta': round(total_put_delta, 2),
        'net_delta': round(net_delta, 2),
        'delta_ratio': round(delta_ratio, 2)
    }


def calculate_iv_rank_from_options(options_data: List[Dict], ticker: str) -> Optional[Dict]:
    """
    Рассчитать IV Rank на основе опционных данных
    
    Args:
        options_data: Список опционных контрактов
        ticker: Тикер акции
        
    Returns:
        Dict с IV Rank или None
    """
    try:
        from app.services.iv_rank_calculator import IVRankCalculator
        
        # Найти среднюю текущую IV из опционов
        iv_values = [opt.get('implied_volatility', 0) for opt in options_data 
                     if opt.get('implied_volatility', 0) > 0]
        
        if not iv_values:
            return None
        
        current_iv = sum(iv_values) / len(iv_values)
        
        # Рассчитать IV Rank
        calculator = IVRankCalculator()
        iv_rank_data = calculator.calculate_iv_rank(ticker, current_iv)
        
        return iv_rank_data
        
    except Exception as e:
        print(f"⚠️  Ошибка расчета IV Rank: {e}")
        return None


def calculate_all_metrics(options_data: List[Dict], current_price: float, ticker: str = "") -> Dict:
    """
    Рассчитать все метрики разом
    
    Args:
        options_data: Список опционных контрактов
        current_price: Текущая цена акции
        ticker: Тикер акции (для IV Rank)
        
    Returns:
        Dict со всеми метриками
    """
    # Базовые метрики
    metrics = {
        'max_pain': calculate_max_pain(options_data),
        'put_call_ratio': calculate_put_call_ratio(options_data),
        'gamma_exposure': calculate_gamma_exposure(options_data, current_price),
        'key_levels': find_key_levels(options_data, current_price),
        'current_price': current_price,
        'total_contracts': len(options_data),
        'days_to_expiry': calculate_days_to_expiry(options_data),
        'delta_distribution': calculate_delta_distribution(options_data)
    }
    
    # Попытаться рассчитать IV Rank (может занять время)
    if ticker:
        iv_rank = calculate_iv_rank_from_options(options_data, ticker)
        metrics['iv_rank'] = iv_rank
    else:
        metrics['iv_rank'] = None
    
    return metrics
