from fastapi import APIRouter, Query, Response, Request
import httpx

router = APIRouter(prefix="/api/finnhub", tags=["finnhub"])

from slowapi.util import get_remote_address
from slowapi import Limiter
limiter = Limiter(key_func=get_remote_address)

@router.get("/quote")
@limiter.limit("60/minute")  # Finnhub free plan: 60 requests/minute
async def finnhub_quote(request: Request, symbol: str = Query(..., min_length=1)):
    """
    Прокси для получения котировок с Finnhub API (обходит CORS для фронта)
    Возвращает только текущую цену для калькулятора опционов
    """
    api_key = "d59oil1r01qgqlm1ilq0d59oil1r01qgqlm1ilqg"  # Finnhub API key
    url = f"https://finnhub.io/api/v1/quote?symbol={symbol}&token={api_key}"

    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url)
        return Response(content=r.content, status_code=r.status_code, media_type="application/json")
