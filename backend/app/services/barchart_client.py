"""
Barchart.com клиент для получения метрик волатильности
ЗАЧЕМ: Получение IV, HV, IV Rank, IV Percentile, 5D IV Avg, 1M IV Avg через API barchart
Механизм: загружаем страницу для получения XSRF-токена, затем запрашиваем API
"""

import re
import requests
import urllib.parse
from typing import Dict, Optional


class BarchartClient:
    """Клиент для получения данных волатильности с barchart.com"""

    def __init__(self):
        self.base_url = "https://www.barchart.com"
        self.headers = {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        }
        # Поля API для метрик волатильности
        self.api_fields = ",".join([
            "optionsWeightedImpliedVolatility",
            "historicVolatility30d",
            "optionsImpliedVolatilityRank1y",
            "optionsImpliedVolatilityPercentile1y",
            "optionsWeightedImpliedVolatility5d",
            "optionsWeightedImpliedVolatility1m",
        ])

    def get_volatility_metrics(self, ticker: str) -> Optional[Dict]:
        """
        Получить метрики волатильности для тикера

        Args:
            ticker: Тикер акции (например, DOCU, AAPL)

        Returns:
            Dict с метриками или None при ошибке
        """
        try:
            session = requests.Session()
            session.headers.update(self.headers)

            # Шаг 1: загружаем страницу для получения XSRF-токена из cookies
            page_url = f"{self.base_url}/stocks/quotes/{ticker.upper()}/options-data"
            session.get(page_url, timeout=15)

            xsrf_raw = session.cookies.get("XSRF-TOKEN")
            if not xsrf_raw:
                print(f"⚠️  [Barchart] XSRF-токен не получен для {ticker}")
                return None

            xsrf_decoded = urllib.parse.unquote(xsrf_raw)

            # Шаг 2: запрашиваем API с нужными полями
            api_url = (
                f"{self.base_url}/proxies/core-api/v1/quotes/get"
                f"?symbol={ticker.upper()}&fields={self.api_fields}&raw=true"
            )
            api_headers = {
                "X-XSRF-TOKEN": xsrf_decoded,
                "Referer": page_url,
                "Accept": "application/json",
            }
            api_resp = session.get(api_url, headers=api_headers, timeout=10)
            api_resp.raise_for_status()

            data = api_resp.json()
            items = data.get("data", [])
            if not items:
                print(f"⚠️  [Barchart] Пустой ответ API для {ticker}")
                return None

            # Берём raw-значения (числа, не строки с %)
            raw = items[0].get("raw", {})

            result = {
                "impliedVolatility": self._to_percent(raw.get("optionsWeightedImpliedVolatility")),
                "historicVolatility": self._to_number(raw.get("historicVolatility30d")),
                "ivRank": self._to_number(raw.get("optionsImpliedVolatilityRank1y")),
                "ivPercentile": self._to_percent(raw.get("optionsImpliedVolatilityPercentile1y")),
                "ivAvg5D": self._to_percent(raw.get("optionsWeightedImpliedVolatility5d")),
                "ivAvg1M": self._to_percent(raw.get("optionsWeightedImpliedVolatility1m")),
            }

            found = sum(1 for v in result.values() if v is not None)
            print(f"✅ [Barchart] {ticker}: получено {found}/6 метрик волатильности")

            return result

        except requests.exceptions.RequestException as e:
            print(f"⚠️  [Barchart] Ошибка запроса для {ticker}: {e}")
            return None
        except Exception as e:
            print(f"⚠️  [Barchart] Ошибка для {ticker}: {e}")
            return None

    def _to_percent(self, value) -> Optional[float]:
        """Конвертация дробного значения (0.5527) в проценты (55.27)"""
        if value is None:
            return None
        try:
            val = float(value)
            # Если значение уже в процентах (> 1) — оставляем как есть
            # Если дробное (< 1) — умножаем на 100
            return round(val * 100, 2) if val < 1 else round(val, 2)
        except (TypeError, ValueError):
            return None

    def _to_number(self, value) -> Optional[float]:
        """Конвертация значения в число"""
        if value is None:
            return None
        try:
            return round(float(value), 2)
        except (TypeError, ValueError):
            return None
