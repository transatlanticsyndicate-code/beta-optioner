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


def compute_multipliers(trades: list, weighted: bool = False) -> dict:
    """
    Вычисляет коэффициенты down_mult и up_mult из результатов симуляции
    ЗАЧЕМ: Коэффициенты корректируют прогноз калькулятора под реальное поведение акции

    Логика применения в калькуляторе:
      - P&L < 0: adjusted = basePL / down_mult  (down_mult > 1 → убыток больше)
      - P&L > 0: adjusted = basePL * up_mult    (up_mult < 1 → прибыль меньше)

    Значит нам нужно найти:
      - down_mult = weighted_median(predicted_pl / real_pl) для убыточных сделок
      - up_mult   = weighted_median(real_pl / predicted_pl) для прибыльных сделок

    Args:
        trades: список сделок
        weighted: если True — используем экспоненциальные веса (свежие сделки важнее)
    """
    # Для взвешенного режима вычисляем возраст каждой сделки в днях
    # ЗАЧЕМ: Чем свежее сделка — тем больше её вес в калибровке (актуальность vs история)
    if weighted:
        dates = []
        for t in trades:
            try:
                dates.append(datetime.fromisoformat(str(t["entry_date"])))
            except Exception:
                dates.append(None)
        max_date = max((d for d in dates if d), default=None)
    else:
        max_date = None
        dates = [None] * len(trades)

    down_items = []  # (ratio, weight)
    up_items = []    # (ratio, weight)

    for i, t in enumerate(trades):
        if t["ratio"] is None:
            continue

        real = t["real_pl"]
        pred = t["predicted_pl"]

        # Вычисляем вес сделки: exp(-age_days / 30) → свежие сделки весят больше
        # При half-life=30 дней: сделка 30д назад весит 0.37, 90д — 0.05
        if weighted and max_date and dates[i]:
            age_days = (max_date - dates[i]).days
            weight = math.exp(-age_days / 30.0)
        else:
            weight = 1.0

        if real < 0 and pred < 0:
            ratio = pred / real
            if 0.1 < ratio < 10:
                down_items.append((ratio, weight))

        elif real > 0 and pred > 0:
            ratio = real / pred
            if 0.1 < ratio < 10:
                up_items.append((ratio, weight))

    def weighted_median(items):
        """Взвешенная медиана: находим точку где накопленный вес = 50%"""
        if not items:
            return 1.0
        sorted_items = sorted(items, key=lambda x: x[0])
        total_weight = sum(w for _, w in sorted_items)
        cumulative = 0.0
        for ratio, w in sorted_items:
            cumulative += w
            if cumulative >= total_weight / 2:
                return ratio
        return sorted_items[-1][0]

    def weighted_mean(items):
        if not items:
            return 1.0
        total_w = sum(w for _, w in items)
        return sum(r * w for r, w in items) / total_w if total_w > 0 else 1.0

    return {
        "down_mult": round(weighted_median(down_items), 3),
        "up_mult": round(weighted_median(up_items), 3),
        "down_mult_mean": round(weighted_mean(down_items), 3),
        "up_mult_mean": round(weighted_mean(up_items), 3),
        "down_trades": len(down_items),
        "up_trades": len(up_items),
        "down_ratios_sample": sorted(r for r, _ in down_items)[:10],
        "up_ratios_sample": sorted(r for r, _ in up_items)[:10],
    }


# ============================================================================
# IV MEAN REVERSION (ORNSTEIN-UHLENBECK)
# ============================================================================

def compute_iv_mean_reversion(trades: list) -> dict:
    """
    Вычисляет параметры модели Ornstein-Uhlenbeck для IV mean reversion
    ЗАЧЕМ: Позволяет калькулятору предсказывать изменение IV на период удержания позиции,
           а не замораживать её на уровне входа. Если IV выше среднего — она будет падать,
           если ниже — расти. Скорость возврата (kappa) определяется из исторических данных.

    Модель: IV(t+dt) = iv_mean + (IV(t) - iv_mean) * exp(-kappa * dt)

    Параметры:
        iv_mean  — долгосрочное среднее IV для данного тикера (в долях, например 0.35)
        iv_kappa — скорость возврата к среднему (в 1/год). Чем выше — тем быстрее возврат.
                   Например, kappa=12 означает half-life ≈ 21 день (ln(2)/12 * 365)

    Returns:
        Словарь с iv_mean, iv_kappa, iv_std, half_life_days
    """
    # Собираем все IV из сделок — это выборка исторических IV при входе
    iv_values = [t["iv"] for t in trades if t.get("iv") and 0.05 < t["iv"] < 3.0]

    if len(iv_values) < 10:
        # Недостаточно данных — возвращаем нейтральные значения
        return {
            "iv_mean": 0.30,
            "iv_kappa": 4.0,
            "iv_std": 0.10,
            "half_life_days": 63,
        }

    # Среднее и стандартное отклонение IV
    n = len(iv_values)
    iv_mean = sum(iv_values) / n
    iv_variance = sum((v - iv_mean) ** 2 for v in iv_values) / n
    iv_std = math.sqrt(iv_variance)

    # Оцениваем kappa через авторегрессию AR(1) на последовательных IV
    # Сортируем сделки по дате входа и берём последовательные пары IV
    # Логика: если IV[t+1] = iv_mean + (IV[t] - iv_mean) * phi, то phi = exp(-kappa * dt)
    # Оцениваем phi через корреляцию последовательных IV
    sorted_trades = sorted(trades, key=lambda t: t["entry_date"])
    iv_seq = [t["iv"] for t in sorted_trades if t.get("iv") and 0.05 < t["iv"] < 3.0]

    # Вычисляем авторегрессионный коэффициент phi через метод наименьших квадратов
    # phi = Cov(IV[t], IV[t+1]) / Var(IV[t])
    if len(iv_seq) >= 4:
        pairs = [(iv_seq[i], iv_seq[i + 1]) for i in range(len(iv_seq) - 1)]
        x_vals = [p[0] for p in pairs]
        y_vals = [p[1] for p in pairs]
        x_mean = sum(x_vals) / len(x_vals)
        y_mean = sum(y_vals) / len(y_vals)
        cov = sum((x - x_mean) * (y - y_mean) for x, y in zip(x_vals, y_vals)) / len(pairs)
        var_x = sum((x - x_mean) ** 2 for x in x_vals) / len(x_vals)
        phi = cov / var_x if var_x > 0 else 0.5
        # Ограничиваем phi в разумных пределах (0.01 ... 0.99)
        phi = max(0.01, min(0.99, phi))
    else:
        phi = 0.5  # дефолт: умеренный mean reversion

    # Предполагаем что средний интервал между сделками ≈ 1 торговый день
    # dt = 1/252 года (один торговый день)
    dt = 1.0 / 252.0
    # kappa = -ln(phi) / dt
    kappa = -math.log(phi) / dt if phi > 0 else 4.0
    # Ограничиваем kappa в разумных пределах (0.5 ... 100 в год)
    kappa = max(0.5, min(100.0, kappa))

    # Half-life: время за которое отклонение от среднего уменьшается вдвое
    # half_life = ln(2) / kappa (в годах) * 365 (в днях)
    half_life_days = round(math.log(2) / kappa * 365)

    return {
        "iv_mean": round(iv_mean, 4),
        "iv_kappa": round(kappa, 2),
        "iv_std": round(iv_std, 4),
        "half_life_days": half_life_days,
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
    parser.add_argument("--mode", type=str, default="standard",
                        choices=["standard", "recent", "weighted"],
                        help="Режим калибровки: standard (все данные), recent (последняя неделя), weighted (с весами по возрасту)")
    parser.add_argument("--recent-days", type=int, default=7,
                        help="Количество последних дней для режима recent (по умолчанию: 7)")

    args = parser.parse_args()
    ticker = args.ticker.upper()
    hold_days = args.hold_days
    mode = args.mode
    recent_days = args.recent_days

    print(f"\n{'='*60}")
    print(f"  Backtest Calibration")
    print(f"  Тикер: {ticker} | Удержание: {hold_days} дней | Режим: {mode}")
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

    # Для режима recent — вычисляем cutoff дату (только последние N дней)
    # ЗАЧЕМ: Показывает как рынок ведёт себя прямо сейчас, а не в среднем за 6 месяцев
    recent_cutoff = None
    if mode == "recent":
        recent_cutoff = datetime.now() - timedelta(days=recent_days)
        print(f"📅 Режим recent: данные с {recent_cutoff.strftime('%Y-%m-%d')} (последние {recent_days} дней)")

    # Обрабатываем каждый файл
    all_trades = []
    contracts_processed = 0

    for filename in sorted(csv_files):
        filepath = os.path.join(data_dir, filename)
        option_data = load_option_data(filepath)

        if len(option_data) < 5:
            continue

        trades = simulate_trades(option_data, stock_prices, hold_days)

        # Фильтруем по дате для режима recent
        if recent_cutoff:
            trades = [
                t for t in trades
                if t.get("entry_date") and datetime.fromisoformat(str(t["entry_date"])) >= recent_cutoff
            ]

        all_trades.extend(trades)
        contracts_processed += 1

    print(f"\n📊 Обработано контрактов: {contracts_processed}")
    print(f"📊 Всего симулированных сделок: {len(all_trades)}")

    if len(all_trades) < args.min_trades:
        print(f"\n⚠️  Недостаточно сделок для калибровки (нужно минимум {args.min_trades})")
        print(f"   Попробуйте загрузить больше данных или уменьшить --min-trades")
        return

    # Вычисляем коэффициенты P&L с учётом режима
    # ЗАЧЕМ: weighted использует экспоненциальные веса — свежие данные важнее
    use_weighted = (mode == "weighted")
    multipliers = compute_multipliers(all_trades, weighted=use_weighted)

    # Вычисляем параметры IV mean reversion (Ornstein-Uhlenbeck)
    # ЗАЧЕМ: Позволяет калькулятору предсказывать изменение IV, а не замораживать её
    iv_params = compute_iv_mean_reversion(all_trades)

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
    print(f"")
    print(f"  IV Mean Reversion (Ornstein-Uhlenbeck):")
    print(f"  iv_mean:        {iv_params['iv_mean']:.4f}  ({iv_params['iv_mean']*100:.1f}%)")
    print(f"  iv_kappa:       {iv_params['iv_kappa']:.2f}  (скорость возврата, 1/год)")
    print(f"  iv_std:         {iv_params['iv_std']:.4f}  ({iv_params['iv_std']*100:.1f}%)")
    print(f"  half_life:      {iv_params['half_life_days']} дней")
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

    # Автоматически обновляем ticker_overrides.json в backend/app/config/
    # ЗАЧЕМ: Коэффициенты сохраняются в секцию режима (standard/recent/weighted)
    #        чтобы все три набора хранились рядом и не перезаписывали друг друга
    overrides_file = os.path.join(
        script_dir, "..", "backend", "app", "config", "ticker_overrides.json"
    )
    try:
        existing = {}
        if os.path.exists(overrides_file):
            with open(overrides_file, "r", encoding="utf-8") as f:
                existing = json.load(f)

        # Получаем текущую запись для тикера (или создаём пустую)
        ticker_entry = existing.get(ticker, {})

        # Данные режима калибровки
        mode_data = {
            "down_mult": dm,
            "up_mult": um,
            "iv_mean": iv_params["iv_mean"],
            "iv_kappa": iv_params["iv_kappa"],
            "iv_std": iv_params["iv_std"],
            "half_life_days": iv_params["half_life_days"],
            "note": f"Calibrated {datetime.now().strftime('%Y-%m-%d')}, {len(all_trades)} trades, {hold_days}d hold, ThetaData EOD"
        }

        # Миграция: если запись в старом формате (нет секций) — переносим в standard
        if ticker_entry and "standard" not in ticker_entry and "down_mult" in ticker_entry:
            old_entry = {
                k: ticker_entry[k] for k in
                ["down_mult", "up_mult", "iv_mean", "iv_kappa", "iv_std", "half_life_days", "note"]
                if k in ticker_entry
            }
            ticker_entry = {"standard": old_entry}
            print(f"📦 Мигрирована старая запись {ticker} → секция standard")

        # Сохраняем в нужную секцию
        ticker_entry[mode] = mode_data
        existing[ticker] = ticker_entry

        with open(overrides_file, "w", encoding="utf-8") as f:
            json.dump(existing, f, indent=2, ensure_ascii=False)

        print(f"✅ ticker_overrides.json обновлён: {ticker} [{mode}] down={dm} up={um}")
    except Exception as e:
        print(f"⚠️  Не удалось обновить ticker_overrides.json: {e}")
        print(f'   Добавьте вручную: "{ticker}": {{"{mode}": {{"down_mult": {dm}, "up_mult": {um}}}}}')


if __name__ == "__main__":
    main()
