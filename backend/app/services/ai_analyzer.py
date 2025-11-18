"""
AI Analyzer - Общий интерфейс для AI провайдеров
Поддержка Gemini и Claude
"""

import os
import time
from enum import Enum
from typing import Dict


class AIProvider(Enum):
    """Доступные AI провайдеры"""
    GEMINI = "gemini"
    CLAUDE = "claude"


class AIAnalyzer:
    """Универсальный анализатор с поддержкой разных AI"""
    
    def __init__(self):
        init_start = time.time()
        
        # Получить выбранный провайдер из .env
        provider_name = os.getenv("AI_PROVIDER", "gemini").lower()
        print(f"🔧 AI Provider selected: {provider_name}")
        
        try:
            self.provider = AIProvider(provider_name)
        except ValueError:
            raise ValueError(f"Неизвестный AI провайдер: {provider_name}. Используй 'gemini' или 'claude'")
        
        # Инициализировать соответствующий клиент
        client_start = time.time()
        if self.provider == AIProvider.GEMINI:
            from .gemini_client import GeminiClient
            self.client = GeminiClient()
            print(f"🟢 Gemini client initialized in {time.time() - client_start:.2f}s")
        elif self.provider == AIProvider.CLAUDE:
            from .claude_client import ClaudeClient
            self.client = ClaudeClient()
            print(f"🟣 Claude client initialized in {time.time() - client_start:.2f}s")
        
        print(f"🤖 AIAnalyzer total init time: {time.time() - init_start:.2f}s")
    
    def analyze(self, ticker: str, metrics: Dict) -> str:
        """
        Анализировать опционные данные через AI
        
        Args:
            ticker: Тикер акции
            metrics: Словарь с метриками (max_pain, put_call_ratio и т.д.)
            
        Returns:
            Текст анализа от AI
        """
        analyze_start = time.time()
        print(f"📡 Starting {self.provider.value} analysis for {ticker}")
        
        result = self.client.analyze(ticker, metrics)
        
        analyze_end = time.time()
        print(f"✅ {self.provider.value} analysis completed in {analyze_end - analyze_start:.2f}s")
        print(f"📝 Response length: {len(result) if result else 0} characters")
        
        return result
    
    def get_provider_name(self) -> str:
        """Получить название текущего провайдера"""
        return self.provider.value
