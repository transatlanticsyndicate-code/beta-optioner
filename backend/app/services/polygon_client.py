"""
Polygon.io API Client
Получение опционных данных и цен акций
"""

import os
import requests
from typing import Dict, List, Optional
from datetime import datetime, timedelta


class PolygonClient:
    """Клиент для работы с Polygon.io API"""
    
    def __init__(self):
        # ЗАЧЕМ: .strip() удаляет скрытые символы (\r, \n) из .env файла
        self.api_key = os.getenv("POLYGON_API_KEY", "").strip()
        if not self.api_key:
            raise ValueError("POLYGON_API_KEY не найден в .env файле")
        
        self.base_url = "https://api.polygon.io"
    
    def get_stock_price(self, ticker: str) -> Dict:
        """
        Получить последнюю цену акции
        
        Args:
            ticker: Тикер акции (например, SPY)
            
        Returns:
            Dict с ценой и метаданными
            {
                'ticker': 'SPY',
                'price': 459.80,
                'change': 2.30,
                'change_percent': 0.5,
                'volume': 1234567,
                'timestamp': '2024-01-15T16:00:00Z'
            }
        """
        try:
            # Получить данные за предыдущий торговый день
            url = f"{self.base_url}/v2/aggs/ticker/{ticker}/prev"
            params = {"apiKey": self.api_key}
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            
            if data.get("status") != "OK" or not data.get("results"):
                raise ValueError(f"Нет данных для тикера {ticker}")
            
            result = data["results"][0]
            
            # Рассчитать изменение
            close_price = result["c"]
            open_price = result["o"]
            change = close_price - open_price
            change_percent = (change / open_price) * 100 if open_price > 0 else 0
            
            return {
                "ticker": ticker,
                "price": close_price,
                "open": open_price,
                "high": result["h"],
                "low": result["l"],
                "change": round(change, 2),
                "change_percent": round(change_percent, 2),
                "volume": result["v"],
                "timestamp": datetime.fromtimestamp(result["t"] / 1000).isoformat()
            }
        except requests.exceptions.RequestException as e:
            raise Exception(f"Ошибка запроса к Polygon.io: {str(e)}")
        except (KeyError, IndexError) as e:
            raise Exception(f"Ошибка парсинга данных: {str(e)}")
    
    def get_ticker_details(self, ticker: str) -> Dict:
        """
        Получить детальную информацию о тикере (название компании и т.д.)
        
        Args:
            ticker: Тикер акции (например, AAPL)
            
        Returns:
            Dict с информацией о компании
            {
                'ticker': 'AAPL',
                'name': 'Apple Inc.',
                'description': '...',
                'market_cap': 2500000000000,
                'primary_exchange': 'NASDAQ'
            }
        """
        try:
            url = f"{self.base_url}/v3/reference/tickers/{ticker}"
            params = {"apiKey": self.api_key}
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            
            if data.get("status") != "OK" or not data.get("results"):
                return {
                    "ticker": ticker,
                    "name": ticker,
                    "description": "",
                    "market_cap": 0,
                    "primary_exchange": ""
                }
            
            result = data["results"]
            
            return {
                "ticker": ticker,
                "name": result.get("name", ticker),
                "description": result.get("description", ""),
                "market_cap": result.get("market_cap", 0),
                "primary_exchange": result.get("primary_exchange", "")
            }
        except Exception as e:
            # В случае ошибки возвращаем минимальные данные
            return {
                "ticker": ticker,
                "name": ticker,
                "description": "",
                "market_cap": 0,
                "primary_exchange": ""
            }
    
    def get_expiration_dates(self, ticker: str, max_pages: int = 10) -> List[str]:
        """
        Получить список доступных дат экспирации для тикера с полной пагинацией
        
        Args:
            ticker: Тикер акции
            max_pages: Максимальное количество страниц для загрузки (по умолчанию 10)
            
        Returns:
            List дат экспирации в формате YYYY-MM-DD
        """
        all_dates = set()
        
        try:
            # Сначала пробуем reference API с пагинацией для получения ВСЕХ контрактов
            print(f"🔍 Получаем ВСЕ даты экспирации через reference API для {ticker}")
            
            # Получаем текущую дату и дату через 2 года для максимального охвата
            today = datetime.now().date()
            end_date = today + timedelta(days=730)  # 2 года вперед
            
            url = f"{self.base_url}/v3/reference/options/contracts"
            next_cursor = None
            page = 1
            
            while page <= max_pages:
                print(f"📄 Загружаем страницу {page}/{max_pages} дат экспирации для {ticker}")
                
                params = {
                    "apiKey": self.api_key,
                    "underlying_ticker": ticker,
                    "expiration_date.gte": today.strftime("%Y-%m-%d"),
                    "expiration_date.lte": end_date.strftime("%Y-%m-%d"),
                    "limit": 1000,
                    "sort": "expiration_date"
                }
                
                # Добавляем cursor для пагинации (если есть)
                if next_cursor:
                    params["cursor"] = next_cursor
                
                response = requests.get(url, params=params, timeout=20)
                response.raise_for_status()
                
                data = response.json()
                
                if data.get("status") != "OK":
                    print(f"⚠️ Статус не OK на странице {page}")
                    break
                
                results = data.get("results", [])
                if not results:
                    print(f"✅ Нет больше данных на странице {page}")
                    break
                
                print(f"📊 Страница {page}: получено {len(results)} контрактов")
                
                # Собираем уникальные даты экспирации с этой страницы
                page_dates = set()
                for contract in results:
                    exp_date = contract.get("expiration_date")
                    if exp_date:
                        try:
                            exp_datetime = datetime.strptime(exp_date, "%Y-%m-%d")
                            if exp_datetime.date() > today:
                                page_dates.add(exp_date)
                        except ValueError:
                            continue
                
                print(f"📅 Найдено {len(page_dates)} уникальных дат на странице {page}")
                
                # Проверяем, есть ли новые даты
                new_dates = page_dates - all_dates
                if new_dates:
                    print(f"➕ Добавлено {len(new_dates)} новых дат")
                    all_dates.update(page_dates)
                else:
                    print(f"🔄 Нет новых дат на странице {page}, но продолжаем...")
                
                # Проверяем, есть ли следующая страница
                next_cursor = data.get("next_url")
                if next_cursor:
                    # Извлекаем cursor из next_url
                    from urllib.parse import urlparse, parse_qs
                    parsed_url = urlparse(next_cursor)
                    cursor_params = parse_qs(parsed_url.query)
                    next_cursor = cursor_params.get("cursor", [None])[0]
                    print(f"🔗 Найден cursor для следующей страницы: {next_cursor[:20]}...")
                else:
                    print(f"🏁 Достигнут конец данных на странице {page}")
                    break
                
                page += 1
                
                # Пауза между запросами для соблюдения rate limit
                import time
                time.sleep(0.2)
            
            if all_dates:
                sorted_dates = sorted(list(all_dates))
                print(f"🎯 Reference API: найдено {len(sorted_dates)} дат экспирации для {ticker} за {page-1} страниц")
                return sorted_dates
            else:
                print(f"⚠️ Reference API не вернул дат, пробуем fallback")
            
            # Если reference API не сработал, используем fallback на snapshot API
            print(f"⚠️ Reference API не дал результатов, используем snapshot API")
            
            # Делаем несколько запросов с разными параметрами
            for request_num in range(3):
                print(f"📄 Fallback запрос {request_num + 1}/3 для {ticker}")
                
                # Получаем опционную цепочку
                url = f"{self.base_url}/v3/snapshot/options/{ticker}"
                params = {
                    "apiKey": self.api_key,
                    "limit": 250
                }
                
                response = requests.get(url, params=params, timeout=15)
                response.raise_for_status()
                
                data = response.json()
                
                if data.get("status") != "OK":
                    print(f"⚠️ Статус не OK в fallback запросе {request_num + 1}")
                    continue
                
                results = data.get("results", [])
                
                if not results:
                    print(f"✅ Нет данных в fallback запросе {request_num + 1}")
                    break
                
                # Собрать уникальные даты экспирации с этого запроса
                request_dates = set()
                for contract in results:
                    details = contract.get("details", {})
                    exp_date = details.get("expiration_date")
                    if exp_date:
                        try:
                            exp_datetime = datetime.strptime(exp_date, "%Y-%m-%d")
                            if exp_datetime.date() > today:
                                request_dates.add(exp_date)
                        except ValueError:
                            continue
                
                print(f"📅 Найдено {len(request_dates)} дат в fallback запросе {request_num + 1}")
                
                # Добавляем новые даты
                new_dates = request_dates - all_dates
                if new_dates:
                    print(f"➕ Добавлено {len(new_dates)} новых дат")
                    all_dates.update(request_dates)
                else:
                    print(f"🔄 Нет новых дат в fallback запросе {request_num + 1}")
                    break
                
                # Пауза между запросами
                import time
                time.sleep(0.3)
            
            # Отсортировать по возрастанию
            sorted_dates = sorted(list(all_dates))
            print(f"🎯 Итого найдено {len(sorted_dates)} дат экспирации для {ticker}")
            
            return sorted_dates
            
        except Exception as e:
            print(f"❌ Error getting expiration dates: {e}")
            return []
    
    def get_options_chain(self, ticker: str, expiration_date: str = None) -> List[Dict]:
        """
        Получить опционную цепочку через snapshot API (быстрее и с OpenInterest!)
        
        Args:
            ticker: Тикер акции
            expiration_date: Дата экспирации (опционально)
            
        Returns:
            List опционных контрактов с OI, Volume, Greeks
        """
        try:
            # Используем snapshot API - возвращает ВСЕ контракты сразу с OI!
            url = f"{self.base_url}/v3/snapshot/options/{ticker}"
            params = {
                "apiKey": self.api_key,
                "limit": 250  # Максимальное количество контрактов
            }
            if expiration_date:
                params["expiration_date"] = expiration_date
            
            response = requests.get(url, params=params, timeout=15)
            response.raise_for_status()
            
            data = response.json()
            
            if data.get("status") != "OK":
                raise ValueError(f"Ошибка получения опционов для {ticker}")
            
            results = data.get("results", [])
            
            enriched_contracts = []
            for idx, contract in enumerate(results[:100]):  # Ограничим первыми 100 для скорости
                try:
                    details = contract.get("details", {})
                    day_data = contract.get("day", {})
                    greeks = contract.get("greeks", {})
                    
                    enriched_contracts.append({
                        "ticker": details.get("ticker", ""),
                        "underlying": ticker,
                        "expiration_date": details.get("expiration_date", ""),
                        "strike": details.get("strike_price", 0),
                        "contract_type": details.get("contract_type", "").lower(),
                        "open_interest": contract.get("open_interest", 0),  # ПРАВИЛЬНО: в contract напрямую!
                        "volume": day_data.get("volume", 0),
                        "bid": contract.get("last_quote", {}).get("bid", 0),
                        "ask": contract.get("last_quote", {}).get("ask", 0),
                        "last_price": day_data.get("close", 0),
                        # ЗАЧЕМ: IV может быть в greeks или в contract напрямую
                        "implied_volatility": greeks.get("implied_volatility") or contract.get("implied_volatility", 0),
                        "delta": greeks.get("delta", 0),
                        "gamma": greeks.get("gamma", 0),
                        "theta": greeks.get("theta", 0),
                        "vega": greeks.get("vega", 0)
                    })
                except Exception as e:
                    continue
            
            return enriched_contracts
        except requests.exceptions.RequestException as e:
            raise Exception(f"Ошибка запроса опционов: {str(e)}")
    def _get_contract_details(self, option_ticker: str) -> Dict:
        """
        Получить детали конкретного опционного контракта
        
        Args:
            option_ticker: Тикер опциона (например, O:SPY251219C00450000)
            
        Returns:
            Dict с деталями контракта
        """
        try:
            # Получить snapshot опциона
            url = f"{self.base_url}/v3/snapshot/options/{option_ticker.split(':')[1]}"
            params = {"apiKey": self.api_key}
            
            response = requests.get(url, params=params, timeout=10)
            
            if response.status_code != 200:
                # Если нет данных, вернуть базовую структуру
                return self._parse_option_ticker(option_ticker)
            
            data = response.json()
            result = data.get("results", {})
            
            # Парсим тикер для получения базовой информации
            base_info = self._parse_option_ticker(option_ticker)
            
            # Добавляем рыночные данные если есть
            if result:
                details = result.get("details", {})
                day_data = result.get("day", {})
                greeks = result.get("greeks", {})
                
                base_info.update({
                    "open_interest": details.get("open_interest", 0),
                    "volume": day_data.get("volume", 0),
                    "bid": result.get("bid", 0),
                    "ask": result.get("ask", 0),
                    "last_price": result.get("last_quote", {}).get("midpoint", 0),
                    "implied_volatility": greeks.get("implied_volatility", 0),
                    "delta": greeks.get("delta", 0),
                    "gamma": greeks.get("gamma", 0),
                    "theta": greeks.get("theta", 0),
                    "vega": greeks.get("vega", 0),
                })
            
            return base_info
            
        except Exception as e:
            # В случае ошибки возвращаем базовую информацию
            return self._parse_option_ticker(option_ticker)
    
    def _parse_option_ticker(self, option_ticker: str) -> Dict:
        """
        Парсить тикер опциона для извлечения базовой информации
        
        Формат: O:SPY251219C00450000
        O: - префикс опциона
        SPY - базовый актив
        251219 - дата экспирации (YYMMDD)
        C/P - тип (Call/Put)
        00450000 - страйк * 1000
        
        Args:
            option_ticker: Тикер опциона
            
        Returns:
            Dict с базовой информацией
        """
        try:
            # Убрать префикс O:
            ticker = option_ticker.replace("O:", "")
            
            # Найти позицию C или P
            call_pos = ticker.find("C")
            put_pos = ticker.find("P")
            
            if call_pos > 0:
                option_type = "call"
                split_pos = call_pos
            elif put_pos > 0:
                option_type = "put"
                split_pos = put_pos
            else:
                raise ValueError("Неверный формат тикера")
            
            # Извлечь компоненты
            underlying = ticker[:split_pos - 6]  # Базовый актив
            exp_date = ticker[split_pos - 6:split_pos]  # Дата экспирации
            strike_str = ticker[split_pos + 1:]  # Страйк
            
            # Преобразовать страйк
            strike = float(strike_str) / 1000
            
            # Преобразовать дату
            exp_year = 2000 + int(exp_date[:2])
            exp_month = int(exp_date[2:4])
            exp_day = int(exp_date[4:6])
            expiration = f"{exp_year}-{exp_month:02d}-{exp_day:02d}"
            
            return {
                "ticker": option_ticker,
                "underlying": underlying,
                "expiration_date": expiration,
                "strike": strike,
                "option_type": option_type,
                "open_interest": 0,
                "volume": 0,
                "bid": 0,
                "ask": 0,
                "last_price": 0,
                "implied_volatility": 0,
                "delta": 0,
                "gamma": 0,
                "theta": 0,
                "vega": 0,
            }
            
        except Exception as e:
            raise ValueError(f"Ошибка парсинга тикера {option_ticker}: {str(e)}")
    
    def get_historical_data(self, ticker: str, period: str = "1mo", interval: str = "1h") -> List[Dict]:
        """
        Получить исторические данные (OHLC) для графика
        
        Args:
            ticker: Тикер акции
            period: Период данных (1d, 5d, 1mo, 3mo, 6mo, 1y)
            interval: Интервал свечей (1m, 5m, 15m, 30m, 1h, 1d)
            
        Returns:
            List словарей с OHLC данными
        """
        try:
            print(f"📊 Запрос исторических данных для {ticker}, period={period}, interval={interval}")
            
            # Определяем временной диапазон
            end_date = datetime.now()
            
            period_map = {
                "1d": 1,
                "5d": 5,
                "1mo": 30,
                "3mo": 90,
                "6mo": 180,
                "1y": 365
            }
            
            days = period_map.get(period, 30)
            start_date = end_date - timedelta(days=days)
            
            print(f"📅 Диапазон: {start_date.strftime('%Y-%m-%d')} - {end_date.strftime('%Y-%m-%d')}")
            
            # Определяем множитель и timespan для Polygon API
            interval_map = {
                "1m": ("minute", 1),
                "5m": ("minute", 5),
                "15m": ("minute", 15),
                "30m": ("minute", 30),
                "1h": ("hour", 1),
                "1d": ("day", 1)
            }
            
            timespan, multiplier = interval_map.get(interval, ("hour", 1))
            
            # Формируем URL для aggregates API
            url = f"{self.base_url}/v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{start_date.strftime('%Y-%m-%d')}/{end_date.strftime('%Y-%m-%d')}"
            
            params = {
                "apiKey": self.api_key,
                "adjusted": "true",
                "sort": "asc",
                "limit": 50000
            }
            
            print(f"🔗 URL: {url}")
            print(f"📡 Отправка запроса к Polygon API...")
            
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            
            print(f"📦 Ответ от API: status={data.get('status')}, resultsCount={data.get('resultsCount', 0)}")
            
            if data.get("status") != "OK":
                print(f"⚠️ Статус не OK: {data}")
                return []
            
            if not data.get("results"):
                print(f"⚠️ Нет результатов в ответе")
                return []
            
            results = data["results"]
            print(f"✅ Получено {len(results)} свечей")
            
            # Преобразуем в нужный формат
            historical_data = []
            for bar in results:
                historical_data.append({
                    "timestamp": datetime.fromtimestamp(bar["t"] / 1000).isoformat(),
                    "open": bar["o"],
                    "high": bar["h"],
                    "low": bar["l"],
                    "close": bar["c"],
                    "volume": bar["v"]
                })
            
            print(f"✅ Данные преобразованы, возвращаем {len(historical_data)} свечей")
            return historical_data
            
        except Exception as e:
            print(f"❌ Error getting historical data: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def _get_next_friday(self) -> str:
        """
        Получить дату ближайшей пятницы (стандартная экспирация опционов)
        
        Returns:
            Дата в формате YYYY-MM-DD
        """
        today = datetime.now()
        days_ahead = 4 - today.weekday()  # 4 = пятница
        
        if days_ahead <= 0:  # Если сегодня пятница или позже
            days_ahead += 7
        
        next_friday = today + timedelta(days=days_ahead)
        return next_friday.strftime("%Y-%m-%d")
    
    def get_dividend_yield(self, ticker: str) -> Dict:
        """
        Получить дивидендную доходность акции
        ЗАЧЕМ: Для модели Black-Scholes-Merton, которая учитывает дивиденды
        
        Метод:
        1. Получаем историю дивидендов за последний год
        2. Суммируем все выплаты
        3. Делим на текущую цену акции
        
        Args:
            ticker: Тикер акции (например, AAPL)
            
        Returns:
            Dict с дивидендной доходностью
            {
                'ticker': 'AAPL',
                'dividend_yield': 0.0052,  # 0.52% в десятичном формате
                'annual_dividend': 0.96,    # Годовой дивиденд на акцию
                'last_dividend': 0.24,      # Последний дивиденд
                'frequency': 4,             # Частота выплат в год
                'ex_dividend_date': '2024-02-09'
            }
        """
        try:
            # Получаем дивиденды за последний год
            today = datetime.now().date()
            one_year_ago = today - timedelta(days=365)
            
            url = f"{self.base_url}/v3/reference/dividends"
            params = {
                "apiKey": self.api_key,
                "ticker": ticker,
                "ex_dividend_date.gte": one_year_ago.strftime("%Y-%m-%d"),
                "ex_dividend_date.lte": today.strftime("%Y-%m-%d"),
                "limit": 50,
                "order": "desc"
            }
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            
            if data.get("status") != "OK" or not data.get("results"):
                # Нет дивидендов — возвращаем 0
                return {
                    "ticker": ticker,
                    "dividend_yield": 0.0,
                    "annual_dividend": 0.0,
                    "last_dividend": 0.0,
                    "frequency": 0,
                    "ex_dividend_date": None
                }
            
            results = data["results"]
            
            # Суммируем все дивиденды за год
            total_dividends = sum(d.get("cash_amount", 0) for d in results)
            last_dividend = results[0].get("cash_amount", 0) if results else 0
            ex_dividend_date = results[0].get("ex_dividend_date") if results else None
            frequency = len(results)  # Количество выплат за год
            
            # Получаем текущую цену для расчёта yield
            try:
                stock_data = self.get_stock_price(ticker)
                current_price = stock_data.get("price", 0)
            except:
                current_price = 0
            
            # Рассчитываем dividend yield
            dividend_yield = total_dividends / current_price if current_price > 0 else 0
            
            return {
                "ticker": ticker,
                "dividend_yield": round(dividend_yield, 6),  # В десятичном формате (0.0052 = 0.52%)
                "annual_dividend": round(total_dividends, 4),
                "last_dividend": round(last_dividend, 4),
                "frequency": frequency,
                "ex_dividend_date": ex_dividend_date
            }
            
        except requests.exceptions.RequestException as e:
            print(f"⚠️ Ошибка получения дивидендов для {ticker}: {e}")
            return {
                "ticker": ticker,
                "dividend_yield": 0.0,
                "annual_dividend": 0.0,
                "last_dividend": 0.0,
                "frequency": 0,
                "ex_dividend_date": None
            }
        except Exception as e:
            print(f"⚠️ Ошибка парсинга дивидендов для {ticker}: {e}")
            return {
                "ticker": ticker,
                "dividend_yield": 0.0,
                "annual_dividend": 0.0,
                "last_dividend": 0.0,
                "frequency": 0,
                "ex_dividend_date": None
            }
