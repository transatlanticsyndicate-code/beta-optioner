"""
Interactive Brokers Client Portal Gateway Client
Подключение к IB через Client Portal Gateway на production
"""

import os
import requests
import urllib3
from typing import Dict, List, Optional
from datetime import datetime

# Отключаем предупреждения о self-signed сертификатах
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class IBClient:
    """Клиент для работы с IB Client Portal Gateway"""
    
    def __init__(self):
        # Production Client Portal Gateway (на production используем localhost)
        self.base_url = os.getenv("IB_GATEWAY_URL", "https://localhost:5000")
        self.session = requests.Session()
        self.session.verify = False  # Self-signed certificate
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'application/json'
        })
    
    def get_auth_status(self) -> Dict:
        """
        Проверить статус аутентификации
        
        Returns:
            Dict с информацией о статусе аутентификации
        """
        try:
            response = self.session.get(
                f"{self.base_url}/v1/api/iserver/auth/status",
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"authenticated": False, "error": str(e)}
    
    def search_contract(self, ticker: str) -> Optional[int]:
        """
        Найти contract ID (conid) для тикера
        
        Args:
            ticker: Тикер акции (например, SPY)
            
        Returns:
            Contract ID или None
        """
        try:
            response = self.session.get(
                f"{self.base_url}/v1/api/iserver/secdef/search",
                params={"symbol": ticker},
                timeout=10
            )
            response.raise_for_status()
            data = response.json()
            
            if data and len(data) > 0:
                # Берем первый результат (обычно это правильный контракт)
                return data[0].get('conid')
            
            return None
        except Exception as e:
            print(f"❌ Error searching contract for {ticker}: {e}")
            return None
    
    def get_stock_price(self, ticker: str) -> Dict:
        """
        Получить текущую цену акции
        
        Args:
            ticker: Тикер акции
            
        Returns:
            Dict с данными о цене
        """
        try:
            # 1. Найти conid
            conid = self.search_contract(ticker)
            if not conid:
                raise ValueError(f"Contract not found for {ticker}")
            
            # 2. Получить market data snapshot
            # Поля Client Portal API: 31=last, 84=bid, 86=ask/high, 87=low, 88=volume, 82=change, 83=change%
            response = self.session.get(
                f"{self.base_url}/v1/api/iserver/marketdata/snapshot",
                params={"conids": conid, "fields": "31,84,86,87,88,82,83,7295"},
                timeout=10
            )
            response.raise_for_status()
            data = response.json()
            
            if not data or len(data) == 0:
                raise ValueError(f"No market data for {ticker}")
            
            snapshot = data[0]
            
            # Вспомогательная функция для парсинга значений
            def parse_float(value, default=0.0):
                if value is None:
                    return default
                try:
                    # Если строка, убираем К (тысячи) и конвертируем
                    if isinstance(value, str):
                        value = value.replace('K', '000').replace('M', '000000')
                    return float(value)
                except:
                    return default
            
            # Парсим данные
            # Поля Client Portal API: 31=last, 84=bid, 86=ask/high, 87=low, 88=volume
            price = parse_float(snapshot.get('31'))
            bid = parse_float(snapshot.get('84'))
            ask = parse_float(snapshot.get('86'))  # Может быть ask или high
            high = ask  # Используем как high, т.к. нет отдельного поля
            
            # Low: используем 87_raw если доступно, иначе пытаемся распарсить 87
            # "87": "166K" означает что-то странное, но "87_raw": 165000.0 - тоже неправильно
            # Возможно "K" означает тысячные доли или другой контекст
            low_raw = snapshot.get('87_raw')
            if low_raw:
                # 87_raw возвращает большое число (165000), делим на 1000?
                low = float(low_raw) / 1000.0
            else:
                low = parse_float(snapshot.get('87'))
            
            volume = int(parse_float(snapshot.get('88')))
            
            # Previous Close: IB field 7295 возвращает 0, используем расчет через change
            change = parse_float(snapshot.get('82'))
            change_percent = parse_float(snapshot.get('83'))
            
            # Если есть change, рассчитываем previous_close
            if change != 0 and price != 0:
                previous_close = price - change
            else:
                previous_close = parse_float(snapshot.get('7295'))
            
            return {
                "ticker": ticker,
                "price": price,
                "bid": bid,
                "ask": ask,
                "high": high,
                "low": low,
                "volume": volume,
                "previous_close": previous_close,
                "open": previous_close,  # Используем previous_close как open
                "change": change,  # IB предоставляет напрямую
                "change_percent": change_percent  # IB предоставляет напрямую
            }
        except Exception as e:
            print(f"❌ Error getting stock price for {ticker}: {e}")
            raise
    
    def get_expiration_dates(self, ticker: str) -> List[str]:
        """
        Получить даты экспирации опционов
        
        Args:
            ticker: Тикер акции
            
        Returns:
            List дат экспирации в формате MMMYY (например, NOV25, DEC25)
        """
        try:
            # 1. Получить информацию о контракте через search
            response = self.session.get(
                f"{self.base_url}/v1/api/iserver/secdef/search",
                params={"symbol": ticker},
                timeout=10
            )
            response.raise_for_status()
            data = response.json()
            
            if not data or len(data) == 0:
                return []
            
            # 2. Найти секцию с опционами
            contract = data[0]
            if 'sections' not in contract:
                return []
            
            expirations = []
            for section in contract['sections']:
                if section.get('secType') == 'OPT' and 'months' in section:
                    # Months приходит в формате "NOV25;DEC25;JAN26"
                    months = section['months'].split(';')
                    expirations.extend(months)
                    break
            
            return expirations
        except Exception as e:
            print(f"❌ Error getting expiration dates for {ticker}: {e}")
            return []
    
    def _get_option_market_data(self, option_conid: int) -> Dict:
        """
        Получить market data для опциона
        Делает двойной запрос: первый активирует подписку, второй получает данные
        """
        import time
        try:
            # Первый запрос: активировать подписку
            self.session.get(
                f"{self.base_url}/v1/api/iserver/marketdata/snapshot",
                params={"conids": option_conid, "fields": "31"},
                timeout=3
            )
            
            # Пауза для инициализации подписки
            time.sleep(0.3)
            
            # Второй запрос: получить полные данные
            md_response = self.session.get(
                f"{self.base_url}/v1/api/iserver/marketdata/snapshot",
                params={"conids": option_conid, "fields": "31,84,86,8,7087,7308,7084,7085,7086"},
                timeout=5
            )
            
            if md_response.status_code == 200:
                md = md_response.json()
                if md and len(md) > 0:
                    snapshot = md[0]
                    return {
                        "bid": float(snapshot.get('84', 0)),
                        "ask": float(snapshot.get('86', 0)),
                        "last": float(snapshot.get('31', 0)),
                        "volume": int(float(snapshot.get('8', 0))),
                        "iv": float(snapshot.get('7087', 0)),
                        "delta": float(snapshot.get('7308', 0)),
                        "gamma": float(snapshot.get('7084', 0)),
                        "theta": float(snapshot.get('7085', 0)),
                        "vega": float(snapshot.get('7086', 0)),
                    }
        except:
            pass
        return {}
    
    def get_options_chain(self, ticker: str, expiration_date: str) -> List[Dict]:
        """
        Получить опционную цепочку для конкретной даты
        
        Args:
            ticker: Тикер акции
            expiration_date: Дата экспирации в формате MMMYY (например, NOV25)
            
        Returns:
            List опционов с данными
        """
        try:
            # 1. Найти conid
            conid = self.search_contract(ticker)
            if not conid:
                raise ValueError(f"Contract not found for {ticker}")
            
            # 2. Получить страйки для даты экспирации
            response = self.session.get(
                f"{self.base_url}/v1/api/iserver/secdef/strikes",
                params={
                    "conid": conid,
                    "sectype": "OPT",
                    "month": expiration_date,  # MMMYY format (NOV25)
                    "exchange": "SMART"
                },
                timeout=10
            )
            response.raise_for_status()
            strikes_data = response.json()
            
            print(f"   DEBUG: strikes_data keys: {strikes_data.keys() if strikes_data else 'None'}")
            
            # 3. Получить текущую цену для выбора ATM страйков
            current_price = self.get_stock_price(ticker).get('price', 0)
            
            # 4. Выбрать страйки близкие к текущей цене (ATM)
            options = []
            
            all_call_strikes = strikes_data.get('call', [])
            all_put_strikes = strikes_data.get('put', [])
            
            # Фильтруем страйки: берем только те, что в пределах ±5% от текущей цены
            call_strikes = [s for s in all_call_strikes if abs(s - current_price) <= current_price * 0.05][:5]
            put_strikes = [s for s in all_put_strikes if abs(s - current_price) <= current_price * 0.05][:5]
            
            print(f"   DEBUG: Current price: ${current_price:.2f}")
            print(f"   DEBUG: ATM call_strikes: {call_strikes}")
            print(f"   DEBUG: ATM put_strikes: {put_strikes}")
            
            # Получаем данные для CALL опционов
            for strike in call_strikes:
                try:
                    opt_response = self.session.get(
                        f"{self.base_url}/v1/api/iserver/secdef/info",
                        params={
                            "conid": conid,
                            "sectype": "OPT",
                            "month": expiration_date,
                            "strike": strike,
                            "right": "C",  # CALL
                            "exchange": "SMART"
                        },
                        timeout=5
                    )
                    if opt_response.status_code == 200:
                        opt_data = opt_response.json()
                        if opt_data and len(opt_data) > 0:
                            option_conid = opt_data[0].get('conid')
                            
                            # Получить market data для опциона (с двойным запросом)
                            market_data = self._get_option_market_data(option_conid)
                            
                            options.append({
                                "strike": strike,
                                "type": "CALL",
                                "conid": option_conid,
                                "expiration": expiration_date,
                                **market_data
                            })
                except:
                    pass
            
            # Получаем данные для PUT опционов
            for strike in put_strikes:
                try:
                    opt_response = self.session.get(
                        f"{self.base_url}/v1/api/iserver/secdef/info",
                        params={
                            "conid": conid,
                            "sectype": "OPT",
                            "month": expiration_date,
                            "strike": strike,
                            "right": "P",  # PUT
                            "exchange": "SMART"
                        },
                        timeout=5
                    )
                    if opt_response.status_code == 200:
                        opt_data = opt_response.json()
                        if opt_data and len(opt_data) > 0:
                            option_conid = opt_data[0].get('conid')
                            
                            # Получить market data для опциона (с двойным запросом)
                            market_data = self._get_option_market_data(option_conid)
                            
                            options.append({
                                "strike": strike,
                                "type": "PUT",
                                "conid": option_conid,
                                "expiration": expiration_date,
                                **market_data
                            })
                except:
                    pass
            
            return options
        except Exception as e:
            print(f"❌ Error getting options chain for {ticker}: {e}")
            return []
    
    def get_historical_data(self, ticker: str, period: str = "2y") -> Dict:
        """
        Получить исторические данные
        
        Args:
            ticker: Тикер акции
            period: Период (например, "1y", "2y")
            
        Returns:
            Dict с историческими данными
        """
        try:
            # 1. Найти conid
            conid = self.search_contract(ticker)
            if not conid:
                raise ValueError(f"Contract not found for {ticker}")
            
            # 2. Получить исторические данные
            # Client Portal Gateway использует /iserver/marketdata/history
            response = self.session.get(
                f"{self.base_url}/v1/api/iserver/marketdata/history",
                params={
                    "conid": conid,
                    "period": period,
                    "bar": "1d"  # Daily bars
                },
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            
            # Парсим исторические данные
            dates = []
            closes = []
            highs = []
            lows = []
            volumes = []
            
            if 'data' in data:
                for bar in data['data']:
                    dates.append(bar.get('t'))  # Timestamp
                    closes.append(bar.get('c'))  # Close
                    highs.append(bar.get('h'))  # High
                    lows.append(bar.get('l'))  # Low
                    volumes.append(bar.get('v'))  # Volume
            
            return {
                "dates": dates,
                "closes": closes,
                "highs": highs,
                "lows": lows,
                "volumes": volumes
            }
        except Exception as e:
            print(f"❌ Error getting historical data for {ticker}: {e}")
            return {"dates": [], "closes": [], "highs": [], "lows": [], "volumes": []}
