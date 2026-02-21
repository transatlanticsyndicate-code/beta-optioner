"""
Скрипт загрузки исторических данных по опционам через ThetaData API v3
ЗАЧЕМ: Получение реальных EOD цен опционов для калибровки коэффициентов калькулятора
Затрагивает: scripts/options_data/{TICKER}/ — CSV файлы с историей цен опционов

Требования:
  - Theta Terminal должен быть запущен: java -jar ~/Downloads/ThetaTerminalv3.jar
  - Подписка VALUE ($40/мес) — достаточно для EOD данных

Запуск:
  python3 scripts/fetch_options_thetadata.py --ticker AAPL
  python3 scripts/fetch_options_thetadata.py --ticker AAPL --months 6
"""

import argparse
import csv
import os
import time
from datetime import datetime, timedelta
from io import StringIO

import requests

# ============================================================================
# КОНФИГУРАЦИЯ
# ============================================================================

# Базовый URL Theta Terminal (локальный сервер)
BASE_URL = "http://127.0.0.1:25503/v3"

# Количество месяцев истории по умолчанию
DEFAULT_MONTHS = 6

# Количество страйков выше/ниже ATM для загрузки
# ЗАЧЕМ: Покрываем диапазон OTM/ATM/ITM для полноты анализа
STRIKES_AROUND_ATM = 4

# Пауза между запросами (VALUE план — макс 2 одновременных запроса)
REQUEST_DELAY = 0.5


# ============================================================================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ============================================================================

def get_output_dir(ticker: str) -> str:
    """Возвращает путь к директории для сохранения данных тикера"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(script_dir, "options_data", ticker)
    os.makedirs(output_dir, exist_ok=True)
    return output_dir


def get_date_range(months: int) -> tuple:
    """
    Вычисляет диапазон дат для загрузки
    ЗАЧЕМ: Берём последние N месяцев исторических данных
    """
    end_date = datetime.now()
    start_date = end_date - timedelta(days=months * 30)
    return start_date.strftime("%Y%m%d"), end_date.strftime("%Y%m%d")


def get_past_expirations(months: int) -> list:
    """
    Вычисляет прошедшие месячные экспирации (3-я пятница месяца)
    ЗАЧЕМ: Для каждой экспирации загружаем историю всех страйков
    """
    expirations = []
    today = datetime.now()

    year = today.year
    month = today.month

    # Берём экспирации за последние N месяцев + текущий месяц
    for _ in range(months + 2):
        first_day = datetime(year, month, 1)
        first_friday_offset = (4 - first_day.weekday()) % 7
        first_friday = first_day + timedelta(days=first_friday_offset)
        third_friday = first_friday + timedelta(weeks=2)

        # Берём только прошедшие экспирации (уже истёкшие)
        if third_friday < today:
            expirations.append(third_friday.strftime("%Y%m%d"))

        # Идём назад по месяцам
        month -= 1
        if month == 0:
            month = 12
            year -= 1

        if len(expirations) >= months:
            break

    return sorted(expirations)  # от старых к новым


def fetch_available_strikes(ticker: str, expiration: str) -> list:
    """
    Получает список доступных страйков для данной экспирации
    ЗАЧЕМ: Нужно знать реальные страйки перед запросом данных
    """
    url = f"{BASE_URL}/option/list/strikes"
    params = {
        "symbol": ticker,
        "expiration": expiration,
    }

    try:
        response = requests.get(url, params=params, timeout=30)
        if response.status_code != 200:
            return []

        # Ответ в формате CSV: symbol,strike
        strikes = []
        reader = csv.DictReader(StringIO(response.text))
        for row in reader:
            try:
                strikes.append(float(row["strike"]))
            except (ValueError, KeyError):
                pass
        return sorted(strikes)
    except Exception as e:
        print(f"     ⚠️  Ошибка получения страйков: {e}")
        return []


def fetch_current_price(ticker: str) -> float:
    """
    Получает текущую цену акции через ThetaData
    ЗАЧЕМ: Нужна для определения ATM страйка
    """
    url = f"{BASE_URL}/stock/snapshot/ohlc"
    params = {"symbol": ticker}

    try:
        response = requests.get(url, params=params, timeout=30)
        if response.status_code != 200:
            return None

        reader = csv.DictReader(StringIO(response.text))
        for row in reader:
            close = row.get("close") or row.get("last")
            if close:
                return float(close)
    except Exception as e:
        print(f"  ⚠️  Ошибка получения цены: {e}")
    return None


def select_strikes_around_atm(strikes: list, current_price: float, count: int) -> list:
    """
    Выбирает N страйков выше и ниже ATM
    ЗАЧЕМ: Фокусируемся на ликвидных страйках около текущей цены
    """
    if not strikes or not current_price:
        return strikes[:10] if strikes else []

    # Находим ближайший страйк к текущей цене (ATM)
    atm_strike = min(strikes, key=lambda s: abs(s - current_price))
    atm_idx = strikes.index(atm_strike)

    # Берём N страйков выше и ниже ATM
    start_idx = max(0, atm_idx - count)
    end_idx = min(len(strikes), atm_idx + count + 1)

    return strikes[start_idx:end_idx]


# ============================================================================
# ЗАГРУЗКА ДАННЫХ
# ============================================================================

def fetch_eod_bulk(ticker: str, expiration: str, start_date: str, end_date: str,
                   selected_strikes: list, output_dir: str) -> int:
    """
    Загружает EOD данные для всех выбранных страйков одной экспирации
    ЗАЧЕМ: Bulk запрос эффективнее — один запрос на экспирацию вместо N запросов

    Returns:
        Количество успешно сохранённых контрактов
    """
    saved = 0

    for right in ["call", "put"]:
        for strike in selected_strikes:
            url = f"{BASE_URL}/option/history/eod"
            params = {
                "symbol": ticker,
                "expiration": expiration,
                "strike": f"{strike:.3f}",
                "right": right,
                "start_date": start_date,
                "end_date": end_date,
            }

            try:
                response = requests.get(url, params=params, timeout=60)

                if response.status_code != 200:
                    continue

                lines = response.text.strip().split("\n")
                if len(lines) < 2:
                    # Нет данных для этого контракта
                    continue

                # Сохраняем в CSV
                exp_fmt = expiration  # YYYYMMDD
                right_short = "C" if right == "call" else "P"
                strike_int = int(strike)
                filename = f"{ticker}_{exp_fmt}_{right_short}{strike_int}_eod.csv"
                filepath = os.path.join(output_dir, filename)

                with open(filepath, "w") as f:
                    f.write(response.text)

                saved += 1
                print(f"     ✅ {ticker} {right.upper()} ${strike:.0f} exp {expiration}: {len(lines)-1} баров → {filename}")

            except Exception as e:
                print(f"     ⚠️  {ticker} {right} ${strike}: {e}")

            time.sleep(REQUEST_DELAY)

    return saved


# ============================================================================
# ГЛАВНАЯ ФУНКЦИЯ
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Загрузка исторических данных опционов через ThetaData API v3"
    )
    parser.add_argument("--ticker", "-t", type=str, default="AAPL",
                        help="Тикер акции (по умолчанию: AAPL)")
    parser.add_argument("--months", "-m", type=int, default=DEFAULT_MONTHS,
                        help=f"Количество месяцев истории (по умолчанию: {DEFAULT_MONTHS})")
    parser.add_argument("--strikes", "-s", type=int, default=STRIKES_AROUND_ATM,
                        help=f"Страйков выше/ниже ATM (по умолчанию: {STRIKES_AROUND_ATM})")

    args = parser.parse_args()
    ticker = args.ticker.upper()
    months = args.months
    strikes_count = args.strikes

    print(f"\n{'='*60}")
    print(f"  ThetaData Options Fetcher")
    print(f"  Тикер: {ticker} | История: {months} мес | Страйки: ±{strikes_count} от ATM")
    print(f"{'='*60}\n")

    # Проверяем доступность Theta Terminal
    try:
        r = requests.get(f"{BASE_URL}/option/list/symbols", timeout=5)
        print(f"✅ Theta Terminal доступен (порт 25503)\n")
    except Exception:
        print("❌ Theta Terminal недоступен! Запустите:")
        print("   java -jar ~/Downloads/ThetaTerminalv3.jar")
        return

    output_dir = get_output_dir(ticker)
    start_date, end_date = get_date_range(months)
    expirations = get_past_expirations(months)

    print(f"📅 Период: {start_date} — {end_date}")
    print(f"📋 Экспираций для загрузки: {len(expirations)}")
    print(f"   {', '.join(expirations)}\n")

    # Получаем текущую цену через список страйков первой экспирации как fallback
    # ЗАЧЕМ: Snapshot может быть недоступен на FREE плане акций
    print(f"💰 Получаем текущую цену {ticker}...")
    current_price = fetch_current_price(ticker)
    if not current_price and expirations:
        # Fallback: берём медиану страйков первой экспирации как приближение ATM
        test_strikes = fetch_available_strikes(ticker, expirations[-1])
        if test_strikes:
            current_price = test_strikes[len(test_strikes) // 2]
            print(f"   Приближённая цена (медиана страйков): ${current_price:.2f}\n")
        else:
            print(f"   ⚠️  Не удалось определить цену\n")
    elif current_price:
        print(f"   Текущая цена: ${current_price:.2f}\n")

    # Загружаем данные по каждой экспирации
    total_saved = 0
    total_expirations = len(expirations)

    for i, expiration in enumerate(expirations, 1):
        print(f"[{i}/{total_expirations}] Экспирация {expiration}")

        # Получаем доступные страйки
        strikes = fetch_available_strikes(ticker, expiration)
        if not strikes:
            print(f"     ⚠️  Нет страйков для {expiration}, пропускаем")
            continue

        print(f"     Доступно страйков: {len(strikes)} (от ${strikes[0]:.0f} до ${strikes[-1]:.0f})")

        # Выбираем страйки около ATM
        selected = select_strikes_around_atm(strikes, current_price, strikes_count)
        print(f"     Выбрано {len(selected)} страйков: {[f'${s:.0f}' for s in selected]}")

        # Загружаем EOD данные
        saved = fetch_eod_bulk(ticker, expiration, start_date, end_date, selected, output_dir)
        total_saved += saved

        print()

    # Итог
    print(f"\n{'='*60}")
    print(f"  ИТОГО")
    print(f"{'='*60}")
    print(f"  Контрактов сохранено: {total_saved}")
    print(f"  Данные в папке:       {output_dir}")
    print(f"{'='*60}\n")

    if total_saved > 0:
        print("✅ Данные загружены! Следующий шаг:")
        print("   python3 scripts/backtest_calibration.py --ticker", ticker)
    else:
        print("⚠️  Данные не загружены. Проверьте подключение Theta Terminal.")


if __name__ == "__main__":
    main()
