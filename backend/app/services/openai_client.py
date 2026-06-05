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

    def select_combinations(self, user_prompt, constraints, chain):
        """
        Запросить у ChatGPT две комбинации.
        Возвращает dict {with_asset, options_only} (как прислала модель).
        """
        user_payload = json.dumps(
            {"constraints": constraints, "chain": chain}, ensure_ascii=False
        )
        system = self.system_prompt
        if user_prompt and user_prompt.strip():
            system = system + "\n\nДОПОЛНИТЕЛЬНЫЕ УКАЗАНИЯ ПОЛЬЗОВАТЕЛЯ:\n" + user_prompt.strip()
        resp = self.client.chat.completions.create(
            model=self.model,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
            response_format={"type": "json_schema", "json_schema": COMBINATION_SCHEMA},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_payload},
            ],
        )
        content = resp.choices[0].message.content
        if not content:
            raise RuntimeError("ChatGPT вернул пустой ответ")
        return json.loads(content)

    def analyze(self, ticker, metrics):
        """Не поддерживается: клиент используется только для подбора «Север GPT»."""
        raise NotImplementedError(
            "OpenAIClient предназначен только для select_combinations (Север GPT)"
        )
