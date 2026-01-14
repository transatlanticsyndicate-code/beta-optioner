"""
Yahoo Finance Client
Получение опционных данных через yfinance
"""
try:
    import yfinance as yf
    YFINANCE_AVAILABLE = True
except ImportError:
    YFINANCE_AVAILABLE = False
    yf = None

import pandas as pd
from typing import Dict, List
from datetime import datetime, timedelta


class YahooClient:
    """
    Клиент для работы с Yahoo Finance API
    """
    
    def __init__(self):
        pass
    
    def get_stock_price(self, ticker: str) -> Dict:
        """
        Получить текущую цену акции
        
        Args:
            ticker: Тикер акции
            
        Returns:
            Dict с данными о цене
        """
        try:
            stock = yf.Ticker(ticker)
            info = stock.info
            hist = stock.history(period="2d")
            
            if hist.empty:
                raise ValueError(f"Нет данных для {ticker}")
            
            current_price = hist['Close'].iloc[-1]
            previous_close = hist['Close'].iloc[-2] if len(hist) > 1 else current_price
            
            change = current_price - previous_close
            change_percent = (change / previous_close * 100) if previous_close > 0 else 0
            
            return {
                "ticker": ticker,
                "price": round(float(current_price), 2),
                "open": round(float(hist['Open'].iloc[-1]), 2),
                "high": round(float(hist['High'].iloc[-1]), 2),
                "low": round(float(hist['Low'].iloc[-1]), 2),
                "change": round(float(change), 2),
                "change_percent": round(float(change_percent), 2),
                "volume": int(hist['Volume'].iloc[-1]),
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            raise Exception(f"Ошибка получения цены: {str(e)}")
    
    def get_expiration_dates(self, ticker: str) -> List[str]:
        """
        Получить все доступные даты экспирации
        """
        try:
            stock = yf.Ticker(ticker)
            return stock.options
        except Exception as e:
            raise Exception(f"Ошибка получения дат экспирации: {str(e)}")

    def get_options_chain(self, ticker: str, expiration_date: str = None) -> List[Dict]:
        """
        Получить опционную цепочку
        
        Args:
            ticker: Тикер акции
            expiration_date: Дата экспирации (опционально)
            
        Returns:
            List опционных контрактов с OI, Volume
        """
        try:
            stock = yf.Ticker(ticker)
            
            # Получить доступные даты экспирации
            expirations = stock.options
            
            if not expirations:
                raise ValueError(f"Нет опционов для {ticker}")
            
            # Если дата не указана, берем ближайшую
            if not expiration_date:
                expiration_date = expirations[0]
            elif expiration_date not in expirations:
                # Найти ближайшую дату
                expiration_date = expirations[0]
            
            # Получить опционную цепочку
            opt_chain = stock.option_chain(expiration_date)
            
            # Объединить calls и puts
            contracts = []
            
            # Обработать Calls
            for _, row in opt_chain.calls.iterrows():
                try:
                    # Безопасное преобразование с обработкой NaN
                    oi = row.get('openInterest', 0)
                    oi = int(oi) if not pd.isna(oi) else 0
                    
                    vol = row.get('volume', 0)
                    vol = int(vol) if not pd.isna(vol) else 0
                    
                    bid = row.get('bid', 0)
                    bid = float(bid) if not pd.isna(bid) else 0.0
                    
                    ask = row.get('ask', 0)
                    ask = float(ask) if not pd.isna(ask) else 0.0
                    
                    last = row.get('lastPrice', 0)
                    last = float(last) if not pd.isna(last) else 0.0
                    
                    iv = row.get('impliedVolatility', 0)
                    iv = float(iv) if not pd.isna(iv) else 0.0
                    
                    contracts.append({
                        "ticker": f"{ticker}_{expiration_date}_C_{row['strike']}",
                        "underlying": ticker,
                        "expiration_date": expiration_date,
                        "strike": float(row['strike']),
                        "option_type": "call",
                        "open_interest": oi,
                        "volume": vol,
                        "bid": bid,
                        "ask": ask,
                        "last_price": last,
                        "implied_volatility": iv,
                        "delta": 0,
                        "gamma": 0,
                        "theta": 0,
                        "vega": 0
                    })
                except Exception as e:
                    continue
            
            # Обработать Puts
            for _, row in opt_chain.puts.iterrows():
                try:
                    # Безопасное преобразование с обработкой NaN
                    oi = row.get('openInterest', 0)
                    oi = int(oi) if not pd.isna(oi) else 0
                    
                    vol = row.get('volume', 0)
                    vol = int(vol) if not pd.isna(vol) else 0
                    
                    bid = row.get('bid', 0)
                    bid = float(bid) if not pd.isna(bid) else 0.0
                    
                    ask = row.get('ask', 0)
                    ask = float(ask) if not pd.isna(ask) else 0.0
                    
                    last = row.get('lastPrice', 0)
                    last = float(last) if not pd.isna(last) else 0.0
                    
                    iv = row.get('impliedVolatility', 0)
                    iv = float(iv) if not pd.isna(iv) else 0.0
                    
                    contracts.append({
                        "ticker": f"{ticker}_{expiration_date}_P_{row['strike']}",
                        "underlying": ticker,
                        "expiration_date": expiration_date,
                        "strike": float(row['strike']),
                        "option_type": "put",
                        "open_interest": oi,
                        "volume": vol,
                        "bid": bid,
                        "ask": ask,
                        "last_price": last,
                        "implied_volatility": iv,
                        "delta": 0,
                        "gamma": 0,
                        "theta": 0,
                        "vega": 0
                    })
                except Exception as e:
                    continue
            
            return contracts
            
        except Exception as e:
            raise Exception(f"Ошибка получения опционов: {str(e)}")
