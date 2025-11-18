"""
IV Rank Calculator
Расчет IV Rank на основе исторических данных Implied Volatility
"""

import requests
from datetime import datetime, timedelta
from typing import Dict, Optional
import os


class IVRankCalculator:
    """
    Калькулятор IV Rank
    
    IV Rank = процентиль текущей IV относительно последних 52 недель
    Формула: (Текущая IV - Min IV) / (Max IV - Min IV) * 100
    """
    
    def __init__(self):
        self.api_key = os.getenv("POLYGON_API_KEY")
        if not self.api_key:
            raise ValueError("POLYGON_API_KEY не найден в .env файле")
        
        self.base_url = "https://api.polygon.io"
    
    def calculate_iv_rank(self, ticker: str, current_iv: float) -> Optional[Dict]:
        """
        Рассчитать IV Rank для тикера
        
        Args:
            ticker: Тикер акции
            current_iv: Текущая Implied Volatility
            
        Returns:
            Dict с IV Rank метриками или None если данных нет
        """
        if not current_iv or current_iv <= 0:
            print(f"⚠️  Текущая IV недоступна для {ticker}")
            return None
        
        try:
            # Получить исторические данные за последний год
            historical_iv = self._get_historical_iv(ticker)
            
            if not historical_iv or len(historical_iv) < 10:
                print(f"⚠️  Недостаточно исторических данных IV для {ticker}")
                return None
            
            # Рассчитать статистику
            min_iv = min(historical_iv)
            max_iv = max(historical_iv)
            avg_iv = sum(historical_iv) / len(historical_iv)
            
            # Рассчитать IV Rank
            if max_iv == min_iv:
                iv_rank = 50.0  # Если нет разброса, считаем средним
            else:
                iv_rank = ((current_iv - min_iv) / (max_iv - min_iv)) * 100
            
            # Рассчитать IV Percentile (сколько дней IV была ниже текущей)
            days_below = sum(1 for iv in historical_iv if iv < current_iv)
            iv_percentile = (days_below / len(historical_iv)) * 100
            
            return {
                'iv_rank': round(iv_rank, 1),
                'iv_percentile': round(iv_percentile, 1),
                'current_iv': round(current_iv, 2),
                'min_iv_52w': round(min_iv, 2),
                'max_iv_52w': round(max_iv, 2),
                'avg_iv_52w': round(avg_iv, 2),
                'data_points': len(historical_iv)
            }
            
        except Exception as e:
            print(f"⚠️  Ошибка расчета IV Rank для {ticker}: {e}")
            return None
    
    def _get_historical_iv(self, ticker: str, days: int = 365) -> list:
        """
        Получить исторические данные IV из Polygon
        
        Args:
            ticker: Тикер акции
            days: Количество дней истории (по умолчанию 365 = 52 недели)
            
        Returns:
            Список значений IV
        """
        # Рассчитать даты
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        # Форматировать даты для API
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = end_date.strftime("%Y-%m-%d")
        
        try:
            # Используем aggregates endpoint для акции
            url = f"{self.base_url}/v2/aggs/ticker/{ticker}/range/1/day/{start_str}/{end_str}"
            params = {
                "apiKey": self.api_key,
                "limit": 50000,
                "adjusted": "true"
            }
            
            print(f"📊 Запрос исторических данных для {ticker}: {start_str} - {end_str}")
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            
            # Polygon может вернуть OK или DELAYED (для бесплатных/стартовых планов)
            status = data.get("status")
            if status not in ["OK", "DELAYED"]:
                print(f"⚠️  Polygon вернул неожиданный статус: {status}")
                return []
            
            if status == "DELAYED":
                print(f"ℹ️  Данные задержаны (DELAYED), но доступны")
            
            results = data.get("results", [])
            
            if not results:
                print(f"⚠️  Polygon не вернул результаты для {ticker}")
                return []
            
            print(f"✅ Получено {len(results)} дней исторических данных")
            
            # Рассчитать историческую волатильность на основе цен
            iv_values = self._calculate_historical_volatility(results)
            
            print(f"✅ Рассчитано {len(iv_values)} значений волатильности")
            
            return iv_values
            
        except Exception as e:
            print(f"⚠️  Ошибка получения исторических данных: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def _calculate_historical_volatility(self, price_data: list) -> list:
        """
        Рассчитать историческую волатильность на основе ценовых данных
        
        Args:
            price_data: Список ценовых данных от Polygon
            
        Returns:
            Список значений волатильности
        """
        if len(price_data) < 20:
            return []
        
        volatilities = []
        window = 20  # 20-дневное окно для расчета волатильности
        
        for i in range(window, len(price_data)):
            # Взять последние 20 дней
            window_data = price_data[i-window:i]
            
            # Рассчитать дневные доходности
            returns = []
            for j in range(1, len(window_data)):
                prev_close = window_data[j-1].get('c', 0)
                curr_close = window_data[j].get('c', 0)
                
                if prev_close > 0 and curr_close > 0:
                    daily_return = (curr_close - prev_close) / prev_close
                    returns.append(daily_return)
            
            if returns:
                # Рассчитать стандартное отклонение (волатильность)
                mean_return = sum(returns) / len(returns)
                variance = sum((r - mean_return) ** 2 for r in returns) / len(returns)
                std_dev = variance ** 0.5
                
                # Аннуализировать (252 торговых дня в году)
                annualized_vol = std_dev * (252 ** 0.5) * 100
                volatilities.append(annualized_vol)
        
        return volatilities
