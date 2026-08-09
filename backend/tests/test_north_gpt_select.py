"""
Тест эндпоинта /api/north-gpt/select с подменённым (мок) клиентом OpenAI.
ЗАЧЕМ: проверяем сборку двух блоков и сверку с реальной ценой, без сети.
"""
import time
from fastapi.testclient import TestClient
from app.main import app
import app.routers.north_gpt as ng

client = TestClient(app)


def post_and_wait(payload, tries=300, delay=0.02):
    """POST /select запускает фоновую задачу; опрашиваем результат до готовности."""
    r = client.post("/api/north-gpt/select", json=payload)
    j = r.json()
    assert j["status"] == "pending", j
    job_id = j["jobId"]
    for _ in range(tries):
        rr = client.get(f"/api/north-gpt/select/{job_id}").json()
        if rr["status"] != "pending":
            return rr
        time.sleep(delay)
    raise AssertionError("Фоновая задача не завершилась за отведённое время")


class FakeClient:
    def select_combinations(self, user_prompt, constraints, chain, with_asset=True, call_only=False):
        return {
            "with_asset": {
                "legs": [{"option_type": "CALL", "strike": 150.0, "quantity": 1, "side": "BUY"}],
                "stock_quantity": 100, "rationale": "rA",
            },
            "options_only": {
                "legs": [{"option_type": "PUT", "strike": 140.0, "quantity": 1, "side": "BUY"}],
                "stock_quantity": 0, "rationale": "rO",
            },
        }


PAYLOAD = {
    "params": {"expirationDate": "2026-07-17", "callStrikeMin": 145, "callStrikeMax": 160,
               "putStrikeMin": 130, "putStrikeMax": 145, "margin": 6000, "marginTolerance": 500,
               "plTolerance": 200, "minStockMarginPct": 40, "topPrice": 190, "bottomPrice": 120,
               "calcDate": "2026-07-05"},
    "prompt": "Подбери",
    "context": {"entryPrice": 145.0, "assetQuantity": 100, "leverage": 1.0, "currentPrice": 150.0,
                "calculatorMode": "stocks", "dividendYield": 0, "ticker": "AAPL"},
    "chain": [
        {"type": "CALL", "strike": 150.0, "date": "2026-07-17", "bid": 5.0, "ask": 5.2,
         "impliedVolatility": 0.3, "delta": 0.5, "gamma": 0.02, "theta": -0.05, "vega": 0.1, "volume": 100},
        {"type": "PUT", "strike": 140.0, "date": "2026-07-17", "bid": 4.0, "ask": 4.3,
         "impliedVolatility": 0.32, "delta": -0.4, "gamma": 0.02, "theta": -0.04, "vega": 0.1, "volume": 80},
    ],
}


def test_select_returns_two_validated_blocks(monkeypatch):
    captured = {}

    class CapturingClient(FakeClient):
        def select_combinations(self, user_prompt, constraints, chain, with_asset=True, call_only=False):
            captured["constraints"] = constraints
            captured["chain"] = chain
            return super().select_combinations(user_prompt, constraints, chain)

    monkeypatch.setattr(ng, "get_openai_client", lambda: CapturingClient())
    data = post_and_wait(PAYLOAD)
    assert data["status"] == "success"
    assert data["withAsset"]["positions"][0]["premium"] == 5.2  # реальный ask из цепочки
    assert data["withAsset"]["qtyStock"] == 100
    assert data["withAsset"]["kind"] == "withStock"
    assert data["withAsset"]["rationale"] == "rA"
    assert data["optionsOnly"]["positions"][0]["type"] == "PUT"
    assert data["optionsOnly"]["kind"] == "optionsOnly"
    # Позиционный контекст проброшен в модель (вход, текущая цена, плечо).
    assert captured["constraints"]["entryPrice"] == 145.0
    assert captured["constraints"]["currentPrice"] == 150.0
    assert captured["constraints"]["leverage"] == 1.0
    # Тикер НЕ уходит в модель (ни в constraints, ни в компактной цепочке).
    assert "ticker" not in captured["constraints"]
    # Цепочка для модели — сжатые поля + готовые plTop/plBottom + cost.
    assert set(captured["chain"][0].keys()) == {"type", "strike", "bid", "ask", "iv", "delta", "plTop", "plBottom", "cost"}
    # Стоимость 1 контракта = ask × множитель (акции = 100).
    assert captured["chain"][0]["cost"] == round(5.2 * 100)
    # Базис маржи актива для акций: цена/плечо и множитель P&L = 1.
    assert captured["constraints"]["assetMarginPerUnit"] == 145.0 / 1.0
    assert captured["constraints"]["assetPlMultiplier"] == 1


def test_select_futures_margin_basis_passed_to_model(monkeypatch):
    """Фьючерсы: модель получает ГОТОВУЮ стоимость контракта (ask × стоимость пункта)
    и базис залога актива (маржа за контракт), иначе угадывает множитель и промахивается."""
    captured = {}

    class CapturingClient(FakeClient):
        def select_combinations(self, user_prompt, constraints, chain, with_asset=True, call_only=False):
            captured["constraints"] = constraints
            captured["chain"] = chain
            return super().select_combinations(user_prompt, constraints, chain)

    payload = {
        **PAYLOAD,
        "context": {**PAYLOAD["context"], "calculatorMode": "futures",
                    "pointValue": 50, "marginPerContract": 12000, "ticker": "ES"},
    }
    monkeypatch.setattr(ng, "get_openai_client", lambda: CapturingClient())
    data = post_and_wait(payload)
    assert data["status"] == "success"
    # cost = ask × стоимость пункта (50), а не × 100.
    assert captured["chain"][0]["cost"] == round(5.2 * 50)
    # Залог под 1 контракт актива = маржа за контракт; P&L актива × стоимость пункта.
    assert captured["constraints"]["assetMarginPerUnit"] == 12000
    assert captured["constraints"]["assetPlMultiplier"] == 50


def test_select_hallucinated_strike_becomes_block_error(monkeypatch):
    class HallucinatingClient:
        def select_combinations(self, user_prompt, constraints, chain, with_asset=True, call_only=False):
            return {
                "with_asset": {"legs": [{"option_type": "CALL", "strike": 777.0, "quantity": 1, "side": "BUY"}],
                               "stock_quantity": 100, "rationale": "x"},
                "options_only": {"legs": [{"option_type": "PUT", "strike": 140.0, "quantity": 1, "side": "BUY"}],
                                 "stock_quantity": 0, "rationale": "y"},
            }
    monkeypatch.setattr(ng, "get_openai_client", lambda: HallucinatingClient())
    data = post_and_wait(PAYLOAD)
    assert data["status"] == "success"
    assert "error" in data["withAsset"]  # выдуманный страйк → блок с ошибкой
    assert data["optionsOnly"]["positions"][0]["type"] == "PUT"  # второй блок валиден


def test_fill_prompt_placeholders():
    c = {"entryPrice": 55, "topPrice": 70, "bottomPrice": 45, "margin": 6000,
         "marginTolerance": 500, "plTolerance": 200, "leverage": 1, "currentPrice": 58}
    out = ng._fill_prompt_placeholders(
        "Вход {вход}, цель {цель_верх}, низ {цель_низ}, маржин {маржин}+/-{допуск_маржин}, низ +/-{допуск_низ}, плечо {плечо}", c)
    assert "Вход 55" in out
    assert "цель 70" in out
    assert "низ 45" in out
    assert "маржин 6000+/-500" in out
    assert "+/-200" in out
    assert "плечо 1" in out
    assert "{" not in out  # все плейсхолдеры заменены


def test_select_forwards_debug(monkeypatch):
    class DebugClient:
        def select_combinations(self, user_prompt, constraints, chain, with_asset=True, call_only=False):
            return (
                {
                    "with_asset": {"legs": [{"option_type": "CALL", "strike": 150.0, "quantity": 1, "side": "BUY"}],
                                   "stock_quantity": 10, "rationale": "x"},
                    "options_only": {"legs": [{"option_type": "PUT", "strike": 140.0, "quantity": 1, "side": "BUY"}],
                                     "stock_quantity": 0, "rationale": "y"},
                },
                {"model": "gpt-test",
                 "messages": [{"role": "system", "content": "S"}, {"role": "user", "content": "U"}],
                 "rawResponse": "{raw}"},
            )

    monkeypatch.setattr(ng, "get_openai_client", lambda: DebugClient())
    data = post_and_wait(PAYLOAD)
    assert data["status"] == "success"
    assert data["debug"]["model"] == "gpt-test"
    assert data["debug"]["rawResponse"] == "{raw}"
    assert len(data["debug"]["messages"]) == 2


def test_select_dual_expiration_returns_two_groups(monkeypatch):
    """Двойная экспирация: две группы (primary/alternative), каждая со своими
    реальными ценами из цепочки своей даты."""
    # Цепочка с двумя датами; цены второй даты отличаются — так проверяем, что
    # каждая группа собрана из строк именно своей экспирации.
    payload = {
        **PAYLOAD,
        "params": {**PAYLOAD["params"], "alternativeExpirationDate": "2026-08-21"},
        "chain": [
            *PAYLOAD["chain"],
            {"type": "CALL", "strike": 150.0, "date": "2026-08-21", "bid": 7.0, "ask": 7.2,
             "impliedVolatility": 0.3, "delta": 0.5, "gamma": 0.02, "theta": -0.05, "vega": 0.1, "volume": 100},
            {"type": "PUT", "strike": 140.0, "date": "2026-08-21", "bid": 6.0, "ask": 6.3,
             "impliedVolatility": 0.32, "delta": -0.4, "gamma": 0.02, "theta": -0.04, "vega": 0.1, "volume": 80},
        ],
    }
    seen = []

    class PerExpirationClient(FakeClient):
        def select_combinations(self, user_prompt, constraints, chain, with_asset=True, call_only=False):
            seen.append(constraints["expirationDate"])
            return super().select_combinations(user_prompt, constraints, chain)

    monkeypatch.setattr(ng, "get_openai_client", lambda: PerExpirationClient())
    data = post_and_wait(payload)
    assert data["status"] == "success"
    assert data["dual"] is True
    assert data["primary"]["expirationDate"] == "2026-07-17"
    assert data["alternative"]["expirationDate"] == "2026-08-21"
    # Каждая группа берёт цены из цепочки своей даты (ask 5.2 vs 7.2).
    assert data["primary"]["withAsset"]["positions"][0]["premium"] == 5.2
    assert data["alternative"]["withAsset"]["positions"][0]["premium"] == 7.2
    # Модель вызвана по разу на каждую дату, каждый со своей expirationDate.
    assert set(seen) == {"2026-07-17", "2026-08-21"}
    # Отладка содержит обе ветки.
    assert "primary" in data["debug"] and "alternative" in data["debug"]


def test_select_single_mode_unchanged_when_alt_equals_main(monkeypatch):
    """Альтернативная == основной → одиночный режим (прежняя форма ответа)."""
    payload = {**PAYLOAD, "params": {**PAYLOAD["params"], "alternativeExpirationDate": "2026-07-17"}}
    monkeypatch.setattr(ng, "get_openai_client", lambda: FakeClient())
    data = post_and_wait(payload)
    assert data["status"] == "success"
    assert "dual" not in data
    assert data["withAsset"]["positions"][0]["premium"] == 5.2


def test_with_asset_disabled_asks_model_only_for_options_only(monkeypatch):
    """Галочка «актив + опционы» снята → модель просят собрать ТОЛЬКО опционную
    конструкцию: экономим токены, а не прячем готовый результат на фронте."""
    seen = {}

    class OnlyOptionsClient:
        def select_combinations(self, user_prompt, constraints, chain, with_asset=True, call_only=False):
            seen["with_asset"] = with_asset
            seen["system"] = user_prompt
            seen["constraints"] = constraints
            # Модель по схеме OPTIONS_ONLY_SCHEMA присылает один ключ.
            return {
                "options_only": {
                    "legs": [{"option_type": "PUT", "strike": 140.0, "quantity": 1, "side": "BUY"}],
                    "stock_quantity": 0, "rationale": "только опционы",
                },
            }

    monkeypatch.setattr(ng, "get_openai_client", lambda: OnlyOptionsClient())
    payload = {**PAYLOAD, "params": {**PAYLOAD["params"], "withAssetEnabled": False}}
    data = post_and_wait(payload)
    assert data["status"] == "success"
    # Модель вызвана в режиме «только опционы».
    assert seen["with_asset"] is False
    # Блок с активом не собирается вовсе.
    assert data["withAsset"] is None
    assert data["optionsOnly"]["positions"][0]["type"] == "PUT"
    assert data["optionsOnly"]["kind"] == "optionsOnly"
    # Служебный флаг и неактуальный порог доли акции модели не уходят.
    assert "withAssetEnabled" not in seen["constraints"]
    assert "minStockMarginPct" not in seen["constraints"]


def test_with_asset_enabled_by_default_keeps_both(monkeypatch):
    """Без флага (старый фронтенд) поведение прежнее — обе комбинации."""
    seen = {}

    class CapturingClient(FakeClient):
        def select_combinations(self, user_prompt, constraints, chain, with_asset=True, call_only=False):
            seen["with_asset"] = with_asset
            return super().select_combinations(user_prompt, constraints, chain)

    monkeypatch.setattr(ng, "get_openai_client", lambda: CapturingClient())
    data = post_and_wait(PAYLOAD)
    assert data["status"] == "success"
    assert seen["with_asset"] is True
    assert data["withAsset"]["kind"] == "withStock"
    assert data["optionsOnly"]["kind"] == "optionsOnly"


def test_without_put_asks_model_for_calls_only(monkeypatch):
    """Галочка «Без Put»: модель не видит Put ни в цепочке, ни в условиях,
    и получает флаг call_only — вернуть Put она физически не может."""
    seen = {}

    class CallOnlyClient:
        def select_combinations(self, user_prompt, constraints, chain, with_asset=True, call_only=False):
            seen["call_only"] = call_only
            seen["constraints"] = constraints
            seen["chain"] = chain
            seen["prompt"] = user_prompt
            return {
                "with_asset": {"legs": [{"option_type": "CALL", "strike": 150.0, "quantity": 1, "side": "BUY"}],
                               "stock_quantity": 100, "rationale": "rA"},
                "options_only": {"legs": [{"option_type": "CALL", "strike": 150.0, "quantity": 2, "side": "BUY"}],
                                 "stock_quantity": 0, "rationale": "чистый Call"},
            }

    monkeypatch.setattr(ng, "get_openai_client", lambda: CallOnlyClient())
    payload = {**PAYLOAD, "params": {**PAYLOAD["params"], "withoutPut": True,
                                     "putStrikeMin": None, "putStrikeMax": None,
                                     "plTolerance": None}}
    data = post_and_wait(payload)
    assert data["status"] == "success"
    assert seen["call_only"] is True
    # В цепочке для модели только Call.
    assert all(row["type"] == "CALL" for row in seen["chain"])
    # Ни диапазона Put, ни допуска по низу, ни служебного флага модели не уходит.
    for key in ("putStrikeMin", "putStrikeMax", "plTolerance", "withoutPut"):
        assert key not in seen["constraints"]
    assert data["optionsOnly"]["positions"][0]["type"] == "CALL"
    assert data["optionsOnly"]["puts"] == []


def test_without_put_rejects_put_leg_from_model(monkeypatch):
    """Даже если модель всё-таки прислала Put — нога отбраковывается валидатором."""
    class SneakyPutClient:
        def select_combinations(self, user_prompt, constraints, chain, with_asset=True, call_only=False):
            return {
                "with_asset": {"legs": [{"option_type": "CALL", "strike": 150.0, "quantity": 1, "side": "BUY"}],
                               "stock_quantity": 100, "rationale": "x"},
                "options_only": {"legs": [{"option_type": "PUT", "strike": 140.0, "quantity": 1, "side": "BUY"}],
                                 "stock_quantity": 0, "rationale": "y"},
            }

    monkeypatch.setattr(ng, "get_openai_client", lambda: SneakyPutClient())
    payload = {**PAYLOAD, "params": {**PAYLOAD["params"], "withoutPut": True,
                                     "putStrikeMin": None, "putStrikeMax": None}}
    data = post_and_wait(payload)
    assert data["status"] == "success"
    assert "error" in data["optionsOnly"]  # Put в сделку не попал
    assert data["withAsset"]["positions"][0]["type"] == "CALL"


def test_fill_prompt_placeholders_without_put():
    """Без Put вместо чисел подставляется словесное пояснение, а не пустая строка."""
    c = {"entryPrice": 55, "topPrice": 70, "bottomPrice": 45}
    out = ng._fill_prompt_placeholders(
        "страйки пут {страйки_пут}, допуск низ {допуск_низ}", c, True)
    assert "страйки пут не используются" in out
    assert "допуск низ не задан" in out


def test_openai_schema_call_only_forbids_put():
    """В режиме «без Put» тип ноги в схеме — только CALL."""
    from app.services.openai_client import build_schema
    call_only = build_schema(with_asset=False, call_only=True)
    leg = call_only["schema"]["$defs"]["combo"]["properties"]["legs"]["items"]
    assert leg["properties"]["option_type"]["enum"] == ["CALL"]
    normal = build_schema(with_asset=False, call_only=False)
    assert normal["schema"]["$defs"]["combo"]["properties"]["legs"]["items"]["properties"]["option_type"]["enum"] == ["CALL", "PUT"]


def test_openai_client_picks_schema_by_with_asset_flag():
    """Схема ответа и задание согласованы с флагом (без сети)."""
    from app.services.openai_client import COMBINATION_SCHEMA, OPTIONS_ONLY_SCHEMA
    assert COMBINATION_SCHEMA["schema"]["required"] == ["with_asset", "options_only"]
    assert OPTIONS_ONLY_SCHEMA["schema"]["required"] == ["options_only"]
    # В «только опционы» схеме ключа with_asset нет вовсе — модель его не вернёт.
    assert "with_asset" not in OPTIONS_ONLY_SCHEMA["schema"]["properties"]


def test_select_openai_failure_returns_friendly_error(monkeypatch):
    class BrokenClient:
        def select_combinations(self, *a, **k):
            raise RuntimeError("OPENAI_API_KEY не задан в .env")
    monkeypatch.setattr(ng, "get_openai_client", lambda: BrokenClient())
    data = post_and_wait(PAYLOAD)
    assert data["status"] == "error"
    assert "ChatGPT" in data["error"]
