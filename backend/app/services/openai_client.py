"""
Клиент OpenAI (ChatGPT) для стратегии «Север GPT».
ЗАЧЕМ: отправляет цепочку опционов + промпт и получает РОВНО две комбинации
в строгом структурированном формате (json_schema, strict). Цены/греки модель
не присылает — они подставляются из реальной цепочки на стороне валидатора.
"""
import os
import json
from openai import OpenAI


# Строгая JSON-схема ответа. ВАЖНО: в strict-режиме OpenAI поддерживает только
# подмножество JSON Schema — без minItems/minimum/maximum. Границы (qty>=1,
# stock_quantity>=0) проверяются и нормализуются в north_gpt_validator.
COMBINATION_SCHEMA = {
    "name": "north_gpt_combinations",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["with_asset", "options_only"],
        "properties": {
            "with_asset": {"$ref": "#/$defs/combo"},
            "options_only": {"$ref": "#/$defs/combo"},
        },
        "$defs": {
            "combo": {
                "type": "object",
                "additionalProperties": False,
                "required": ["legs", "stock_quantity", "rationale"],
                "properties": {
                    "legs": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["option_type", "strike", "quantity", "side"],
                            "properties": {
                                "option_type": {"type": "string", "enum": ["CALL", "PUT"]},
                                "strike": {"type": "number"},
                                "quantity": {"type": "integer"},
                                "side": {"type": "string", "enum": ["BUY"]},
                            },
                        },
                    },
                    "stock_quantity": {"type": "integer"},
                    "rationale": {"type": "string"},
                },
            }
        },
    },
}


class OpenAIClient:
    """Клиент для подбора комбинаций через ChatGPT."""

    def __init__(self):
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY не задан в .env")
        self.client = OpenAI(api_key=api_key)
        self.model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        self.temperature = float(os.getenv("OPENAI_TEMPERATURE", "0.2"))
        self.max_tokens = int(os.getenv("OPENAI_MAX_TOKENS", "1500"))
        # Глубина раздумий для рассуждающих моделей: minimal|low|medium|high.
        # По умолчанию НЕ задаём — используем дефолт модели (проверено: даёт
        # качественный подбор). Можно понизить через env ради скорости/цены.
        self.reasoning_effort = os.getenv("OPENAI_REASONING_EFFORT") or None
        self.system_prompt = self._load_template()

    def _load_template(self):
        path = os.path.join(os.path.dirname(__file__), "..", "prompts", "north_gpt_prompt.md")
        try:
            with open(path, "r", encoding="utf-8") as f:
                return f.read()
        except OSError:
            return ("Ты — опционный стратег. Верни РОВНО две комбинации (with_asset и "
                    "options_only) строго по JSON-схеме. Только покупка Call/Put, страйки — "
                    "только из присланной цепочки. Цены не присылай.")

    def _is_reasoning_model(self):
        """gpt-5+ и o-серия — рассуждающие модели с иным контрактом вызова."""
        m = (self.model or "").lower()
        return (m.startswith("o1") or m.startswith("o3") or m.startswith("o4")
                or m.startswith("gpt-5"))

    def select_combinations(self, user_prompt, constraints, chain):
        """
        Запросить у ChatGPT две комбинации.
        Возвращает кортеж (result, debug):
          result — dict {with_asset, options_only} (как прислала модель);
          debug  — {model, messages, rawResponse} — точный запрос и сырой ответ
                   (для служебного просмотра «что ушло / что вернулось»).
        """
        user_payload = json.dumps(
            {"constraints": constraints, "chain": chain}, ensure_ascii=False
        )
        system = self.system_prompt
        if user_prompt and user_prompt.strip():
            system = system + "\n\nДОПОЛНИТЕЛЬНЫЕ УКАЗАНИЯ ПОЛЬЗОВАТЕЛЯ:\n" + user_prompt.strip()
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user_payload},
        ]
        params = {
            "model": self.model,
            "response_format": {"type": "json_schema", "json_schema": COMBINATION_SCHEMA},
            "messages": messages,
        }
        if self._is_reasoning_model():
            # Рассуждающие модели (o-series, gpt-5+): свой лимит токенов (включает
            # «мысли»). Ставим с запасом — при малом лимите модель тратит всё на
            # рассуждение и возвращает пустой ответ. Платим только за фактические токены.
            params["max_completion_tokens"] = max(self.max_tokens, 16000)
            if self.reasoning_effort:
                params["reasoning_effort"] = self.reasoning_effort
        else:
            params["temperature"] = self.temperature
            params["max_tokens"] = self.max_tokens
        resp = self.client.chat.completions.create(**params)
        content = resp.choices[0].message.content
        debug = {"model": self.model, "messages": messages, "rawResponse": content}
        if not content:
            raise RuntimeError("ChatGPT вернул пустой ответ")
        return json.loads(content), debug

    def analyze(self, ticker, metrics):
        """Не поддерживается: клиент используется только для подбора «Север GPT»."""
        raise NotImplementedError(
            "OpenAIClient предназначен только для select_combinations (Север GPT)"
        )
