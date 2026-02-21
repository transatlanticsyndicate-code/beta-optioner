"""
Скрипт бэктестинга для калибровки коэффициентов P&L калькулятора
ЗАЧЕМ: Вычисляет per-ticker коэффициенты down_mult и up_mult путём сравнения
       прогноза калькулятора (Black-Scholes) с реальными ценами опционов из ThetaData
Затрагивает: scripts/options_data/{TICKER}/ — входные данные
             scripts/calibration_results/ — результаты калибровки

Логика:
  1. Для каждого контракта берём день входа (entry_day) и день выхода (exit_day = entry + N дней)
  2. Вычисляем теоретическую цену опциона в entry_day по Black-Scholes
  3. Вычисляем прогноз P&L калькулятора: (цена в exit_day - цена в entry_day) * 100
  4. Сравниваем с реальным P&L: (реальная цена в exit_day - цена в entry_day) * 100
  5. Вычисляем коэффициент: real_pl / predicted_pl
  6. Усредняем коэффициенты по всем сделкам → down_mult, up_mult

Запуск:
  python3 scripts/backtest_calibration.py --ticker AAPL
  python3 scripts/backtest_calibration.py --ticker AAPL --hold-days 14 --min-trades 20
"""

import argparse
import csv
import json
import math
import os
from datetime import datetime, timedelta
from collections import defaultdict

# ============================================================================
# КОНФИГУРАЦИЯ
# ============================================================================

# Дней удержания позиции для симуляции
DEFAULT_HOLD_DAYS = 14

# Минимальное количество сделок для надёжной калибровки
MIN_TRADES = 10

# Минимальная цена опциона (фильтр неликвидных контрактов)
MIN_OPTION_PRICE = 0.50

# Безрисковая ставка для Black-Scholes
RISK_FREE_RATE = 0.05


# ============================================================================
# BLACK-SCHOLES МОДЕЛЬ
# ============================================================================

def norm_cdf(x: float) -> float:
    """Кумулятивная функция нормального распределения (приближение)"""
    # Используем приближение Абрамовица и Стегуна
    a1 = 0.254829592
    a2 = -0.284496736
    a3 = 1.421413741
    a4 = -1.453152027
    a5 = 1.061405429
    p = 0.3275911

    sign = 1 if x >= 0 else -1
    x = abs(x) / math.sqrt(2)
    t = 1.0 / (1.0 + p * x)
    y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * math.exp(-x * x)
    return 0.5 * (1.0 + sign * y)


def black_scholes_price(S: float, K: float, T: float, r: float, sigma: float, right: str) -> float:
    """
    Вычисляет теоретическую цену опциона по модели Black-Scholes
    ЗАЧЕМ: Прогноз калькулятора основан на BS, нужно воспроизвести ту же логику

    Args:
        S: Текущая цена акции
        K: Страйк опциона
        T: Время до экспирации в годах
        r: Безрисковая ставка
        sigma: Подразумеваемая волатильность (IV)
        right: 'CALL' или 'PUT'

    Returns:
        Теоретическая цена опциона
    """
    if T <= 0 or sigma <= 0 or S <= 0:
        return max(0.0, (S - K) if right == 'CALL' else (K - S))

    d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)

    if right == 'CALL':
        price = S * norm_cdf(d1) - K * math.exp(-r * T) * norm_cdf(d2)
    else:
        price = K * math.exp(-r * T) * norm_cdf(-d2) - S * norm_cdf(-d1)

    return max(0.0, price)


def estimate_iv_from_price(S: float, K: float, T: float, r: float,
                           market_price: float, right: str) -> float:
    """
    Вычисляет подразумеваемую волатильность методом бисекции
    ЗАЧЕМ: IV нужна для прогноза цены опциона в будущий момент времени
    """
    if T <= 0 or market_price <= 0:
        return 0.30  # дефолтная IV 30%

    low, high = 0.001, 5.0  # диапазон поиска IV

    for _ in range(100):
        mid = (low + high) / 2
        price = black_scholes_price(S, K, T, r, mid, right)

        if abs(price - market_price) < 0.001:
            return mid
        elif price < market_price:
            low = mid
        else:
            high = mid

    return (low + high) / 2


# ============================================================================
# ЗАГРУЗКА ДАННЫХ
# ============================================================================

def load_option_data(filepath: str) -> list:
    """
    Загружает EOD данные опциона из CSV файла ThetaData
    ЗАЧЕМ: Реальные цены опциона по дням для сравнения с прогнозом

    Returns:
        Список словарей с полями: date, mid_price, bid, ask, strike, right, expiration
    """
    rows = []
    try:
        with open(filepath, "r") as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    # Дата из поля created (формат: 2025-08-25T17:16:17.366)
                    date_str = row["created"].split("T")[0]
                    date = datetime.strptime(date_str, "%Y-%m-%d")

                    bid = float(row["bid"]) if row["bid"] else 0.0
                    ask = float(row["ask"]) if row["ask"] else 0.0
                    mid = (bid + ask) / 2 if bid > 0 and ask > 0 else 0.0

                    # Пропускаем строки без цены
                    if mid < MIN_OPTION_PRICE:
                        continue

                    rows.append({
                        "date": date,
                        "mid_price": mid,
                        "bid": bid,
                        "ask": ask,
                        "strike": float(row["strike"]),
                        "right": row["right"].upper(),
                        "expiration": datetime.strptime(row["expiration"], "%Y-%m-%d"),
                    })
                except (ValueError, KeyError):
                    continue
    except Exception as e:
        print(f"  ⚠️  Ошибка чтения {filepath}: {e}")

    return sorted(rows, key=lambda x: x["date"])


def load_stock_data(ticker: str) -> dict:
    """
    Загружает исторические цены акции из CSV (загруженного через IB TWS)
    ЗАЧЕМ: Цена акции нужна для расчёта BS прогноза

    Returns:
        Словарь {date: close_price}
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    filepath = os.path.join(script_dir, "options_data", ticker, f"{ticker}_stock_daily.csv")

    prices = {}
    if not os.path.exists(filepath):
        return prices

    try:
        with open(filepath, "r") as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    date = datetime.strptime(str(row["date"]), "%Y-%m-%d")
                    prices[date] = float(row["close"])
                except (ValueError, KeyError):
                    continue
    except Exception as e:
        print(f"  ⚠️  Ошибка чтения цен акции: {e}")

    return prices


# ============================================================================
# БЭКТЕСТИНГ
# ============================================================================

def simulate_trades(option_data: list, stock_prices: dict, hold_days: int) -> list:
    """
    Симулирует сделки: вход в день X, выход в день X+hold_days
    ЗАЧЕМ: Получаем пары (predicted_pl, real_pl) для вычисления коэффициентов

    Returns:
        Список словарей с результатами каждой симулированной сделки
    """
    trades = []

    # Создаём словарь цен опциона по дате для быстрого поиска
    option_by_date = {row["date"]: row for row in option_data}
    dates = sorted(option_by_date.keys())

    for i, entry_date in enumerate(dates):
        entry_row = option_by_date[entry_date]

        # Ищем дату выхода (через hold_days торговых дней)
        exit_date = None
        for j in range(i + 1, min(i + hold_days * 2, len(dates))):
            candidate = dates[j]
            if (candidate - entry_date).days >= hold_days:
                exit_date = candidate
                break

        if exit_date is None:
            continue

        exit_row = option_by_date.get(exit_date)
        if exit_row is None:
            continue

        entry_price = entry_row["mid_price"]
        exit_price = exit_row["mid_price"]
        strike = entry_row["strike"]
        right = entry_row["right"]
        expiration = entry_row["expiration"]

        # Реальный P&L (на 1 контракт = 100 акций)
        real_pl = (exit_price - entry_price) * 100

        # Прогноз калькулятора через Black-Scholes
        # Нужна цена акции в день входа
        stock_price_entry = None
        for delta in range(5):
            candidate_date = entry_date - timedelta(days=delta)
            if candidate_date in stock_prices:
                stock_price_entry = stock_prices[candidate_date]
                break

        if stock_price_entry is None:
            continue

        # Время до экспирации в годах
        T_entry = max(0.001, (expiration - entry_date).days / 365.0)
        T_exit = max(0.001, (expiration - exit_date).days / 365.0)

        # Вычисляем IV из рыночной цены в день входа
        iv = estimate_iv_from_price(stock_price_entry, strike, T_entry,
                                    RISK_FREE_RATE, entry_price, right)

        # Цена акции в день выхода (или используем entry как приближение)
        stock_price_exit = None
        for delta in range(5):
            candidate_date = exit_date - timedelta(days=delta)
            if candidate_date in stock_prices:
                stock_price_exit = stock_prices[candidate_date]
                break

        if stock_price_exit is None:
            stock_price_exit = stock_price_entry

        # Прогноз цены опциона в день выхода (BS с той же IV)
        predicted_exit_price = black_scholes_price(
            stock_price_exit, strike, T_exit, RISK_FREE_RATE, iv, right
        )
        predicted_pl = (predicted_exit_price - entry_price) * 100

        # Пропускаем сделки с нулевым прогнозом
        if abs(predicted_pl) < 1.0:
            continue

        trades.append({
            "entry_date": entry_date,
            "exit_date": exit_date,
            "strike": strike,
            "right": right,
            "entry_price": entry_price,
            "exit_price": exit_price,
            "real_pl": real_pl,
            "predicted_pl": predicted_pl,
            "ratio": real_pl / predicted_pl if predicted_pl != 0 else None,
            "stock_entry": stock_price_entry,
            "stock_exit": stock_price_exit,
            "iv": iv,
        })

    return trades


def compute_multipliers(trades: list) -> dict:
    """
    Вычисляет коэффициенты down_mult и up_mult из результатов симуляции
    ЗАЧЕМ: Коэффициенты корректируют прогноз калькулятора под реальное поведение акции

    Логика применения в калькуляторе:
      - P&L < 0: adjusted = basePL / down_mult  (down_mult > 1 → убыток больше)
      - P&L > 0: adjusted = basePL * up_mult    (up_mult < 1 → прибыль меньше)

    Значит нам нужно найти:
      - down_mult = median(predicted_pl / real_pl) для убыточных сделок
      - up_mult   = median(real_pl / predicted_pl) для прибыльных сделок
    """
    down_ratios = []
    up_ratios = []

    for t in trades:
        if t["ratio"] is None:
            continue

        real = t["real_pl"]
        pred = t["predicted_pl"]

        if real < 0 and pred < 0:
            # Убыточная сделка: насколько реальный убыток больше прогноза?
            # down_mult = pred / real (оба отрицательные → результат положительный)
            ratio = pred / real  # > 1 если реальный убыток больше прогноза
            if 0.1 < ratio < 10:
                down_ratios.append(ratio)

        elif real > 0 and pred > 0:
            # Прибыльная сделка: насколько реальная прибыль меньше прогноза?
            # up_mult = real / pred
            ratio = real / pred
            if 0.1 < ratio < 10:
                up_ratios.append(ratio)

    def median(lst):
        if not lst:
            return 1.0
        s = sorted(lst)
        n = len(s)
        return s[n // 2] if n % 2 == 1 else (s[n // 2 - 1] + s[n // 2]) / 2

    def mean(lst):
        return sum(lst) / len(lst) if lst else 1.0

    return {
        "down_mult": round(median(down_ratios), 3),
        "up_mult": round(median(up_ratios), 3),
        "down_mult_mean": round(mean(down_ratios), 3),
        "up_mult_mean": round(mean(up_ratios), 3),
        "down_trades": len(down_ratios),
        "up_trades": len(up_ratios),
        "down_ratios_sample": sorted(down_ratios)[:10],
        "up_ratios_sample": sorted(up_ratios)[:10],
    }


# ============================================================================
# ГЛАВНАЯ ФУНКЦИЯ
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Бэктестинг калибровки коэффициентов P&L калькулятора"
    )
    parser.add_argument("--ticker", "-t", type=str, default="AAPL",
                        help="Тикер акции (по умолчанию: AAPL)")
    parser.add_argument("--hold-days", "-d", type=int, default=DEFAULT_HOLD_DAYS,
                        help=f"Дней удержания позиции (по умолчанию: {DEFAULT_HOLD_DAYS})")
    parser.add_argument("--min-trades", type=int, default=MIN_TRADES,
                        help=f"Минимум сделок для калибровки (по умолчанию: {MIN_TRADES})")

    args = parser.parse_args()
    ticker = args.ticker.upper()
    hold_days = args.hold_days

    print(f"\n{'='*60}")
    print(f"  Backtest Calibration")
    print(f"  Тикер: {ticker} | Удержание: {hold_days} дней")
    print(f"{'='*60}\n")

    # Находим все CSV файлы опционов
    script_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(script_dir, "options_data", ticker)

    if not os.path.exists(data_dir):
        print(f"❌ Папка с данными не найдена: {data_dir}")
        print(f"   Сначала запустите: python3 scripts/fetch_options_thetadata.py --ticker {ticker}")
        return

    csv_files = [f for f in os.listdir(data_dir) if f.endswith("_eod.csv")]
    print(f"📂 Найдено файлов опционов: {len(csv_files)}")

    # Загружаем цены акции
    stock_prices = load_stock_data(ticker)
    print(f"📈 Загружено дней цен акции: {len(stock_prices)}")

    if not stock_prices:
        print(f"⚠️  Нет данных по ценам акции {ticker}.")
        print(f"   Запустите: python3 scripts/fetch_options_history.py --ticker {ticker} --port 7496")
        print(f"   Или используем приближение через цены опционов...\n")

    # Обрабатываем каждый файл
    all_trades = []
    contracts_processed = 0

    for filename in sorted(csv_files):
        filepath = os.path.join(data_dir, filename)
        option_data = load_option_data(filepath)

        if len(option_data) < 5:
            continue

        trades = simulate_trades(option_data, stock_prices, hold_days)
        all_trades.extend(trades)
        contracts_processed += 1

    print(f"\n📊 Обработано контрактов: {contracts_processed}")
    print(f"📊 Всего симулированных сделок: {len(all_trades)}")

    if len(all_trades) < args.min_trades:
        print(f"\n⚠️  Недостаточно сделок для калибровки (нужно минимум {args.min_trades})")
        print(f"   Попробуйте загрузить больше данных или уменьшить --min-trades")
        return

    # Вычисляем коэффициенты
    multipliers = compute_multipliers(all_trades)

    print(f"\n{'='*60}")
    print(f"  РЕЗУЛЬТАТЫ КАЛИБРОВКИ для {ticker}")
    print(f"{'='*60}")
    print(f"  Убыточных сделок:  {multipliers['down_trades']}")
    print(f"  Прибыльных сделок: {multipliers['up_trades']}")
    print(f"")
    print(f"  down_mult (медиана): {multipliers['down_mult']}")
    print(f"  down_mult (среднее): {multipliers['down_mult_mean']}")
    print(f"  up_mult   (медиана): {multipliers['up_mult']}")
    print(f"  up_mult   (среднее): {multipliers['up_mult_mean']}")
    print(f"{'='*60}")

    # Интерпретация
    print(f"\n📌 Интерпретация:")
    dm = multipliers['down_mult']
    um = multipliers['up_mult']
    if dm > 1.1:
        print(f"  ⬇️  Реальные убытки на {((dm-1)*100):.0f}% больше прогноза (down_mult={dm})")
    elif dm < 0.9:
        print(f"  ⬇️  Реальные убытки на {((1-dm)*100):.0f}% меньше прогноза (down_mult={dm})")
    else:
        print(f"  ⬇️  Убытки соответствуют прогнозу (down_mult={dm})")

    if um < 0.9:
        print(f"  ⬆️  Реальная прибыль на {((1-um)*100):.0f}% меньше прогноза (up_mult={um})")
    elif um > 1.1:
        print(f"  ⬆️  Реальная прибыль на {((um-1)*100):.0f}% больше прогноза (up_mult={um})")
    else:
        print(f"  ⬆️  Прибыль соответствует прогнозу (up_mult={um})")

    # Сохраняем результаты
    results_dir = os.path.join(script_dir, "calibration_results")
    os.makedirs(results_dir, exist_ok=True)

    result = {
        "ticker": ticker,
        "hold_days": hold_days,
        "total_trades": len(all_trades),
        "down_mult": multipliers["down_mult"],
        "up_mult": multipliers["up_mult"],
        "down_mult_mean": multipliers["down_mult_mean"],
        "up_mult_mean": multipliers["up_mult_mean"],
        "down_trades": multipliers["down_trades"],
        "up_trades": multipliers["up_trades"],
        "calibrated_at": datetime.now().isoformat(),
    }

    result_file = os.path.join(results_dir, f"{ticker}_calibration.json")
    with open(result_file, "w") as f:
        json.dump(result, f, indent=2)

    print(f"\n✅ Результаты сохранены: {result_file}")
    print(f"\n📋 Для применения в калькуляторе добавьте в per-ticker overrides:")
    print(f'   "{ticker}": {{"down_mult": {dm}, "up_mult": {um}}}')


if __name__ == "__main__":
    main()
