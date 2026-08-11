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


# ============ Изоляция наборов по режимам ============
def test_prompt_defaults_to_options_only():
    """Промпт без явного режима попадает в набор «только опционы»."""
    r = client.post("/api/north-gpt/prompts", json={"name": "БезРежима", "text": "x"})
    data = r.json()["data"]
    assert data["mode"] == "options_only"
    ids = [p["id"] for p in client.get("/api/north-gpt/prompts?mode=options_only").json()["data"]]
    assert data["id"] in ids
    client.delete(f"/api/north-gpt/prompts/{data['id']}")


def test_prompts_isolated_by_mode():
    """Промпт одного режима не виден в наборах двух других."""
    created = {}
    for mode in ("with_asset", "options_only", "call_only"):
        created[mode] = client.post(
            "/api/north-gpt/prompts",
            json={"name": f"P-{mode}", "text": "t", "mode": mode},
        ).json()["data"]["id"]
    try:
        for mode, pid in created.items():
            ids = [p["id"] for p in client.get(f"/api/north-gpt/prompts?mode={mode}").json()["data"]]
            assert pid in ids
            # чужие промпты в этот набор не попали
            for other_mode, other_id in created.items():
                if other_mode != mode:
                    assert other_id not in ids
    finally:
        for pid in created.values():
            client.delete(f"/api/north-gpt/prompts/{pid}")


def test_invalid_mode_rejected():
    assert client.get("/api/north-gpt/prompts?mode=garbage").status_code == 400
    r = client.post("/api/north-gpt/prompts",
                    json={"name": "X", "text": "x", "mode": "garbage"})
    assert r.status_code == 400


def test_last_used_sorted_within_mode():
    """Сортировка «последний использованный первым» работает внутри набора."""
    a = client.post("/api/north-gpt/prompts",
                    json={"name": "WA-A", "text": "a", "mode": "with_asset"}).json()["data"]["id"]
    b = client.post("/api/north-gpt/prompts",
                    json={"name": "WA-B", "text": "b", "mode": "with_asset"}).json()["data"]["id"]
    other = client.post("/api/north-gpt/prompts",
                        json={"name": "OO", "text": "o", "mode": "options_only"}).json()["data"]["id"]
    try:
        client.post(f"/api/north-gpt/prompts/{a}/touch")
        ids = [p["id"] for p in client.get("/api/north-gpt/prompts?mode=with_asset").json()["data"]]
        assert ids.index(a) < ids.index(b)
        assert other not in ids
    finally:
        for pid in (a, b, other):
            client.delete(f"/api/north-gpt/prompts/{pid}")


def test_get_without_mode_returns_all():
    """Обратная совместимость: запрос без режима отдаёт промпты всех наборов."""
    a = client.post("/api/north-gpt/prompts",
                    json={"name": "ALL-A", "text": "a", "mode": "call_only"}).json()["data"]["id"]
    b = client.post("/api/north-gpt/prompts",
                    json={"name": "ALL-B", "text": "b", "mode": "with_asset"}).json()["data"]["id"]
    try:
        ids = [p["id"] for p in client.get("/api/north-gpt/prompts").json()["data"]]
        assert a in ids and b in ids
    finally:
        client.delete(f"/api/north-gpt/prompts/{a}")
        client.delete(f"/api/north-gpt/prompts/{b}")
