"""
Аутентификация для облачного состояния crypto.
ЗАЧЕМ: единый общий пароль (хэш в env) + подписанный токен-пропуск,
чтобы данные нельзя было прочитать/записать без входа. Без внешних зависимостей.
"""
import base64
import hashlib
import hmac
import json
import os
import time

_DEFAULT_TTL = 90 * 24 * 3600  # 90 дней


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def verify_password(password: str) -> bool:
    """Сравнить пароль с хэшем из env (constant-time)."""
    expected = os.getenv("CRYPTO_APP_PASSWORD_HASH", "")
    if not expected:
        return False
    actual = hashlib.sha256(password.encode("utf-8")).hexdigest()
    return hmac.compare_digest(actual, expected)


def _secret() -> bytes:
    return os.getenv("CRYPTO_TOKEN_SECRET", "").encode("utf-8")


def issue_token(ttl_seconds: int = _DEFAULT_TTL) -> str:
    """Выпустить токен-пропуск с подписью HMAC-SHA256."""
    payload = {"exp": int(time.time()) + ttl_seconds}
    body = _b64(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    sig = _b64(hmac.new(_secret(), body.encode("utf-8"), hashlib.sha256).digest())
    return f"{body}.{sig}"


def verify_token(token: str) -> bool:
    """Проверить подпись и срок жизни токена."""
    try:
        body, sig = token.split(".", 1)
    except (ValueError, AttributeError):
        return False
    expected_sig = _b64(hmac.new(_secret(), body.encode("utf-8"), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected_sig):
        return False
    try:
        payload = json.loads(_unb64(body))
    except Exception:
        return False
    return int(payload.get("exp", 0)) > int(time.time())


# --- Простой in-memory rate-limit на попытки логина (защита от перебора) ---
_ATTEMPTS: dict[str, list[float]] = {}
_WINDOW = 60.0          # окно, сек
_MAX_ATTEMPTS = 10      # макс. попыток за окно с одного IP


def too_many_attempts(ip: str) -> bool:
    now = time.time()
    bucket = [t for t in _ATTEMPTS.get(ip, []) if now - t < _WINDOW]
    _ATTEMPTS[ip] = bucket
    return len(bucket) >= _MAX_ATTEMPTS


def record_attempt(ip: str) -> None:
    _ATTEMPTS.setdefault(ip, []).append(time.time())
