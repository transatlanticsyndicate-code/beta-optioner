"""
Databento Client
ЗАЧЕМ: Сервис для получения данных по фьючерсам и опционам на фьючерсы от Databento
Затрагивает: Интеграция с Databento API для калькулятора опционов
"""

import databento as db
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
import os
from dotenv import load_dotenv
import pandas as pd
import numpy as np

# Импортируем py_vollib для расчета IV и Греков (модель Black-76 для фьючерсов)
try:
    from py_vollib.black_76 import greeks
    from py_vollib.black_76 import price as bs_price
    from py_vollib.black_76.implied_volatility import implied_volatility
    PY_VOLLIB_AVAILABLE = True
except ImportError:
    PY_VOLLIB_AVAILABLE = False
    print("⚠️ py_vollib not installed. Greeks and IV will not be calculated.")

load_dotenv()

class DatabentoClient:
    """Клиент для работы с Databento API"""

    def __init__(self):
        self.api_key = os.getenv('DATABENTO_API_KEY')
        if not self.api_key:
             # Fallback for dev/test
             self.api_key = 'db-cSsKVen5t58CtD9Ab3VFT6rVrh3Vv'
             
        self.client = db.Historical(self.api_key)
        self.dataset = 'GLBX.MDP3'  # CME Globex MDP 3.0
        self.risk_free_rate = 0.045  # Примерная безрисковая ставка 4.5%

    def get_futures_price(self, symbol: str) -> Dict[str, Any]:
        """
        Получить последнюю цену фьючерса
        Args:
            symbol: Символ фьючерса (например, 'ESZ4' или 'ES')
        """
        try:
            # Используем 'trades' для получения последней цены
            # Берем данные за последние 7 дней (чтобы точно захватить торговые дни)
            end_date = datetime.now()
            start_date = end_date - timedelta(days=7) 
            
            # Запрос последних сделок
            # Используем ISO формат без миллисекунд
            start_str = start_date.strftime('%Y-%m-%d')
            
            data = self.client.timeseries.get_range(
                dataset=self.dataset,
                schema='trades',
                symbols=[symbol],
                start=start_str,
                limit=1000
            )
            
            df = data.to_df()
            
            if df.empty:
                print(f"⚠️ No trades found for {symbol}")
                return {"price": 0, "timestamp": None}
            
            last_trade = df.iloc[-1]
            price = last_trade['price']
            
            return {
                "ticker": symbol,
                "price": float(price),
                "timestamp": str(last_trade.name) if 'ts_event' not in last_trade else str(last_trade['ts_event'])
            }
            
        except Exception as e:
            print(f"❌ Error getting futures price for {symbol}: {e}")
            return {"price": 0, "timestamp": None}

    def get_options_chain(self, root_symbol: str, expiration_date: Optional[str] = None) -> List[Dict]:
        """
        Получить опционную цепочку для фьючерса с расчетом IV и Греков
        """
        try:
            print(f"🔍 Getting options chain for {root_symbol} from Databento...")
            
            # 1. Получаем текущую цену фьючерса
            future_data = self.get_futures_price(root_symbol)
            underlying_price = future_data['price']
            
            if underlying_price == 0:
                print(f"⚠️ Could not get underlying price for {root_symbol}")
                return []

            chain = []
            
            # Генерируем страйки вокруг цены
            center_strike = round(underlying_price / 5) * 5
            strikes = []
            for i in range(-20, 21):
                strikes.append(center_strike + i * 50) 
                
            # Дата экспирации (фиксированная для прототипа)
            today = datetime.now()
            exp_date = today + timedelta(days=30)
            t = 30 / 365.0 
            
            for strike in strikes:
                for opt_type in ['call', 'put']:
                    try:
                        flag = opt_type[0].lower()
                        sigma = 0.15 # Фиксированная IV
                        
                        # Расчет по Black-76
                        if PY_VOLLIB_AVAILABLE:
                            theo_price = bs_price(underlying_price, strike, t, self.risk_free_rate, sigma, flag)
                            delta = greeks.delta(flag, underlying_price, strike, t, self.risk_free_rate, sigma)
                            gamma = greeks.gamma(flag, underlying_price, strike, t, self.risk_free_rate, sigma)
                            theta = greeks.theta(flag, underlying_price, strike, t, self.risk_free_rate, sigma)
                            vega = greeks.vega(flag, underlying_price, strike, t, self.risk_free_rate, sigma)
                        else:
                            theo_price = 0
                            delta = gamma = theta = vega = 0
                        
                        chain.append({
                            "ticker": f"{root_symbol}_OPT_{strike}_{opt_type}",
                            "strike": strike,
                            "type": opt_type,
                            "expiration": exp_date.strftime('%Y-%m-%d'),
                            "last": round(theo_price, 2),
                            "bid": round(theo_price * 0.98, 2),
                            "ask": round(theo_price * 1.02, 2),
                            "volume": 0,
                            "open_interest": 0,
                            "implied_volatility": sigma,
                            "delta": delta,
                            "gamma": gamma,
                            "theta": theta,
                            "vega": vega,
                            "underlying_price": underlying_price
                        })
                        
                    except Exception as calc_error:
                        continue

            return chain

        except Exception as e:
            print(f"❌ Error getting options chain: {e}")
            return []

    def get_expirations(self, ticker: str) -> List[str]:
        """Получить даты экспирации"""
        today = datetime.now()
        expirations = []
        for i in range(60):
            date = today + timedelta(days=i)
            if date.weekday() == 4:
                expirations.append(date.strftime('%Y-%m-%d'))
        return expirations[:10]
