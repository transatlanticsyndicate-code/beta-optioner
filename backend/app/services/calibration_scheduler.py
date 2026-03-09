import json
import logging
import os
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, Union

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
CONFIG_DIR = os.path.join(os.path.dirname(__file__), "..", "config")
WATCHLIST_FILE = os.path.join(CONFIG_DIR, "calibration_watchlist.json")
TICKERS_FILE = os.path.join(CONFIG_DIR, "calibration_tickers.json")
HISTORY_FILE = os.path.join(CONFIG_DIR, "calibration_history.json")

RunCallback = Callable[[str, Dict[str, Any], str], Dict[str, Any]]


class CalibrationScheduler:
    def __init__(self) -> None:
        self.scheduler = BackgroundScheduler()
        self.run_callback: Optional[RunCallback] = None
        self.started = False

    def get_default_config(self) -> Dict[str, Any]:
        return {
            "enabled": False,
            "theta": {
                "jar_path": "",
                "creds_file": ""
            },
            "cleanup": {
                "enabled": True,
                "auto_cleanup_after_run": True,
                "options_max_age_days": 45,
                "results_max_age_days": 90,
                "history_max_entries": 200,
                "delete_orphan_options": True,
                "delete_orphan_results": False
            },
            "modes": {
                "standard": {
                    "enabled": True,
                    "months": 6,
                    "hold_days": 14,
                    "cron": ["0 16 1 1-3,11-12 *", "0 15 1 4-10 *"]
                },
                "recent": {
                    "enabled": True,
                    "recent_days": 14,
                    "hold_days": 7,
                    "cron": ["0 16 * 1-3,11-12 *", "0 15 * 4-10 *"]
                },
                "weighted": {
                    "enabled": True,
                    "months": 6,
                    "hold_days": 14,
                    "cron": ["0 16 * 1-3,11-12 0", "0 15 * 4-10 0"]
                }
            },
            "updated_at": None
        }

    def get_default_tickers(self) -> Dict[str, Any]:
        return {
            "tickers": [],
            "updated_at": None,
        }

    def ensure_files(self) -> None:
        os.makedirs(CONFIG_DIR, exist_ok=True)
        if not os.path.exists(WATCHLIST_FILE):
            with open(WATCHLIST_FILE, "w", encoding="utf-8") as f:
                json.dump(self.get_default_config(), f, indent=2, ensure_ascii=False)
        if not os.path.exists(TICKERS_FILE):
            with open(TICKERS_FILE, "w", encoding="utf-8") as f:
                json.dump(self.get_default_tickers(), f, indent=2, ensure_ascii=False)
        if not os.path.exists(HISTORY_FILE):
            with open(HISTORY_FILE, "w", encoding="utf-8") as f:
                json.dump([], f, indent=2, ensure_ascii=False)

    def load_config(self) -> Dict[str, Any]:
        self.ensure_files()
        try:
            with open(WATCHLIST_FILE, "r", encoding="utf-8") as f:
                config = json.load(f)
        except Exception:
            config = self.get_default_config()
        default_config = self.get_default_config()
        config.setdefault("enabled", default_config["enabled"])
        config.setdefault("theta", default_config["theta"])
        config.setdefault("cleanup", default_config["cleanup"])
        config.setdefault("modes", default_config["modes"])
        for key, value in default_config["cleanup"].items():
            config["cleanup"].setdefault(key, value)
        for mode, mode_defaults in default_config["modes"].items():
            config["modes"].setdefault(mode, {})
            for key, value in mode_defaults.items():
                config["modes"][mode].setdefault(key, value)
        return config

    def save_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        self.ensure_files()
        config["updated_at"] = datetime.utcnow().isoformat()
        with open(WATCHLIST_FILE, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        self.reload_jobs()
        return config

    def load_tickers(self) -> List[str]:
        self.ensure_files()
        try:
            with open(TICKERS_FILE, "r", encoding="utf-8") as f:
                payload = json.load(f)
        except Exception:
            payload = self.get_default_tickers()
        tickers = payload.get("tickers", []) if isinstance(payload, dict) else []
        return [ticker.strip().upper() for ticker in tickers if isinstance(ticker, str) and ticker.strip()]

    def save_tickers(self, tickers: List[str]) -> Dict[str, Any]:
        self.ensure_files()
        payload = {
            "tickers": [ticker.strip().upper() for ticker in tickers if isinstance(ticker, str) and ticker.strip()],
            "updated_at": datetime.utcnow().isoformat(),
        }
        with open(TICKERS_FILE, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
        self.reload_jobs()
        return payload

    def load_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        self.ensure_files()
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                history = json.load(f)
        except Exception:
            history = []
        history = history if isinstance(history, list) else []
        return list(reversed(history[-limit:]))

    def append_history(self, item: Dict[str, Any]) -> None:
        self.ensure_files()
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                history = json.load(f)
        except Exception:
            history = []
        history = history if isinstance(history, list) else []
        history.append(item)
        history = history[-200:]
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2, ensure_ascii=False)

    def update_history_item(self, job_id: str, payload: Dict[str, Any]) -> None:
        self.ensure_files()
        config = self.load_config()
        max_entries = int(config.get("cleanup", {}).get("history_max_entries", 200))
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                history = json.load(f)
        except Exception:
            history = []
        history = history if isinstance(history, list) else []
        updated = False
        for item in history:
            if item.get("job_id") == job_id:
                item.update(payload)
                updated = True
                break
        if not updated:
            payload = {"job_id": job_id, **payload}
            history.append(payload)
        history = history[-max(10, max_entries):]
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2, ensure_ascii=False)

    def configure(self, run_callback: RunCallback) -> None:
        self.run_callback = run_callback
        if not self.started:
            self.scheduler.start()
            self.started = True
        self.reload_jobs()
        logger.info("CalibrationScheduler configured")

    def _parse_cron(self, expression: str) -> CronTrigger:
        minute, hour, day, month, day_of_week = expression.split()
        return CronTrigger(minute=minute, hour=hour, day=day, month=month, day_of_week=day_of_week)

    def _get_cron_expressions(self, cron_value: Union[str, List[str]]) -> List[str]:
        if isinstance(cron_value, list):
            return [item.strip() for item in cron_value if isinstance(item, str) and item.strip()]
        if isinstance(cron_value, str) and cron_value.strip():
            return [cron_value.strip()]
        return []

    def reload_jobs(self) -> None:
        if not self.started:
            return
        for job in list(self.scheduler.get_jobs()):
            if job.id.startswith("calibration_"):
                self.scheduler.remove_job(job.id)
        config = self.load_config()
        if not config.get("enabled") or not self.run_callback:
            return
        tickers = self.load_tickers()
        if not tickers:
            return
        for mode, settings in config.get("modes", {}).items():
            if not settings.get("enabled"):
                continue
            cron_expressions = self._get_cron_expressions(settings.get("cron", ""))
            for index, cron_expr in enumerate(cron_expressions):
                trigger = self._parse_cron(cron_expr)
                self.scheduler.add_job(
                    func=self._run_scheduled_mode,
                    trigger=trigger,
                    args=[mode],
                    id=f"calibration_{mode}_{index}",
                    replace_existing=True,
                    max_instances=1,
                    coalesce=True,
                )

    def _run_scheduled_mode(self, mode: str) -> None:
        config = self.load_config()
        if not self.run_callback or not config.get("enabled"):
            return
        tickers = self.load_tickers()
        if not tickers:
            return
        mode_settings = config.get("modes", {}).get(mode, {})
        try:
            self.run_callback(mode, mode_settings, "scheduler")
        except Exception as e:
            logger.error("Scheduled calibration failed for mode %s: %s", mode, e)

    def get_scheduler_status(self) -> Dict[str, Any]:
        jobs = []
        for job in self.scheduler.get_jobs() if self.started else []:
            if not job.id.startswith("calibration_"):
                continue
            jobs.append({
                "id": job.id,
                "next_run_at": job.next_run_time.isoformat() if job.next_run_time else None
            })
        return {
            "started": self.started,
            "jobs": jobs,
            "watchlist_file": WATCHLIST_FILE,
            "tickers_file": TICKERS_FILE,
            "history_file": HISTORY_FILE
        }

    def shutdown(self) -> None:
        if self.started:
            self.scheduler.shutdown()
            self.started = False


calibration_scheduler = CalibrationScheduler()
