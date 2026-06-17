"""
Тесты по-строчных эндпоинтов общей таблицы ETF.
ЗАЧЕМ: те же гарантии, что и у фьючерсов — create/update/delete по одной строке,
оптимистичная блокировка (409 stale), переименование на занятый тикер (409
ticker_taken), идемпотентное удаление, seed-only PUT.

Песочница: тикер TSTETF (вне заводского набора), прибираем за собой.
"""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

BASE = "/api/etf-settings/"
T = "TSTETF"


def _cleanup(ticker=T):
    client.delete(f"{BASE}{ticker}")


def test_get_returns_envelope():
    r = client.get(BASE)
    assert r.status_code == 200
    assert isinstance(r.json()["data"], list)


def test_create_update_delete_lifecycle():
    _cleanup()
    r = client.post(BASE, json={"ticker": T, "name": "Test Fund"})
    assert r.status_code == 200
    token = r.json()["data"]["updatedAt"]

    r = client.put(f"{BASE}{T}", json={"ticker": T, "name": "Renamed Fund", "expectedUpdatedAt": token})
    assert r.status_code == 200
    assert r.json()["data"]["name"] == "Renamed Fund"

    assert client.delete(f"{BASE}{T}").status_code == 200
    assert client.delete(f"{BASE}{T}").status_code == 200  # идемпотентно


def test_create_duplicate_returns_409():
    # SPY засеян на старте
    r = client.post(BASE, json={"ticker": "SPY", "name": "x"})
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "duplicate"


def test_update_stale_token_returns_409():
    _cleanup()
    client.post(BASE, json={"ticker": T, "name": "Test"})
    try:
        r = client.put(f"{BASE}{T}", json={
            "ticker": T, "name": "y", "expectedUpdatedAt": "1999-01-01T00:00:00",
        })
        assert r.status_code == 409
        assert r.json()["detail"]["code"] == "stale"
    finally:
        _cleanup()


def test_rename_onto_existing_returns_409():
    _cleanup()
    client.post(BASE, json={"ticker": T, "name": "Test"})
    try:
        r = client.put(f"{BASE}{T}", json={"ticker": "SPY", "name": "Test"})
        assert r.status_code == 409
        assert r.json()["detail"]["code"] == "ticker_taken"
    finally:
        _cleanup()


def test_seed_put_rejected_when_nonempty():
    r = client.put(BASE, json={"etfs": [{"ticker": "AAA", "name": "x"}]})
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "not_empty"
