import hashlib
from app.services import crypto_auth as ca


def test_password_verify_ok(monkeypatch):
    monkeypatch.setenv("CRYPTO_APP_PASSWORD_HASH", hashlib.sha256(b"secret").hexdigest())
    assert ca.verify_password("secret") is True
    assert ca.verify_password("wrong") is False


def test_token_roundtrip(monkeypatch):
    monkeypatch.setenv("CRYPTO_TOKEN_SECRET", "test-secret")
    token = ca.issue_token(ttl_seconds=60)
    assert ca.verify_token(token) is True


def test_token_expired(monkeypatch):
    monkeypatch.setenv("CRYPTO_TOKEN_SECRET", "test-secret")
    token = ca.issue_token(ttl_seconds=-1)  # уже истёк
    assert ca.verify_token(token) is False


def test_token_wrong_secret(monkeypatch):
    monkeypatch.setenv("CRYPTO_TOKEN_SECRET", "secret-a")
    token = ca.issue_token(ttl_seconds=60)
    monkeypatch.setenv("CRYPTO_TOKEN_SECRET", "secret-b")
    assert ca.verify_token(token) is False


def test_token_tampered(monkeypatch):
    monkeypatch.setenv("CRYPTO_TOKEN_SECRET", "test-secret")
    token = ca.issue_token(ttl_seconds=60)
    assert ca.verify_token(token + "x") is False
