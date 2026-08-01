"""
Options Service
Сервис для работы с опционными данными через Polygon.io API
"""

import os
import requests
from typing import Dict, List, Optional
from datetime import datetime, timedelta

from app.utils.trading_date import get_trading_today


class OptionsService:
    """Сервис для получения опционных данных"""
    
    def __init__(self):
        self.api_key = os.getenv("POLYGON_API_KEY")
        if not self.api_key:
            raise ValueError("POLYGON_API_KEY не найден в .env файле")
        
        self.base_url = "https://api.polygon.io"
    
    def get_option_expirations(self, ticker: str) -> List[str]:
        """
        Получить доступные даты экспирации для тикера
        
        Args:
            ticker: Тикер акции (например, SPY)
            
        Returns:
            List дат экспирации в формате YYYY-MM-DD
        """
        try:
            # Получаем контракты опционов с пагинацией
            url = f"{self.base_url}/v3/reference/options/contracts"
            params = {
                "underlying_ticker": ticker,
                "limit": 1000,
                "apiKey": self.api_key
            }
            
            all_expirations = set()
            max_pages = 5  # Ограничение на количество страниц (5000 контрактов)
            page = 0
            
            while url and page < max_pages:
                # Для первого запроса используем params, для остальных - добавляем apiKey в URL
                if page == 0:
                    response = requests.get(url, params=params, timeout=10)
                else:
                    # next_url уже содержит все параметры, добавляем только apiKey
                    url_with_key = f"{url}&apiKey={self.api_key}"
                    response = requests.get(url_with_key, timeout=10)
                
                response.raise_for_status()
                
                data = response.json()
                
                if data.get("status") != "OK":
                    break
                
                # Извлекаем даты экспирации
                for contract in data.get("results", []):
                    exp_date = contract.get("expiration_date")
                    if exp_date:
                        all_expirations.add(exp_date)
                
                # Проверяем наличие следующей страницы
                url = data.get("next_url")
                page += 1
            
            # Сортируем и возвращаем только будущие даты
            # Торговая дата (America/New_York) — единая база с фронтом, а не серверное время
            today = get_trading_today()
            future_expirations = [
                exp for exp in sorted(all_expirations)
                if datetime.strptime(exp, "%Y-%m-%d").date() >= today
            ]
            
            return future_expirations  # Возвращаем все даты
            
        except Exception as e:
            print(f"Error fetching option expirations: {e}")
            return []
    
    def get_options_chain(
        self, 
        ticker: str, 
        expiration_date: Optional[str] = None
    ) -> List[Dict]:
        """
        Получить опционную цепочку для тикера через snapshot API
        
        Args:
            ticker: Тикер акции
            expiration_date: Дата экспирации (опционально)
            
        Returns:
            List опционных контрактов с ценами, volume, OI и греками
        """
        try:

            # Используем snapshot API - возвращает ВСЕ данные сразу!
            url = f"{self.base_url}/v3/snapshot/options/{ticker}"
            params = {
                "apiKey": self.api_key,
                "limit": 250  # Максимальное количество контрактов на одну страницу
            }
            
            # Если указана дата экспирации, фильтруем по ней
            if expiration_date:
                params["expiration_date.gte"] = expiration_date
                params["expiration_date.lte"] = expiration_date
            
            print(f"🔍 Fetching options chain for {ticker}, date: {expiration_date}")
            
            all_contracts = []
            page = 0
            max_pages = 20 # Защита от бесконечного цикла (до 5000 контрактов)
            
            while url and page < max_pages:
                if page == 0:
                    response = requests.get(url, params=params, timeout=15)
                else:
                    # Next URL уже содержит ключ и параметры
                    if "apiKey" not in url:
                        url = f"{url}&apiKey={self.api_key}"
                    response = requests.get(url, timeout=15)
                
                response.raise_for_status()
                data = response.json()
                
                results = data.get("results", [])
                if not results and page == 0:
                     # Если на первой странице пусто
                     break
                     
                all_contracts.extend(results)
                
                # Проверяем наличие следующей страницы
                url = data.get("next_url")
                if not url:
                    break
                    
                page += 1
                if page > 0:
                    print(f"   Fetching page {page + 1}...")

            print(f"📦 Snapshot API response status: {data.get('status')}")
            
            if not all_contracts:
                print(f"⚠️ No contracts found, generating mock data for {ticker}")
                return self._generate_mock_options(ticker, expiration_date)
                
            contracts = all_contracts
            print(f"📊 Found {len(contracts)} contracts total")
            
            # Извлекаем полные данные из snapshot
            options_list = []
            
            # Логирование первых 3 контрактов для отладки real-time данных
            print(f"\n{'='*80}")
            print(f"📊 BACKEND: Обработка опционов для {ticker} {expiration_date}")
            print(f"{'='*80}")
            
            for idx, contract in enumerate(contracts):
                details = contract.get("details", {})
                day_data = contract.get("day", {})
                greeks = contract.get("greeks", {})
                
                # ✅ ПРАВИЛЬНО: Real-time данные из contract.last_quote (не day_data!)
                last_quote = contract.get("last_quote", {}) or {}
                last_trade = contract.get("last_trade", {}) or {}
                
                strike = details.get("strike_price")
                contract_type = details.get("contract_type", "").lower()
                
                if not strike:
                    continue
                
                # Real-time цены из last_quote и last_trade
                bid = last_quote.get("bid", 0) or 0
                ask = last_quote.get("ask", 0) or 0
                last_price = last_trade.get("price", 0) or day_data.get("close", 0) or 0
                
                # FALLBACK: Если рынок закрыт или нет ликвидности (bid/ask = 0),
                # оцениваем bid/ask на основе last_price с разумным спредом (например, ±2%)
                # Это позволяет "Золотому подбору" работать даже на закрытом рынке
                if last_price > 0:
                    if bid == 0:
                        bid = last_price * 0.98  # -2%
                    if ask == 0:
                        ask = last_price * 1.02  # +2%
                
                mid = (bid + ask) / 2 if bid > 0 and ask > 0 else last_price
                
                # Определяем is_realtime флаг (true только если были реальные биды/аски)
                is_realtime = (
                    last_quote is not None and 
                    last_quote.get("bid", 0) > 0 and 
                    last_quote.get("ask", 0) > 0
                )
                
                # Логируем первые 3 контракта
                if idx < 3:
                    print(f"\n🔹 CONTRACT #{idx + 1}: {contract_type.upper()} Strike ${strike}")
                    print(f"   - bid: {bid:.2f} (orig: {last_quote.get('bid', 0)})")
                    print(f"   - ask: {ask:.2f} (orig: {last_quote.get('ask', 0)})")
                    print(f"   - last: {last_price}")
                    print(f"   - is_realtime: {is_realtime}")
                    print(f"   - volume: {day_data.get('volume', 0)}")
                    print(f"   - open_interest: {contract.get('open_interest', 0)}")
                
                # Полные данные опциона с real-time ценами
                option_data = {
                    "strike": strike,
                    "type": contract_type,
                    "expiration": details.get("expiration_date"),
                    "ticker": contract.get("ticker"),
                    
                    # ✅ Real-time цены из last_quote и last_trade (или fallback)
                    "last": last_price,
                    "bid": bid,
                    "ask": ask,
                    "mid": mid,
                    "close": day_data.get("close"),
                    "open": day_data.get("open"),
                    "high": day_data.get("high"),
                    "low": day_data.get("low"),
                    
                    # Volume и Open Interest
                    "volume": day_data.get("volume", 0),
                    "open_interest": contract.get("open_interest", 0),
                    
                    # Greeks
                    "delta": greeks.get("delta"),
                    "gamma": greeks.get("gamma"),
                    "theta": greeks.get("theta"),
                    "vega": greeks.get("vega"),
                    
                    # Implied Volatility
                    "implied_volatility": contract.get("implied_volatility"),
                    
                    # ✅ Флаг real-time данных
                    "is_realtime": is_realtime
                }
                
                options_list.append(option_data)
            
            print(f"{'='*80}\n")
            
            return options_list
            
        except Exception as e:
            print(f"Error fetching options chain: {e}")
            return []
    
    def _get_option_price(self, option_ticker: str) -> Dict:
        """
        Получить последнюю цену опционного контракта
        
        Args:
            option_ticker: Тикер опционного контракта
            
        Returns:
            Dict с ценой и метаданными
        """
        try:
            # Получаем последнюю сделку
            url = f"{self.base_url}/v2/last/trade/{option_ticker}"
            params = {"apiKey": self.api_key}
            
            response = requests.get(url, params=params, timeout=5)
            response.raise_for_status()
            
            data = response.json()
            
            if data.get("status") != "OK":
                return {"price": 0}
            
            result = data.get("results", {})
            
            return {
                "price": result.get("p", 0),  # price
                "bid": result.get("b", 0),     # bid
                "ask": result.get("a", 0),     # ask
                "volume": result.get("v", 0),  # volume
                "open_interest": 0,  # Polygon не всегда предоставляет OI
                "implied_volatility": None  # Требует отдельного запроса
            }
            
        except Exception as e:
            print(f"Error fetching option price for {option_ticker}: {e}")
            return {"price": 0}
    
    def calculate_pl(
        self,
        positions: List[Dict],
        price_range: tuple = None,
        num_points: int = 200
    ) -> Dict:
        """
        Рассчитать P&L для портфеля опционов
        
        Args:
            positions: Список позиций
            price_range: Диапазон цен (min, max)
            num_points: Количество точек для расчета
            
        Returns:
            Dict с данными для графика P&L
        """
        if not positions:
            return {
                "prices": [],
                "pl_values": [],
                "breakeven_points": [],
                "max_profit": 0,
                "max_loss": 0
            }
        
        # Определяем диапазон цен
        if not price_range:
            strikes = [p["strike"] for p in positions]
            min_strike = min(strikes)
            max_strike = max(strikes)
            range_size = (max_strike - min_strike) * 0.5
            price_range = (
                max(0, min_strike - range_size),
                max_strike + range_size
            )
        
        min_price, max_price = price_range
        step = (max_price - min_price) / num_points
        
        prices = []
        pl_values = []
        
        # Расчет P&L для каждой точки цены
        for i in range(num_points + 1):
            price = min_price + (step * i)
            prices.append(price)
            
            total_pl = 0
            for pos in positions:
                pl = self._calculate_position_pl(pos, price)
                total_pl += pl
            
            pl_values.append(total_pl)
        
        # Поиск breakeven points
        breakeven_points = []
        for i in range(1, len(pl_values)):
            if (pl_values[i-1] < 0 and pl_values[i] > 0) or \
               (pl_values[i-1] > 0 and pl_values[i] < 0):
                # Линейная интерполяция для точного breakeven
                breakeven = prices[i-1] + (prices[i] - prices[i-1]) * \
                           (-pl_values[i-1] / (pl_values[i] - pl_values[i-1]))
                breakeven_points.append(round(breakeven, 2))
        
        return {
            "prices": prices,
            "pl_values": pl_values,
            "breakeven_points": breakeven_points,
            "max_profit": round(max(pl_values), 2),
            "max_loss": round(min(pl_values), 2),
            "max_profit_price": prices[pl_values.index(max(pl_values))],
            "max_loss_price": prices[pl_values.index(min(pl_values))]
        }
    
    def _calculate_position_pl(self, position: Dict, spot_price: float) -> float:
        """
        Рассчитать P&L для одной позиции
        
        Args:
            position: Данные позиции
            spot_price: Цена актива
            
        Returns:
            P&L для позиции
        """
        strike = position["strike"]
        option_type = position["type"]
        direction = position["direction"]
        size = position["size"]
        premium = position["price"]
        commission = position.get("commission", 0)
        
        # Расчет внутренней стоимости
        if option_type == "call":
            intrinsic_value = max(0, spot_price - strike)
        else:  # put
            intrinsic_value = max(0, strike - spot_price)
        
        # Расчет P&L
        if direction == "buy":
            pl = (intrinsic_value - premium) * size * 100
        else:  # sell
            pl = (premium - intrinsic_value) * size * 100
        
        # Вычитаем комиссию
        pl -= commission * size
        
        return pl
    
    def get_option_details(self, ticker: str, expiration_date: str, strike: float, option_type: str):
        """
        Получить детальную информацию (bid/ask/volume/oi) для конкретного опциона
        
        Args:
            ticker: Тикер актива
            expiration_date: Дата экспирации в формате YYYY-MM-DD
            strike: Страйк цена
            option_type: Тип опциона (CALL или PUT)
            
        Returns:
            dict: Детальная информация об опционе
        """
        try:
            # Формируем тикер опциона в формате Polygon
            # Пример: O:AAPL251017C00230000
            exp_date = expiration_date.replace('-', '')[2:]  # 2025-10-17 -> 251017
            option_letter = 'C' if option_type == 'CALL' else 'P'
            strike_formatted = f"{int(strike * 1000):08d}"  # 230 -> 00230000
            
            option_ticker = f"O:{ticker}{exp_date}{option_letter}{strike_formatted}"
            print(f"🔍 Fetching details for: {option_ticker}")
            
            # Получаем snapshot для bid/ask/volume/oi
            snapshot_url = f"https://api.polygon.io/v3/snapshot/options/{ticker}/{option_ticker}"
            params = {"apiKey": self.api_key}
            
            snapshot_response = requests.get(snapshot_url, params=params, timeout=10)
            print(f"📡 Snapshot response status: {snapshot_response.status_code}")
            
            if snapshot_response.status_code == 200:
                snapshot_data = snapshot_response.json()
                print(f"📦 Snapshot data: {snapshot_data}")
                results = snapshot_data.get('results', {})
                
                day_data = results.get('day', {})
                
                # ✅ ПРАВИЛЬНО: Real-time данные из results.last_quote (не day_data!)
                last_quote = results.get('last_quote', {}) or {}
                last_trade = results.get('last_trade', {}) or {}
                
                # Real-time цены
                bid = last_quote.get('bid', 0) or 0
                ask = last_quote.get('ask', 0) or 0
                premium = last_trade.get('price', 0) or day_data.get('close', 0) or 0
                
                # Если нет bid/ask, используем close ± спред (примерно 2%)
                if bid == 0 and premium > 0:
                    bid = premium * 0.98
                if ask == 0 and premium > 0:
                    ask = premium * 1.02
                
                # Логирование для отладки
                print(f"\n{'='*80}")
                print(f"📊 BACKEND: Детали опциона {option_ticker}")
                print(f"   - bid: {bid}")
                print(f"   - ask: {ask}")
                print(f"   - last: {premium}")
                print(f"{'='*80}\n")
                
                # Получаем Greeks из snapshot данных
                greeks = results.get('greeks', {})
                
                # Получаем implied_volatility из results (Polygon API возвращает его в корне results)
                implied_volatility = results.get('implied_volatility', 0)
                print(f"📊 Implied Volatility from API: {implied_volatility}")
                
                # Если Greeks отсутствуют, генерируем mock данные для тестирования
                if not greeks or all(v == 0 for v in greeks.values()):
                    # Mock Greeks на основе типа опциона и монетности
                    current_price = 245.27  # Примерная текущая цена AAPL
                    moneyness = strike / current_price  # ATM = 1.0, ITM < 1.0, OTM > 1.0
                    
                    if option_type == 'CALL':
                        mock_delta = max(0.1, min(0.9, 1.2 - moneyness))  # 0.1-0.9 для CALL
                        mock_gamma = 0.02 * (1 - abs(moneyness - 1) * 2)  # Максимум у ATM
                        mock_theta = -0.05 * mock_delta  # Отрицательная для покупки
                        mock_vega = 0.15 * mock_gamma * 100  # Пропорциональна гамме
                    else:  # PUT
                        mock_delta = min(-0.1, max(-0.9, moneyness - 1.2))  # -0.1 до -0.9 для PUT
                        mock_gamma = 0.02 * (1 - abs(moneyness - 1) * 2)
                        mock_theta = -0.05 * abs(mock_delta)
                        mock_vega = 0.15 * mock_gamma * 100
                    
                    greeks = {
                        'delta': round(mock_delta, 3),
                        'gamma': round(mock_gamma, 3),
                        'theta': round(mock_theta, 3),
                        'vega': round(mock_vega, 2)
                    }
                
                # Если IV не пришла от API или равна 0, используем mock значение 25%
                if implied_volatility == 0 or implied_volatility is None:
                    implied_volatility = 0.25
                    print(f"⚠️ Using mock IV: {implied_volatility}")
                
                return {
                    "strike": strike,
                    "type": option_type,
                    "bid": round(bid, 2),
                    "ask": round(ask, 2),
                    "premium": round(premium, 2),
                    "volume": day_data.get('volume', 0),
                    "open_interest": results.get('open_interest', 0),
                    # Greeks для расчета метрик
                    "delta": greeks.get('delta', 0),
                    "gamma": greeks.get('gamma', 0),
                    "theta": greeks.get('theta', 0),
                    "vega": greeks.get('vega', 0),
                    "implied_volatility": implied_volatility
                }
            else:
                print(f"❌ Snapshot failed with status: {snapshot_response.status_code}")
                # Fallback - возвращаем базовые данные с mock Greeks
                # Mock Greeks для тестирования
                current_price = 245.27  # Примерная текущая цена AAPL
                moneyness = strike / current_price  # ATM = 1.0, ITM < 1.0, OTM > 1.0
                
                if option_type == 'CALL':
                    mock_delta = max(0.1, min(0.9, 1.2 - moneyness))  # 0.1-0.9 для CALL
                    mock_gamma = 0.02 * (1 - abs(moneyness - 1) * 2)  # Максимум у ATM
                    mock_theta = -0.05 * mock_delta  # Отрицательная для покупки
                    mock_vega = 0.15 * mock_gamma * 100  # Пропорциональна гамме
                else:  # PUT
                    mock_delta = min(-0.1, max(-0.9, moneyness - 1.2))  # -0.1 до -0.9 для PUT
                    mock_gamma = 0.02 * (1 - abs(moneyness - 1) * 2)
                    mock_theta = -0.05 * abs(mock_delta)
                    mock_vega = 0.15 * mock_gamma * 100
                
                return {
                    "strike": strike,
                    "type": option_type,
                    "bid": 0,
                    "ask": 0,
                    "premium": 0,
                    "volume": 0,
                    "open_interest": 0,
                    # Mock Greeks для тестирования
                    "delta": round(mock_delta, 3),
                    "gamma": round(mock_gamma, 3),
                    "theta": round(mock_theta, 3),
                    "vega": round(mock_vega, 2),
                    "implied_volatility": 0.25  # 25% IV по умолчанию
                }
                
        except Exception as e:
            print(f"Error fetching option details: {e}")
            # Возвращаем данные с mock Greeks при ошибке
            current_price = 245.27  # Примерная текущая цена AAPL
            moneyness = strike / current_price  # ATM = 1.0, ITM < 1.0, OTM > 1.0
            
            if option_type == 'CALL':
                mock_delta = max(0.1, min(0.9, 1.2 - moneyness))  # 0.1-0.9 для CALL
                mock_gamma = 0.02 * (1 - abs(moneyness - 1) * 2)  # Максимум у ATM
                mock_theta = -0.05 * mock_delta  # Отрицательная для покупки
                mock_vega = 0.15 * mock_gamma * 100  # Пропорциональна гамме
            else:  # PUT
                mock_delta = min(-0.1, max(-0.9, moneyness - 1.2))  # -0.1 до -0.9 для PUT
                mock_gamma = 0.02 * (1 - abs(moneyness - 1) * 2)
                mock_theta = -0.05 * abs(mock_delta)
                mock_vega = 0.15 * mock_gamma * 100
            
            return {
                "strike": strike,
                "type": option_type,
                "bid": 0,
                "ask": 0,
                "premium": 0,
                "volume": 0,
                "open_interest": 0,
                # Mock Greeks для тестирования
                "delta": round(mock_delta, 3),
                "gamma": round(mock_gamma, 3),
                "theta": round(mock_theta, 3),
                "vega": round(mock_vega, 2),
                "implied_volatility": 0.25  # 25% IV по умолчанию
            }

    def generate_mock_option(self, ticker: str, expiration_date: str, strike: float, option_type: str):
        """
        Генерировать mock данные для опциона
        
        Args:
            ticker: Тикер актива
            expiration_date: Дата экспирации в формате YYYY-MM-DD
            strike: Страйк цена
            option_type: Тип опциона (CALL или PUT)
            
        Returns:
            dict: Mock данные для опциона
        """
        current_price = 245.27  # Примерная текущая цена AAPL
        moneyness = strike / current_price  # ATM = 1.0, ITM < 1.0, OTM > 1.0
        
        if option_type == 'CALL':
            mock_delta = max(0.1, min(0.9, 1.2 - moneyness))  # 0.1-0.9 для CALL
            mock_gamma = 0.02 * (1 - abs(moneyness - 1) * 2)  # Максимум у ATM
            mock_theta = -0.05 * mock_delta  # Отрицательная для покупки
            mock_vega = 0.15 * mock_gamma * 100  # Пропорциональна гамме
        else:  # PUT
            mock_delta = min(-0.1, max(-0.9, moneyness - 1.2))  # -0.1 до -0.9 для PUT
            mock_gamma = 0.02 * (1 - abs(moneyness - 1) * 2)
            mock_theta = -0.05 * abs(mock_delta)
            mock_vega = 0.15 * mock_gamma * 100
        
        return {
            "strike": strike,
            "type": option_type,
            "bid": 0,
            "ask": 0,
            "premium": 0,
            "volume": 0,
            "open_interest": 0,
            # Mock Greeks для тестирования
            "delta": round(mock_delta, 3),
            "gamma": round(mock_gamma, 3),
            "theta": round(mock_theta, 3),
            "vega": round(mock_vega, 2),
            "implied_volatility": 0.25  # 25% IV по умолчанию
        }

    def get_iv_surface(self, ticker: str, num_expirations: int = 5) -> Dict:
        """
        Получить IV Surface для тикера — IV для нескольких дат экспирации
        ЗАЧЕМ: Для точного прогнозирования IV при симуляции времени
        
        Args:
            ticker: Тикер акции (например, SPY)
            num_expirations: Количество дат экспирации для загрузки (по умолчанию 5)
            
        Returns:
            Dict с IV Surface структурой:
            {
                "surface": {
                    strike: { days_to_expiration: iv, ... },
                    ...
                },
                "expirations": ["2025-01-17", "2025-01-24", ...],
                "data_points": 150
            }
        """
        try:
            # Шаг 1: Получаем ближайшие даты экспирации
            expirations = self.get_option_expirations(ticker)
            if not expirations:
                print(f"⚠️ No expirations found for {ticker}")
                return {"surface": {}, "expirations": [], "data_points": 0}
            
            # Берём только первые N дат
            selected_expirations = expirations[:num_expirations]
            print(f"📊 Loading IV Surface for {ticker}, dates: {selected_expirations}")
            
            # Шаг 2: Загружаем опционы для каждой даты
            surface = {}
            total_points = 0
            # Торговая дата (America/New_York) — единая база с фронтом, дни до экспирации
            # идут ключами в IV Surface, которую потом использует калькулятор
            today = get_trading_today()
            
            for exp_date in selected_expirations:
                # Вычисляем дни до экспирации
                exp_date_obj = datetime.strptime(exp_date, "%Y-%m-%d").date()
                days_to_exp = (exp_date_obj - today).days
                
                if days_to_exp <= 0:
                    continue
                
                # Загружаем опционы для этой даты
                options = self.get_options_chain(ticker, exp_date)
                
                for opt in options:
                    strike = opt.get("strike")
                    iv = opt.get("implied_volatility")
                    
                    if strike and iv and iv > 0:
                        if strike not in surface:
                            surface[strike] = {}
                        
                        # Конвертируем IV в десятичный формат если нужно
                        iv_decimal = iv / 100 if iv > 1 else iv
                        surface[strike][days_to_exp] = iv_decimal
                        total_points += 1
            
            print(f"✅ IV Surface loaded: {len(surface)} strikes, {total_points} data points")
            
            return {
                "surface": surface,
                "expirations": selected_expirations,
                "data_points": total_points
            }
            
        except Exception as e:
            print(f"❌ Error fetching IV Surface: {e}")
            return {"surface": {}, "expirations": [], "data_points": 0}
