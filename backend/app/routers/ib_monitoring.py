"""
IB Gateway Monitoring Router
Endpoint для мониторинга состояния IB Gateway
"""
from fastapi import APIRouter, HTTPException
from typing import Dict, List, Optional
from datetime import datetime, timedelta
import os
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ib", tags=["IB Monitoring"])

# In-memory хранилище для статистики (в production можно заменить на Redis)
_requests_log: List[Dict] = []
_errors_log: List[Dict] = []

# Максимальное количество записей в логах
MAX_LOG_SIZE = 1000


def log_request(asset_type: str, success: bool = True, error: Optional[str] = None):
    """
    Логировать запрос к IB Gateway
    
    Args:
        asset_type: Тип актива (stocks, options, futures, indices, forex)
        success: Успешность запроса
        error: Сообщение об ошибке (если есть)
    """
    timestamp = datetime.now().isoformat()
    
    # Добавить в лог запросов
    _requests_log.append({
        "timestamp": timestamp,
        "asset_type": asset_type,
        "success": success
    })
    
    # Ограничить размер лога
    if len(_requests_log) > MAX_LOG_SIZE:
        _requests_log.pop(0)
    
    # Если ошибка - добавить в лог ошибок
    if not success and error:
        _errors_log.append({
            "timestamp": timestamp,
            "asset_type": asset_type,
            "error": error
        })
        
        if len(_errors_log) > MAX_LOG_SIZE:
            _errors_log.pop(0)


def get_requests_stats() -> Dict:
    """
    Получить статистику запросов за последний час по типам активов
    
    Returns:
        Dict с количеством запросов по каждому типу
    """
    now = datetime.now()
    hour_ago = now - timedelta(hours=1)
    
    # Фильтруем запросы за последний час
    recent_requests = [
        r for r in _requests_log 
        if datetime.fromisoformat(r["timestamp"]) > hour_ago
    ]
    
    # Считаем по типам
    stats = {
        "stocks": 0,
        "options": 0,
        "futures": 0,
        "indices": 0,
        "forex": 0,
        "total": len(recent_requests)
    }
    
    for req in recent_requests:
        asset_type = req.get("asset_type", "unknown")
        if asset_type in stats:
            stats[asset_type] += 1
    
    return stats


@router.get("/status")
async def get_ib_status():
    """
    Получить полный статус IB Gateway
    
    Returns:
        Dict со статусом подключения, статистикой запросов и ошибками
    """
    try:
        # Проверяем доступность IBClient
        from app.services.data_source_factory import DataSourceFactory, IB_CLIENT_AVAILABLE
        
        # Получаем текущий клиент
        current_client = DataSourceFactory.get_client()
        current_source = DataSourceFactory.get_source_name()
        
        # Определяем статус подключения
        is_ib_active = "IB" in current_source
        
        # Пробуем получить auth status если IB активен
        auth_status = {"authenticated": False, "connected": False}
        gateway_info = {}
        
        if is_ib_active and IB_CLIENT_AVAILABLE:
            try:
                # Пытаемся получить статус авторизации
                auth_status = current_client.get_auth_status()
                
                # Пытаемся получить информацию о Gateway
                # (Это mock данные, реальный IB Gateway может возвращать версию)
                gateway_info = {
                    "version": os.getenv("IB_GATEWAY_VERSION", "Unknown"),
                    "url": os.getenv("IB_GATEWAY_URL", "https://localhost:5000"),
                    "paper_trading": os.getenv("IB_PAPER_TRADING", "true").lower() == "true"
                }
            except Exception as e:
                logger.error(f"Failed to get IB auth status: {e}")
        
        # Получаем последний успешный запрос
        last_successful = None
        if _requests_log:
            successful_requests = [r for r in _requests_log if r.get("success")]
            if successful_requests:
                last_successful = successful_requests[-1]["timestamp"]
        
        # Получаем статистику запросов
        requests_stats = get_requests_stats()
        
        # Получаем последние ошибки (максимум 10)
        recent_errors = _errors_log[-10:] if _errors_log else []
        
        return {
            "status": "connected" if is_ib_active and auth_status.get("connected") else "disconnected",
            "data_source": current_source,
            "is_ib_active": is_ib_active,
            "ib_available": IB_CLIENT_AVAILABLE,
            "last_successful_request": last_successful,
            "requests_last_hour": requests_stats,
            "errors": recent_errors,
            "auth_status": auth_status,
            "gateway_info": gateway_info,
            "environment": os.getenv("REACT_APP_ENV", "unknown"),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting IB status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/test/{asset_type}")
async def test_ib_connection(asset_type: str, ticker: str = "SPY"):
    """
    Тестовый запрос к IB Gateway для конкретного типа актива
    
    Args:
        asset_type: Тип актива (stocks, options, futures, indices, forex)
        ticker: Тикер для тестирования (по умолчанию SPY)
    
    Returns:
        Результат тестового запроса
    """
    try:
        from app.services.data_source_factory import DataSourceFactory
        
        client = DataSourceFactory.get_client()
        
        # Тестируем в зависимости от типа актива
        if asset_type == "stocks":
            result = client.get_stock_price(ticker)
            log_request("stocks", success=True)
            
        elif asset_type == "options":
            # Для опционов нужна дата экспирации
            result = client.get_options_chain(ticker)
            log_request("options", success=True)
            
        elif asset_type == "futures":
            # Для фьючерсов - специальный метод
            result = {"error": "Futures not implemented yet"}
            log_request("futures", success=False, error="Not implemented")
            
        elif asset_type == "indices":
            # Для индексов - специальный метод
            result = {"error": "Indices not implemented yet"}
            log_request("indices", success=False, error="Not implemented")
            
        elif asset_type == "forex":
            # Для форекса - специальный метод
            result = {"error": "Forex not implemented yet"}
            log_request("forex", success=False, error="Not implemented")
            
        else:
            raise HTTPException(status_code=400, detail=f"Unknown asset type: {asset_type}")
        
        return {
            "status": "success",
            "asset_type": asset_type,
            "ticker": ticker,
            "result": result,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        error_msg = str(e)
        log_request(asset_type, success=False, error=error_msg)
        logger.error(f"Test failed for {asset_type}/{ticker}: {e}")
        
        return {
            "status": "error",
            "asset_type": asset_type,
            "ticker": ticker,
            "error": error_msg,
            "timestamp": datetime.now().isoformat()
        }


@router.get("/requests/history")
async def get_requests_history(hours: int = 24):
    """
    Получить историю запросов за указанный период
    
    Args:
        hours: Количество часов назад (по умолчанию 24)
    
    Returns:
        List запросов с группировкой по часам
    """
    try:
        now = datetime.now()
        cutoff = now - timedelta(hours=hours)
        
        # Фильтруем запросы
        filtered = [
            r for r in _requests_log 
            if datetime.fromisoformat(r["timestamp"]) > cutoff
        ]
        
        # Группируем по часам и типам
        hourly_stats = {}
        
        for req in filtered:
            req_time = datetime.fromisoformat(req["timestamp"])
            hour_key = req_time.strftime("%Y-%m-%d %H:00")
            asset_type = req.get("asset_type", "unknown")
            
            if hour_key not in hourly_stats:
                hourly_stats[hour_key] = {
                    "stocks": 0,
                    "options": 0,
                    "futures": 0,
                    "indices": 0,
                    "forex": 0,
                    "total": 0
                }
            
            if asset_type in hourly_stats[hour_key]:
                hourly_stats[hour_key][asset_type] += 1
            hourly_stats[hour_key]["total"] += 1
        
        return {
            "period_hours": hours,
            "total_requests": len(filtered),
            "hourly_breakdown": hourly_stats
        }
        
    except Exception as e:
        logger.error(f"Error getting request history: {e}")
        raise HTTPException(status_code=500, detail=str(e))
