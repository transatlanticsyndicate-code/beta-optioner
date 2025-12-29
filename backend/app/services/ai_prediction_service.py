import onnxruntime as ort
import numpy as np
import os
import logging
from typing import Optional, List

# Настройка логгера
logger = logging.getLogger(__name__)

# Константы модели (из AI_INTEGRATION_GUIDE.md)
TICKERS_LIST = [
    'AAPL', 'ABBV', 'ABNB', 'ADBE', 'AMD', 'AMZN', 'BA', 'BAC', 'CAT', 'CMCSA', 
    'COP', 'COST', 'CVX', 'DIA', 'DIS', 'GE', 'GOOGL', 'GS', 'HD', 'HON', 
    'IWM', 'JNJ', 'JPM', 'KO', 'LLY', 'LOW', 'MA', 'META', 'MMM', 'MRK', 
    'MS', 'MSFT', 'NFLX', 'NVDA', 'PEP', 'PFE', 'PG', 'PM', 'QQQ', 'SLB', 
    'SPY', 'T', 'TGT', 'TSLA', 'UBER', 'UNH', 'V', 'VZ', 'WFC', 'WMT', 'XOM'
]

# Коэффициенты нормализации (StandardScaler)
X_MEAN = np.array([0.026034710370290055, 0.4732129489943703, 0.39012464388406426], dtype=np.float32)
X_STD = np.array([0.28651675423875517, 0.5812719472646916, 0.12222801581754388], dtype=np.float32)
Y_MEAN = 0.3901246440083509
Y_STD = 0.21758850699903196

class AIPredictionService:
    _instance = None
    _session = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(AIPredictionService, cls).__new__(cls)
        return cls._instance

    def _get_model_path(self) -> str:
        """Возвращает абсолютный путь к файлу модели"""
        # Путь относительно этого файла: ../../ai_models/options_model.onnx
        current_dir = os.path.dirname(os.path.abspath(__file__))
        return os.path.join(current_dir, '..', 'ai_models', 'options_model.onnx')

    async def init_model(self):
        """Инициализация ONNX сессии"""
        if self._session is not None:
            return

        try:
            model_path = self._get_model_path()
            if not os.path.exists(model_path):
                logger.error(f"❌ Model file not found at: {model_path}")
                return

            # Создание сессии
            # В python onnxruntime создание сессии синхронное, но быстрое
            self._session = ort.InferenceSession(model_path)
            logger.info("✅ AI Model loaded successfully")
        except Exception as e:
            logger.error(f"❌ Failed to load AI model: {e}")
            self._session = None

    def is_ticker_supported(self, ticker: str) -> bool:
        """Проверка поддержки тикера моделью"""
        if not ticker:
            return False
        return ticker.upper() in TICKERS_LIST

    async def predict_iv(self, ticker: str, type_str: str, stock_price: float, 
                         strike: float, ttm: float, current_iv: float) -> float:
        """
        Прогнозирование IV на основе параметров сценария.
        
        Args:
            ticker: Тикер актива (напр. 'AAPL')
            type_str: Тип опциона ('CALL' или 'PUT')
            stock_price: Цена базового актива (будущая)
            strike: Страйк
            ttm: Время до экспирации в годах
            current_iv: Текущая IV (для fallback и как фича)
            
        Returns:
            Предсказанная IV (десятичная дробь)
        """
        # Если тикер не поддерживается или модель не загружена — возвращаем current_iv
        if not self.is_ticker_supported(ticker):
            return current_iv
            
        if self._session is None:
            await self.init_model()
            if self._session is None:
                return current_iv

        try:
            # Подготовка индексов
            ticker_idx = TICKERS_LIST.index(ticker.upper())
            # 0=Call, 1=Put (как в JS версии: startsWith('c') ? 0 : 1)
            type_idx = 0 if type_str.lower().startswith('c') else 1

            # Логарифм moneyness
            # Защита от деления на ноль
            if strike <= 0 or stock_price <= 0:
                return current_iv
            moneyness_log = np.log(stock_price / strike)

            # Вектор признаков: [moneyness_log, ttm, current_iv]
            raw_cont = np.array([moneyness_log, ttm, current_iv], dtype=np.float32)

            # Масштабирование (StandardScaler)
            # (val - mean) / std
            scaled_cont = (raw_cont - X_MEAN) / X_STD

            # Формирование входных данных для ONNX
            # Входы: ticker_idx (int64[1]), type_idx (int64[1]), continuous_features (float32[1, 3])
            
            inputs = {
                'ticker_idx': np.array([ticker_idx], dtype=np.int64),
                'type_idx': np.array([type_idx], dtype=np.int64),
                'continuous_features': scaled_cont.reshape(1, 3).astype(np.float32)
            }

            # Инференс
            outputs = self._session.run(None, inputs)
            
            # Получаем предсказанное масштабированное значение
            # output name usually 'predicted_iv' or similar, but run(None) returns list of outputs
            predicted_scaled = outputs[0][0] # Assuming first output, first element

            # Обратное масштабирование
            final_iv = (predicted_scaled * Y_STD) + Y_MEAN

            # Ограничители (Sanity Check)
            # IV не может быть меньше 1% и больше 300% (как в JS)
            return float(max(0.01, min(3.0, final_iv)))

        except Exception as e:
            logger.error(f"AI Inference error: {e}")
            return current_iv

# Глобальный экземпляр
ai_service = AIPredictionService()
