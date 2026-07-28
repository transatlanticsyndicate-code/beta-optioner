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
        if not self.configured:
            return {"status": "unavailable", "message": "Проверка сделки не настроена: нет ключа API"}
        try:
            resp = requests.post(
                f"{self.base_url}/api/deal/precheck",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=28,
            )
        except requests.exceptions.Timeout:
            return {"status": "unavailable", "message": "Проверка сделки не ответила вовремя"}
        except requests.exceptions.RequestException as e:
            return {"status": "unavailable", "message": f"Проверка сделки недоступна: {e}"}

        if not resp.ok:
            detail = ""
            try:
                detail = str(resp.json())[:300]
            except ValueError:
                detail = resp.text[:300]
            return {"status": "unavailable", "message": _friendly_error(resp.status_code, detail)}

        try:
            data = resp.json()
        except ValueError:
            return {"status": "unavailable", "message": "Проверка сделки вернула нечитаемый ответ"}

        return {"status": "ok", **data}
