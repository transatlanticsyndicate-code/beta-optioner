"""
Тесты CRUD библиотеки промптов стратегии «Север GPT».
ЗАЧЕМ: промпты общие (без авторизации); «последний использованный» — первым в списке.
"""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_prompt_crud_lifecycle():
    # создать
    r = client.post("/api/north-gpt/prompts",
                    json={"name": "Базовый", "text": "Подбери защитный воротник"})
    assert r.status_code == 200
    pid = r.json()["data"]["id"]
    # список содержит созданный
    r = client.get("/api/north-gpt/prompts")
    assert any(p["id"] == pid for p in r.json()["data"])
    # обновить (переименование + текст)
    r = client.put(f"/api/north-gpt/prompts/{pid}",
                   json={"name": "Воротник", "text": "новый текст"})
    assert r.json()["data"]["name"] == "Воротник"
    assert r.json()["data"]["text"] == "новый текст"
    # удалить
    r = client.delete(f"/api/north-gpt/prompts/{pid}")
    assert r.status_code == 200
    r = client.get("/api/north-gpt/prompts")
    assert all(p["id"] != pid for p in r.json()["data"])


def test_empty_name_rejected():
    r = client.post("/api/north-gpt/prompts", json={"name": "   ", "text": "x"})
    assert r.status_code == 400


def test_prompts_sorted_last_used_first():
    a = client.post("/api/north-gpt/prompts", json={"name": "A", "text": "a"}).json()["data"]["id"]
    b = client.post("/api/north-gpt/prompts", json={"name": "B", "text": "b"}).json()["data"]["id"]
    # отметить A как использованный позже
    assert client.post(f"/api/north-gpt/prompts/{a}/touch").status_code == 200
    ids = [p["id"] for p in client.get("/api/north-gpt/prompts").json()["data"]]
    assert ids.index(a) < ids.index(b)
    # очистка
    client.delete(f"/api/north-gpt/prompts/{a}")
    client.delete(f"/api/north-gpt/prompts/{b}")
