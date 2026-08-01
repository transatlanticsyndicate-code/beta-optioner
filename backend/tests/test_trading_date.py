"""
Тест единой торговой даты бэкенда (app/utils/trading_date.py).

ЗАЧЕМ: раньше разные части бэкенда брали "сегодня" по-разному — date.today()/
datetime.now() (локальное время СЕРВЕРА, зависит от настройки хостинга) и
datetime.utcnow() (UTC). Если сервер стоит не в America/New_York, "сегодня" на
бэкенде и "сегодня" на фронте (который считает по America/New_York, см.
frontend/src/utils/dateUtils.js) могли разойтись на календарный день около полуночи.

Этот тест проверяет ГЛАВНОЕ требование задачи: get_trading_today()/get_trading_now()
дают ОДИНАКОВЫЙ результат независимо от того, в каком часовом поясе настроен сам
процесс/сервер (TZ окружения) — в отличие от "наивных" date.today()/datetime.now(),
которые от TZ сервера как раз зависят (это и есть баг, который мы чиним).
"""
import os
import time
import pytest
from datetime import date, datetime

from app.utils.trading_date import get_trading_today, get_trading_now, get_trading_today_iso


def _set_server_tz(tz_name):
    """
    Меняет TZ текущего процесса (POSIX: time.tzset подхватывает переменную окружения TZ).
    ЗАЧЕМ: единственный способ честно смоделировать "сервер настроен в другом часовом
    поясе" без реального деплоя на разные хосты.
    """
    os.environ['TZ'] = tz_name
    time.tzset()


@pytest.fixture(autouse=True)
def restore_server_tz():
    """Возвращаем TZ процесса в исходное состояние после каждого теста — не должны
    протекать побочные эффекты в остальной тестовый прогон."""
    original = os.environ.get('TZ')
    yield
    if original is None:
        os.environ.pop('TZ', None)
    else:
        os.environ['TZ'] = original
    time.tzset()


def test_get_trading_today_returns_date():
    result = get_trading_today()
    assert isinstance(result, date)


def test_get_trading_today_iso_format():
    iso = get_trading_today_iso()
    # YYYY-MM-DD, парсится обратно без ошибок
    parsed = date.fromisoformat(iso)
    assert parsed == get_trading_today()


def test_trading_today_independent_of_server_timezone():
    """
    ГЛАВНЫЙ тест задачи: результат get_trading_today() должен быть одинаков
    независимо от TZ, в которой запущен процесс сервера.
    """
    _set_server_tz('UTC')
    today_as_utc_server = get_trading_today()

    # Kiritimati (Кирибати) — UTC+14, самый "опережающий" часовой пояс в мире.
    # Если бы get_trading_today() случайно зависел от локального времени процесса
    # (как date.today()), смена TZ на настолько "далёкую" зону почти гарантированно
    # сдвинула бы календарную дату — тест поймал бы регресс.
    _set_server_tz('Pacific/Kiritimati')
    today_as_kiritimati_server = get_trading_today()

    # America/New_York — для контроля: тоже другой часовой пояс относительно UTC
    _set_server_tz('America/New_York')
    today_as_ny_server = get_trading_today()

    assert today_as_utc_server == today_as_kiritimati_server == today_as_ny_server


def test_trading_now_is_timezone_aware_and_ny_based():
    now = get_trading_now()
    assert now.tzinfo is not None
    # UTC-смещение America/New_York всегда отрицательное (западнее UTC): -4ч (EDT) или -5ч (EST)
    offset = now.utcoffset()
    assert offset is not None
    assert offset.total_seconds() in (-4 * 3600, -5 * 3600)


def test_naive_datetime_now_actually_depends_on_server_tz_control_case():
    """
    Контрольный тест (демонстрация бага, который мы чиним): "наивный" datetime.now()
    ДЕЙСТВИТЕЛЬНО зависит от TZ процесса — именно поэтому date.today()/datetime.now()
    нельзя было использовать для торговых дат. Если этот тест начнёт падать —
    значит платформа перестала поддерживать TZ-зависимость naive datetime.now(),
    и защитный вывод выше нужно пересмотреть.
    """
    _set_server_tz('UTC')
    hour_as_utc = datetime.now().hour

    _set_server_tz('Pacific/Kiritimati')  # UTC+14
    hour_as_kiritimati = datetime.now().hour

    # Час дня отличается на 14 (по модулю 24) — наглядно показывает, что "локальное
    # время сервера" плавает вместе с TZ, поэтому не годится как база для торговых дат.
    assert hour_as_utc != hour_as_kiritimati
