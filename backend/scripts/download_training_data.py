#!/usr/bin/env python3
"""
Скрипт массовой загрузки данных для обучения ML модели
ЗАЧЕМ: Загрузка исторических опционных данных из Polygon API с соблюдением rate limit
Затрагивает: Polygon API, кэширование, построение Vol Surface

ВАЖНО: Rate limit для Polygon Starter = 5 req/min
Скрипт автоматически соблюдает лимит и использует кэширование.

Использование:
    python download_training_data.py --tickers SPY,QQQ,AAPL --days 30
    python download_training_data.py --resume  # продолжить с последней точки
"""

import os
import sys
import json
import asyncio
import argparse
import numpy as np
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional
import logging

# Добавляем путь к backend для импорта модулей
sys.path.insert(0, str(Path(__file__).parent.parent))

# Загружаем переменные окружения из .env файла
# ЗАЧЕМ: При запуске скрипта напрямую .env не загружается автоматически
from dotenv import load_dotenv
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)
logger_init = logging.getLogger(__name__)
logger_init.info(f"📁 Загружен .env из: {env_path}")

from ml.data.polygon_loader import PolygonLoader
from ml.data.surface_builder import SurfaceBuilder

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


# ============== Конфигурация ==============

# Тикеры для обучения — расширенный список для полноценной модели
# ЗАЧЕМ: Разнообразие секторов и уровней волатильности для обобщающей модели
DEFAULT_TICKERS = [
    # Индексы (высокая ликвидность, стабильные IV)
    "SPY", "QQQ", "IWM", "DIA",
    # Mega-cap Tech (много данных, разнообразие)
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA",
    # Финансы
    "JPM", "BAC", "GS", "V", "MA",
    # Здравоохранение
    "JNJ", "UNH", "PFE", "ABBV",
    # Энергетика
    "XOM", "CVX", "COP",
    # Потребительский сектор
    "WMT", "COST", "HD", "MCD",
    # Промышленность
    "CAT", "BA", "UPS",
    # Волатильные (для разнообразия IV)
    "MSTR", "COIN", "AMD", "SQ"
]
# Итого: 35 тикеров

# Директория для сохранения данных
DATA_DIR = Path(__file__).parent.parent / "ml" / "data" / "training"

# Файл прогресса для resume
PROGRESS_FILE = DATA_DIR / "download_progress.json"


class TrainingDataDownloader:
    """
    Загрузчик данных для обучения с прогресс-баром и resume
    ЗАЧЕМ: Эффективная загрузка больших объёмов данных с учётом rate limit
    """
    
    # Критерии качества данных
    # ЗАЧЕМ: Фильтрация некачественных данных для улучшения обучения модели
    MIN_OPTIONS_IN_CHAIN = 50      # Минимум опционов в цепочке
    MIN_IV_POINTS = 30             # Минимум точек с валидным IV
    MIN_COVERAGE = 0.35            # Минимум 35% покрытия сетки
    MAX_CAPPED_RATIO = 0.40        # Максимум 40% capped значений
    IV_MIN = 0.01                  # Минимальный IV (1%)
    IV_MAX = 3.0                   # Максимальный IV (300%)
    
    def __init__(
        self,
        tickers: List[str],
        days_back: int = 365,
        rate_limit: float = 5.0
    ):
        """
        Инициализация загрузчика
        
        Args:
            tickers: список тикеров для загрузки
            days_back: сколько дней назад загружать
            rate_limit: лимит запросов в минуту (Polygon Starter = 5)
        """
        self.tickers = tickers
        self.days_back = days_back
        
        # Инициализация компонентов
        self.loader = PolygonLoader(rate_limit=rate_limit)
        self.surface_builder = SurfaceBuilder()
        
        # Создаём директорию для данных
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        
        # Прогресс
        self.progress = self._load_progress()
        
        # Статистика
        self.stats = {
            "total_days": 0,
            "processed_days": 0,
            "successful_surfaces": 0,
            "failed_surfaces": 0,
            "skipped_low_quality": 0,
            "api_requests": 0,
            "cache_hits": 0
        }
    
    def _load_progress(self) -> Dict:
        """Загрузка прогресса для resume"""
        if PROGRESS_FILE.exists():
            try:
                with open(PROGRESS_FILE, 'r') as f:
                    return json.load(f)
            except:
                pass
        return {"completed_dates": {}}
    
    def _save_progress(self):
        """Сохранение прогресса"""
        with open(PROGRESS_FILE, 'w') as f:
            json.dump(self.progress, f, indent=2)
    
    def _get_trading_days(self, from_date: str, to_date: str) -> List[str]:
        """Получение списка торговых дней (без выходных)"""
        return self.loader.get_trading_days(from_date, to_date)
    
    async def download_all(self) -> Dict:
        """
        Загрузка всех данных
        ЗАЧЕМ: Основной метод для запуска загрузки
        
        Returns:
            Статистика загрузки
        """
        # Определяем диапазон дат
        end_date = datetime.now()
        start_date = end_date - timedelta(days=self.days_back)
        
        from_date = start_date.strftime("%Y-%m-%d")
        to_date = end_date.strftime("%Y-%m-%d")
        
        logger.info("=" * 60)
        logger.info(f"📥 Загрузка данных для обучения ML модели")
        logger.info(f"   Тикеры: {', '.join(self.tickers)}")
        logger.info(f"   Период: {from_date} → {to_date}")
        logger.info(f"   Rate limit: {self.loader.rate_limit} req/min")
        logger.info("=" * 60)
        
        # Получаем список торговых дней
        trading_days = self._get_trading_days(from_date, to_date)
        self.stats["total_days"] = len(trading_days) * len(self.tickers)
        
        logger.info(f"📅 Торговых дней: {len(trading_days)}")
        logger.info(f"📊 Всего задач: {self.stats['total_days']}")
        
        # Оценка времени
        # При 5 req/min и ~2 запроса на день (chain + price) = ~2.5 дня на тикер
        estimated_minutes = (self.stats["total_days"] * 2) / self.loader.rate_limit
        logger.info(f"⏱️ Оценка времени: ~{estimated_minutes:.0f} минут ({estimated_minutes/60:.1f} часов)")
        logger.info("")
        
        # Собираем данные
        all_surfaces = []
        all_dates = []
        all_prices = []
        all_tickers = []
        
        for ticker in self.tickers:
            logger.info(f"\n{'='*40}")
            logger.info(f"🔄 Обработка {ticker}")
            logger.info(f"{'='*40}")
            
            ticker_surfaces = []
            ticker_dates = []
            ticker_prices = []
            
            for i, date in enumerate(trading_days):
                # Проверяем, не обработан ли уже этот день
                progress_key = f"{ticker}_{date}"
                if progress_key in self.progress.get("completed_dates", {}):
                    self.stats["cache_hits"] += 1
                    self.stats["processed_days"] += 1
                    continue
                
                try:
                    # Загружаем опционную цепочку
                    options_chain = await self.loader.get_options_chain(ticker, date)
                    self.stats["api_requests"] += 1
                    
                    if not options_chain:
                        logger.warning(f"   ⚠️ {date}: нет опционных данных")
                        self.stats["failed_surfaces"] += 1
                        continue
                    
                    # Загружаем цену базового актива
                    price_history = await self.loader.get_underlying_price_history(
                        ticker, date, date
                    )
                    self.stats["api_requests"] += 1
                    
                    if not price_history:
                        logger.warning(f"   ⚠️ {date}: нет цены базового актива")
                        self.stats["failed_surfaces"] += 1
                        continue
                    
                    spot_price = price_history[0].get("c", 0)  # close price
                    
                    if spot_price <= 0:
                        self.stats["failed_surfaces"] += 1
                        continue
                    
                    # Проверка качества опционной цепочки ПЕРЕД построением surface
                    # ЗАЧЕМ: Экономим время, не строя surface из плохих данных
                    quality_check = self._check_chain_quality(options_chain, spot_price, date)
                    
                    if not quality_check["passed"]:
                        logger.debug(f"   ⚠️ {date}: {quality_check['reason']}")
                        self.stats["skipped_low_quality"] += 1
                        # Отмечаем как обработанный, чтобы не повторять
                        if "completed_dates" not in self.progress:
                            self.progress["completed_dates"] = {}
                        self.progress["completed_dates"][progress_key] = "skipped"
                        continue
                    
                    # Строим Volatility Surface
                    surface = self.surface_builder.build_surface_from_chain(
                        options_chain, spot_price, date
                    )
                    
                    if surface is not None:
                        # Дополнительная проверка качества surface
                        surface_quality = self._check_surface_quality(surface)
                        
                        if not surface_quality["passed"]:
                            logger.debug(f"   ⚠️ {date}: surface quality - {surface_quality['reason']}")
                            self.stats["skipped_low_quality"] += 1
                            self.progress["completed_dates"][progress_key] = "skipped"
                            continue
                        
                        ticker_surfaces.append(surface)
                        ticker_dates.append(date)
                        ticker_prices.append(spot_price)
                        self.stats["successful_surfaces"] += 1
                        
                        # Отмечаем прогресс
                        if "completed_dates" not in self.progress:
                            self.progress["completed_dates"] = {}
                        self.progress["completed_dates"][progress_key] = True
                        
                        # Сохраняем прогресс каждые 10 успешных surface
                        if self.stats["successful_surfaces"] % 10 == 0:
                            self._save_progress()
                    else:
                        self.stats["failed_surfaces"] += 1
                    
                    self.stats["processed_days"] += 1
                    
                    # Прогресс-бар
                    progress_pct = (self.stats["processed_days"] / self.stats["total_days"]) * 100
                    if (i + 1) % 5 == 0:
                        logger.info(
                            f"   📊 {ticker}: {i+1}/{len(trading_days)} дней | "
                            f"Surfaces: {len(ticker_surfaces)} | "
                            f"Общий прогресс: {progress_pct:.1f}%"
                        )
                    
                except Exception as e:
                    logger.error(f"   ❌ {date}: ошибка - {e}")
                    self.stats["failed_surfaces"] += 1
                    continue
            
            # Добавляем данные тикера к общим
            all_surfaces.extend(ticker_surfaces)
            all_dates.extend(ticker_dates)
            all_prices.extend(ticker_prices)
            all_tickers.extend([ticker] * len(ticker_surfaces))
            
            logger.info(f"✅ {ticker}: загружено {len(ticker_surfaces)} surfaces")
        
        # Сохраняем финальный прогресс
        self._save_progress()
        
        # Сохраняем данные в .npz
        if all_surfaces:
            self._save_training_data(
                all_surfaces, all_dates, all_prices, all_tickers
            )
        
        # Финальная статистика
        self._print_stats()
        
        return self.stats
    
    def _check_chain_quality(
        self, 
        options_chain: List[Dict], 
        spot_price: float,
        date: str
    ) -> Dict:
        """
        Проверка качества опционной цепочки ПЕРЕД построением surface
        ЗАЧЕМ: Отсеиваем некачественные данные до затратных вычислений
        
        Returns:
            {"passed": bool, "reason": str, "stats": dict}
        """
        from datetime import datetime
        ref_date = datetime.strptime(date, "%Y-%m-%d")
        
        # Проверка 1: Минимальное количество опционов
        if len(options_chain) < self.MIN_OPTIONS_IN_CHAIN:
            return {
                "passed": False, 
                "reason": f"Мало опционов: {len(options_chain)} < {self.MIN_OPTIONS_IN_CHAIN}",
                "stats": {"options_count": len(options_chain)}
            }
        
        # Проверка 2: Количество опционов с валидным IV
        valid_iv_count = 0
        iv_values = []
        
        for opt in options_chain:
            details = opt.get("details", {})
            greeks = opt.get("greeks", {})
            
            strike = details.get("strike_price") or opt.get("strike")
            expiration = details.get("expiration_date") or opt.get("expiration_date")
            iv = greeks.get("implied_volatility") or opt.get("implied_volatility")
            
            if not all([strike, expiration, iv]):
                continue
            
            # Проверяем диапазон IV
            if self.IV_MIN <= iv <= self.IV_MAX:
                valid_iv_count += 1
                iv_values.append(iv)
        
        if valid_iv_count < self.MIN_IV_POINTS:
            return {
                "passed": False,
                "reason": f"Мало валидных IV: {valid_iv_count} < {self.MIN_IV_POINTS}",
                "stats": {"valid_iv_count": valid_iv_count}
            }
        
        # Проверка 3: Разброс IV (не должен быть слишком маленьким)
        if iv_values:
            iv_std = np.std(iv_values)
            if iv_std < 0.01:  # Слишком однородные данные
                return {
                    "passed": False,
                    "reason": f"Слишком однородный IV: std={iv_std:.4f}",
                    "stats": {"iv_std": iv_std}
                }
        
        return {
            "passed": True,
            "reason": "OK",
            "stats": {
                "options_count": len(options_chain),
                "valid_iv_count": valid_iv_count,
                "iv_mean": np.mean(iv_values) if iv_values else 0,
                "iv_std": np.std(iv_values) if iv_values else 0
            }
        }
    
    def _check_surface_quality(self, surface: np.ndarray) -> Dict:
        """
        Проверка качества построенного surface
        ЗАЧЕМ: Финальная проверка перед добавлением в датасет
        
        Returns:
            {"passed": bool, "reason": str, "stats": dict}
        """
        total_points = surface.size
        
        # Проверка 1: NaN значения
        nan_count = np.isnan(surface).sum()
        if nan_count > 0:
            nan_ratio = nan_count / total_points
            if nan_ratio > 0.1:  # Более 10% NaN
                return {
                    "passed": False,
                    "reason": f"Много NaN: {nan_ratio*100:.1f}%",
                    "stats": {"nan_ratio": nan_ratio}
                }
        
        # Проверка 2: Capped значения (на границах диапазона)
        capped_low = (surface <= self.IV_MIN + 0.001).sum()
        capped_high = (surface >= self.IV_MAX - 0.001).sum()
        capped_ratio = (capped_low + capped_high) / total_points
        
        if capped_ratio > self.MAX_CAPPED_RATIO:
            return {
                "passed": False,
                "reason": f"Много capped значений: {capped_ratio*100:.1f}% > {self.MAX_CAPPED_RATIO*100:.0f}%",
                "stats": {"capped_ratio": capped_ratio}
            }
        
        # Проверка 3: Разумный диапазон средних значений
        mean_iv = np.nanmean(surface)
        if mean_iv < 0.05 or mean_iv > 2.0:  # 5% - 200%
            return {
                "passed": False,
                "reason": f"Нереалистичный средний IV: {mean_iv*100:.1f}%",
                "stats": {"mean_iv": mean_iv}
            }
        
        # Проверка 4: Стандартное отклонение (не слишком маленькое и не слишком большое)
        std_iv = np.nanstd(surface)
        if std_iv < 0.01 or std_iv > 1.0:
            return {
                "passed": False,
                "reason": f"Нереалистичный разброс IV: std={std_iv:.3f}",
                "stats": {"std_iv": std_iv}
            }
        
        return {
            "passed": True,
            "reason": "OK",
            "stats": {
                "mean_iv": mean_iv,
                "std_iv": std_iv,
                "capped_ratio": capped_ratio
            }
        }
    
    def _save_training_data(
        self,
        surfaces: List[np.ndarray],
        dates: List[str],
        prices: List[float],
        tickers: List[str]
    ):
        """
        Сохранение данных в формате .npz
        ЗАЧЕМ: Компактное хранение для быстрой загрузки при обучении
        """
        output_path = DATA_DIR / "training_data.npz"
        
        # Конвертируем в numpy arrays
        surfaces_array = np.array(surfaces)  # (N, 41, 20)
        
        np.savez_compressed(
            output_path,
            surfaces_grid=surfaces_array,
            quote_dates=np.array(dates),
            underlying_prices=np.array(prices),
            tickers=np.array(tickers),
            k_grid=self.surface_builder.k_grid,
            T_grid=self.surface_builder.t_grid
        )
        
        logger.info(f"\n💾 Данные сохранены: {output_path}")
        logger.info(f"   Размер: {output_path.stat().st_size / 1024 / 1024:.2f} MB")
        logger.info(f"   Shape: {surfaces_array.shape}")
    
    def _print_stats(self):
        """Вывод финальной статистики"""
        logger.info("\n" + "=" * 60)
        logger.info("📊 СТАТИСТИКА ЗАГРУЗКИ")
        logger.info("=" * 60)
        logger.info(f"   Всего дней: {self.stats['total_days']}")
        logger.info(f"   Обработано: {self.stats['processed_days']}")
        logger.info(f"   ✅ Успешных surfaces: {self.stats['successful_surfaces']}")
        logger.info(f"   ⚠️ Пропущено (низкое качество): {self.stats['skipped_low_quality']}")
        logger.info(f"   ❌ Неудачных: {self.stats['failed_surfaces']}")
        logger.info(f"   🔄 API запросов: {self.stats['api_requests']}")
        logger.info(f"   💾 Из кэша: {self.stats['cache_hits']}")
        
        # Расчёт качества данных
        total_processed = self.stats['successful_surfaces'] + self.stats['skipped_low_quality'] + self.stats['failed_surfaces']
        if total_processed > 0:
            quality_rate = (self.stats['successful_surfaces'] / total_processed) * 100
            logger.info(f"   📈 Качество данных: {quality_rate:.1f}%")
        
        success_rate = (
            self.stats['successful_surfaces'] / 
            max(1, self.stats['processed_days'])
        ) * 100
        logger.info(f"   🎯 Успешность: {success_rate:.1f}%")
        logger.info("=" * 60)


async def main():
    """Главная функция"""
    parser = argparse.ArgumentParser(
        description="Загрузка данных для обучения ML модели"
    )
    parser.add_argument(
        "--tickers",
        type=str,
        default=",".join(DEFAULT_TICKERS),
        help=f"Тикеры через запятую (по умолчанию: {','.join(DEFAULT_TICKERS)})"
    )
    parser.add_argument(
        "--days",
        type=int,
        default=365,
        help="Количество дней назад (по умолчанию: 365)"
    )
    parser.add_argument(
        "--rate-limit",
        type=float,
        default=60.0,
        help="Rate limit запросов в минуту (по умолчанию: 60, платные планы Polygon = unlimited)"
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Продолжить с последней точки"
    )
    parser.add_argument(
        "--clear-progress",
        action="store_true",
        help="Очистить прогресс и начать заново"
    )
    
    args = parser.parse_args()
    
    # Очистка прогресса если нужно
    if args.clear_progress and PROGRESS_FILE.exists():
        PROGRESS_FILE.unlink()
        logger.info("🗑️ Прогресс очищен")
    
    # Парсим тикеры
    tickers = [t.strip().upper() for t in args.tickers.split(",")]
    
    # Создаём загрузчик
    downloader = TrainingDataDownloader(
        tickers=tickers,
        days_back=args.days,
        rate_limit=args.rate_limit
    )
    
    # Запускаем загрузку
    try:
        stats = await downloader.download_all()
        
        if stats["successful_surfaces"] > 0:
            logger.info("\n✅ Загрузка завершена успешно!")
            logger.info(f"   Данные готовы для обучения: {DATA_DIR / 'training_data.npz'}")
        else:
            logger.warning("\n⚠️ Не удалось загрузить ни одного surface")
            
    except KeyboardInterrupt:
        logger.info("\n⏹️ Загрузка прервана пользователем")
        logger.info("   Прогресс сохранён. Используйте --resume для продолжения.")
    except Exception as e:
        logger.error(f"\n❌ Ошибка: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())
