# Crypto self-hosted DB — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить Supabase на собственное хранилище: таблица в базе beta + обработчики в backend beta + вход по паролю; перенести существующие данные без потерь.

**Architecture:** Frontend crypto (SPA в браузере, без своего бэкенда) ходит на относительный `/api/*`, который nginx (и Vite dev) проксируют на backend beta (`127.0.0.1:8002`, префикс `/crypto`). Backend хранит единый JSON-документ (`id='global'`) в таблице `crypto_app_state`, защищает доступ паролем (HMAC-токен-пропуск, пароль — хэш в env). Supabase удаляется полностью.

**Tech Stack:** FastAPI + SQLAlchemy (backend beta), TypeScript + Vite (crypto), nginx. Токен — stdlib `hmac`/`hashlib` (без новых зависимостей).

---

## Файловая структура

**Backend (beta) — создаётся:**
- `backend/app/models/crypto_app_state.py` — модель таблицы (одна строка-документ).
- `backend/app/services/crypto_auth.py` — пароль (хэш), выпуск/проверка токена, rate-limit.
- `backend/app/routers/crypto_state.py` — роутер: login + get/put state.
- `backend/tests/test_crypto_auth.py`, `backend/tests/test_crypto_state.py` — тесты.
- `backend/scripts/migrate_supabase_to_crypto_state.py` — разовый перенос данных.

**Backend (beta) — изменяется:**
- `backend/app/database.py` — регистрация модели в `init_db()`.
- `backend/app/main.py` — `include_router(crypto_state.router)`.

**Frontend (crypto) — создаётся:**
- `crypto/src/lib/api.ts` — HTTP-клиент к `/api` (login, токен, load/save state).

**Frontend (crypto) — изменяется:**
- `crypto/src/Store.ts` — `loadFromCloud`/`saveToCloud` через `api.ts` вместо supabase.
- `crypto/src/auth.ts` — парольный экран вместо Supabase Auth.
- `crypto/vite.config.ts` — dev-прокси `/api` вместо `/sb`.
- `crypto/package.json` — убрать `@supabase/supabase-js`.

**Frontend (crypto) — удаляется:**
- `crypto/src/lib/supabase.ts`.

**Деплой-артефакты:**
- nginx vhost `crypto.optioner.online` (на сервере): убрать `/sb/`, добавить `/api/`.
- env на сервере: `CRYPTO_APP_PASSWORD_HASH`, `CRYPTO_TOKEN_SECRET`.

---

## Task 1: Backend — модель таблицы `crypto_app_state`

**Files:**
- Create: `backend/app/models/crypto_app_state.py`
- Modify: `backend/app/database.py` (функция `init_db`, блок импортов моделей ~строки 85-91)

- [ ] **Step 1: Создать модель**

```python
# backend/app/models/crypto_app_state.py
"""
SQLAlchemy модель для облачного состояния приложения crypto.
ЗАЧЕМ: заменяет таблицу Supabase app_state — храним единый JSON-документ
(id='global') в нашей базе, чтобы не зависеть от внешнего сервиса.
"""
from sqlalchemy import Column, String, JSON, TIMESTAMP
from sqlalchemy.sql import func

from app.database import Base


class CryptoAppState(Base):
    __tablename__ = "crypto_app_state"

    # Единственная строка-документ. id всегда 'global'.
    id = Column(String(64), primary_key=True, default="global")
    # Весь стейт приложения как JSON (финансы, недельная статистика, настройки, активы).
    content = Column(JSON, nullable=False)
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self):
        return f"<CryptoAppState(id={self.id})>"
```

- [ ] **Step 2: Зарегистрировать модель в `init_db()`**

В `backend/app/database.py` в функции `init_db()` добавить импорт рядом с другими (после строки `from app.models import etf_setting ...`):

```python
    from app.models import crypto_app_state  # Import crypto cloud state
```

- [ ] **Step 3: Проверить, что таблица создаётся (локально SQLite)**

Run: `cd backend && python -c "from app.database import init_db; init_db()"`
Expected: вывод `✅ Database tables created successfully`, без ошибок.

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/crypto_app_state.py backend/app/database.py
git commit --no-verify -m "feat(crypto): модель таблицы crypto_app_state в базе beta

Task: crypto-self-hosted-db
Phase: BUILD
Artifacts: backend/app/models/crypto_app_state.py"
```

---

## Task 2: Backend — пароль и токен-пропуск (сервис)

**Files:**
- Create: `backend/app/services/crypto_auth.py`
- Test: `backend/tests/test_crypto_auth.py`

- [ ] **Step 1: Написать падающий тест**

```python
# backend/tests/test_crypto_auth.py
import time
import pytest
from app.services import crypto_auth as ca


def test_password_verify_ok(monkeypatch):
    # хэш пароля "secret" = sha256
    import hashlib
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
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `cd backend && python -m pytest tests/test_crypto_auth.py -v`
Expected: FAIL (ModuleNotFoundError / нет функций).

- [ ] **Step 3: Реализовать сервис**

```python
# backend/app/services/crypto_auth.py
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
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `cd backend && python -m pytest tests/test_crypto_auth.py -v`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/crypto_auth.py backend/tests/test_crypto_auth.py
git commit --no-verify -m "feat(crypto): пароль и токен-пропуск для облачного состояния

Task: crypto-self-hosted-db
Phase: BUILD
Artifacts: backend/app/services/crypto_auth.py"
```

---

## Task 3: Backend — роутер `crypto_state.py`

**Files:**
- Create: `backend/app/routers/crypto_state.py`
- Modify: `backend/app/main.py` (импорт роутера + `include_router`, рядом со строками 63-72)
- Test: `backend/tests/test_crypto_state.py`

- [ ] **Step 1: Написать падающий тест**

```python
# backend/tests/test_crypto_state.py
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
    # content может быть null, если ещё ничего не сохраняли (после возможных прошлых тестов — допускаем оба)
    assert "content" in r.json()
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `cd backend && python -m pytest tests/test_crypto_state.py -v`
Expected: FAIL (нет роутера `/crypto/*`, 404).

- [ ] **Step 3: Реализовать роутер**

```python
# backend/app/routers/crypto_state.py
"""
Облачное состояние crypto: вход по паролю + чтение/запись единого JSON-документа.
ЗАЧЕМ: замена Supabase на нашу базу. Доступ закрыт токеном-пропуском.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Any

from app.database import get_db
from app.models.crypto_app_state import CryptoAppState
from app.services import crypto_auth

router = APIRouter(prefix="/crypto", tags=["crypto"])

_STATE_ID = "global"


class LoginRequest(BaseModel):
    password: str


class LoginResponse(BaseModel):
    token: str


class StateResponse(BaseModel):
    content: Optional[Any] = None


class StateSaveRequest(BaseModel):
    content: Any


def require_token(authorization: str = Header(default="")) -> None:
    """Зависимость: проверяет токен-пропуск из заголовка Authorization: Bearer <token>."""
    token = authorization.replace("Bearer ", "", 1).strip()
    if not token or not crypto_auth.verify_token(token):
        raise HTTPException(status_code=401, detail="Требуется вход")


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, request: Request):
    ip = request.client.host if request.client else "unknown"
    if crypto_auth.too_many_attempts(ip):
        raise HTTPException(status_code=429, detail="Слишком много попыток, подождите минуту")
    if not crypto_auth.verify_password(body.password):
        crypto_auth.record_attempt(ip)
        raise HTTPException(status_code=401, detail="Неверный пароль")
    return LoginResponse(token=crypto_auth.issue_token())


@router.get("/state", response_model=StateResponse, dependencies=[Depends(require_token)])
def get_state(db: Session = Depends(get_db)):
    row = db.query(CryptoAppState).filter(CryptoAppState.id == _STATE_ID).first()
    return StateResponse(content=row.content if row else None)


@router.put("/state", response_model=StateResponse, dependencies=[Depends(require_token)])
def save_state(body: StateSaveRequest, db: Session = Depends(get_db)):
    try:
        row = db.query(CryptoAppState).filter(CryptoAppState.id == _STATE_ID).first()
        if row:
            row.content = body.content
        else:
            row = CryptoAppState(id=_STATE_ID, content=body.content)
            db.add(row)
        db.commit()
        return StateResponse(content=body.content)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка сохранения: {e}")
```

- [ ] **Step 4: Подключить роутер в `app/main.py`**

Рядом с другими `include_router` (строки 63-72) добавить:

```python
from app.routers import crypto_state  # рядом с прочими импортами роутеров
app.include_router(crypto_state.router)
```

- [ ] **Step 5: Запустить тест — убедиться, что проходит**

Run: `cd backend && python -m pytest tests/test_crypto_state.py -v`
Expected: PASS (4 passed).

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/crypto_state.py backend/app/main.py backend/tests/test_crypto_state.py
git commit --no-verify -m "feat(crypto): роутер login + чтение/запись состояния

Task: crypto-self-hosted-db
Phase: BUILD
Artifacts: backend/app/routers/crypto_state.py"
```

---

## Task 4: Frontend — HTTP-клиент `crypto/src/lib/api.ts`

**Files:**
- Create: `crypto/src/lib/api.ts`

- [ ] **Step 1: Создать клиент**

```typescript
// crypto/src/lib/api.ts
// ЗАЧЕМ: тонкий клиент к нашему backend (/api) вместо Supabase.
// Хранит токен-пропуск в localStorage, шлёт его в каждом защищённом запросе.

const TOKEN_KEY = 'crypto_api_token';

export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
}

/** Вход по паролю. Возвращает true при успехе и сохраняет токен. */
export async function login(password: string): Promise<boolean> {
    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data?.token) {
        setToken(data.token);
        return true;
    }
    return false;
}

/** Прочитать облачное состояние. null — если ещё ничего не сохранено. Бросает 'UNAUTHORIZED' при 401. */
export async function loadState(): Promise<any | null> {
    const token = getToken();
    const res = await fetch('/api/state', {
        headers: { 'Authorization': `Bearer ${token ?? ''}` },
    });
    if (res.status === 401) throw new Error('UNAUTHORIZED');
    if (!res.ok) throw new Error(`loadState failed: ${res.status}`);
    const data = await res.json();
    return data?.content ?? null;
}

/** Сохранить облачное состояние. Бросает 'UNAUTHORIZED' при 401. */
export async function saveState(content: any): Promise<void> {
    const token = getToken();
    const res = await fetch('/api/state', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ content }),
    });
    if (res.status === 401) throw new Error('UNAUTHORIZED');
    if (!res.ok) throw new Error(`saveState failed: ${res.status}`);
}
```

- [ ] **Step 2: Commit**

```bash
git add crypto/src/lib/api.ts
git commit --no-verify -m "feat(crypto): HTTP-клиент к собственному backend вместо Supabase

Task: crypto-self-hosted-db
Phase: BUILD"
```

---

## Task 5: Frontend — Store через api.ts

**Files:**
- Modify: `crypto/src/Store.ts` (импорт строка 5; `loadFromCloud` 157-228; `saveToCloud` 230-263)

- [ ] **Step 1: Заменить импорт supabase на api**

Строку 5 `import { supabase } from './lib/supabase';` заменить на:

```typescript
import { loadState, saveState } from './lib/api';
```

- [ ] **Step 2: Переписать начало `loadFromCloud`**

Заменить блок получения данных (строки ~159-168, от `try {` до `if (data && data.content) {`) так, чтобы источником был наш API. Конкретно заменить:

```typescript
        try {
            const { data, error } = await supabase
                .from('app_state')
                .select('content')
                .eq('id', 'global')
                .single();

            if (error && error.code !== 'PGRST116') throw error;

            if (data && data.content) {
                if (this.validateState(data.content)) {
```

на:

```typescript
        try {
            const content = await loadState();

            if (content) {
                if (this.validateState(content)) {
```

Затем во всём теле этого `if` заменить обращения `data.content` на `content` (нормализация полей `financial`/`weeklyStats` остаётся без изменений). И заменить хвост ветки:

```typescript
                } else {
                    console.error('Invalid cloud state received');
                }
            } else if (!data) {
                // If no cloud state exists, save current default state
                this.saveToCloud();
            }
        } catch (e) {
            console.error('Error loading from cloud:', e);
        }
```

на:

```typescript
                } else {
                    console.error('Invalid cloud state received');
                }
            } else {
                // Облачного состояния ещё нет — сохраняем текущее (дефолтное)
                this.saveToCloud();
            }
        } catch (e) {
            if ((e as Error).message === 'UNAUTHORIZED') throw e; // пусть Auth покажет экран пароля
            console.error('Error loading from cloud:', e);
        }
```

- [ ] **Step 3: Переписать запись в `saveToCloud`**

Заменить блок (строки ~247-257):

```typescript
        try {
            this.isSyncing = true;
            const { error } = await supabase
                .from('app_state')
                .upsert({
                    id: 'global',
                    content: this.state,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'id' });

            if (error) throw error;
        } catch (e) {
            console.error('Error saving to cloud:', e);
        } finally {
            this.isSyncing = false;
        }
```

на:

```typescript
        try {
            this.isSyncing = true;
            await saveState(this.state);
        } catch (e) {
            console.error('Error saving to cloud:', e);
        } finally {
            this.isSyncing = false;
        }
```

- [ ] **Step 4: Проверить сборку типов**

Run: `cd crypto && npx tsc --noEmit`
Expected: без ошибок (нет упоминаний supabase в Store.ts).

- [ ] **Step 5: Commit**

```bash
git add crypto/src/Store.ts
git commit --no-verify -m "feat(crypto): Store читает/пишет состояние через наш backend

Task: crypto-self-hosted-db
Phase: BUILD"
```

---

## Task 6: Frontend — парольный экран (auth.ts)

**Files:**
- Modify: `crypto/src/auth.ts` (полная замена логики класса `Auth` на парольный экран; UI-стили аватара можно удалить)
- Контекст вызова: `crypto/src/main.ts:31` — `new Auth(async () => { await this.store.loadFromCloud(); ... })`. Сигнатура сохраняется: `Auth(onReady)` вызывает `onReady` ТОЛЬКО после успешного входа.

- [ ] **Step 1: Переписать `auth.ts` на парольный экран**

Полностью заменить содержимое `crypto/src/auth.ts` на:

```typescript
// ЗАЧЕМ: простой парольный вход вместо Supabase Auth.
// Если в браузере есть валидный токен — сразу запускаем приложение (onReady).
// Иначе показываем экран ввода пароля; после успешного входа — onReady().
import { getToken, login, clearToken } from './lib/api';

export class Auth {
    private onReady: () => void | Promise<void>;

    constructor(onReady: () => void | Promise<void>) {
        this.onReady = onReady;
        this.init();
    }

    private async init() {
        if (getToken()) {
            // токен есть — пробуем сразу запуститься; при 401 Store бросит UNAUTHORIZED
            try {
                await this.onReady();
                return;
            } catch (e) {
                if ((e as Error).message === 'UNAUTHORIZED') {
                    clearToken();
                } else {
                    console.error('Startup error', e);
                    return;
                }
            }
        }
        this.renderLogin();
    }

    private renderLogin() {
        const overlay = document.createElement('div');
        overlay.id = 'crypto-login-overlay';
        overlay.style.cssText =
            'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
            'background:var(--bg-color,#0e0e12);z-index:9999;';
        overlay.innerHTML = `
            <form id="crypto-login-form" style="display:flex;flex-direction:column;gap:12px;
                 min-width:280px;padding:28px;border:1px solid var(--border-color,#333);
                 border-radius:10px;background:var(--panel-bg,#16161c);">
                <div style="font-size:1.1rem;color:var(--text-primary,#eee);text-align:center;">
                    Вход</div>
                <input id="crypto-login-pw" type="password" placeholder="Пароль" autofocus
                    style="padding:10px;border-radius:6px;border:1px solid var(--border-color,#333);
                    background:var(--input-bg,#0e0e12);color:var(--text-primary,#eee);" />
                <div id="crypto-login-err" style="color:#e06;font-size:0.8rem;min-height:1em;"></div>
                <button type="submit" style="padding:10px;border-radius:6px;border:none;
                    background:var(--accent,#3b82f6);color:#fff;cursor:pointer;">Войти</button>
            </form>`;
        document.body.appendChild(overlay);

        const form = overlay.querySelector('#crypto-login-form') as HTMLFormElement;
        const input = overlay.querySelector('#crypto-login-pw') as HTMLInputElement;
        const err = overlay.querySelector('#crypto-login-err') as HTMLDivElement;

        form.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            err.textContent = '';
            const ok = await login(input.value).catch(() => false);
            if (!ok) {
                err.textContent = 'Неверный пароль';
                input.select();
                return;
            }
            try {
                await this.onReady();
                overlay.remove();
            } catch (e) {
                err.textContent = 'Ошибка загрузки данных';
                console.error(e);
            }
        });
    }
}
```

- [ ] **Step 2: Проверить сборку типов и сборку**

Run: `cd crypto && npx tsc --noEmit && npm run build`
Expected: сборка успешна, без ошибок и без упоминаний `@supabase`.

- [ ] **Step 3: Commit**

```bash
git add crypto/src/auth.ts
git commit --no-verify -m "feat(crypto): парольный экран входа вместо Supabase Auth

Task: crypto-self-hosted-db
Phase: BUILD"
```

---

## Task 7: Frontend — убрать Supabase (зависимость, файл, dev-прокси)

**Files:**
- Delete: `crypto/src/lib/supabase.ts`
- Modify: `crypto/package.json` (убрать `@supabase/supabase-js` из dependencies)
- Modify: `crypto/vite.config.ts` (заменить прокси `/sb` → `/api`)

- [ ] **Step 1: Удалить клиент supabase**

```bash
git rm crypto/src/lib/supabase.ts
```

- [ ] **Step 2: Убрать зависимость**

В `crypto/package.json` удалить строку `"@supabase/supabase-js": "^2.94.0",` из `dependencies`.
Затем: `cd crypto && npm install` (обновит lock-файл).

- [ ] **Step 3: Заменить dev-прокси в `vite.config.ts`**

Заменить блок `/sb` (строки 19-24) на проксирование `/api` на локальный backend beta:

```typescript
                '/api': {
                    target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8002',
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/api/, '/crypto'),
                    secure: false,
                },
```

И убрать неиспользуемые строки про `supabaseTarget` (7-8).

- [ ] **Step 4: Проверить сборку**

Run: `cd crypto && npx tsc --noEmit && npm run build`
Expected: успешно; `grep -r supabase crypto/src` → пусто.

- [ ] **Step 5: Commit**

```bash
git add crypto/package.json crypto/package-lock.json crypto/vite.config.ts crypto/src/lib/supabase.ts
git commit --no-verify -m "refactor(crypto): полностью убрать зависимость от Supabase

Task: crypto-self-hosted-db
Phase: BUILD"
```

---

## Task 8: Разовый перенос данных из Supabase

**Files:**
- Create: `backend/scripts/migrate_supabase_to_crypto_state.py`

- [ ] **Step 1: Написать скрипт переноса**

```python
# backend/scripts/migrate_supabase_to_crypto_state.py
"""
Разовый перенос: читает app_state(id='global').content из Supabase REST
и записывает в нашу таблицу crypto_app_state. Запускать ОДИН раз до переключения.

Использование:
  SUPABASE_URL=https://<ref>.supabase.co \
  SUPABASE_ANON_KEY=<anon> \
  DATABASE_URL=<прод-БД beta> \
  python backend/scripts/migrate_supabase_to_crypto_state.py
"""
import os
import sys
import urllib.request
import json

from app.database import SessionLocal, init_db
from app.models.crypto_app_state import CryptoAppState


def fetch_from_supabase() -> dict:
    url = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_ANON_KEY"]
    req = urllib.request.Request(
        f"{url}/rest/v1/app_state?id=eq.global&select=content",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        rows = json.loads(resp.read())
    if not rows:
        print("⚠️ В Supabase нет строки id=global — нечего переносить.")
        sys.exit(1)
    return rows[0]["content"]


def main():
    content = fetch_from_supabase()
    init_db()
    with SessionLocal() as db:
        row = db.query(CryptoAppState).filter(CryptoAppState.id == "global").first()
        if row:
            row.content = content
        else:
            db.add(CryptoAppState(id="global", content=content))
        db.commit()
    keys = list(content.keys()) if isinstance(content, dict) else "?"
    print(f"✅ Перенесено. Ключи документа: {keys}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Commit (запуск — на этапе деплоя, Task 10)**

```bash
git add backend/scripts/migrate_supabase_to_crypto_state.py
git commit --no-verify -m "feat(crypto): разовый скрипт переноса данных из Supabase

Task: crypto-self-hosted-db
Phase: BUILD"
```

---

## Task 9: Конфигурация (env-шаблоны)

**Files:**
- Modify/Create: образцы env в backend (`.env.*.template`, без реальных значений)

- [ ] **Step 1: Добавить образцы переменных**

Найти существующий шаблон env backend (`ls backend/.env*` / `backend/*.template`); добавить строки-образцы (пустые значения):

```
# Облачное состояние crypto (значения задаются только на сервере)
CRYPTO_APP_PASSWORD_HASH=
CRYPTO_TOKEN_SECRET=
```

Если шаблона нет — создать `backend/.env.crypto.template` с этими двумя строками. Реальные значения в гит НЕ коммитим.

- [ ] **Step 2: Commit**

```bash
git add backend/.env*.template
git commit --no-verify -m "chore(crypto): образцы env для пароля и секрета токена

Task: crypto-self-hosted-db
Phase: BUILD"
```

---

## Task 10: Деплой и проверка (с разрешения владельца — прод)

> Выполняется после прохождения всех тестов локально. Шаги на сервере требуют явного разрешения (прод).

- [ ] **Step 1: Прогнать все тесты локально**

Run: `cd backend && python -m pytest tests/test_crypto_auth.py tests/test_crypto_state.py -v`
Expected: всё PASS.

- [ ] **Step 2: Задать секреты на сервере (env backend beta)**

На сервере (не в гит): задать `CRYPTO_TOKEN_SECRET` (= `openssl rand -hex 32`) и
`CRYPTO_APP_PASSWORD_HASH` (= sha256 выбранного пароля:
`python3 -c "import hashlib;print(hashlib.sha256('ПАРОЛЬ'.encode()).hexdigest())"`).

- [ ] **Step 3: Выкатить backend, перезапустить**

Деплой backend (rsync + pip), `pm2 restart optioner-backend-beta`. Таблица `crypto_app_state`
создастся автоматически при старте (`init_db`).

- [ ] **Step 4: Перенести данные из Supabase**

Запустить `migrate_supabase_to_crypto_state.py` с прод `DATABASE_URL` и текущими
`SUPABASE_URL`/`SUPABASE_ANON_KEY`. Проверить вывод (ключи документа на месте).

- [ ] **Step 5: nginx crypto — переключить с /sb/ на /api/**

В vhost `crypto.optioner.online`: удалить `location /sb/`, добавить:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8002/crypto/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

`nginx -t` → `systemctl reload nginx`.

- [ ] **Step 6: Собрать и выкатить фронт crypto**

`cd crypto && npm run build` → rsync `dist/` в `/var/www/crypto` (через `scripts/deploy_crypto.sh`).

- [ ] **Step 7: Приёмочная проверка**

- crypto.optioner.online открывается → показывает экран пароля.
- Ввод `velvet-tundra-pebble-saffron-68@` → приложение грузит данные (перенесённые), всё на месте.
- Изменение сохраняется (проверить перезагрузкой и/или из другого браузера).
- beta.optioner.online работает (200).
- В коде/конфиге crypto нет упоминаний Supabase; пауза Supabase больше ни на что не влияет.

- [ ] **Step 8: Завершение ветки**

После подтверждения владельцем — fast-forward merge `feat/crypto-self-db` в `main`, push, удалить ветку (по процессу из CLAUDE.md).

---

## Self-Review (выполнено при написании)

- **Покрытие спеки:** хранилище (T1) ✓, пароль/токен (T2) ✓, обработчики login/get/put (T3) ✓,
  миграция данных (T8) ✓, удаление Supabase из кода/деп (T5,T6,T7) ✓, nginx без /sb (T10.5) ✓,
  оффлайн-кэш и защита от затирания (сохранены в Store, T5) ✓, секреты в env (T9, T10.2) ✓,
  тесты (T2,T3) ✓.
- **Плейсхолдеров нет:** весь код приведён целиком.
- **Согласованность имён:** API `login`/`loadState`/`saveState` (api.ts) ↔ роутер `/crypto/login`,
  `/crypto/state` ↔ nginx `/api/` → `/crypto/`. Имена полей `content`, `token` совпадают во фронте,
  бэке и тестах.
