"""
Google Gemini AI Client
Анализ опционных данных через Gemini
"""

import os
import time
import google.generativeai as genai
from typing import Dict


class GeminiClient:
    """Клиент для работы с Google Gemini AI"""
    
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY не найден в .env файле")
        
        # Настроить Gemini
        genai.configure(api_key=api_key)
        
        # Получить параметры из .env (с дефолтными значениями)
        model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
        temperature = float(os.getenv("GEMINI_TEMPERATURE", "0.3"))
        top_p = float(os.getenv("GEMINI_TOP_P", "0.8"))
        top_k = int(os.getenv("GEMINI_TOP_K", "40"))
        max_tokens = int(os.getenv("GEMINI_MAX_TOKENS", "2048"))
        
        # Создать модель с параметрами из .env
        from google.generativeai.types import HarmCategory, HarmBlockThreshold
        
        self.model = genai.GenerativeModel(
            model_name,
            generation_config={
                'temperature': temperature,
                'top_p': top_p,
                'top_k': top_k,
                'max_output_tokens': max_tokens,
            },
            safety_settings={
                HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
                HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
                HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
                HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
            }
        )
    
    def analyze(self, ticker: str, metrics: Dict) -> str:
        """
        Анализировать опционные данные
        
        Args:
            ticker: Тикер акции
            metrics: Словарь с метриками
            
        Returns:
            Текст анализа от Gemini
        """
        try:
            data_start = time.time()
            
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
            
            data_end = time.time()
            print(f"📊 Data extraction took: {data_end - data_start:.3f}s")
            
            # Загрузить промпт из файла
            prompt_start = time.time()
            prompt_template = self._load_prompt_from_file()
            prompt_load_end = time.time()
            print(f"📄 Prompt loading took: {prompt_load_end - prompt_start:.3f}s")
            
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
            format_start = time.time()
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
            format_end = time.time()
            print(f"🔧 Prompt formatting took: {format_end - format_start:.3f}s")
            print(f"📏 Final prompt length: {len(formatted_prompt)} characters")
            
            # Отправить в Gemini
            gemini_start = time.time()
            print(f"🚀 Sending request to Gemini API...")
            response = self.model.generate_content(formatted_prompt)
            gemini_end = time.time()
            print(f"🎯 Gemini API response received in: {gemini_end - gemini_start:.2f}s")
            
            # Попробовать получить текст
            try:
                return response.text
            except ValueError:
                # Если response.text не работает, попробовать через candidates
                if response.candidates and len(response.candidates) > 0:
                    candidate = response.candidates[0]
                    if candidate.content and candidate.content.parts:
                        return candidate.content.parts[0].text
                
                # Если ничего не помогло
                raise Exception(f"Gemini не вернул текст. Finish reason: {response.candidates[0].finish_reason if response.candidates else 'unknown'}")
            
        except Exception as e:
            raise Exception(f"Ошибка анализа Gemini: {str(e)}")
    
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
    
    def _load_prompt(self) -> str:
        """Загрузить промпт из файла"""
        prompt_path = os.path.join(
            os.path.dirname(__file__),
            '..',
            'prompts',
            'analysis_v1.txt'
        )
        
        with open(prompt_path, 'r', encoding='utf-8') as f:
            return f.read()
    
    def _format_prompt(self, template: str, ticker: str, metrics: Dict) -> str:
        """
        Форматировать промпт с данными
        
        Args:
            template: Шаблон промпта
            ticker: Тикер акции
            metrics: Метрики для анализа
            
        Returns:
            Отформатированный промпт
        """
        # Извлечь данные из metrics
        max_pain = metrics.get('max_pain', 0)
        pc_ratio = metrics.get('put_call_ratio', {})
        gex = metrics.get('gamma_exposure', {})
        levels = metrics.get('key_levels', {})
        current_price = metrics.get('current_price', 0)
        
        # Форматировать топ OI страйки с деталями
        support = levels.get('support_levels', [])[:5]
        resistance = levels.get('resistance_levels', [])[:5]
        
        top_oi_strikes_list = []
        
        if support:
            top_oi_strikes_list.append("Поддержка (PUT):")
            for s in support:
                distance = ((current_price - s['strike']) / current_price * 100) if current_price > 0 else 0
                top_oi_strikes_list.append(f"  ${s['strike']:.2f} (OI: {s['oi']:,}, -{distance:.1f}%)")
        
        if resistance:
            top_oi_strikes_list.append("Сопротивление (CALL):")
            for r in resistance:
                distance = ((r['strike'] - current_price) / current_price * 100) if current_price > 0 else 0
                top_oi_strikes_list.append(f"  ${r['strike']:.2f} (OI: {r['oi']:,}, +{distance:.1f}%)")
        
        top_oi_strikes_formatted = "\n".join(top_oi_strikes_list) if top_oi_strikes_list else "Данные по ключевым страйкам недоступны"
        
        # Дополнительная информация
        distance_to_max_pain = abs(current_price - max_pain)
        distance_pct = (distance_to_max_pain / current_price * 100) if current_price > 0 else 0
        
        # Заполнить шаблон
        try:
            formatted = template.format(
                symbol=ticker,
                current_price=f"${current_price:.2f}",
                max_pain=f"${max_pain:.2f} (расстояние: ${distance_to_max_pain:.2f} или {distance_pct:.1f}%)",
                put_call_ratio=f"{pc_ratio.get('volume_ratio', 0):.2f} (Calls: {pc_ratio.get('total_call_volume', 0):,}, Puts: {pc_ratio.get('total_put_volume', 0):,})",
                gamma_exposure=f"{gex.get('net_gamma', 0):,.0f} (Call GEX: {gex.get('call_gamma', 0):,.0f}, Put GEX: {gex.get('put_gamma', 0):,.0f})",
                top_oi_strikes=top_oi_strikes_formatted
            )
        except KeyError as e:
            # Если не хватает переменных, создать простой промпт
            formatted = f"""
Проанализируй опционы {ticker}:
- Цена: {current_price:.2f}
- Max Pain: {max_pain:.2f}
- Put/Call Ratio: {pc_ratio.get('volume_ratio', 0):.2f}

Дай краткий анализ на русском.
"""
        
        return formatted
