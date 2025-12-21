"""
Data Source Factory
Фабрика для выбора источника данных (Mock, IB, Polygon, Yahoo или Hybrid)
"""
import os
from typing import Union
from app.services.polygon_client import PolygonClient
from app.services.yahoo_client import YahooClient
from app.services.hybrid_client import HybridClient
from app.services.mock_data_provider import MockDataProvider

# Импортируем IBClient если доступен
try:
    from app.services.ib_client import IBClient
    IB_CLIENT_AVAILABLE = True
except ImportError:
    IB_CLIENT_AVAILABLE = False


class DataSourceFactory:
    """
    Фабрика для создания клиента источника данных
    
    Логика выбора источника:
    1. Если DATA_SOURCE=mock или REACT_APP_ENV in [local, test] → MockDataProvider
    2. Если DATA_SOURCE=ib → IBClient (если доступен)
    3. Если DATA_SOURCE=polygon → PolygonClient
    4. Если DATA_SOURCE=yahoo → YahooClient
    5. Иначе → HybridClient (default - PRODUCTION ИСПОЛЬЗУЕТ ЭТО!)
    
    ВАЖНО: Production по умолчанию использует HybridClient (Polygon + Yahoo)
    Для переключения на IB нужно явно установить DATA_SOURCE=ib
    """
    
    @staticmethod
    def get_client() -> Union[MockDataProvider, 'IBClient', PolygonClient, YahooClient, HybridClient]:
        """
        Получить клиент на основе настроек в .env
        
        Returns:
            MockDataProvider, IBClient, PolygonClient, YahooClient или HybridClient
        """
        # Проверяем переменные окружения
        data_source = os.getenv("DATA_SOURCE", "hybrid").lower()
        app_env = os.getenv("REACT_APP_ENV", "local").lower()
        
        # Mock данные для локальной разработки и тестового сервера
        if data_source == "mock" or app_env in ["local", "test"]:
            return MockDataProvider()
        
        # IB Client ТОЛЬКО если явно указано DATA_SOURCE=ib
        if data_source == "ib" and IB_CLIENT_AVAILABLE:
            return IBClient()
        
        # Polygon для тестов с Polygon API
        if data_source == "polygon":
            return PolygonClient()
        
        # Yahoo для тестов с Yahoo
        if data_source == "yahoo":
            return YahooClient()
        
        # По умолчанию - Hybrid (Polygon + Yahoo) - PRODUCTION ИСПОЛЬЗУЕТ ЭТО!
        return HybridClient()
    
    @staticmethod
    def get_source_name() -> str:
        """
        Получить название текущего источника данных
        
        Returns:
            Название источника
        """
        data_source = os.getenv("DATA_SOURCE", "hybrid").lower()
        app_env = os.getenv("REACT_APP_ENV", "local").lower()
        
        # Mock данные
        if data_source == "mock" or app_env in ["local", "test"]:
            env_name = "Local" if app_env == "local" else "Test"
            return f"Mock Data ({env_name})"
        
        # IB Client ТОЛЬКО если явно указано
        if data_source == "ib" and IB_CLIENT_AVAILABLE:
            return "IB Client Portal Gateway"
        
        # Другие источники
        if data_source == "polygon":
            return "Polygon.io"
        elif data_source == "yahoo":
            return "Yahoo Finance"
        elif data_source == "hybrid":
            return "Hybrid (Yahoo + Polygon)"
        else:
            return "Hybrid (default)"
