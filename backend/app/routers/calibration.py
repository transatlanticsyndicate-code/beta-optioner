"""
API роутер для управления калибровкой коэффициентов P&L по историческим данным опционов
ЗАЧЕМ: Позволяет запускать загрузку данных ThetaData и бэктестинг прямо из UI настроек,
       отслеживать прогресс и управлять результатами калибровки для каждого тикера
Затрагивает: scripts/fetch_options_thetadata.py, scripts/backtest_calibration.py,
             backend/app/config/ticker_overrides.json, scripts/calibration_results/

Эндпоинты:
- GET  /api/calibration/status          — список тикеров и статус калибровки
- POST /api/calibration/run             — запустить калибровку для тикера(ов)
- GET  /api/calibration/progress/{job}  — статус текущего задания
- DELETE /api/calibration/{ticker}      — удалить калибровку тикера
- GET  /api/calibration/terminal        — проверить статус Theta Terminal
"""

import json
import os
import subprocess
import sys
import threading
import time
from datetime import datetime
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel

# ============================================================================
# КОНФИГУРАЦИЯ ПУТЕЙ
# ============================================================================

# Корень проекта (два уровня вверх от routers/)
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))

# Пути к скриптам и данным
SCRIPTS_DIR = os.path.join(PROJECT_ROOT, "scripts")
CALIBRATION_RESULTS_DIR = os.path.join(SCRIPTS_DIR, "calibration_results")
OPTIONS_DATA_DIR = os.path.join(SCRIPTS_DIR, "options_data")
TICKER_OVERRIDES_FILE = os.path.join(
    os.path.dirname(__file__), "..", "config", "ticker_overrides.json"
)

# Путь к Theta Terminal jar — файл лежит в корне проекта
THETA_TERMINAL_JAR = os.path.join(PROJECT_ROOT, "ThetaTerminalv3.jar")
THETA_TERMINAL_PORT = 25503

# ============================================================================
# ХРАНИЛИЩЕ ЗАДАНИЙ В ПАМЯТИ
# ЗАЧЕМ: Отслеживаем прогресс запущенных калибровок без БД
# ============================================================================

# Словарь активных заданий: job_id → {status, ticker, log, started_at, ...}
_jobs: Dict[str, Dict[str, Any]] = {}
_jobs_lock = threading.Lock()


# ============================================================================
# МОДЕЛИ ЗАПРОСОВ
# ============================================================================

class RunCalibrationRequest(BaseModel):
    """Запрос на запуск калибровки"""
    tickers: List[str]          # Список тикеров (например ["AAPL", "NVDA"])
    months: int = 6             # Период загрузки данных в месяцах
    hold_days: int = 14         # Горизонт удержания для бэктестинга


# ============================================================================
# РОУТЕР
# ============================================================================

router = APIRouter(prefix="/api/calibration", tags=["calibration"])


# ============================================================================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ============================================================================

def _load_ticker_overrides() -> Dict[str, Any]:
    """Загружает текущие per-ticker overrides из JSON файла"""
    try:
        if os.path.exists(TICKER_OVERRIDES_FILE):
            with open(TICKER_OVERRIDES_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception as e:
        print(f"[calibration] Ошибка загрузки overrides: {e}")
    return {}


def _load_calibration_result(ticker: str) -> Optional[Dict[str, Any]]:
    """Загружает результат калибровки из JSON файла"""
    result_file = os.path.join(CALIBRATION_RESULTS_DIR, f"{ticker}_calibration.json")
    try:
        if os.path.exists(result_file):
            with open(result_file, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception as e:
        print(f"[calibration] Ошибка загрузки результата {ticker}: {e}")
    return None


def _count_options_files(ticker: str) -> int:
    """Считает количество загруженных CSV файлов опционов для тикера"""
    ticker_dir = os.path.join(OPTIONS_DATA_DIR, ticker.upper())
    if not os.path.exists(ticker_dir):
        return 0
    return len([f for f in os.listdir(ticker_dir) if f.endswith(".csv")])


def _is_theta_terminal_running() -> bool:
    """Проверяет, запущен ли Theta Terminal на порту 25503"""
    import urllib.request
    try:
        urllib.request.urlopen(
            f"http://127.0.0.1:{THETA_TERMINAL_PORT}/v3/list/roots/option",
            timeout=2
        )
        return True
    except Exception:
        return False


def _start_theta_terminal() -> bool:
    """
    Запускает Theta Terminal в фоне если он не запущен
    ЗАЧЕМ: Автоматически поднимает терминал перед загрузкой данных
    Возвращает True если терминал успешно запустился
    """
    if _is_theta_terminal_running():
        return True

    if not os.path.exists(THETA_TERMINAL_JAR):
        print(f"[calibration] Theta Terminal jar не найден: {THETA_TERMINAL_JAR}")
        return False

    # Запускаем терминал в фоне (без блокировки)
    try:
        subprocess.Popen(
            ["java", "-jar", THETA_TERMINAL_JAR],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True
        )
        # Ждём до 30 секунд пока терминал поднимется
        for _ in range(30):
            time.sleep(1)
            if _is_theta_terminal_running():
                print("[calibration] Theta Terminal успешно запущен")
                return True
        print("[calibration] Theta Terminal не ответил за 30 секунд")
        return False
    except Exception as e:
        print(f"[calibration] Ошибка запуска Theta Terminal: {e}")
        return False


def _run_calibration_job(job_id: str, tickers: List[str], months: int, hold_days: int):
    """
    Фоновая задача: запускает fetch + backtest для каждого тикера последовательно
    ЗАЧЕМ: Выполняется в отдельном потоке, обновляет статус задания в _jobs
    """
    def log(msg: str):
        """Добавляет строку в лог задания"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        with _jobs_lock:
            _jobs[job_id]["log"].append(f"[{timestamp}] {msg}")
        print(f"[calibration job {job_id}] {msg}")

    with _jobs_lock:
        _jobs[job_id]["status"] = "running"
        _jobs[job_id]["current_step"] = "Запуск Theta Terminal"

    # Шаг 1: Проверяем и запускаем Theta Terminal
    log("Проверка Theta Terminal...")
    if not _is_theta_terminal_running():
        log("Theta Terminal не запущен. Запускаем...")
        with _jobs_lock:
            _jobs[job_id]["current_step"] = "Запуск Theta Terminal"
        if not _start_theta_terminal():
            log("❌ Не удалось запустить Theta Terminal. Убедитесь что файл ~/Downloads/ThetaTerminalv3.jar существует.")
            with _jobs_lock:
                _jobs[job_id]["status"] = "error"
                _jobs[job_id]["error"] = "Theta Terminal недоступен"
            return
        log("✅ Theta Terminal запущен")
    else:
        log("✅ Theta Terminal уже работает")

    total = len(tickers)
    results = []

    for idx, ticker in enumerate(tickers):
        ticker = ticker.upper()
        log(f"--- [{idx+1}/{total}] Начинаем калибровку {ticker} ---")

        with _jobs_lock:
            _jobs[job_id]["current_ticker"] = ticker
            _jobs[job_id]["current_step"] = f"Загрузка данных {ticker}"
            _jobs[job_id]["progress"] = int((idx / total) * 100)

        # Шаг 2: Загрузка исторических данных опционов
        log(f"📥 Загрузка данных опционов {ticker} за {months} месяцев...")
        fetch_script = os.path.join(SCRIPTS_DIR, "fetch_options_thetadata.py")
        try:
            proc = subprocess.run(
                [sys.executable, fetch_script, "--ticker", ticker, "--months", str(months)],
                capture_output=True,
                text=True,
                timeout=300,  # 5 минут максимум на загрузку
                cwd=PROJECT_ROOT
            )
            if proc.returncode != 0:
                log(f"⚠️ Fetch завершился с ошибкой: {proc.stderr[-500:] if proc.stderr else 'нет вывода'}")
            else:
                # Показываем последние строки вывода
                output_lines = proc.stdout.strip().split("\n") if proc.stdout else []
                for line in output_lines[-5:]:
                    if line.strip():
                        log(f"  {line}")
                contracts = _count_options_files(ticker)
                log(f"✅ Загружено {contracts} контрактов для {ticker}")
        except subprocess.TimeoutExpired:
            log(f"❌ Timeout при загрузке данных {ticker}")
            results.append({"ticker": ticker, "status": "error", "error": "Timeout"})
            continue
        except Exception as e:
            log(f"❌ Ошибка загрузки {ticker}: {e}")
            results.append({"ticker": ticker, "status": "error", "error": str(e)})
            continue

        # Шаг 3: Бэктестинг и калибровка
        with _jobs_lock:
            _jobs[job_id]["current_step"] = f"Бэктестинг {ticker}"
        log(f"📊 Запуск бэктестинга {ticker} (горизонт {hold_days} дней)...")
        backtest_script = os.path.join(SCRIPTS_DIR, "backtest_calibration.py")
        try:
            proc = subprocess.run(
                [sys.executable, backtest_script, "--ticker", ticker, "--hold-days", str(hold_days)],
                capture_output=True,
                text=True,
                timeout=120,
                cwd=PROJECT_ROOT
            )
            if proc.returncode != 0:
                log(f"⚠️ Backtest ошибка: {proc.stderr[-500:] if proc.stderr else 'нет вывода'}")
                results.append({"ticker": ticker, "status": "error", "error": "Backtest failed"})
                continue

            # Показываем вывод бэктеста
            output_lines = proc.stdout.strip().split("\n") if proc.stdout else []
            for line in output_lines[-8:]:
                if line.strip():
                    log(f"  {line}")

            # Читаем результат
            result = _load_calibration_result(ticker)
            if result:
                log(f"✅ {ticker}: down_mult={result['down_mult']}, up_mult={result['up_mult']}, сделок={result['total_trades']}")
                results.append({"ticker": ticker, "status": "success", **result})
            else:
                log(f"⚠️ Файл результата {ticker} не найден")
                results.append({"ticker": ticker, "status": "error", "error": "Result file missing"})

        except subprocess.TimeoutExpired:
            log(f"❌ Timeout при бэктестинге {ticker}")
            results.append({"ticker": ticker, "status": "error", "error": "Backtest timeout"})
        except Exception as e:
            log(f"❌ Ошибка бэктестинга {ticker}: {e}")
            results.append({"ticker": ticker, "status": "error", "error": str(e)})

    # Завершение
    log(f"🏁 Калибровка завершена. Успешно: {sum(1 for r in results if r['status'] == 'success')}/{total}")
    with _jobs_lock:
        _jobs[job_id]["status"] = "done"
        _jobs[job_id]["progress"] = 100
        _jobs[job_id]["current_step"] = "Завершено"
        _jobs[job_id]["results"] = results
        _jobs[job_id]["finished_at"] = datetime.now().isoformat()


# ============================================================================
# ЭНДПОИНТЫ
# ============================================================================

@router.get("/status")
async def get_calibration_status():
    """
    Возвращает список всех тикеров с результатами калибровки
    ЗАЧЕМ: Главная таблица страницы — показывает что откалиброванно, когда и с какими коэффициентами
    """
    overrides = _load_ticker_overrides()
    tickers_data = []

    # Собираем данные из calibration_results/
    if os.path.exists(CALIBRATION_RESULTS_DIR):
        for filename in sorted(os.listdir(CALIBRATION_RESULTS_DIR)):
            if not filename.endswith("_calibration.json"):
                continue
            ticker = filename.replace("_calibration.json", "")
            result = _load_calibration_result(ticker)
            if not result:
                continue

            # Проверяем свежесть калибровки
            calibrated_at = result.get("calibrated_at", "")
            is_stale = False
            days_ago = None
            if calibrated_at:
                try:
                    dt = datetime.fromisoformat(calibrated_at)
                    days_ago = (datetime.now() - dt).days
                    is_stale = days_ago > 30
                except Exception:
                    pass

            # Проверяем наличие override в ticker_overrides.json
            override = overrides.get(ticker, {})
            has_override = bool(override) and not ticker.startswith("_")

            tickers_data.append({
                "ticker": ticker,
                "down_mult": result.get("down_mult"),
                "up_mult": result.get("up_mult"),
                "total_trades": result.get("total_trades"),
                "hold_days": result.get("hold_days"),
                "calibrated_at": calibrated_at,
                "days_ago": days_ago,
                "is_stale": is_stale,
                "contracts_count": _count_options_files(ticker),
                "has_override": has_override,
                "override_note": override.get("note", "") if has_override else ""
            })

    # Проверяем статус Theta Terminal
    terminal_running = _is_theta_terminal_running()

    return {
        "tickers": tickers_data,
        "terminal_running": terminal_running,
        "total_calibrated": len(tickers_data)
    }


@router.post("/run")
async def run_calibration(request: RunCalibrationRequest, background_tasks: BackgroundTasks):
    """
    Запускает калибровку для списка тикеров в фоне
    ЗАЧЕМ: Нажатие кнопки в UI запускает полный цикл: Terminal → fetch → backtest → сохранение
    """
    # Валидация тикеров
    clean_tickers = []
    for t in request.tickers:
        t = t.strip().upper()
        if t and t.isalpha() and len(t) <= 6:
            clean_tickers.append(t)

    if not clean_tickers:
        raise HTTPException(status_code=400, detail="Не указаны корректные тикеры")

    # Создаём задание
    job_id = f"job_{int(time.time() * 1000)}"
    with _jobs_lock:
        _jobs[job_id] = {
            "job_id": job_id,
            "status": "pending",
            "tickers": clean_tickers,
            "current_ticker": None,
            "current_step": "Ожидание запуска",
            "progress": 0,
            "log": [],
            "results": [],
            "started_at": datetime.now().isoformat(),
            "finished_at": None,
            "error": None
        }

    # Запускаем в фоновом потоке
    thread = threading.Thread(
        target=_run_calibration_job,
        args=(job_id, clean_tickers, request.months, request.hold_days),
        daemon=True
    )
    thread.start()

    return {
        "job_id": job_id,
        "tickers": clean_tickers,
        "status": "started"
    }


@router.get("/progress/{job_id}")
async def get_job_progress(job_id: str):
    """
    Возвращает текущий статус и лог задания калибровки
    ЗАЧЕМ: Frontend polling каждые 2 секунды для отображения прогресса в реальном времени
    """
    with _jobs_lock:
        job = _jobs.get(job_id)

    if not job:
        raise HTTPException(status_code=404, detail=f"Задание {job_id} не найдено")

    return job


@router.delete("/{ticker}")
async def delete_calibration(ticker: str):
    """
    Удаляет калибровку тикера: результат, данные опционов и override
    ЗАЧЕМ: Позволяет полностью сбросить тикер и начать калибровку заново
    """
    ticker = ticker.upper().strip()
    if not ticker.isalpha() or len(ticker) > 6:
        raise HTTPException(status_code=400, detail="Некорректный тикер")

    deleted = []

    # Удаляем файл результата калибровки
    result_file = os.path.join(CALIBRATION_RESULTS_DIR, f"{ticker}_calibration.json")
    if os.path.exists(result_file):
        os.remove(result_file)
        deleted.append("calibration_result")

    # Удаляем override из ticker_overrides.json
    try:
        if os.path.exists(TICKER_OVERRIDES_FILE):
            with open(TICKER_OVERRIDES_FILE, "r", encoding="utf-8") as f:
                overrides = json.load(f)
            if ticker in overrides:
                del overrides[ticker]
                with open(TICKER_OVERRIDES_FILE, "w", encoding="utf-8") as f:
                    json.dump(overrides, f, indent=2, ensure_ascii=False)
                deleted.append("ticker_override")
    except Exception as e:
        print(f"[calibration] Ошибка удаления override {ticker}: {e}")

    return {
        "status": "ok",
        "ticker": ticker,
        "deleted": deleted
    }


@router.get("/terminal")
async def check_terminal_status():
    """
    Проверяет статус Theta Terminal
    ЗАЧЕМ: UI показывает индикатор подключения перед запуском калибровки
    """
    running = _is_theta_terminal_running()
    return {
        "running": running,
        "port": THETA_TERMINAL_PORT,
        "jar_exists": os.path.exists(THETA_TERMINAL_JAR)
    }
