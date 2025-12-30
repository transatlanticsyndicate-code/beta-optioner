"""
FastAPI Main Application
"""
from fastapi import FastAPI, Depends, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy.orm import Session
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import os
import time
import json
import redis
from dotenv import load_dotenv
from typing import Dict, Optional
from datetime import datetime, timedelta
import re

from app.database import get_db, init_db
from app.models.analysis_history import AnalysisHistory
from app.models.user import Base as UserBase
from app.routers import options, ai_chat, polygon, auth, admin, telegram_webhook, data_source_info, ib_monitoring, yahoo_proxy, crypto_rating, ml_api, ai_prediction, finnhub_proxy

# Load environment variables from .env file
env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
load_dotenv(dotenv_path=env_path, override=True)

# Импортируем функции для Telegram polling
import asyncio

# Инициализировать БД при старте
try:
    init_db()
    print("✅ Database initialized")
except Exception as e:
    print(f"⚠️ Database initialization failed: {e}")

# Redis клиент для кэша
try:
    redis_client = redis.Redis(
        host=os.getenv('REDIS_HOST', 'localhost'),
        port=int(os.getenv('REDIS_PORT', 6379)),
        db=0,
        decode_responses=True,
        socket_connect_timeout=1,  # Таймаут 1 секунда
        socket_timeout=1
    )
    redis_client.ping()
    print("✅ Redis подключен")
except Exception as e:
    print(f"⚠️ Redis недоступен: {e}. Используем in-memory кэш.")
    redis_client = None

app = FastAPI(
    title="Options Flow AI Analyzer",
    description="API для анализа опционного рынка с помощью AI",
    version="0.1.0"
)

# Rate Limiter для защиты от DoS атак
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Подключаем роутеры
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(telegram_webhook.router)
app.include_router(options.router)
app.include_router(ai_chat.router)
app.include_router(ai_prediction.router)
app.include_router(polygon.router)
app.include_router(data_source_info.router)
app.include_router(ib_monitoring.router)
app.include_router(yahoo_proxy.router)
app.include_router(finnhub_proxy.router)
app.include_router(crypto_rating.router)
app.include_router(ml_api.router)

# Простой in-memory кэш (fallback если Redis недоступен)
_data_cache: Dict = {}
_cache_ttl = 300  # 5 минут в секундах

# Кэш для цен тикеров (короткий TTL для актуальности)
# ЗАЧЕМ: Избежать дублирующих запросов к Polygon API при параллельных вызовах
_ticker_price_cache: Dict = {}
_ticker_price_ttl = 30  # 30 секунд — баланс между актуальностью и экономией запросов

# Security Headers Middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        # Защита от XSS, Clickjacking, MIME sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # HSTS только для production
        if os.getenv("ENVIRONMENT") == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# CORS - ограниченные настройки для безопасности
# Добавляем 127.0.0.1 для Windsurf preview
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
# Добавляем динамические порты для Windsurf preview
allowed_origins.extend([f"http://127.0.0.1:{port}" for port in range(56000, 57000)])
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],  # Добавлен DELETE для удаления снимков/анализов
    allow_headers=["Content-Type", "Authorization", "Accept"],  # Только необходимые заголовки
)


# Telegram polling events
@app.on_event("startup")
async def startup_event():
    """Запуск Telegram polling и планировщика криптовалют при старте приложения"""
    print("🚀 Startup event вызван")
    # Запускаем polling в фоне (не блокируем startup)
    try:
        asyncio.create_task(telegram_webhook.start_polling())
        print("✅ Telegram polling запущен в фоне")
    except Exception as e:
        print(f"❌ Ошибка при запуске polling: {e}")
        import traceback
        traceback.print_exc()
    
    # Планировщик больше не используется (ручное создание снимков)
    # try:
    #     from app.services.crypto_scheduler import crypto_scheduler
    #     crypto_scheduler.restore_tasks_from_db()
    #     print("✅ Crypto scheduler задачи восстановлены")
    # except Exception as e:
    #     print(f"❌ Ошибка при восстановлении crypto scheduler: {e}")
    #     import traceback
    #     traceback.print_exc()
    print("ℹ️ Crypto scheduler отключен (используется ручное создание снимков)")


@app.on_event("shutdown")
async def shutdown_event():
    """Остановка Telegram polling и планировщика при остановке приложения"""
    await telegram_webhook.stop_polling()
    
    # Планировщик отключен
    # try:
    #     from app.services.crypto_scheduler import crypto_scheduler
    #     crypto_scheduler.shutdown()
    #     print("✅ Crypto scheduler остановлен")
    # except Exception as e:
    #     print(f"❌ Ошибка при остановке crypto scheduler: {e}")
    print("ℹ️ Crypto scheduler был отключен")


def validate_ticker(ticker: str) -> str:
    """
    Валидация тикера для защиты от injection атак
    """
    if not ticker or not isinstance(ticker, str):
        raise HTTPException(status_code=400, detail="Ticker is required")
    
    ticker = ticker.strip().upper()
    
    # Тикер должен быть 1-5 букв
    if not re.match(r'^[A-Z]{1,5}$', ticker):
        raise HTTPException(
            status_code=400, 
            detail="Invalid ticker format. Must be 1-5 letters (e.g., SPY, AAPL)"
        )
    
    return ticker


@app.get("/")
async def root():
    return {"status": "ok", "message": "Options Flow AI Analyzer API"}


@app.get("/health")
async def health_check():
    from app.services.data_source_factory import DataSourceFactory
    return {
        "status": "healthy",
        "environment": os.getenv("ENVIRONMENT", "development"),
        "ai_provider": os.getenv("AI_PROVIDER", "gemini"),
        "data_source": DataSourceFactory.get_source_name()
    }


@app.get("/api/market/risk-free-rate")
async def get_risk_free_rate():
    """
    Получить актуальную безрисковую ставку (Treasury Rate) для расчётов Black-Scholes
    ЗАЧЕМ: Точные расчёты цен опционов требуют актуальную ставку от ФРС
    
    Источник: FRED API (Federal Reserve Economic Data)
    Серия: DGS3MO - 3-месячные Treasury Bills
    """
    try:
        from app.services.treasury_rate_service import get_rate_info
        
        rate_info = get_rate_info()
        return {
            "status": "success",
            **rate_info
        }
    except Exception as e:
        # Fallback на дефолтную ставку при любой ошибке
        return {
            "status": "success",
            "rate": 0.045,
            "rate_percent": 4.5,
            "source": "Default fallback (FRED unavailable)",
            "error": str(e)
        }


@app.get("/api/polygon/ticker/{ticker}")
@limiter.limit("30/minute")
async def get_ticker_price(request: Request, ticker: str):
    """
    Получить текущую цену тикера из Polygon с кэшированием
    ЗАЧЕМ: Избежать дублирующих запросов при параллельных вызовах от разных компонентов
    """
    ticker = validate_ticker(ticker).upper()
    cache_key = f"price_{ticker}"
    current_time = time.time()
    
    # Проверяем кэш — если данные свежие, возвращаем их
    # ЗАЧЕМ: Экономим запросы к Polygon API (лимит 5/мин на бесплатном плане)
    if cache_key in _ticker_price_cache:
        cached_data, cached_time = _ticker_price_cache[cache_key]
        if current_time - cached_time < _ticker_price_ttl:
            return {**cached_data, "cached": True}
    
    try:
        from app.services.polygon_client import PolygonClient
        
        client = PolygonClient()
        data = client.get_stock_price(ticker)
        
        response_data = {
            "status": "success",
            "ticker": ticker,
            "price": data.get('price'),
            "change": data.get('change'),
            "changePercent": data.get('change_percent'),
            "volume": data.get('volume'),
            "timestamp": data.get('timestamp'),
            "cached": False
        }
        
        # Сохраняем в кэш
        _ticker_price_cache[cache_key] = (response_data, current_time)
        
        return response_data
    except Exception as e:
        # При ошибке пробуем вернуть устаревший кэш (лучше старые данные, чем ничего)
        if cache_key in _ticker_price_cache:
            cached_data, _ = _ticker_price_cache[cache_key]
            return {**cached_data, "cached": True, "stale": True}
        return {"status": "error", "error": str(e)}


@app.get("/api/polygon/ticker/{ticker}/details")
@limiter.limit("30/minute")
async def get_ticker_details(request: Request, ticker: str):
    """Получить информацию о компании из Polygon"""
    ticker = validate_ticker(ticker)
    try:
        from app.services.polygon_client import PolygonClient
        
        client = PolygonClient()
        data = client.get_ticker_details(ticker.upper())
        
        return {
            "status": "success",
            "ticker": ticker.upper(),
            "name": data.get('name'),
            "description": data.get('description'),
            "market_cap": data.get('market_cap'),
            "primary_exchange": data.get('primary_exchange')
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.get("/api/polygon/ticker/{ticker}/expirations")
@limiter.limit("30/minute")
async def get_expiration_dates(request: Request, ticker: str):
    """Получить даты экспирации опционов для тикера с кэшированием"""
    ticker = validate_ticker(ticker)
    cache_key = f"expiration_dates:{ticker.upper()}"
    
    try:
        # Проверяем кэш сначала
        cached_data = _get_cached_expiration_dates(cache_key)
        if cached_data:
            print(f"📦 Возвращаем даты экспирации из кэша для {ticker}")
            return cached_data
        
        print(f"🔄 Загружаем новые даты экспирации для {ticker}")
        from app.services.polygon_client import PolygonClient
        
        client = PolygonClient()
        dates = client.get_expiration_dates(ticker.upper(), max_pages=10)
        
        result = {
            "status": "success",
            "ticker": ticker.upper(),
            "dates": dates,
            "count": len(dates),
            "cached_at": datetime.now().isoformat(),
            "ttl_minutes": 60  # Показываем TTL пользователю
        }
        
        # Кэшируем результат на 1 час (даты экспирации меняются редко)
        _cache_expiration_dates(cache_key, result, ttl_minutes=60)
        
        return result
        
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.get("/api/polygon/ticker/{ticker}/options")
@limiter.limit("30/minute")
async def get_options_chain(request: Request, ticker: str, expiration_date: str):
    """Получить полную цепочку опционов для тикера и даты экспирации"""
    ticker = validate_ticker(ticker)
    
    try:
        print(f"🔄 Загружаем опционную цепочку для {ticker} дата: {expiration_date}")
        from app.services.polygon_client import PolygonClient
        
        client = PolygonClient()
        options = client.get_options_chain(ticker.upper(), expiration_date)
        
        result = {
            "status": "success",
            "ticker": ticker.upper(),
            "expiration_date": expiration_date,
            "options": options,
            "count": len(options)
        }
        
        print(f"✅ Загружено {len(options)} опционов для {ticker} на {expiration_date}")
        return result
        
    except Exception as e:
        print(f"❌ Ошибка загрузки опционов: {e}")
        return {"status": "error", "error": str(e)}


@app.delete("/api/polygon/ticker/{ticker}/expirations/cache")
@limiter.limit("10/minute")
async def clear_expiration_cache(request: Request, ticker: str):
    """Очистить кэш дат экспирации для тикера"""
    ticker = validate_ticker(ticker)
    cache_key = f"expiration_dates:{ticker.upper()}"
    
    try:
        # Очистить из Redis
        if redis_client:
            try:
                deleted = redis_client.delete(cache_key)
                if deleted:
                    print(f"🗑️ Удален кэш из Redis для {ticker}")
            except Exception as e:
                print(f"Redis delete error: {e}")
        
        # Очистить из memory кэша
        if cache_key in _data_cache:
            del _data_cache[cache_key]
            print(f"🗑️ Удален кэш из memory для {ticker}")
        
        return {
            "status": "success",
            "message": f"Кэш дат экспирации очищен для {ticker}",
            "ticker": ticker.upper()
        }
        
    except Exception as e:
        return {"status": "error", "error": str(e)}


def _get_cached_expiration_dates(cache_key: str):
    """Получить даты экспирации из кэша с проверкой TTL"""
    try:
        # Попытка получить из Redis
        if redis_client:
            try:
                cached_str = redis_client.get(cache_key)
                if cached_str:
                    cached_data = json.loads(cached_str)
                    
                    # Проверяем TTL - если данные старше 1 часа, считаем их устаревшими
                    cached_at = datetime.fromisoformat(cached_data.get('cached_at', ''))
                    if datetime.now() - cached_at < timedelta(hours=1):
                        return cached_data
                    else:
                        print(f"🗑️ Удаляем устаревшие данные из Redis кэша")
                        redis_client.delete(cache_key)
                        return None
            except Exception as e:
                print(f"Redis error: {e}")
        
        # Fallback на in-memory кэш
        if cache_key in _data_cache:
            cached_data, timestamp = _data_cache[cache_key]
            if time.time() - timestamp < 3600:  # 1 час
                return cached_data
            else:
                print(f"🗑️ Удаляем устаревшие данные из memory кэша")
                del _data_cache[cache_key]
                return None
        
        return None
    except Exception as e:
        print(f"Cache error: {e}")
        return None

def _cache_expiration_dates(cache_key: str, data: dict, ttl_minutes: int = 60):
    """Кэшировать даты экспирации с TTL"""
    try:
        # Сохранить в Redis с TTL
        if redis_client:
            try:
                redis_client.setex(
                    cache_key, 
                    ttl_minutes * 60,  # TTL в секундах
                    json.dumps(data)
                )
                print(f"💾 Данные сохранены в Redis кэш на {ttl_minutes} минут")
                return
            except Exception as e:
                print(f"Redis cache error: {e}")
        
        # Fallback на in-memory кэш
        _data_cache[cache_key] = (data, time.time())
        print(f"💾 Данные сохранены в memory кэш на {ttl_minutes} минут")
        
    except Exception as e:
        print(f"Cache save error: {e}")

def _get_cached_data(ticker: str):
    """Получить данные из кэша (Redis или in-memory)"""
    cache_key = f"options_data:{ticker.upper()}"
    
    # Попытка получить из Redis
    if redis_client:
        try:
            cached_str = redis_client.get(cache_key)
            if cached_str:
                return json.loads(cached_str)
        except Exception as e:
            print(f"Redis get error: {e}")
    
    # Fallback на in-memory кэш
    if cache_key in _data_cache:
        cached = _data_cache[cache_key]
        if time.time() - cached['timestamp'] < _cache_ttl:
            return cached['data']
    
    return None


def _set_cached_data(ticker: str, data):
    """Сохранить данные в кэш (Redis или in-memory)"""
    cache_key = f"options_data:{ticker.upper()}"
    
    # Попытка сохранить в Redis
    if redis_client:
        try:
            redis_client.setex(cache_key, _cache_ttl, json.dumps(data))
            return
        except Exception as e:
            print(f"Redis set error: {e}")
    
    # Fallback на in-memory кэш
    _data_cache[cache_key] = {
        'data': data,
        'timestamp': time.time()
    }


@app.post("/analyze")
@limiter.limit("10/minute")  # Максимум 10 анализов в минуту
async def analyze_ticker(request: Request, ticker: str):
    """Полный анализ"""
    ticker = validate_ticker(ticker)
    try:
        from app.services.data_source_factory import DataSourceFactory
        from app.services.calculations import calculate_all_metrics
        from app.services.ai_analyzer import AIAnalyzer
        
        client = DataSourceFactory.get_client()
        stock_data = client.get_stock_price(ticker.upper())
        options_data = client.get_options_chain(ticker.upper())
        
        if not options_data:
            return {"status": "error", "error": "Нет опционных данных", "ticker": ticker}
        
        metrics = calculate_all_metrics(options_data, stock_data['price'], ticker.upper())
        ai = AIAnalyzer()
        analysis = ai.analyze(ticker.upper(), metrics)
        
        return {
            "status": "success",
            "ticker": ticker.upper(),
            "stock_data": stock_data,
            "metrics": metrics,
            "ai_analysis": analysis,
            "ai_provider": ai.get_provider_name()
        }
    except Exception as e:
        return {"status": "error", "error": str(e), "ticker": ticker}


@app.post("/analyze/step1")
@limiter.limit("15/minute")  # Максимум 15 запросов в минуту
async def analyze_step1_data(request: Request, ticker: str):
    """Шаг 1: Получить данные с использованием гибридного клиента."""
    ticker = validate_ticker(ticker)
    start_time = time.time()
    try:
        from app.services.hybrid_client import HybridClient

        # Проверить кэш
        cached = _get_cached_data(ticker)
        if cached:
            return {
                "status": "success",
                "ticker": ticker.upper(),
                "stock_data": cached['stock_data'],
                "options_count": cached['options_count']
            }

        client = HybridClient()
        
        # Получаем данные
        stock_data = client.get_stock_price(ticker.upper())
        relevant_dates = client.get_relevant_expiration_dates(ticker.upper())
        options_data = client.get_options_chain(ticker.upper(), relevant_dates)

        if not options_data:
            return {"status": "error", "error": "Не удалось получить опционные данные ни из одного источника."}

        # Удаление дубликатов (на всякий случай)
        unique_options_data = list({(item['ticker'], item['strike'], item['option_type']): item for item in options_data}.values())

        # Сохранить в кэш
        _set_cached_data(ticker, {
            'stock_data': stock_data,
            'options_data': unique_options_data,
            'options_count': len(unique_options_data)
        })

        end_time = time.time()
        print(f"⏱️ Step 1 (Data Fetch) took: {end_time - start_time:.2f} seconds")
        return {
            "status": "success",
            "ticker": ticker.upper(),
            "stock_data": stock_data,
            "options_count": len(unique_options_data)
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.post("/analyze/step2")
@limiter.limit("20/minute")  # Максимум 20 запросов в минуту
async def analyze_step2_metrics(request: Request, ticker: str):
    """Шаг 2: Рассчитать метрики"""
    ticker = validate_ticker(ticker)
    start_time = time.time()
    try:
        from app.services.calculations import calculate_all_metrics
        
        # Получить из кэша
        cached = _get_cached_data(ticker)
        if not cached:
            return {"status": "error", "error": "Нет данных в кэше. Выполните step1 сначала."}
        
        metrics = calculate_all_metrics(cached['options_data'], cached['stock_data']['price'], ticker.upper())
        
        # Обновить кэш
        cached['metrics'] = metrics
        _set_cached_data(ticker, cached)
        
        end_time = time.time()
        print(f"⏱️ Step 2 (Metrics Calc) took: {end_time - start_time:.2f} seconds")
        return {
            "status": "success",
            "ticker": ticker.upper(),
            "stock_data": cached['stock_data'],
            "metrics": metrics
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.post("/analyze/step3")
@limiter.limit("5/minute")  # AI анализ - строгий лимит
async def analyze_step3_ai(request: Request, ticker: str, ai_model: str = "gemini"):
    """Шаг 3: AI анализ"""
    ticker = validate_ticker(ticker)
    start_time = time.time()
    try:
        from app.services.ai_analyzer import AIAnalyzer
        
        # Получить из кэша
        cached = _get_cached_data(ticker)
        if not cached or 'metrics' not in cached:
            return {"status": "error", "error": "Нет метрик в кэше. Выполните step2 сначала."}
        
        # Временно переопределить AI_PROVIDER
        original_provider = os.getenv("AI_PROVIDER")
        if ai_model == "claude":
            os.environ["AI_PROVIDER"] = "claude"
        else:
            os.environ["AI_PROVIDER"] = "gemini"
        
        # Детальные логи времени выполнения
        import json
        step_start = time.time()
        
        print(f"\n=== AI Analysis Start ===")
        print(f"AI Model: {ai_model}")
        print(f"Provider: {os.getenv('AI_PROVIDER')}")
        print(f"⏱️ Step 3 initialization took: {step_start - start_time:.2f}s")
        
        # Логируем размер данных
        metrics_json = json.dumps(cached['metrics'], ensure_ascii=False)
        print(f"📊 Metrics data size: {len(metrics_json)} characters")
        
        # Сохраняем файл только в development окружении
        if ticker.upper() == 'TSLA' and os.getenv('ENVIRONMENT', 'development') == 'development':
            try:
                file_start = time.time()
                with open("tsla_metrics.json", "w", encoding="utf-8") as f:
                    json.dump(cached['metrics'], f, indent=2, ensure_ascii=False)
                file_end = time.time()
                print(f"✅ Metrics for TSLA saved to tsla_metrics.json in {file_end - file_start:.2f}s")
            except Exception as e:
                print(f"⚠️ Could not save metrics file: {e}")
        
        # Создание AI анализатора
        ai_init_start = time.time()
        ai = AIAnalyzer()
        ai_init_end = time.time()
        print(f"🤖 AI Analyzer initialization took: {ai_init_end - ai_init_start:.2f}s")
        
        # Запуск анализа
        analysis_start = time.time()
        print(f"🚀 Starting AI analysis at {analysis_start}")
        analysis = ai.analyze(ticker.upper(), cached['metrics'])
        analysis_end = time.time()
        print(f"🏁 AI analysis completed in: {analysis_end - analysis_start:.2f}s")
        
        print(f"Analysis result type: {type(analysis)}")
        print(f"Analysis result length: {len(str(analysis)) if analysis else 0}")
        print(f"Analysis preview: {str(analysis)[:200] if analysis else 'None'}")
        print(f"=== AI Analysis End ===\n")
        
        # Восстановить оригинальное значение
        if original_provider:
            os.environ["AI_PROVIDER"] = original_provider
        
        end_time = time.time()
        execution_time_ms = int((end_time - start_time) * 1000)
        print(f"⏱️ Step 3 (AI Analysis) took: {end_time - start_time:.2f} seconds")
        
        # Автосохранение в БД
        print("💾 Attempting to save analysis to database...")
        try:
            db = next(get_db())
            print(f"📊 Creating analysis record for {ticker.upper()}")
            analysis_record = AnalysisHistory(
                ticker=ticker.upper(),
                stock_data=cached['stock_data'],
                metrics=cached['metrics'],
                ai_model=ai_model or 'gemini',
                ai_analysis=analysis,
                ai_provider=ai.get_provider_name(),
                execution_time_ms=execution_time_ms
            )
            db.add(analysis_record)
            print("💾 Committing to database...")
            db.commit()
            db.refresh(analysis_record)
            
            # Сгенерировать URL
            base_url = os.getenv("BASE_URL", "http://localhost:3000")
            analysis_url = f"{base_url}/analysis/{analysis_record.id}"
            
            print(f"✅ Analysis saved to DB: {analysis_record.id}")
            print(f"🔗 Share URL: {analysis_url}")
            
            return {
                "status": "success",
                "ticker": ticker.upper(),
                "stock_data": cached['stock_data'],
                "metrics": cached['metrics'],
                "ai_analysis": analysis,
                "ai_provider": ai.get_provider_name(),
                "analysis_id": str(analysis_record.id),
                "share_url": analysis_url
            }
        except Exception as db_error:
            print(f"⚠️ Failed to save to DB: {db_error}")
            import traceback
            traceback.print_exc()
            # Вернуть результат даже если сохранение не удалось
            return {
                "status": "success",
                "ticker": ticker.upper(),
                "stock_data": cached['stock_data'],
                "metrics": cached['metrics'],
                "ai_analysis": analysis,
                "ai_provider": ai.get_provider_name()
            }
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.post("/api/analysis/save")
async def save_analysis(
    request: Request,
    ticker: str,
    stock_data: dict,
    metrics: dict,
    ai_model: str,
    ai_analysis: str,
    ai_provider: str,
    execution_time_ms: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Сохранить результат анализа в PostgreSQL"""
    try:
        # Получить IP и User-Agent из request
        ip_address = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")
        
        # Создать запись
        analysis = AnalysisHistory(
            ticker=ticker.upper(),
            stock_data=stock_data,
            metrics=metrics,
            ai_model=ai_model,
            ai_analysis=ai_analysis,
            ai_provider=ai_provider,
            ip_address=ip_address,
            user_agent=user_agent,
            execution_time_ms=execution_time_ms
        )
        
        db.add(analysis)
        db.commit()
        db.refresh(analysis)
        
        # Сгенерировать URL
        base_url = os.getenv("BASE_URL", "http://localhost:3000")
        url = f"{base_url}/analysis/{analysis.id}"
        
        return {
            "status": "success",
            "id": str(analysis.id),
            "url": url
        }
    except Exception as e:
        db.rollback()
        return {"status": "error", "error": str(e)}


@app.get("/api/analysis/{analysis_id}")
async def get_analysis(analysis_id: str, db: Session = Depends(get_db)):
    """Получить сохраненный анализ по ID"""
    try:
        # Найти анализ по UUID
        analysis = db.query(AnalysisHistory).filter(
            AnalysisHistory.id == analysis_id
        ).first()
        
        if analysis:
            return {
                "status": "success",
                "data": analysis.to_dict()
            }
        else:
            return {"status": "error", "error": "Анализ не найден"}
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.get("/api/analysis/history")
async def get_history(
    limit: int = 20,
    offset: int = 0,
    ticker: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Получить историю анализов с пагинацией"""
    try:
        # Базовый запрос
        query = db.query(AnalysisHistory)
        
        # Фильтр по тикеру если указан
        if ticker:
            query = query.filter(AnalysisHistory.ticker == ticker.upper())
        
        # Сортировка по дате (новые первые)
        query = query.order_by(AnalysisHistory.created_at.desc())
        
        # Пагинация
        analyses = query.offset(offset).limit(limit).all()
        
        # Конвертировать в dict
        data = [analysis.to_dict() for analysis in analyses]
        
        return {
            "status": "success",
            "data": data,
            "count": len(data)
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}
