"""
Клиент внешнего сервиса «Проверка сделки» (news.optioner.online).
ЗАЧЕМ: по уже собранной конструкции (ноги + параметры + посчитанные бэком калькулятора
маржа/прогноз) внешний сервис возвращает готовую риск-памятку на русском. Вся логика
оценки живёт у них — здесь только авторизованная переотправка запроса.

Проверка информационная, а не ворота: при любом сбое (нет ключа, таймаут, ошибка сети,
не-2xx ответ) возвращаем {"status": "unavailable", ...} вместо исключения — фронтенд
должен показать конструкцию как обычно, просто без риск-блока.
"""
import os
import time
import requests


def _friendly_error(status_code, detail=""):
    """Понятное русское сообщение по коду ошибки (см. коды в ТЗ интеграции)."""
    if status_code == 401:
        return "Проверка сделки не настроена: неверный или отсутствующий ключ"
    if status_code == 422:
        return f"Проверка сделки: сервер не принял форму запроса ({detail})" if detail else \
            "Проверка сделки: сервер не принял форму запроса"
    if status_code == 400:
        return "Проверка сделки: в одной из ног нечисловые значения"
    if status_code == 500:
        return "Проверка сделки временно недоступна на стороне сервиса"
    return f"Проверка сделки: неожиданный ответ сервиса ({status_code})"


class DealPrecheckClient:
    """Клиент для POST /api/deal/precheck на news.optioner.online."""

    def __init__(self):
        self.api_key = os.getenv("DEAL_PRECHECK_API_KEY")
        self.base_url = os.getenv("DEAL_PRECHECK_BASE_URL", "https://news.optioner.online").rstrip("/")
        self.configured = bool(self.api_key)

    def precheck(self, payload: dict) -> dict:
        """Отправить сделку на проверку. Никогда не бросает исключение."""
        ticker = payload.get("ticker", "?")
        if not self.configured:
            print("⚠️  [DealPrecheck] Нет ключа DEAL_PRECHECK_API_KEY — проверка пропущена")
            return {"status": "unavailable", "message": "Проверка сделки не настроена: нет ключа API"}
        started = time.monotonic()
        try:
            resp = requests.post(
                f"{self.base_url}/api/deal/precheck",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                # ЗАЧЕМ 40с: собственный ответ сервиса «обычно ~25с, худший случай
                # около 25с», но на практике даже пустой прогон с новостями занимал
                # ~20с — берём заметный запас, чтобы не резать легитимно долгие ответы.
                timeout=40,
            )
        except requests.exceptions.Timeout:
            elapsed = time.monotonic() - started
            print(f"⚠️  [DealPrecheck] {ticker}: таймаут после {elapsed:.1f}с")
            return {"status": "unavailable", "message": "Проверка сделки не ответила вовремя"}
        except requests.exceptions.RequestException as e:
            print(f"⚠️  [DealPrecheck] {ticker}: ошибка сети — {e}")
            return {"status": "unavailable", "message": f"Проверка сделки недоступна: {e}"}

        elapsed = time.monotonic() - started

        if not resp.ok:
            detail = ""
            try:
                detail = str(resp.json())[:300]
            except ValueError:
                detail = resp.text[:300]
            print(f"⚠️  [DealPrecheck] {ticker}: HTTP {resp.status_code} за {elapsed:.1f}с — {detail}")
            return {"status": "unavailable", "message": _friendly_error(resp.status_code, detail)}

        try:
            data = resp.json()
        except ValueError:
            print(f"⚠️  [DealPrecheck] {ticker}: нечитаемый ответ за {elapsed:.1f}с")
            return {"status": "unavailable", "message": "Проверка сделки вернула нечитаемый ответ"}

        print(f"✅ [DealPrecheck] {ticker}: {data.get('final_status', '?')} за {elapsed:.1f}с")
        return {"status": "ok", **data}
