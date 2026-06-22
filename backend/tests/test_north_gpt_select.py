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
    def select_combinations(self, user_prompt, constraints, chain):
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
        def select_combinations(self, user_prompt, constraints, chain):
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
        def select_combinations(self, user_prompt, constraints, chain):
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
        def select_combinations(self, user_prompt, constraints, chain):
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
        def select_combinations(self, user_prompt, constraints, chain):
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
        def select_combinations(self, user_prompt, constraints, chain):
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


def test_select_openai_failure_returns_friendly_error(monkeypatch):
    class BrokenClient:
        def select_combinations(self, *a, **k):
            raise RuntimeError("OPENAI_API_KEY не задан в .env")
    monkeypatch.setattr(ng, "get_openai_client", lambda: BrokenClient())
    data = post_and_wait(PAYLOAD)
    assert data["status"] == "error"
    assert "ChatGPT" in data["error"]
