from fastapi import APIRouter, Query, Response, Request
import httpx

router = APIRouter(prefix="/api/yahoo-proxy", tags=["yahoo-proxy"])

from slowapi.util import get_remote_address
from slowapi import Limiter
limiter = Limiter(key_func=get_remote_address)

@router.get("")
@limiter.limit("1/minute")
async def yahoo_proxy(request: Request, symbol: str = Query(..., min_length=1), interval: str = '1d', range_days: int = 30):
    """
    Прокси для получения котировок с Yahoo Finance (обходит CORS для фронта)
    """
    import time
    period2 = int(time.time())
    period1 = period2 - range_days * 24 * 60 * 60
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?period1={period1}&period2={period2}&interval={interval}"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url)
        return Response(content=r.content, status_code=r.status_code, media_type="application/json")
