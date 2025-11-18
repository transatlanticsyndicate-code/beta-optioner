"""
Mock Data Provider - предоставляет mock данные для локальной разработки и тестирования
Использует JSON файлы из backend/mock_data/
"""

import os
import json
from typing import Dict, List
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class MockDataProvider:
    """
    Провайдер mock данных для локальной разработки
    Читает данные из JSON файлов вместо реальных API запросов
    """
    
    def __init__(self, mock_data_dir: str = None):
        """
        Инициализация провайдера
        
        Args:
            mock_data_dir: Путь к директории с mock данными
        """
        if mock_data_dir is None:
            # По умолчанию используем backend/mock_data
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
            mock_data_dir = os.path.join(base_dir, 'mock_data')
        
        self.mock_data_dir = mock_data_dir
        logger.info(f"MockDataProvider initialized with dir: {mock_data_dir}")
    
    def _load_json(self, file_path: str) -> Dict:
        """
        Загрузить JSON файл
        
        Args:
            file_path: Путь к файлу
            
        Returns:
            Dict с данными из файла
        """
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            # Извлекаем имя файла для более понятного сообщения
            filename = os.path.basename(file_path)
            ticker = filename.replace('.json', '').split('_')[0]
            
            logger.error(f"Mock file not found: {file_path}")
            logger.info(f"💡 Подсказка: Создайте файл {filename} в {os.path.dirname(file_path)}")
            logger.info(f"   Или используйте существующие тикеры: SPY, AAPL")
            
            # Возвращаем понятную ошибку
            raise FileNotFoundError(
                f"❌ Mock данные для {ticker} не найдены.\n\n"
                f"📁 Ожидаемый файл: {file_path}\n\n"
                f"💡 Решения:\n"
                f"1. Создайте файл вручную, скопировав структуру из SPY.json\n"
                f"2. Используйте существующие тикеры: SPY, AAPL\n"
                f"3. Переключитесь на IB Gateway (REACT_APP_ENV=production)\n\n"
                f"📚 См. backend/mock_data/README.md для деталей"
            )
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in {file_path}: {e}")
            raise
    
    def get_stock_price(self, ticker: str) -> Dict:
        """
        Получить цену акции из mock данных
        Если данных нет - автоматически создает template
        
        Args:
            ticker: Тикер акции (например, SPY)
            
        Returns:
            Dict с данными о цене акции
        """
        file_path = os.path.join(self.mock_data_dir, 'stocks', f'{ticker}.json')
        logger.info(f"Loading stock price for {ticker} from mock data")
        
        try:
            return self._load_json(file_path)
        except FileNotFoundError:
            # Автоматически создаем mock данные для нового тикера
            logger.warning(f"Mock data not found for {ticker}, creating template...")
            self._auto_create_mock_data(ticker)
            # Пробуем загрузить снова
            return self._load_json(file_path)
    
    def get_expiration_dates(self, ticker: str) -> List[str]:
        """
        Получить список дат экспирации опционов из mock данных
        
        Args:
            ticker: Тикер акции
            
        Returns:
            List дат экспирации в формате MMMYY
        """
        options_dir = os.path.join(self.mock_data_dir, 'options_chains')
        
        # Поиск всех файлов options chains для данного тикера
        expirations = []
        try:
            for filename in os.listdir(options_dir):
                if filename.startswith(f'{ticker}_') and filename.endswith('.json'):
                    # Извлекаем дату экспирации из имени файла
                    # Формат: TICKER_EXPIRATION.json -> EXPIRATION
                    expiration = filename.replace(f'{ticker}_', '').replace('.json', '')
                    expirations.append(expiration)
            
            logger.info(f"Found {len(expirations)} expirations for {ticker} in mock data")
            return sorted(expirations)
        except FileNotFoundError:
            logger.warning(f"Options chains directory not found: {options_dir}")
            return []
    
    def get_options_chain(self, ticker: str, expiration: str) -> List[Dict]:
        """
        Получить опционную цепочку из mock данных
        
        Args:
            ticker: Тикер акции
            expiration: Дата экспирации в формате MMMYY (например, NOV25)
            
        Returns:
            List опционов с данными
        """
        file_path = os.path.join(
            self.mock_data_dir, 
            'options_chains', 
            f'{ticker}_{expiration}.json'
        )
        logger.info(f"Loading options chain for {ticker} {expiration} from mock data")
        data = self._load_json(file_path)
        return data.get('options', [])
    
    def get_metrics(self, ticker: str) -> Dict:
        """
        Получить метрики для Options Analyzer из mock данных
        
        Args:
            ticker: Тикер акции
            
        Returns:
            Dict с метриками
        """
        file_path = os.path.join(self.mock_data_dir, 'analyzers', f'{ticker}.json')
        logger.info(f"Loading metrics for {ticker} from mock data")
        data = self._load_json(file_path)
        return data.get('step2_metrics', {})
    
    def get_analyzer_data(self, ticker: str) -> Dict:
        """
        Получить полные данные для Options Analyzer из mock данных
        
        Args:
            ticker: Тикер акции
            
        Returns:
            Dict с полными данными анализа
        """
        file_path = os.path.join(self.mock_data_dir, 'analyzers', f'{ticker}.json')
        logger.info(f"Loading analyzer data for {ticker} from mock data")
        return self._load_json(file_path)
    
    def search_contract(self, ticker: str) -> int:
        """
        Получить conid для тикера (для совместимости с IBClient)
        Возвращает фиктивный conid
        
        Args:
            ticker: Тикер акции
            
        Returns:
            int conid (фиктивный для mock данных)
        """
        # Возвращаем фиктивный conid на основе хеша тикера
        logger.info(f"Returning mock conid for {ticker}")
        return abs(hash(ticker)) % 1000000
    
    def get_historical_data(self, ticker: str, period: str = "2y") -> Dict:
        """
        Получить исторические данные (заглушка для mock данных)
        
        Args:
            ticker: Тикер акции
            period: Период данных
            
        Returns:
            Dict с историческими данными
        """
        logger.warning(f"Historical data not implemented for mock provider: {ticker}")
        return {
            "dates": [],
            "closes": [],
            "volumes": []
        }
    
    def get_auth_status(self) -> Dict:
        """
        Статус авторизации (для совместимости с IBClient)
        Mock данные всегда "авторизованы"
        
        Returns:
            Dict со статусом
        """
        return {
            "authenticated": True,
            "connected": True,
            "mode": "mock"
        }
    
    def _auto_create_mock_data(self, ticker: str, price: float = 100.0):
        """
        Автоматически создать mock данные для нового тикера
        
        Args:
            ticker: Тикер акции
            price: Базовая цена (по умолчанию 100)
        """
        logger.info(f"🚀 Auto-creating mock data for {ticker}...")
        
        # Создаем директории если не существуют
        stocks_dir = os.path.join(self.mock_data_dir, 'stocks')
        options_dir = os.path.join(self.mock_data_dir, 'options_chains')
        analyzers_dir = os.path.join(self.mock_data_dir, 'analyzers')
        
        os.makedirs(stocks_dir, exist_ok=True)
        os.makedirs(options_dir, exist_ok=True)
        os.makedirs(analyzers_dir, exist_ok=True)
        
        # Stock price template
        stock_data = {
            "ticker": ticker,
            "price": price,
            "bid": price - 0.05,
            "ask": price + 0.05,
            "high": price + 2.0,
            "low": price - 2.0,
            "volume": 1000000,
            "previous_close": price - 1.0,
            "open": price - 0.5,
            "change": 1.0,
            "change_percent": 1.0,
            "market_cap": None,
            "pe_ratio": None,
            "dividend_yield": None,
            "_source": "Auto-generated template",
            "_captured_at": datetime.now().isoformat() + "Z",
            "_notes": f"Auto-generated mock data for {ticker}. Replace with real values if needed."
        }
        
        # Options chain template
        exp_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        strikes = [price - 5, price - 2.5, price, price + 2.5, price + 5]
        options = []
        
        for i, strike in enumerate(strikes):
            # CALL
            options.append({
                "strike": strike,
                "type": "CALL",
                "conid": abs(hash(ticker + str(strike))) % 900000,
                "bid": max(0.1, price - strike + 2.0),
                "ask": max(0.2, price - strike + 2.2),
                "last": max(0.15, price - strike + 2.1),
                "volume": 500,
                "open_interest": 2000,
                "iv": 0.25,
                "delta": 0.5,
                "gamma": 0.05,
                "theta": -0.15,
                "vega": 0.12,
                "rho": 0.05
            })
            # PUT
            options.append({
                "strike": strike,
                "type": "PUT",
                "conid": abs(hash(ticker + str(strike) + "P")) % 900000,
                "bid": max(0.1, strike - price + 2.0),
                "ask": max(0.2, strike - price + 2.2),
                "last": max(0.15, strike - price + 2.1),
                "volume": 450,
                "open_interest": 1800,
                "iv": 0.26,
                "delta": -0.5,
                "gamma": 0.05,
                "theta": -0.14,
                "vega": 0.12,
                "rho": -0.05
            })
        
        options_data = {
            "ticker": ticker,
            "expiration": "DEC25",
            "expiration_date": exp_date,
            "underlying_price": price,
            "options": options,
            "_source": "Auto-generated template",
            "_captured_at": datetime.now().isoformat() + "Z",
            "_notes": f"Auto-generated mock options for {ticker}."
        }
        
        # Analyzer template
        analyzer_data = {
            "ticker": ticker,
            "step1_stock_price": stock_data,
            "step2_metrics": {
                "iv_rank": 50,
                "iv_percentile": 55,
                "put_call_ratio": 0.95,
                "skew": -0.10,
                "atm_iv": 0.25,
                "implied_move": 5.0,
                "vix_level": 18.0
            },
            "step3_recommendation": "NEUTRAL",
            "step4_ai_analysis": f"Auto-generated analysis for {ticker}. Replace with real analysis.",
            "_source": "Auto-generated template",
            "_captured_at": datetime.now().isoformat() + "Z"
        }
        
        # Сохраняем файлы
        with open(os.path.join(stocks_dir, f'{ticker}.json'), 'w') as f:
            json.dump(stock_data, f, indent=2)
        
        with open(os.path.join(options_dir, f'{ticker}_DEC25.json'), 'w') as f:
            json.dump(options_data, f, indent=2)
        
        with open(os.path.join(analyzers_dir, f'{ticker}.json'), 'w') as f:
            json.dump(analyzer_data, f, indent=2)
        
        logger.info(f"✅ Auto-created mock data for {ticker}")
