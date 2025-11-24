"""
IBKR Data Router
Эндпоинты для получения данных из Interactive Brokers
"""

from fastapi import APIRouter, HTTPException, Request
from typing import List, Dict
from app.services.ib_client import IBClient
import traceback

router = APIRouter(prefix="/api/ibkr", tags=["ibkr"])


@router.get("/stock-price")
async def get_stock_price(request: Request, symbol: str):
    """
    Получить текущую цену акции из IBKR
    
    Args:
        symbol: Тикер акции (например, AAPL)
    
    Returns:
        Данные о цене акции
    """
    try:
        print(f"📊 Запрос цены акции для {symbol}")
        client = IBClient()
        
        # Проверяем статус аутентификации
        auth_status = client.get_auth_status()
        print(f"🔐 Статус аутентификации: {auth_status}")
        
        if not auth_status.get('authenticated', False):
            raise HTTPException(
                status_code=401, 
                detail="IB Gateway не авторизован. Пожалуйста, авторизуйтесь через https://localhost:5000"
            )
        
        data = client.get_stock_price(symbol.upper())
        print(f"✅ Получена цена для {symbol}: ${data.get('price')}")
        
        return {
            "status": "success",
            "symbol": symbol.upper(),
            "price": data.get('price'),
            "bid": data.get('bid'),
            "ask": data.get('ask'),
            "change": data.get('change'),
            "changePercent": data.get('change_percent'),
            "volume": data.get('volume'),
            "high": data.get('high'),
            "low": data.get('low')
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Ошибка получения цены для {symbol}:")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error fetching stock price: {str(e)}")


@router.get("/futures-contracts")
async def get_futures_contracts(request: Request, symbol: str):
    """
    Получить доступные контракты фьючерсов для символа
    
    Args:
        symbol: Символ фьючерса (например, ES, NQ)
    
    Returns:
        Список доступных контрактов
    """
    try:
        print(f"📊 Запрос контрактов фьючерсов для {symbol}")
        client = IBClient()
        
        # Поиск фьючерсных контрактов
        response = client.session.get(
            f"{client.base_url}/v1/api/iserver/secdef/search",
            params={"symbol": symbol.upper()},
            timeout=10
        )
        response.raise_for_status()
        data = response.json()
        
        if not data or len(data) == 0:
            print(f"⚠️ Контракты не найдены для {symbol}")
            return {
                "status": "success",
                "symbol": symbol.upper(),
                "contracts": []
            }
        
        # Фильтруем только фьючерсы
        contracts = []
        for item in data:
            if item.get('assetClass') == 'FUT' or item.get('secType') == 'FUT':
                contracts.append({
                    "conId": item.get('conid'),
                    "symbol": item.get('symbol'),
                    "description": item.get('description'),
                    "localSymbol": item.get('ticker', item.get('symbol')),
                    "lastTradeDateOrContractMonth": item.get('expiry', 'N/A'),
                    "exchange": item.get('exchange', 'SMART')
                })
        
        print(f"✅ Найдено {len(contracts)} контрактов для {symbol}")
        return {
            "status": "success",
            "symbol": symbol.upper(),
            "contracts": contracts
        }
    except Exception as e:
        print(f"❌ Ошибка получения контрактов для {symbol}:")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error fetching futures contracts: {str(e)}")


@router.get("/futures-price")
async def get_futures_price(request: Request, symbol: str, contract: str):
    """
    Получить текущую цену фьючерсного контракта
    
    Args:
        symbol: Символ фьючерса (например, ES)
        contract: Contract ID (conId)
    
    Returns:
        Данные о цене фьючерса
    """
    try:
        client = IBClient()
        
        # Получить market data snapshot для конкретного контракта
        response = client.session.get(
            f"{client.base_url}/v1/api/iserver/marketdata/snapshot",
            params={"conids": contract, "fields": "31,84,86,87,88,82,83"},
            timeout=10
        )
        response.raise_for_status()
        data = response.json()
        
        if not data or len(data) == 0:
            raise HTTPException(status_code=404, detail="No market data available")
        
        snapshot = data[0]
        
        # Парсинг данных
        def parse_float(value, default=0.0):
            if value is None:
                return default
            try:
                if isinstance(value, str):
                    value = value.replace('K', '000').replace('M', '000000')
                return float(value)
            except:
                return default
        
        price = parse_float(snapshot.get('31'))
        bid = parse_float(snapshot.get('84'))
        ask = parse_float(snapshot.get('86'))
        volume = int(parse_float(snapshot.get('88')))
        change = parse_float(snapshot.get('82'))
        change_percent = parse_float(snapshot.get('83'))
        
        return {
            "status": "success",
            "symbol": symbol.upper(),
            "contract": contract,
            "price": price,
            "bid": bid,
            "ask": ask,
            "change": change,
            "changePercent": change_percent,
            "volume": volume
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching futures price: {str(e)}")


@router.get("/search")
async def search_instrument(request: Request, symbol: str):
    """
    Поиск инструмента (акции, фьючерсы и т.д.)
    
    Args:
        symbol: Символ для поиска
    
    Returns:
        Результаты поиска
    """
    try:
        client = IBClient()
        
        response = client.session.get(
            f"{client.base_url}/v1/api/iserver/secdef/search",
            params={"symbol": symbol.upper()},
            timeout=10
        )
        response.raise_for_status()
        data = response.json()
        
        return {
            "status": "success",
            "symbol": symbol.upper(),
            "results": data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error searching instrument: {str(e)}")


@router.get("/test-connection")
async def test_connection(request: Request):
    """
    Тестовый эндпоинт для проверки подключения к IB Gateway
    """
    try:
        print("=" * 50)
        print("🔍 ТЕСТ ПОДКЛЮЧЕНИЯ К IB GATEWAY")
        print("=" * 50)
        
        client = IBClient()
        print(f"✅ IBClient создан, base_url: {client.base_url}")
        
        # Тест 1: Проверка статуса аутентификации
        print("\n📋 Тест 1: Проверка auth status...")
        try:
            auth_response = client.session.get(
                f"{client.base_url}/v1/api/iserver/auth/status",
                timeout=5
            )
            print(f"   Status Code: {auth_response.status_code}")
            print(f"   Response: {auth_response.text}")
            auth_data = auth_response.json()
        except Exception as e:
            print(f"   ❌ Ошибка: {str(e)}")
            print(f"   Traceback: {traceback.format_exc()}")
            auth_data = {"error": str(e)}
        
        # Тест 2: Поиск контракта AAPL
        print("\n📋 Тест 2: Поиск контракта AAPL...")
        try:
            search_response = client.session.get(
                f"{client.base_url}/v1/api/iserver/secdef/search",
                params={"symbol": "AAPL"},
                timeout=5
            )
            print(f"   Status Code: {search_response.status_code}")
            print(f"   Response: {search_response.text[:200]}...")
            search_data = search_response.json()
        except Exception as e:
            print(f"   ❌ Ошибка: {str(e)}")
            print(f"   Traceback: {traceback.format_exc()}")
            search_data = {"error": str(e)}
        
        print("\n" + "=" * 50)
        
        return {
            "status": "success",
            "base_url": client.base_url,
            "auth_status": auth_data,
            "search_test": search_data
        }
    except Exception as e:
        print(f"\n❌ КРИТИЧЕСКАЯ ОШИБКА:")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Test failed: {str(e)}")
