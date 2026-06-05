"""
Тест эндпоинта /api/north-gpt/select с подменённым (мок) клиентом OpenAI.
ЗАЧЕМ: проверяем сборку двух блоков и сверку с реальной ценой, без сети.
"""
from fastapi.testclient import TestClient
from app.main import app
import app.routers.north_gpt as ng

client = TestClient(app)


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
    monkeypatch.setattr(ng, "get_openai_client", lambda: FakeClient())
    r = client.post("/api/north-gpt/select", json=PAYLOAD)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "success"
    assert data["withAsset"]["positions"][0]["premium"] == 5.2  # реальный ask из цепочки
    assert data["withAsset"]["qtyStock"] == 100
    assert data["withAsset"]["kind"] == "withStock"
    assert data["withAsset"]["rationale"] == "rA"
    assert data["optionsOnly"]["positions"][0]["type"] == "PUT"
    assert data["optionsOnly"]["kind"] == "optionsOnly"


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
    r = client.post("/api/north-gpt/select", json=PAYLOAD)
    data = r.json()
    assert data["status"] == "success"
    assert "error" in data["withAsset"]  # выдуманный страйк → блок с ошибкой
    assert data["optionsOnly"]["positions"][0]["type"] == "PUT"  # второй блок валиден


def test_select_openai_failure_returns_friendly_error(monkeypatch):
    class BrokenClient:
        def select_combinations(self, *a, **k):
            raise RuntimeError("OPENAI_API_KEY не задан в .env")
    monkeypatch.setattr(ng, "get_openai_client", lambda: BrokenClient())
    r = client.post("/api/north-gpt/select", json=PAYLOAD)
    data = r.json()
    assert data["status"] == "error"
    assert "ChatGPT" in data["error"]
