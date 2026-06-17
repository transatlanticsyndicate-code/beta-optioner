"""
Тесты по-строчных эндпоинтов общей таблицы фьючерсов.
ЗАЧЕМ: проверяем, что create/update/delete работают по одной строке (ключ — ticker),
что оптимистичная блокировка ловит устаревший токен (409 stale), переименование на
занятый тикер отбивается (409 ticker_taken), удаление идемпотентно, а полный PUT
разрешён только на пустую таблицу (защита от «воскрешения» старыми клиентами).

Тесты используют тикер-песочницу TSTX, которого нет в заводском наборе, и
прибирают за собой (delete) — чтобы не засорять общую таблицу.
"""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

BASE = "/api/futures-settings/"
T = "TSTX"  # тестовый тикер вне заводского набора


def _cleanup(ticker=T):
    client.delete(f"{BASE}{ticker}")


def test_get_returns_envelope():
    r = client.get(BASE)
    assert r.status_code == 200
    assert r.json()["status"] == "success"
    assert isinstance(r.json()["data"], list)


def test_create_update_delete_lifecycle():
    _cleanup()
    # create
    r = client.post(BASE, json={"ticker": T, "name": "Test", "pointValue": 12.5})
    assert r.status_code == 200
    row = r.json()["data"]
    assert row["ticker"] == T
    assert row["pointValue"] == 12.5
    token = row["updatedAt"]

    # update с верным токеном
    r = client.put(f"{BASE}{T}", json={
        "ticker": T, "name": "Test 2", "pointValue": 99, "expectedUpdatedAt": token,
    })
    assert r.status_code == 200
    assert r.json()["data"]["name"] == "Test 2"
    assert r.json()["data"]["pointValue"] == 99

    # delete (идемпотентно: второй раз тоже success)
    assert client.delete(f"{BASE}{T}").status_code == 200
    assert client.delete(f"{BASE}{T}").status_code == 200


def test_create_duplicate_returns_409():
    # ES есть в заводском наборе → повторное создание = конфликт duplicate
    r = client.post(BASE, json={"ticker": "ES", "name": "x", "pointValue": 50})
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "duplicate"


def test_update_missing_returns_404():
    r = client.put(f"{BASE}NOSUCHTKR", json={"ticker": "NOSUCHTKR", "name": "x", "pointValue": 1})
    assert r.status_code == 404


def test_update_stale_token_returns_409():
    _cleanup()
    client.post(BASE, json={"ticker": T, "name": "Test", "pointValue": 1})
    try:
        r = client.put(f"{BASE}{T}", json={
            "ticker": T, "name": "y", "pointValue": 2, "expectedUpdatedAt": "1999-01-01T00:00:00",
        })
        assert r.status_code == 409
        assert r.json()["detail"]["code"] == "stale"
    finally:
        _cleanup()


def test_rename_onto_existing_returns_409():
    _cleanup()
    client.post(BASE, json={"ticker": T, "name": "Test", "pointValue": 1})
    try:
        # переименование TSTX → ES (занят) = конфликт ticker_taken
        r = client.put(f"{BASE}{T}", json={"ticker": "ES", "name": "Test", "pointValue": 1})
        assert r.status_code == 409
        assert r.json()["detail"]["code"] == "ticker_taken"
    finally:
        _cleanup()


def test_seed_put_rejected_when_nonempty():
    # Таблица засеяна на старте → полный PUT запрещён (защита от воскрешения).
    r = client.put(BASE, json={"futures": [{"ticker": "AAA", "name": "x", "pointValue": 1}]})
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "not_empty"
