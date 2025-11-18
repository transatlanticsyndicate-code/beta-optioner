"""
Anthropic Claude AI Client
Анализ опционных данных через Claude (опционально)
"""

import os
from anthropic import Anthropic
from typing import Dict


class ClaudeClient:
    """Клиент для работы с Anthropic Claude AI"""
    
    def __init__(self):
        api_key = os.getenv("CLAUDE_API_KEY")
        if not api_key:
            raise ValueError("CLAUDE_API_KEY не найден в .env файле")
        
        # Получить параметры из .env
        self.model = os.getenv("CLAUDE_MODEL", "claude-3-5-haiku-20241022")
        self.temperature = float(os.getenv("CLAUDE_TEMPERATURE", "0.3"))
        self.top_p = float(os.getenv("CLAUDE_TOP_P", "0.8"))
        # Claude Haiku максимум 8192 токена
        max_tokens_env = int(os.getenv("CLAUDE_MAX_TOKENS", "4096"))
        self.max_tokens = min(max_tokens_env, 8192)  # Ограничиваем максимумом модели
        
        # Создать клиент
        self.client = Anthropic(api_key=api_key)
    
    def analyze(self, ticker: str, metrics: Dict) -> str:
        """
        Анализировать опционные данные
        
        Args:
            ticker: Тикер акции
            metrics: Словарь с метриками
            
        Returns:
            Текст анализа от Claude
        """
        try:
            # Извлечь данные
            max_pain = metrics.get('max_pain', 0)
            pc_ratio_dict = metrics.get('put_call_ratio', {})
            pc_ratio = pc_ratio_dict.get('volume_ratio', 0)
            current_price = metrics.get('current_price', 0)
            gex = metrics.get('gamma_exposure', {}).get('net_gamma', 0)
            
            # Детальный промпт с пояснением данных
            levels = metrics.get('key_levels', {})
            support_count = len(levels.get('support_levels', []))
            resistance_count = len(levels.get('resistance_levels', []))
            total_oi = pc_ratio_dict.get('total_call_oi', 0) + pc_ratio_dict.get('total_put_oi', 0)
            
            # Загрузить промпт из файла
            prompt_template = self._load_prompt_from_file()
            
            # Форматировать уровни поддержки и сопротивления
            support_levels = levels.get('support_levels', [])[:5]
            resistance_levels = levels.get('resistance_levels', [])[:5]
            
            support_text = "\n".join([f"${s['strike']:.2f} (OI: {s['oi']:,})" for s in support_levels]) if support_levels else "Нет данных"
            resistance_text = "\n".join([f"${r['strike']:.2f} (OI: {r['oi']:,})" for r in resistance_levels]) if resistance_levels else "Нет данных"
            
            # Получить дополнительные метрики
            days_to_expiry = metrics.get('days_to_expiry', 0)
            delta_dist = metrics.get('delta_distribution', {})
            delta_text = f"Net Delta: {delta_dist.get('net_delta', 0):,.0f} (Call: {delta_dist.get('total_call_delta', 0):,.0f}, Put: {delta_dist.get('total_put_delta', 0):,.0f})"
            
            # Рассчитать Volume/OI ratio
            total_volume = pc_ratio_dict.get('total_call_volume', 0) + pc_ratio_dict.get('total_put_volume', 0)
            volume_oi_ratio = total_volume / total_oi if total_oi > 0 else 0
            
            # Получить IV Rank
            iv_rank_data = metrics.get('iv_rank')
            if iv_rank_data:
                iv_rank_text = f"{iv_rank_data['iv_rank']}% (текущая IV: {iv_rank_data['current_iv']}%, диапазон 52w: {iv_rank_data['min_iv_52w']}-{iv_rank_data['max_iv_52w']}%)"
            else:
                iv_rank_text = "N/A"
            
            # Заполнить переменные
            formatted_prompt = prompt_template.format(
                ticker=ticker,
                current_price=f"${current_price:.2f}",
                max_pain=f"${max_pain:.2f}",
                put_call_ratio=f"{pc_ratio:.2f}",
                gamma_exposure=f"{gex:,.0f}",
                support_count=support_count,
                resistance_count=resistance_count,
                total_oi=f"{total_oi:,}",
                iv_rank=iv_rank_text,
                days_to_expiry=str(days_to_expiry),
                volume=f"{total_volume:,}",
                ratio=f"{volume_oi_ratio:.2f}",
                support_levels=support_text,
                resistance_levels=resistance_text,
                delta_distribution=delta_text
            )
            
            # Отправить в Claude
            response = self.client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                temperature=self.temperature,
                top_p=self.top_p,
                messages=[
                    {"role": "user", "content": formatted_prompt}
                ]
            )
            
            # Получить текст из ответа
            if response.content and len(response.content) > 0:
                return response.content[0].text
            else:
                raise Exception("Claude не вернул текст в ответе")
            
        except Exception as e:
            raise Exception(f"Ошибка анализа Claude: {str(e)}")
    
    def _load_prompt_from_file(self) -> str:
        """
        Загрузить промпт из файла
        
        Returns:
            Текст промпта
        """
        prompt_path = os.path.join(
            os.path.dirname(__file__),
            "..",
            "prompts",
            "options_analysis_prompt.md"
        )
        
        try:
            with open(prompt_path, 'r', encoding='utf-8') as f:
                return f.read()
        except FileNotFoundError:
            # Fallback на простой промпт если файл не найден
            return """Технический обзор опционного рынка для {ticker}

ДАННЫЕ:
• Текущая цена: {current_price}
• Max Pain: {max_pain}
• Put/Call Ratio: {put_call_ratio}
• Gamma Exposure: {gamma_exposure}

Напиши краткий технический обзор на русском языке (3-4 абзаца).
Используй Markdown для форматирования.

Disclaimer: Образовательный материал, не финансовый совет."""
