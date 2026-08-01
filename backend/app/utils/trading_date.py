"""
Единая база для ТОРГОВЫХ дат на бэкенде — America/New_York.

ЗАЧЕМ: На фронте все расчёты, завязанные на дни до экспирации (дата входа, дата
расчёта, дни до экспирации), считаются от America/New_York — см.
frontend/src/utils/dateUtils.js (getTodayDateStringET и семья calculate*PreciseET).
Бэкенд же в разных местах использовал:
  - date.today() / datetime.now() — локальное время СЕРВЕРА (зависит от того, как
    настроен хостинг, может быть UTC, может быть чем угодно ещё);
  - datetime.utcnow() — UTC.
Если сервер стоит не в UTC и не в America/New_York, «сегодня» на бэкенде и «сегодня»
на фронте могли разойтись на календарный день около полуночи по любой из этих баз —
это ломает сопоставление дат (initialDaysToExpiration зафиксированных позиций,
фильтрация будущих дат экспирации, дни до экспирации в North GPT и т.п.).

Этот модуль — единственная точка входа для ТОРГОВЫХ дат бэкенда (зеркало
getTodayDateStringET() на фронте). НЕ использовать для служебных меток БД
(created_at/updated_at) — они намеренно остаются в UTC, это стандартная практика
для аудита и не участвует в сопоставлении дат с фронтом.
"""
from datetime import date, datetime

try:
    # zoneinfo — стандартная библиотека Python 3.9+, без внешних зависимостей.
    # Пакет tzdata (см. requirements.txt) гарантирует наличие базы часовых поясов
    # независимо от того, установлен ли системный tzdata на хосте.
    from zoneinfo import ZoneInfo
    NY_TIME_ZONE = "America/New_York"
    _NY_TZ = ZoneInfo(NY_TIME_ZONE)
except Exception:  # pragma: no cover - защита на случай отсутствия базы часовых поясов на хосте
    _NY_TZ = None


def get_trading_now() -> datetime:
    """
    Текущий момент времени в биржевой базе America/New_York (timezone-aware datetime).
    ЗАЧЕМ: единая точка правды для «сейчас» в торговом контексте — от неё
    строятся get_trading_today() и любые вычисления дней до экспирации на бэкенде.
    """
    if _NY_TZ is not None:
        return datetime.now(_NY_TZ)
    # Фолбэк, если на хосте почему-то недоступна база часовых поясов (не должно
    # случаться — tzdata указан в requirements.txt): лучше явный UTC, чем молча
    # уйти на непредсказуемое локальное время сервера.
    return datetime.utcnow()


def get_trading_today() -> date:
    """
    Сегодняшняя календарная дата по America/New_York.
    ЗАЧЕМ: бэкенд-аналог getTodayDateStringET() на фронте — единая база «сегодня»
    для дат входа/расчёта дней до экспирации на бэкенде, вместо date.today()
    (локальное время сервера) или datetime.utcnow().date() (UTC).
    """
    return get_trading_now().date()


def get_trading_today_iso() -> str:
    """Сегодняшняя торговая дата (America/New_York) в формате YYYY-MM-DD."""
    return get_trading_today().isoformat()
