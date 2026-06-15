"""
Тесты эндпоинта общих «значений по умолчанию» стратегии «Север GPT».
ЗАЧЕМ: два независимых набора (акции / крипта) хранятся на сервере единым
JSON-документом; GET до посева отдаёт null, PUT заменяет целиком и возвращает
сохранённое.
"""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

BLOCK = {"plTolerance": 200, "margin": 4000, "marginTolerance": 500,
         "minStockMarginPct": 40, "calcDays": 30}
VALID = {"stocks": dict(BLOCK), "crypto": dict(BLOCK)}


def test_get_returns_envelope():
    r = client.get("/api/strategy-defaults/")
    assert r.status_code == 200
    assert r.json()["status"] == "success"
    assert "data" in r.json()


def test_put_then_get_roundtrip():
    payload = {
        "stocks": {**BLOCK, "margin": 7777},
        "crypto": {**BLOCK, "margin": 90000},
    }
    r = client.put("/api/strategy-defaults/", json=payload)
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["stocks"]["margin"] == 7777
    assert data["crypto"]["margin"] == 90000
    # Чтение возвращает то же, что записали
    r2 = client.get("/api/strategy-defaults/")
    assert r2.json()["data"]["stocks"]["margin"] == 7777
    assert r2.json()["data"]["crypto"]["margin"] == 90000


def test_put_rejects_pct_over_100():
    bad = {"stocks": {**BLOCK, "minStockMarginPct": 150}, "crypto": dict(BLOCK)}
    r = client.put("/api/strategy-defaults/", json=bad)
    assert r.status_code == 422


def test_put_rejects_missing_block():
    r = client.put("/api/strategy-defaults/", json={"stocks": dict(BLOCK)})
    assert r.status_code == 422
