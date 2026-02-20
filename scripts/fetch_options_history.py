"""
Скрипт для загрузки исторических данных по опционам через IB TWS API
ЗАЧЕМ: Получить данные для калибровки калькулятора опционов (per-ticker коэффициенты)
Затрагивает: калибровка P&L прогнозов, stock_groups_settings

Использование:
    1. Установить: pip install ib_insync
    2. Запустить TWS, включить API (порт 7497)
    3. Запустить: python scripts/fetch_options_history.py --ticker AAPL
    
Результат: CSV файлы в scripts/options_data/{TICKER}/
"""

import argparse
import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

try:
    from ib_insync import IB, Stock, Option, util
except ImportError:
    print("❌ Библиотека ib_insync не установлена.")
    print("   Установите: pip install ib_insync")
    sys.exit(1)


# ============================================================================
# КОНФИГУРАЦИЯ
# ============================================================================

# Директория для сохранения данных
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "options_data")

# Параметры подключения к TWS
TWS_HOST = "127.0.0.1"
TWS_PORT = 7496  # 7497 для live, 7496 для paper trading
CLIENT_ID = 10   # Уникальный ID клиента (не должен конфликтовать с другими)

# Период загрузки исторических данных
HISTORY_DURATION = "6 M"  # 6 месяцев
BAR_SIZE = "1 day"        # Дневные бары

# Пауза между запросами к API (IB ограничивает частоту)
# ЗАЧЕМ: IB разрешает ~60 запросов в 10 минут, делаем паузу для безопасности
REQUEST_DELAY_SEC = 3


# ============================================================================
# КОНФИГУРАЦИЯ КОНТРАКТОВ ПО ТИКЕРАМ
# ============================================================================

def get_contracts_config(ticker: str, current_price: float) -> dict:
    """
    Возвращает конфигурацию контрактов для загрузки по тикеру
    ЗАЧЕМ: Определяем страйки относительно текущей цены для каждого тикера
    
    Args:
        ticker: Тикер акции
        current_price: Текущая цена акции (для расчёта ATM/OTM/ITM страйков)
    
    Returns:
        Словарь с конфигурацией: expiries и contracts
    """
    # Округляем цену до ближайшего страйка (шаг $5 для большинства акций)
    strike_step = 5 if current_price > 50 else 2.5 if current_price > 20 else 1
    atm_strike = round(current_price / strike_step) * strike_step
    
    # Генерируем страйки: ATM, OTM -4%, OTM -8%, ITM +4%
    otm_1 = round((current_price * 0.96) / strike_step) * strike_step
    otm_2 = round((current_price * 0.92) / strike_step) * strike_step
    itm_1 = round((current_price * 1.04) / strike_step) * strike_step
    otm_call_1 = round((current_price * 1.04) / strike_step) * strike_step
    otm_call_2 = round((current_price * 1.08) / strike_step) * strike_step
    
    print(f"\n📊 Конфигурация для {ticker} (цена: ${current_price:.2f})")
    print(f"   ATM strike: ${atm_strike}")
    print(f"   Strike step: ${strike_step}")
    print(f"   Put OTM-1: ${otm_1}, Put OTM-2: ${otm_2}, Put ITM: ${itm_1}")
    print(f"   Call OTM-1: ${otm_call_1}, Call OTM-2: ${otm_call_2}")
    
    # Ближайшие месячные экспирации (3-й пятница месяца)
    # ЗАЧЕМ: Месячные опционы самые ликвидные
    expiries = _get_monthly_expiries(2)  # 2 ближайшие экспирации
    
    contracts = []
    
    # Put-опционы (основной фокус — торгуем путы)
    for exp in expiries:
        exp_label = "ближняя" if exp == expiries[0] else "дальняя"
        contracts.extend([
            {"right": "P", "strike": atm_strike, "expiry": exp,
             "label": f"Put ATM ${atm_strike} {exp_label}"},
            {"right": "P", "strike": otm_1, "expiry": exp,
             "label": f"Put OTM ${otm_1} {exp_label}"},
        ])
    
    # Глубокий OTM и ITM только для ближней экспирации
    contracts.extend([
        {"right": "P", "strike": otm_2, "expiry": expiries[0],
         "label": f"Put deep OTM ${otm_2} ближняя"},
        {"right": "P", "strike": itm_1, "expiry": expiries[0],
         "label": f"Put ITM ${itm_1} ближняя"},
    ])
    
    # Call-опционы (для калибровки up_mult)
    for exp in expiries:
        exp_label = "ближняя" if exp == expiries[0] else "дальняя"
        contracts.append(
            {"right": "C", "strike": atm_strike, "expiry": exp,
             "label": f"Call ATM ${atm_strike} {exp_label}"}
        )
    
    contracts.extend([
        {"right": "C", "strike": otm_call_1, "expiry": expiries[0],
         "label": f"Call OTM ${otm_call_1} ближняя"},
        {"right": "C", "strike": otm_call_2, "expiry": expiries[0],
         "label": f"Call deep OTM ${otm_call_2} ближняя"},
    ])
    
    return {
        "expiries": expiries,
        "contracts": contracts
    }


def _get_monthly_expiries(count: int) -> list:
    """
    Вычисляет даты ближайших месячных экспираций (3-я пятница месяца)
    ЗАЧЕМ: Месячные опционы — самые ликвидные, по ним больше данных
    
    Args:
        count: Количество экспираций
    
    Returns:
        Список строк в формате 'YYYYMMDD'
    """
    expiries = []
    today = datetime.now()
    
    # Начинаем с текущего месяца
    year = today.year
    month = today.month
    
    for _ in range(count + 2):  # +2 запас на случай если текущая уже прошла
        # Находим 3-ю пятницу месяца
        # Первый день месяца
        first_day = datetime(year, month, 1)
        # День недели первого дня (0=пн, 4=пт)
        first_friday_offset = (4 - first_day.weekday()) % 7
        first_friday = first_day + timedelta(days=first_friday_offset)
        third_friday = first_friday + timedelta(weeks=2)
        
        # Берём только будущие экспирации (минимум через 7 дней)
        if third_friday > today + timedelta(days=7):
            expiries.append(third_friday.strftime("%Y%m%d"))
        
        if len(expiries) >= count:
            break
        
        # Следующий месяц
        month += 1
        if month > 12:
            month = 1
            year += 1
    
    return expiries


# ============================================================================
# ЗАГРУЗКА ДАННЫХ
# ============================================================================

def fetch_stock_history(ib: IB, ticker: str, output_dir: str) -> float:
    """
    Загружает исторические дневные данные по акции
    ЗАЧЕМ: Нужна цена underlying для каждой даты при калибровке
    
    Args:
        ib: Подключение к IB
        ticker: Тикер акции
        output_dir: Директория для сохранения
    
    Returns:
        Текущая цена акции
    """
    print(f"\n{'='*60}")
    print(f"📈 Загрузка данных по акции {ticker}...")
    print(f"{'='*60}")
    
    stock = Stock(ticker, "SMART", "USD")
    ib.qualifyContracts(stock)
    
    # Запрашиваем исторические данные
    bars = ib.reqHistoricalData(
        stock,
        endDateTime="",  # До текущего момента
        durationStr=HISTORY_DURATION,
        barSizeSetting=BAR_SIZE,
        whatToShow="TRADES",
        useRTH=True,  # Только регулярные торговые часы
        formatDate=1
    )
    
    if not bars:
        print(f"❌ Нет данных по {ticker}")
        return 0
    
    # Сохраняем в CSV
    df = util.df(bars)
    filepath = os.path.join(output_dir, f"{ticker}_stock_daily.csv")
    df.to_csv(filepath, index=False)
    
    current_price = bars[-1].close
    print(f"✅ Загружено {len(bars)} баров. Последняя цена: ${current_price:.2f}")
    print(f"   Период: {bars[0].date} — {bars[-1].date}")
    print(f"   Сохранено: {filepath}")
    
    return current_price


def fetch_option_history(ib: IB, ticker: str, contract_config: dict, output_dir: str) -> bool:
    """
    Загружает исторические данные по одному опционному контракту
    ЗАЧЕМ: Реальные цены опционов для сравнения с прогнозом калькулятора
    
    Args:
        ib: Подключение к IB
        ticker: Тикер underlying
        contract_config: Словарь с параметрами контракта (right, strike, expiry)
        output_dir: Директория для сохранения
    
    Returns:
        True если данные загружены успешно
    """
    right = contract_config["right"]
    strike = contract_config["strike"]
    expiry = contract_config["expiry"]
    label = contract_config["label"]
    
    right_name = "Put" if right == "P" else "Call"
    print(f"\n  📋 {label}")
    print(f"     {ticker} {right_name} ${strike} exp {expiry}")
    
    # Создаём контракт опциона
    option = Option(ticker, expiry, strike, right, "SMART", currency="USD")
    
    try:
        qualified = ib.qualifyContracts(option)
        if not qualified:
            print(f"     ⚠️  Контракт не найден, пропускаем")
            return False
    except Exception as e:
        print(f"     ⚠️  Ошибка квалификации: {e}")
        return False
    
    # Запрашиваем исторические данные
    # ВАЖНО: Для опционов используем MIDPOINT (среднее bid/ask)
    # ЗАЧЕМ: TRADES может быть пустым для неликвидных контрактов
    try:
        bars = ib.reqHistoricalData(
            option,
            endDateTime="",
            durationStr=HISTORY_DURATION,
            barSizeSetting=BAR_SIZE,
            whatToShow="MIDPOINT",
            useRTH=True,
            formatDate=1
        )
    except Exception as e:
        print(f"     ⚠️  Ошибка запроса MIDPOINT: {e}")
        # Пробуем TRADES как fallback
        try:
            bars = ib.reqHistoricalData(
                option,
                endDateTime="",
                durationStr=HISTORY_DURATION,
                barSizeSetting=BAR_SIZE,
                whatToShow="TRADES",
                useRTH=True,
                formatDate=1
            )
        except Exception as e2:
            print(f"     ❌ Ошибка запроса TRADES: {e2}")
            return False
    
    if not bars:
        print(f"     ⚠️  Нет исторических данных")
        return False
    
    # Сохраняем в CSV
    df = util.df(bars)
    
    # Добавляем метаданные контракта в каждую строку
    # ЗАЧЕМ: При анализе нужно знать параметры контракта
    df["underlying"] = ticker
    df["right"] = right_name
    df["strike"] = strike
    df["expiry"] = expiry
    
    filename = f"{ticker}_{right_name}_{int(strike)}_{expiry}.csv"
    filepath = os.path.join(output_dir, filename)
    df.to_csv(filepath, index=False)
    
    print(f"     ✅ Загружено {len(bars)} баров ({bars[0].date} — {bars[-1].date})")
    print(f"     Сохранено: {filename}")
    
    return True


def fetch_all_options(ib: IB, ticker: str) -> dict:
    """
    Загружает все данные для указанного тикера
    ЗАЧЕМ: Основная функция — координирует загрузку акции и всех опционных контрактов
    
    Args:
        ib: Подключение к IB
        ticker: Тикер акции
    
    Returns:
        Статистика загрузки: {"total": int, "success": int, "failed": int}
    """
    # Создаём директорию для тикера
    ticker_dir = os.path.join(OUTPUT_DIR, ticker)
    os.makedirs(ticker_dir, exist_ok=True)
    
    # Шаг 1: Загружаем данные по акции и получаем текущую цену
    current_price = fetch_stock_history(ib, ticker, ticker_dir)
    
    if current_price == 0:
        print(f"\n❌ Не удалось получить цену {ticker}. Проверьте подключение к TWS.")
        return {"total": 0, "success": 0, "failed": 0}
    
    # Шаг 2: Генерируем конфигурацию контрактов на основе текущей цены
    config = get_contracts_config(ticker, current_price)
    contracts = config["contracts"]
    
    print(f"\n{'='*60}")
    print(f"📦 Загрузка {len(contracts)} опционных контрактов для {ticker}")
    print(f"   Экспирации: {', '.join(config['expiries'])}")
    print(f"{'='*60}")
    
    # Шаг 3: Загружаем каждый контракт
    success_count = 0
    failed_count = 0
    
    for i, contract in enumerate(contracts, 1):
        print(f"\n  [{i}/{len(contracts)}]", end="")
        
        if fetch_option_history(ib, ticker, contract, ticker_dir):
            success_count += 1
        else:
            failed_count += 1
        
        # Пауза между запросами для соблюдения лимитов IB API
        if i < len(contracts):
            print(f"     ⏳ Пауза {REQUEST_DELAY_SEC} сек...")
            time.sleep(REQUEST_DELAY_SEC)
    
    return {
        "total": len(contracts),
        "success": success_count,
        "failed": failed_count
    }


# ============================================================================
# ТОЧКА ВХОДА
# ============================================================================

def _update_duration(duration: str):
    """Обновляет глобальную переменную периода загрузки"""
    global HISTORY_DURATION
    HISTORY_DURATION = duration


def main():
    """
    Главная функция скрипта
    ЗАЧЕМ: Подключается к TWS, загружает данные, выводит отчёт
    """
    parser = argparse.ArgumentParser(
        description="Загрузка исторических данных по опционам из IB TWS"
    )
    parser.add_argument(
        "--ticker", "-t",
        type=str,
        default="AAPL",
        help="Тикер акции (по умолчанию: AAPL)"
    )
    parser.add_argument(
        "--port", "-p",
        type=int,
        default=TWS_PORT,
        help=f"Порт TWS API (по умолчанию: {TWS_PORT})"
    )
    parser.add_argument(
        "--duration", "-d",
        type=str,
        default=HISTORY_DURATION,
        help=f"Период загрузки (по умолчанию: '{HISTORY_DURATION}')"
    )
    
    args = parser.parse_args()
    ticker = args.ticker.upper()
    
    # Обновляем глобальную переменную периода загрузки
    _update_duration(args.duration)
    
    print(f"""
╔══════════════════════════════════════════════════════════╗
║  IB TWS Options History Downloader                      ║
║  Загрузка исторических данных по опционам               ║
╠══════════════════════════════════════════════════════════╣
║  Тикер:    {ticker:<45}║
║  Порт:     {args.port:<45}║
║  Период:   {HISTORY_DURATION:<45}║
║  Выход:    scripts/options_data/{ticker + '/':<30}║
╚══════════════════════════════════════════════════════════╝
""")
    
    # Подключаемся к TWS
    print("🔌 Подключение к TWS...")
    ib = IB()
    
    try:
        ib.connect(TWS_HOST, args.port, clientId=CLIENT_ID)
        print("✅ Подключено к TWS")
    except ConnectionRefusedError:
        print(f"""
❌ Не удалось подключиться к TWS на порту {args.port}

Проверьте:
1. TWS запущен
2. В TWS: Edit → Global Configuration → API → Settings:
   ✅ Enable ActiveX and Socket Clients
   Port: {args.port}
   ✅ Allow connections from localhost only
3. Перезапустите TWS после изменения настроек
""")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Ошибка подключения: {e}")
        sys.exit(1)
    
    try:
        # Загружаем данные
        stats = fetch_all_options(ib, ticker)
        
        # Итоговый отчёт
        print(f"""
╔══════════════════════════════════════════════════════════╗
║  ИТОГО                                                  ║
╠══════════════════════════════════════════════════════════╣
║  Контрактов запрошено:  {stats['total']:<33}║
║  Успешно загружено:     {stats['success']:<33}║
║  Не удалось:            {stats['failed']:<33}║
║  Данные сохранены в:    scripts/options_data/{ticker + '/':<16}║
╚══════════════════════════════════════════════════════════╝
""")
        
        if stats['success'] > 0:
            print("✅ Данные готовы для калибровки калькулятора.")
            print("   Следующий шаг: запустить скрипт бэктестинга.")
        
        if stats['failed'] > 0:
            print(f"\n⚠️  {stats['failed']} контрактов не загружены.")
            print("   Возможные причины: контракт ещё не торгуется или нет данных.")
    
    finally:
        ib.disconnect()
        print("\n🔌 Отключено от TWS")


if __name__ == "__main__":
    main()
