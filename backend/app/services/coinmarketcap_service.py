"""
Сервис для работы с CoinMarketCap API
ЗАЧЕМ: Получение топ-400 криптовалют для анализа
Затрагивает: API CoinMarketCap, модели БД
"""

import requests
import logging
from typing import List, Dict
from datetime import datetime

logger = logging.getLogger(__name__)

# API ключ CoinMarketCap
CMC_API_KEY = "REMOVED_API_KEY"
CMC_BASE_URL = "https://pro-api.coinmarketcap.com/v1"


class CoinMarketCapService:
    """
    Сервис для получения данных с CoinMarketCap
    """
    
    def __init__(self):
        self.api_key = CMC_API_KEY
        self.base_url = CMC_BASE_URL
        self.headers = {
            'Accepts': 'application/json',
            'X-CMC_PRO_API_KEY': self.api_key,
        }
    
    def fetch_top_400_cryptos(self) -> List[Dict[str, str]]:
        """
        Получить топ-400 криптовалют с CoinMarketCap
        
        Returns:
            List[Dict]: Список словарей с полями symbol и name
            Пример: [{"symbol": "BTC", "name": "Bitcoin"}, ...]
        """
        try:
            logger.info("Fetching top 400 cryptocurrencies from CoinMarketCap...")
            
            # CoinMarketCap API endpoint для получения списка криптовалют
            url = f"{self.base_url}/cryptocurrency/listings/latest"
            
            # Параметры запроса
            params = {
                'start': '1',
                'limit': '400',  # Топ-400
                'convert': 'USD'
            }
            
            # Выполняем запрос
            response = requests.get(url, headers=self.headers, params=params, timeout=30)
            response.raise_for_status()
            
            # Парсим ответ
            data = response.json()
            
            if 'data' not in data:
                logger.error("Invalid response from CoinMarketCap API")
                raise ValueError("Invalid API response")
            
            # Извлекаем только symbol и name
            crypto_list = []
            for crypto in data['data']:
                crypto_list.append({
                    'symbol': crypto['symbol'],
                    'name': crypto['name']
                })
            
            logger.info(f"Successfully fetched {len(crypto_list)} cryptocurrencies")
            return crypto_list
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching data from CoinMarketCap: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error in fetch_top_400_cryptos: {str(e)}")
            raise
    
    def test_connection(self) -> bool:
        """
        Проверить подключение к CoinMarketCap API
        
        Returns:
            bool: True если подключение успешно
        """
        try:
            url = f"{self.base_url}/cryptocurrency/listings/latest"
            params = {'start': '1', 'limit': '1', 'convert': 'USD'}
            
            response = requests.get(url, headers=self.headers, params=params, timeout=10)
            response.raise_for_status()
            
            logger.info("CoinMarketCap API connection test successful")
            return True
            
        except Exception as e:
            logger.error(f"CoinMarketCap API connection test failed: {str(e)}")
            return False


# Singleton instance
coinmarketcap_service = CoinMarketCapService()
