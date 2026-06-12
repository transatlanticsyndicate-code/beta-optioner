import hashlib
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("CRYPTO_APP_PASSWORD_HASH", hashlib.sha256(b"pw").hexdigest())
    monkeypatch.setenv("CRYPTO_TOKEN_SECRET", "secret")
    from app.main import app
    from app.database import init_db
    init_db()
    return TestClient(app)


def _login(client):
    r = client.post("/crypto/login", json={"password": "pw"})
    assert r.status_code == 200
    return r.json()["token"]


def test_login_bad_password(client):
    r = client.post("/crypto/login", json={"password": "nope"})
    assert r.status_code == 401


def test_state_requires_token(client):
    assert client.get("/crypto/state").status_code == 401
    assert client.put("/crypto/state", json={"content": {}}).status_code == 401


def test_put_then_get_state(client):
    token = _login(client)
    h = {"Authorization": f"Bearer {token}"}
    payload = {"content": {"deposit": 100, "hello": "world"}}
    assert client.put("/crypto/state", json=payload, headers=h).status_code == 200
    r = client.get("/crypto/state", headers=h)
    assert r.status_code == 200
    assert r.json()["content"]["hello"] == "world"


def test_get_state_empty(client):
    token = _login(client)
    h = {"Authorization": f"Bearer {token}"}
    r = client.get("/crypto/state", headers=h)
    assert r.status_code == 200
    assert "content" in r.json()
