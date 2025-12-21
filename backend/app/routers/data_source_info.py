"""
API endpoint для получения информации об источнике данных
"""
from fastapi import APIRouter
from app.services.data_source_factory import DataSourceFactory
import os

router = APIRouter(prefix="/api/data-source", tags=["data-source"])


@router.get("/info")
async def get_data_source_info():
    """
    Получить информацию о текущем источнике данных
    
    Returns:
        Dict с информацией об источнике
    """
    source_name = DataSourceFactory.get_source_name()
    app_env = os.getenv("REACT_APP_ENV", "local").lower()
    data_source = os.getenv("DATA_SOURCE", "hybrid").lower()
    
    # Определяем тип источника
    is_mock = app_env in ["local", "test"] or data_source == "mock"
    is_production = app_env == "production"
    
    return {
        "source_name": source_name,
        "environment": app_env,
        "is_mock": is_mock,
        "is_production": is_production,
        "available_tickers": get_available_mock_tickers() if is_mock else None,
        "icon": "🧪" if is_mock else "📊" if is_production else "🔀",
        "description": get_source_description(source_name, is_mock)
    }


def get_available_mock_tickers():
    """Получить список доступных тикеров в mock данных"""
    import glob
    mock_data_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        'mock_data',
        'stocks'
    )
    
    if not os.path.exists(mock_data_dir):
        return []
    
    files = glob.glob(os.path.join(mock_data_dir, '*.json'))
    return [os.path.basename(f).replace('.json', '') for f in files]


def get_source_description(source_name: str, is_mock: bool) -> str:
    """Получить описание источника данных"""
    if is_mock:
        return "Демо-данные для разработки. Данные могут быть устаревшими."
    elif "IB Client" in source_name:
        return "Реальные данные от Interactive Brokers"
    elif "Polygon" in source_name:
        return "Реальные данные от Polygon.io"
    elif "Yahoo" in source_name:
        return "Данные от Yahoo Finance"
    else:
        return "Комбинированные данные из нескольких источников"
