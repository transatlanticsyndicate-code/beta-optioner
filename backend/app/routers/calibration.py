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
import re
import shutil
import subprocess
import sys
import threading
import time
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from app.services.calibration_scheduler import calibration_scheduler

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
    calibration_mode: str = "standard"  # Режим: standard | recent | weighted
    recent_days: int = 14       # Дней для режима recent


class SaveWatchlistRequest(BaseModel):
    enabled: bool = False
    tickers: List[str] = []
    theta: Dict[str, str] = {}
    cleanup: Dict[str, Any] = {}
    modes: Dict[str, Dict[str, Any]] = {}


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


def _find_theta_jar() -> Optional[str]:
    config = calibration_scheduler.load_config()
    theta_config = config.get("theta", {}) if isinstance(config, dict) else {}
    candidates = [
        theta_config.get("jar_path", ""),
        os.getenv("THETA_JAR_PATH", ""),
        os.path.join(PROJECT_ROOT, "ThetaTerminalv3.jar"),
        os.path.expanduser("~/ThetaTerminalv3.jar"),
        os.path.expanduser("~/Downloads/ThetaTerminalv3.jar"),
    ]
    for path in candidates:
        if path and os.path.exists(path):
            return path
    return None


def _get_override_section(override_raw: dict, mode: str = "standard") -> dict:
    """
    Извлекает данные нужной секции из override записи тикера
    ЗАЧЕМ: Поддерживает оба формата — новый {standard:{...}, recent:{...}} и старый {down_mult:...}
    """
    if not override_raw or not isinstance(override_raw, dict):
        return {}
    # Новый формат: есть секции режимов
    if "standard" in override_raw or "recent" in override_raw or "weighted" in override_raw:
        return override_raw.get(mode) or override_raw.get("standard") or {}
    # Старый формат: данные прямо в корне
    return override_raw


def _get_available_modes(override_raw: dict) -> list:
    """
    Возвращает список доступных режимов калибровки для тикера
    ЗАЧЕМ: UI показывает только те режимы которые реально откалиброваны
    """
    if not override_raw or not isinstance(override_raw, dict):
        return []
    # Новый формат
    if "standard" in override_raw or "recent" in override_raw or "weighted" in override_raw:
        return [m for m in ["standard", "recent", "weighted"] if m in override_raw]
    # Старый формат — только standard
    if override_raw.get("down_mult"):
        return ["standard"]
    return []


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


def _safe_parse_iso_datetime(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return None


def _get_cleanup_policy() -> Dict[str, Any]:
    config = calibration_scheduler.load_config()
    return config.get("cleanup", {}) if isinstance(config, dict) else {}


def _load_online_tickers() -> List[str]:
    return calibration_scheduler.load_tickers()


def _scan_cleanup_candidates() -> Dict[str, Any]:
    policy = _get_cleanup_policy()
    now = datetime.now()
    active_tickers = set(_load_online_tickers())
    options_max_age_days = int(policy.get("options_max_age_days", 45))
    results_max_age_days = int(policy.get("results_max_age_days", 90))
    delete_orphan_options = bool(policy.get("delete_orphan_options", True))
    delete_orphan_results = bool(policy.get("delete_orphan_results", False))
    options_cutoff = now - timedelta(days=max(1, options_max_age_days))
    results_cutoff = now - timedelta(days=max(1, results_max_age_days))

    options_candidates = []
    if os.path.exists(OPTIONS_DATA_DIR):
        for ticker in sorted(os.listdir(OPTIONS_DATA_DIR)):
            ticker_dir = os.path.join(OPTIONS_DATA_DIR, ticker)
            if not os.path.isdir(ticker_dir):
                continue
            csv_files = []
            newest_mtime = None
            for filename in os.listdir(ticker_dir):
                if not filename.endswith(".csv"):
                    continue
                file_path = os.path.join(ticker_dir, filename)
                try:
                    mtime = datetime.fromtimestamp(os.path.getmtime(file_path))
                    csv_files.append(file_path)
                    if newest_mtime is None or mtime > newest_mtime:
                        newest_mtime = mtime
                except OSError:
                    continue
            if not csv_files:
                continue
            is_orphan = ticker.upper() not in active_tickers
            is_stale = newest_mtime is not None and newest_mtime < options_cutoff
            if is_stale or (is_orphan and delete_orphan_options):
                options_candidates.append({
                    "ticker": ticker.upper(),
                    "path": ticker_dir,
                    "files_count": len(csv_files),
                    "newest_mtime": newest_mtime.isoformat() if newest_mtime else None,
                    "reason": "stale" if is_stale else "orphan",
                })

    result_candidates = []
    if os.path.exists(CALIBRATION_RESULTS_DIR):
        for filename in sorted(os.listdir(CALIBRATION_RESULTS_DIR)):
            if not filename.endswith("_calibration.json"):
                continue
            ticker = filename.replace("_calibration.json", "").upper()
            file_path = os.path.join(CALIBRATION_RESULTS_DIR, filename)
            result = _load_calibration_result(ticker) or {}
            calibrated_at = _safe_parse_iso_datetime(result.get("calibrated_at", ""))
            if not calibrated_at:
                try:
                    calibrated_at = datetime.fromtimestamp(os.path.getmtime(file_path))
                except OSError:
                    calibrated_at = None
            is_orphan = ticker not in active_tickers
            is_stale = calibrated_at is not None and calibrated_at < results_cutoff
            if is_stale or (is_orphan and delete_orphan_results):
                result_candidates.append({
                    "ticker": ticker,
                    "path": file_path,
                    "calibrated_at": calibrated_at.isoformat() if calibrated_at else None,
                    "reason": "stale" if is_stale else "orphan",
                })

    return {
        "policy": policy,
        "options": options_candidates,
        "results": result_candidates,
        "summary": {
            "options_dirs": len(options_candidates),
            "result_files": len(result_candidates),
        },
    }


def _run_cleanup(trigger: str = "manual") -> Dict[str, Any]:
    candidates = _scan_cleanup_candidates()
    deleted_options = []
    deleted_results = []

    for item in candidates.get("options", []):
        try:
            shutil.rmtree(item["path"], ignore_errors=False)
            deleted_options.append(item)
        except Exception as e:
            item["error"] = str(e)

    for item in candidates.get("results", []):
        try:
            os.remove(item["path"])
            deleted_results.append(item)
        except Exception as e:
            item["error"] = str(e)

    cleanup_job_id = f"cleanup_{int(time.time() * 1000)}"
    calibration_scheduler.update_history_item(cleanup_job_id, {
        "job_id": cleanup_job_id,
        "status": "done",
        "source": trigger,
        "kind": "cleanup",
        "started_at": datetime.now().isoformat(),
        "finished_at": datetime.now().isoformat(),
        "results": [
            {
                "status": "success",
                "deleted_options_dirs": len(deleted_options),
                "deleted_result_files": len(deleted_results),
            }
        ],
        "cleanup": {
            "deleted_options": deleted_options,
            "deleted_results": deleted_results,
        },
    })

    return {
        "status": "ok",
        "deleted_options": deleted_options,
        "deleted_results": deleted_results,
        "summary": {
            "deleted_options_dirs": len(deleted_options),
            "deleted_result_files": len(deleted_results),
        },
    }


def _is_theta_terminal_running() -> bool:
    """
    Проверяет, запущен ли Theta Terminal на порту 25503
    ЗАЧЕМ: Любой HTTP ответ (даже ошибка) означает что терминал работает
    """
    import socket
    try:
        sock = socket.create_connection(("127.0.0.1", THETA_TERMINAL_PORT), timeout=2)
        sock.close()
        return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


def _find_creds_file() -> Optional[str]:
    """
    Ищет файл creds.txt в нескольких стандартных местах
    ЗАЧЕМ: Credentials нужны Theta Terminal для авторизации
    """
    config = calibration_scheduler.load_config()
    theta_config = config.get("theta", {}) if isinstance(config, dict) else {}
    candidates = [
        theta_config.get("creds_file", ""),                # из server watchlist config
        os.getenv("THETA_CREDS_FILE", ""),                  # из env
        os.path.join(PROJECT_ROOT, "creds.txt"),           # корень проекта
        os.path.expanduser("~/Downloads/creds.txt"),        # Downloads
        os.path.expanduser("~/creds.txt"),                  # домашняя папка
    ]
    for path in candidates:
        if os.path.exists(path):
            print(f"[calibration] Найден creds.txt: {path}")
            return path
    print(f"[calibration] creds.txt не найден. Проверены: {candidates}")
    return None


def _start_theta_terminal() -> bool:
    """
    Запускает Theta Terminal в фоне если он не запущен
    ЗАЧЕМ: Автоматически поднимает терминал перед загрузкой данных
    Возвращает True если терминал успешно запустился
    """
    if _is_theta_terminal_running():
        return True

    theta_jar = _find_theta_jar()
    if not theta_jar:
        print(f"[calibration] Theta Terminal jar не найден: {THETA_TERMINAL_JAR}")
        return False

    # Ищем файл с credentials
    creds_file = _find_creds_file()
    if not creds_file:
        print("[calibration] creds.txt не найден — терминал не запустится без credentials")
        return False

    # Убиваем все старые экземпляры перед запуском нового
    # ЗАЧЕМ: Два экземпляра вызывают "Invalid session ID" на серверах ThetaData
    # ThetaTerminal запускает дочерний jar (202602131.jar или аналогичный) — убиваем оба паттерна
    try:
        subprocess.run(["pkill", "-9", "-f", "ThetaTerminalv3.jar"], capture_output=True)
        subprocess.run(["pkill", "-9", "-f", "ThetaTerminal.jar"], capture_output=True)
        # Дочерний процесс терминала (числовое имя jar)
        subprocess.run(["pkill", "-9", "-f", "lib/2026"], capture_output=True)
        subprocess.run(["pkill", "-9", "-f", "lib/2025"], capture_output=True)
        time.sleep(5)  # Ждём пока сессия закроется на серверах ThetaData
        print("[calibration] Старые экземпляры Theta Terminal остановлены")
    except Exception:
        pass

    # Запускаем терминал в фоне с указанием файла credentials
    # Предпочитаем запускать реальный jar из lib/ напрямую (bootstrap плодит дочерние процессы)
    try:
        lib_dir = os.path.join(PROJECT_ROOT, "lib")
        real_jar = None
        if os.path.exists(lib_dir):
            jars = sorted([f for f in os.listdir(lib_dir) if f.endswith(".jar")], reverse=True)
            if jars:
                real_jar = os.path.join(lib_dir, jars[0])
                print(f"[calibration] Используем реальный jar: {real_jar}")

        jar_to_run = real_jar if real_jar else theta_jar
        cmd = ["java", "-jar", jar_to_run, "--creds-file", creds_file]
        print(f"[calibration] Запуск: {' '.join(cmd)}")
        subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True
        )
        # Ждём до 60 секунд пока терминал поднимется и авторизуется
        for i in range(60):
            time.sleep(1)
            if _is_theta_terminal_running():
                time.sleep(5)  # Дополнительная пауза для полной инициализации
                print(f"[calibration] Theta Terminal успешно запущен (за {i+1} сек)")
                return True
        print("[calibration] Theta Terminal не ответил за 60 секунд")
        return False
    except Exception as e:
        print(f"[calibration] Ошибка запуска Theta Terminal: {e}")
        return False


def _build_job(job_id: str, tickers: List[str], months: int, hold_days: int,
               calibration_mode: str, recent_days: int, source: str) -> Dict[str, Any]:
    return {
        "job_id": job_id,
        "status": "pending",
        "tickers": tickers,
        "months": months,
        "hold_days": hold_days,
        "calibration_mode": calibration_mode,
        "recent_days": recent_days,
        "source": source,
        "current_ticker": None,
        "current_step": "Ожидание запуска",
        "progress": 0,
        "log": [],
        "results": [],
        "started_at": datetime.now().isoformat(),
        "finished_at": None,
        "error": None
    }


def _extract_result_from_override(ticker: str, mode: str) -> Optional[Dict[str, Any]]:
    overrides = _load_ticker_overrides()
    override_raw = overrides.get(ticker.upper())
    override = _get_override_section(override_raw, mode)
    if not override or not override.get("down_mult") or not override.get("up_mult"):
        return None
    note = override.get("note", "")
    total_trades = None
    calibrated_at = None
    trades_match = re.search(r"(\d+) trades", note)
    if trades_match:
        total_trades = int(trades_match.group(1))
    date_match = re.search(r"Calibrated (\d{4}-\d{2}-\d{2})", note)
    if date_match:
        calibrated_at = date_match.group(1)
    return {
        "ticker": ticker.upper(),
        "down_mult": override.get("down_mult"),
        "up_mult": override.get("up_mult"),
        "iv_mean": override.get("iv_mean"),
        "iv_kappa": override.get("iv_kappa"),
        "iv_std": override.get("iv_std"),
        "half_life_days": override.get("half_life_days"),
        "total_trades": total_trades,
        "calibrated_at": calibrated_at,
        "note": note,
        "mode": mode,
    }


def _append_job_history(job: Dict[str, Any]) -> None:
    success_count = sum(1 for r in job.get("results", []) if r.get("status") == "success")
    skipped_count = sum(1 for r in job.get("results", []) if r.get("status", "").startswith("skipped"))
    error_count = sum(1 for r in job.get("results", []) if r.get("status") == "error")
    calibration_scheduler.update_history_item(job["job_id"], {
        "job_id": job["job_id"],
        "status": job.get("status"),
        "source": job.get("source", "manual"),
        "tickers": job.get("tickers", []),
        "months": job.get("months"),
        "hold_days": job.get("hold_days"),
        "calibration_mode": job.get("calibration_mode"),
        "recent_days": job.get("recent_days"),
        "started_at": job.get("started_at"),
        "finished_at": job.get("finished_at"),
        "error": job.get("error"),
        "results": job.get("results", []),
        "success_count": success_count,
        "skipped_count": skipped_count,
        "error_count": error_count,
    })


def _maybe_run_auto_cleanup(trigger: str) -> Optional[Dict[str, Any]]:
    policy = _get_cleanup_policy()
    if not policy.get("enabled") or not policy.get("auto_cleanup_after_run"):
        return None
    return _run_cleanup(trigger=trigger)


def _run_calibration_job(job_id: str, tickers: List[str], months: int, hold_days: int, calibration_mode: str = "standard", recent_days: int = 7):
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
            log(f"❌ Не удалось запустить Theta Terminal. Проверьте: jar={THETA_TERMINAL_JAR}, creds.txt в корне проекта или ~/Downloads/")
            with _jobs_lock:
                _jobs[job_id]["status"] = "error"
                _jobs[job_id]["error"] = "Theta Terminal недоступен"
                _jobs[job_id]["finished_at"] = datetime.now().isoformat()
            _append_job_history(_jobs[job_id])
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
        # Для режима recent скачиваем чуть больше чем recent_days (+ hold_days запас)
        # ЗАЧЕМ: Нужно покрыть сделки которые открылись ДО cutoff но закрылись ВНУТРИ периода
        # Минимум: ceil((recent_days + hold_days) / 30) месяцев, но не больше 2
        if calibration_mode == "recent":
            import math
            fetch_months = min(2, max(1, math.ceil((recent_days + hold_days) / 30)))
        else:
            fetch_months = months
        log(f"📥 Загрузка данных опционов {ticker} за {fetch_months} мес. (режим: {calibration_mode})...")
        fetch_script = os.path.join(SCRIPTS_DIR, "fetch_options_thetadata.py")
        try:
            proc = subprocess.run(
                [sys.executable, fetch_script, "--ticker", ticker, "--months", str(fetch_months)],
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
        log(f"📊 Запуск бэктестинга {ticker} (горизонт {hold_days} дней, режим: {calibration_mode})...")
        backtest_script = os.path.join(SCRIPTS_DIR, "backtest_calibration.py")
        try:
            backtest_cmd = [
                sys.executable, backtest_script,
                "--ticker", ticker,
                "--hold-days", str(hold_days),
                "--mode", calibration_mode,
            ]
            if calibration_mode == "recent":
                backtest_cmd += ["--recent-days", str(recent_days)]
            proc = subprocess.run(
                backtest_cmd,
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

            joined_output = "\n".join(output_lines)
            override_result = _extract_result_from_override(ticker, calibration_mode)
            if "Недостаточно сделок для калибровки" in joined_output:
                log(f"⚠️ {ticker}: недостаточно сделок для режима {calibration_mode}")
                results.append({"ticker": ticker, "status": "skipped_insufficient_trades", "error": "Недостаточно сделок"})
            elif override_result:
                log(f"✅ {ticker}: down_mult={override_result['down_mult']}, up_mult={override_result['up_mult']}, сделок={override_result['total_trades']}")
                results.append({"ticker": ticker, "status": "success", **override_result})
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
    _append_job_history(_jobs[job_id])
    cleanup_result = _maybe_run_auto_cleanup(trigger=f"cleanup_after_{_jobs[job_id].get('source', 'manual')}")
    if cleanup_result:
        log(
            f"🧹 Cleanup: удалено папок options={cleanup_result['summary']['deleted_options_dirs']}, "
            f"файлов results={cleanup_result['summary']['deleted_result_files']}"
        )


def _launch_calibration_job(tickers: List[str], months: int, hold_days: int,
                            calibration_mode: str, recent_days: int, source: str = "manual") -> Dict[str, Any]:
    clean_tickers = []
    for t in tickers:
        t = t.strip().upper()
        if t and t.isalpha() and len(t) <= 6:
            clean_tickers.append(t)

    if not clean_tickers:
        raise HTTPException(status_code=400, detail="Не указаны корректные тикеры")

    job_id = f"job_{int(time.time() * 1000)}"
    job = _build_job(job_id, clean_tickers, months, hold_days, calibration_mode, recent_days, source)
    with _jobs_lock:
        _jobs[job_id] = job
    _append_job_history(job)

    thread = threading.Thread(
        target=_run_calibration_job,
        args=(job_id, clean_tickers, months, hold_days, calibration_mode, recent_days),
        daemon=True
    )
    thread.start()
    return job


def run_scheduled_calibration(mode: str, mode_settings: Dict[str, Any], source: str = "scheduler") -> Dict[str, Any]:
    tickers = _load_online_tickers()
    if mode == "recent":
        months = int(mode_settings.get("months", 1))
        hold_days = int(mode_settings.get("hold_days", 7))
        recent_days = int(mode_settings.get("recent_days", 14))
    else:
        months = int(mode_settings.get("months", 6))
        hold_days = int(mode_settings.get("hold_days", 14))
        recent_days = int(mode_settings.get("recent_days", 14))
    return _launch_calibration_job(tickers, months, hold_days, mode, recent_days, source)


# ============================================================================
# ЭНДПОИНТЫ
# ============================================================================

@router.get("/status")
async def get_calibration_status():
    """
    Возвращает список всех тикеров с результатами калибровки
    ЗАЧЕМ: Главная таблица страницы — показывает что откалиброванно, когда и с какими коэффициентами
    Источники данных (приоритет): calibration_results/ → ticker_overrides.json (fallback)
    """
    overrides = _load_ticker_overrides()
    tickers_data = []
    # Отслеживаем тикеры уже добавленные из calibration_results/
    seen_tickers = set()

    # Источник 1: файлы calibration_results/ (детальные данные о сделках)
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
            # Поддержка нового формата {standard: {...}, recent: {...}} и старого {down_mult: ...}
            override_raw = overrides.get(ticker, {})
            has_override = bool(override_raw) and not ticker.startswith("_")
            override = _get_override_section(override_raw, "standard")

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
                "override_note": override.get("note", "") if has_override else "",
                # Параметры IV mean reversion (Ornstein-Uhlenbeck) из ticker_overrides
                # ЗАЧЕМ: Показываем в UI что для тикера применяется новая IV модель
                "iv_mean": override.get("iv_mean") if has_override else None,
                "iv_kappa": override.get("iv_kappa") if has_override else None,
                "iv_std": override.get("iv_std") if has_override else None,
                "half_life_days": override.get("half_life_days") if has_override else None,
                "available_modes": _get_available_modes(override_raw),
            })
            seen_tickers.add(ticker)

    # Источник 2: ticker_overrides.json — fallback для тикеров без calibration_results/
    # ЗАЧЕМ: calibration_results/ в .gitignore и не деплоится на сервер,
    #        но ticker_overrides.json коммитится и содержит все откалиброванные тикеры
    for ticker, override_raw in sorted(overrides.items()):
        # Пропускаем служебные ключи и уже добавленные тикеры
        if ticker.startswith("_") or ticker in seen_tickers:
            continue

        # Получаем данные секции standard (fallback на корень если старый формат)
        override = _get_override_section(override_raw, "standard")

        # Пропускаем записи без коэффициентов (некорректные)
        if not override.get("down_mult") or not override.get("up_mult"):
            continue

        # Парсим дату из поля note (формат: "Calibrated YYYY-MM-DD, ...")
        calibrated_at = ""
        days_ago = None
        is_stale = False
        note = override.get("note", "")
        try:
            date_match = re.search(r"Calibrated (\d{4}-\d{2}-\d{2})", note)
            if date_match:
                calibrated_at = date_match.group(1)
                dt = datetime.fromisoformat(calibrated_at)
                days_ago = (datetime.now() - dt).days
                is_stale = days_ago > 30
        except Exception:
            pass

        # Извлекаем количество сделок из note: "..., 3258 trades, ..."
        total_trades = None
        try:
            trades_match = re.search(r"(\d+) trades", note)
            if trades_match:
                total_trades = int(trades_match.group(1))
        except Exception:
            pass

        tickers_data.append({
            "ticker": ticker,
            "down_mult": override.get("down_mult"),
            "up_mult": override.get("up_mult"),
            "total_trades": total_trades,
            "hold_days": None,
            "calibrated_at": calibrated_at,
            "days_ago": days_ago,
            "is_stale": is_stale,
            "contracts_count": _count_options_files(ticker),
            "has_override": True,
            "override_note": note,
            "iv_mean": override.get("iv_mean"),
            "iv_kappa": override.get("iv_kappa"),
            "iv_std": override.get("iv_std"),
            "half_life_days": override.get("half_life_days"),
            "available_modes": _get_available_modes(override_raw),
        })

    # Проверяем статус Theta Terminal
    terminal_running = _is_theta_terminal_running()
    watchlist_config = calibration_scheduler.load_config()

    return {
        "tickers": tickers_data,
        "terminal_running": terminal_running,
        "jar_exists": bool(_find_theta_jar()),
        "total_calibrated": len(tickers_data),
        "watchlist": {
            **watchlist_config,
            "tickers": _load_online_tickers(),
        },
        "scheduler": calibration_scheduler.get_scheduler_status(),
        "cleanup_preview": _scan_cleanup_candidates(),
    }


@router.get("/history")
async def get_calibration_history(limit: int = 20):
    return {
        "items": calibration_scheduler.load_history(limit=max(1, min(limit, 100)))
    }


@router.get("/watchlist")
async def get_calibration_watchlist():
    config = calibration_scheduler.load_config()
    return {
        **config,
        "tickers": _load_online_tickers(),
    }


@router.put("/watchlist")
async def save_calibration_watchlist(request: SaveWatchlistRequest):
    clean_tickers = []
    for ticker in request.tickers:
        ticker = ticker.strip().upper()
        if ticker and ticker.isalpha() and len(ticker) <= 6:
            clean_tickers.append(ticker)
    config = calibration_scheduler.load_config()
    config["enabled"] = request.enabled
    config["theta"] = request.theta or {}
    config["cleanup"] = request.cleanup or config.get("cleanup", {})
    config["modes"] = request.modes or config.get("modes", {})
    saved = calibration_scheduler.save_config(config)
    saved_tickers = calibration_scheduler.save_tickers(clean_tickers)
    return {
        "status": "ok",
        "config": {
            **saved,
            "tickers": saved_tickers.get("tickers", []),
        },
        "scheduler": calibration_scheduler.get_scheduler_status(),
    }


@router.get("/cleanup/preview")
async def get_cleanup_preview():
    return _scan_cleanup_candidates()


@router.post("/cleanup/run")
async def run_cleanup_now():
    return _run_cleanup(trigger="manual_cleanup")


@router.post("/run-scheduled/{mode}")
async def run_scheduled_mode_now(mode: str):
    mode = mode.strip().lower()
    config = calibration_scheduler.load_config()
    mode_settings = config.get("modes", {}).get(mode)
    if mode not in ["standard", "recent", "weighted"] or not mode_settings:
        raise HTTPException(status_code=400, detail="Некорректный режим")
    job = run_scheduled_calibration(mode, mode_settings, "manual_scheduler")
    return {
        "status": "started",
        "job_id": job["job_id"],
        "mode": mode,
        "tickers": job["tickers"],
    }


@router.get("/scheduler")
async def get_scheduler_status():
    return calibration_scheduler.get_scheduler_status()


@router.post("/run")
async def run_calibration(request: RunCalibrationRequest, background_tasks: BackgroundTasks):
    """
    Запускает калибровку для списка тикеров в фоне
    ЗАЧЕМ: Нажатие кнопки в UI запускает полный цикл: Terminal → fetch → backtest → сохранение
    """
    job = _launch_calibration_job(
        tickers=request.tickers,
        months=request.months,
        hold_days=request.hold_days,
        calibration_mode=request.calibration_mode,
        recent_days=request.recent_days,
        source="manual"
    )

    return {
        "job_id": job["job_id"],
        "tickers": job["tickers"],
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
        "jar_exists": bool(_find_theta_jar())
    }
