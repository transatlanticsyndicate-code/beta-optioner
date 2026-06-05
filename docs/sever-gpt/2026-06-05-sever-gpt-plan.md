# План реализации: стратегия «Север GPT»

> **Для исполнителя:** использовать `superpowers:subagent-driven-development` или `superpowers:executing-plans`. Шаги отмечены чекбоксами `- [ ]`. Спецификация: `docs/sever-gpt/2026-06-05-sever-gpt-design.md`.

**Goal:** добавить параллельную стратегию «Север GPT» (ИИ-подбор опционов через OpenAI ChatGPT) поверх каркаса «Севера», не меняя «Север».

**Architecture:** фронтенд переиспользует сбор данных «Севера» (расширение TradingView → localStorage) без изменений; вместо локального математического анализатора собранная цепочка + промпт уходят на новый бэкенд-эндпоинт, который вызывает OpenAI со строгим JSON-ответом, сверяет ноги с реальной цепочкой и возвращает две готовые комбинации. Промпты хранятся на сервере (общие). Изоляция от «Севера» через отдельный флаг `fromNorthGptStrategy` и отдельное состояние.

**Tech Stack:** React (CRA, JSX), FastAPI + SQLAlchemy + Pydantic, OpenAI Python SDK (`openai>=1.40`), pytest, React Testing Library.

---

## Карта файлов

**Бэкенд (новое):**
- `backend/app/models/north_gpt_prompt.py` — модель таблицы промптов.
- `backend/app/services/openai_client.py` — клиент OpenAI (структурированный подбор).
- `backend/app/services/north_gpt_validator.py` — чистая логика валидации/восстановления + сборки ног (юнит-тестируемая).
- `backend/app/routers/north_gpt.py` — роутер: `/select` + CRUD промптов.
- `backend/app/prompts/north_gpt_prompt.md` — системный шаблон.
- `backend/tests/test_north_gpt_validator.py`, `backend/tests/test_north_gpt_prompts.py`, `backend/tests/test_north_gpt_select.py`.

**Бэкенд (правка, аддитивно):**
- `backend/app/database.py` — импорт новой модели в `init_db()`.
- `backend/app/main.py` — регистрация роутера.
- `backend/app/services/ai_analyzer.py` — добавить `OPENAI` в `AIProvider`.
- `backend/.env.example`, `backend/requirements.txt`.

**Фронтенд (новое) — `frontend/src/components/CalculatorV2/NorthGptStrategy/`:**
- `NorthGptButton.jsx`, `NorthGptBadge.jsx`, `NorthGptParamsForm.jsx`, `NorthGptResultsView.jsx`, `NorthGptStrategyDialog.jsx`, `northGptConstants.js`.
- `frontend/src/services/northGptApi.js` — сервис API.
- `frontend/src/utils/northGptStrategy/enrich.js` — досчёт P&L-метрик существующими функциями.

**Фронтенд (правка, аддитивно):**
- `frontend/src/components/CalculatorV2/OptionsTableV3.jsx` — кнопка + значок.
- `frontend/src/pages/UniversalOptionsCalculator.jsx` — параллельное состояние и обработчики.

**Не трогаем:** всё в `NorthStrategy/`, `utils/northStrategy/`, флаг `fromNorthStrategy`.

**Git-конвенция коммитов** (из CLAUDE.md): `type(scope): описание` + блок `Task: sever-gpt / Phase / Artifacts` + `Co-Authored-By`. Ветка отдельная от свежей `origin/main`.

---

## Phase 0 — Подготовка зависимостей

### Task 0.1: OpenAI SDK и переменные окружения

**Files:** Modify `backend/requirements.txt`, `backend/.env.example`

- [ ] **Шаг 1:** В `backend/requirements.txt` добавить строку:
```
openai>=1.40.0
```
- [ ] **Шаг 2:** В `backend/.env.example` добавить блок:
```
# --- OPENAI (ChatGPT) для стратегии «Север GPT» ---
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini
OPENAI_TEMPERATURE=0.2
OPENAI_MAX_TOKENS=1500
```
- [ ] **Шаг 3:** Установить: `cd backend && pip install -r requirements.txt`. Ожидание: `openai` установлен без ошибок.
- [ ] **Шаг 4:** Commit: `chore(sever-gpt): add openai dependency and env template`

---

## Phase 1 — Бэкенд: библиотека промптов (модель + CRUD)

### Task 1.1: Модель `north_gpt_prompts`

**Files:** Create `backend/app/models/north_gpt_prompt.py`; Modify `backend/app/database.py`

- [ ] **Шаг 1:** Прочитать `backend/app/models/saved_configuration.py`, чтобы взять точные импорты (`Base`, типы колонок, стиль `to_dict`/`server_default`).
- [ ] **Шаг 2:** Создать `backend/app/models/north_gpt_prompt.py` по образцу, **без** `user_id`/`author`:
```python
import uuid
from sqlalchemy import Column, String, Text, TIMESTAMP, func
from app.database import Base  # подтвердить путь по saved_configuration.py

class NorthGptPrompt(Base):
    __tablename__ = "north_gpt_prompts"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False, index=True)
    text = Column(Text, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    last_used_at = Column(TIMESTAMP, nullable=True, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "text": self.text,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
            "lastUsedAt": self.last_used_at.isoformat() if self.last_used_at else None,
        }
```
- [ ] **Шаг 3:** В `backend/app/database.py`, в функции `init_db()` (перед `Base.metadata.create_all`), добавить импорт регистрации модели:
```python
from app.models import north_gpt_prompt  # noqa: F401  регистрация таблицы north_gpt_prompts
```
- [ ] **Шаг 4:** Запустить бэкенд локально (`uvicorn app.main:app --reload --port 8000`), убедиться, что стартует без ошибок и таблица создаётся (в SQLite-файле / логах нет ошибок миграции).
- [ ] **Шаг 5:** Commit: `feat(sever-gpt): add north_gpt_prompts model`

### Task 1.2: CRUD-эндпоинты промптов (TDD)

**Files:** Create `backend/app/routers/north_gpt.py` (часть с промптами); Test `backend/tests/test_north_gpt_prompts.py`; Modify `backend/app/main.py`

- [ ] **Шаг 1:** Прочитать `backend/app/routers/saved_configurations.py` — взять стиль роутера, зависимость сессии БД (`get_db`), формат ответа (`{status, data}`).
- [ ] **Шаг 2 (failing test):** Создать `backend/tests/test_north_gpt_prompts.py` с TestClient:
```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_prompt_crud_lifecycle():
    # создать
    r = client.post("/api/north-gpt/prompts", json={"name": "Базовый", "text": "Подбери защитный воротник"})
    assert r.status_code == 200
    pid = r.json()["data"]["id"]
    # список содержит созданный
    r = client.get("/api/north-gpt/prompts")
    assert any(p["id"] == pid for p in r.json()["data"])
    # обновить (переименование + текст)
    r = client.put(f"/api/north-gpt/prompts/{pid}", json={"name": "Воротник", "text": "новый текст"})
    assert r.json()["data"]["name"] == "Воротник"
    # удалить
    r = client.delete(f"/api/north-gpt/prompts/{pid}")
    assert r.status_code == 200
    r = client.get("/api/north-gpt/prompts")
    assert all(p["id"] != pid for p in r.json()["data"])

def test_prompts_sorted_last_used_first():
    a = client.post("/api/north-gpt/prompts", json={"name": "A", "text": "a"}).json()["data"]["id"]
    b = client.post("/api/north-gpt/prompts", json={"name": "B", "text": "b"}).json()["data"]["id"]
    # отметить A как использованный позже
    client.post(f"/api/north-gpt/prompts/{a}/touch")
    ids = [p["id"] for p in client.get("/api/north-gpt/prompts").json()["data"]]
    assert ids.index(a) < ids.index(b)
```
- [ ] **Шаг 3 (run, fail):** `cd backend && python -m pytest tests/test_north_gpt_prompts.py -v`. Ожидание: FAIL (роут не найден / 404).
- [ ] **Шаг 4 (impl):** В `backend/app/routers/north_gpt.py` создать роутер `APIRouter(prefix="/api/north-gpt", tags=["north-gpt"])` и эндпоинты промптов:
```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db  # подтвердить по saved_configurations.py
from app.models.north_gpt_prompt import NorthGptPrompt

router = APIRouter(prefix="/api/north-gpt", tags=["north-gpt"])

class PromptCreate(BaseModel):
    name: str
    text: str

class PromptUpdate(BaseModel):
    name: Optional[str] = None
    text: Optional[str] = None

@router.get("/prompts")
def list_prompts(db: Session = Depends(get_db)):
    items = db.query(NorthGptPrompt).order_by(
        NorthGptPrompt.last_used_at.desc().nullslast(),
        NorthGptPrompt.updated_at.desc(),
    ).all()
    return {"status": "success", "data": [p.to_dict() for p in items]}

@router.post("/prompts")
def create_prompt(body: PromptCreate, db: Session = Depends(get_db)):
    p = NorthGptPrompt(name=body.name.strip(), text=body.text)
    db.add(p); db.commit(); db.refresh(p)
    return {"status": "success", "data": p.to_dict()}

@router.put("/prompts/{prompt_id}")
def update_prompt(prompt_id: str, body: PromptUpdate, db: Session = Depends(get_db)):
    p = db.query(NorthGptPrompt).filter(NorthGptPrompt.id == prompt_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Промпт не найден")
    if body.name is not None: p.name = body.name.strip()
    if body.text is not None: p.text = body.text
    db.commit(); db.refresh(p)
    return {"status": "success", "data": p.to_dict()}

@router.delete("/prompts/{prompt_id}")
def delete_prompt(prompt_id: str, db: Session = Depends(get_db)):
    p = db.query(NorthGptPrompt).filter(NorthGptPrompt.id == prompt_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Промпт не найден")
    db.delete(p); db.commit()
    return {"status": "success"}

@router.post("/prompts/{prompt_id}/touch")
def touch_prompt(prompt_id: str, db: Session = Depends(get_db)):
    p = db.query(NorthGptPrompt).filter(NorthGptPrompt.id == prompt_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Промпт не найден")
    p.last_used_at = func.now()
    db.commit(); db.refresh(p)
    return {"status": "success", "data": p.to_dict()}
```
- [ ] **Шаг 5:** В `backend/app/main.py` зарегистрировать: `from app.routers import north_gpt` и `app.include_router(north_gpt.router)`.
- [ ] **Шаг 6 (run, pass):** `python -m pytest tests/test_north_gpt_prompts.py -v`. Ожидание: PASS.
- [ ] **Шаг 7:** Commit: `feat(sever-gpt): saved prompts CRUD endpoints`

---

## Phase 2 — Бэкенд: подбор через OpenAI

### Task 2.1: Валидация/восстановление ног (чистая логика, TDD)

**Files:** Create `backend/app/services/north_gpt_validator.py`; Test `backend/tests/test_north_gpt_validator.py`

Контракт функции:
```python
# validate_combination(legs, stock_quantity, chain_index, ranges) -> dict
#   legs: [{"option_type","strike","quantity","side"}]  (из ответа модели)
#   chain_index: {("CALL", strike_float): {bid, ask, iv, delta, gamma, theta, vega, volume, date}}
#   ranges: {"call": (min,max), "put": (min,max)}
#   -> {"positions": [<полный снимок ноги>], "calls":[...], "puts":[...],
#       "qtyStock": int, "errors": [str]}  (positions пуст => комбинация невалидна)
```

- [ ] **Шаг 1 (failing tests):** Создать `backend/tests/test_north_gpt_validator.py`:
```python
from app.services.north_gpt_validator import build_chain_index, validate_combination

CHAIN = [
    {"type": "CALL", "strike": 150.0, "date": "2026-07-17", "bid": 5.0, "ask": 5.2, "impliedVolatility": 0.30,
     "delta": 0.5, "gamma": 0.02, "theta": -0.05, "vega": 0.1, "volume": 100},
    {"type": "PUT", "strike": 140.0, "date": "2026-07-17", "bid": 4.0, "ask": 4.3, "impliedVolatility": 0.32,
     "delta": -0.4, "gamma": 0.02, "theta": -0.04, "vega": 0.1, "volume": 80},
]
RANGES = {"call": (145.0, 160.0), "put": (130.0, 145.0)}

def test_valid_legs_get_real_prices():
    idx = build_chain_index(CHAIN, entry_price=145.0)
    out = validate_combination(
        legs=[{"option_type":"CALL","strike":150.0,"quantity":1,"side":"BUY"}],
        stock_quantity=0, chain_index=idx, ranges=RANGES)
    assert len(out["positions"]) == 1
    assert out["positions"][0]["premium"] == 5.2  # ask из цепочки
    assert out["positions"][0]["action"] == "Buy"

def test_nonexistent_strike_dropped():
    idx = build_chain_index(CHAIN, entry_price=145.0)
    out = validate_combination(
        legs=[{"option_type":"CALL","strike":999.0,"quantity":1,"side":"BUY"}],
        stock_quantity=0, chain_index=idx, ranges=RANGES)
    assert out["positions"] == []
    assert out["errors"]

def test_out_of_range_strike_dropped():
    idx = build_chain_index(CHAIN, entry_price=145.0)
    out = validate_combination(
        legs=[{"option_type":"PUT","strike":140.0,"quantity":1,"side":"BUY"}],
        stock_quantity=0, chain_index=idx, ranges={"call":(145,160),"put":(141,145)})
    assert out["positions"] == []

def test_duplicate_legs_merged():
    idx = build_chain_index(CHAIN, entry_price=145.0)
    out = validate_combination(
        legs=[{"option_type":"CALL","strike":150.0,"quantity":1,"side":"BUY"},
              {"option_type":"CALL","strike":150.0,"quantity":2,"side":"BUY"}],
        stock_quantity=0, chain_index=idx, ranges=RANGES)
    assert len(out["positions"]) == 1
    assert out["positions"][0]["quantity"] == 3
```
- [ ] **Шаг 2 (run, fail):** `python -m pytest tests/test_north_gpt_validator.py -v`. Ожидание: FAIL (модуль не найден).
- [ ] **Шаг 3 (impl):** Создать `backend/app/services/north_gpt_validator.py`:
```python
from datetime import date

def _norm_iv(v):
    if v is None: return None
    return v / 100.0 if v > 1.5 else v

def build_chain_index(chain, entry_price):
    idx = {}
    for row in chain:
        t = (row.get("type") or "").upper()
        ask = row.get("ask")
        iv = row.get("impliedVolatility", row.get("iv"))
        if t not in ("CALL", "PUT"): continue
        if not ask or ask <= 0: continue
        if not iv or iv <= 0: continue
        idx[(t, float(row["strike"]))] = {**row, "type": t, "_entry": entry_price}
    return idx

def _snapshot(row, qty, entry_price):
    return {
        "action": "Buy", "type": row["type"], "strike": float(row["strike"]),
        "date": row.get("date"), "quantity": int(qty),
        "premium": float(row["ask"]), "bid": row.get("bid"), "ask": row.get("ask"),
        "volume": row.get("volume"), "oi": row.get("oi"), "visible": True,
        "impliedVolatility": _norm_iv(row.get("impliedVolatility", row.get("iv"))),
        "delta": row.get("delta"), "gamma": row.get("gamma"),
        "theta": row.get("theta"), "vega": row.get("vega"),
        "entryDate": date.today().isoformat(), "assetPriceAtEntry": entry_price,
    }

def validate_combination(legs, stock_quantity, chain_index, ranges):
    errors, merged = [], {}
    entry_price = next(iter(chain_index.values()))["_entry"] if chain_index else None
    for leg in legs or []:
        t = (leg.get("option_type") or "").upper()
        side = (leg.get("side") or "").upper()
        if t not in ("CALL", "PUT") or side != "BUY":
            errors.append(f"Неверная нога: {leg}"); continue
        strike = float(leg.get("strike", 0))
        row = chain_index.get((t, strike))
        if not row:
            errors.append(f"Страйк не найден в цепочке: {t} {strike}"); continue
        lo, hi = ranges["call"] if t == "CALL" else ranges["put"]
        if not (lo <= strike <= hi):
            errors.append(f"Страйк вне диапазона: {t} {strike}"); continue
        qty = max(1, int(leg.get("quantity", 1)))
        key = (t, strike)
        merged[key] = merged.get(key, 0) + qty
    positions = [_snapshot(chain_index[k], q, entry_price) for k, q in merged.items()]
    calls = [p for p in positions if p["type"] == "CALL"]
    puts = [p for p in positions if p["type"] == "PUT"]
    qty_stock = max(0, int(stock_quantity or 0))
    if not positions:
        errors.append("Не осталось валидных ног")
    return {"positions": positions, "calls": calls, "puts": puts,
            "qtyStock": qty_stock, "errors": errors}
```
- [ ] **Шаг 4 (run, pass):** `python -m pytest tests/test_north_gpt_validator.py -v`. Ожидание: PASS (4 теста).
- [ ] **Шаг 5:** Commit: `feat(sever-gpt): chain validation and leg snapshot builder`

### Task 2.2: Расчёт стоимости/маржина (чистая логика, TDD)

**Files:** Modify `backend/app/services/north_gpt_validator.py`; Modify test файл

- [ ] **Шаг 1 (failing test):** Добавить в тест:
```python
from app.services.north_gpt_validator import compute_cost

def test_compute_cost_options_only():
    positions = [{"type":"CALL","ask":5.2,"quantity":1},{"type":"PUT","ask":4.3,"quantity":1}]
    c = compute_cost(positions, qty_stock=0, entry_price=145.0, leverage=1.0)
    assert round(c["optionsCost"], 2) == round((5.2+4.3)*100, 2)
    assert c["stockMargin"] == 0
    assert c["marginUsed"] == c["optionsCost"]
```
- [ ] **Шаг 2 (run, fail):** `python -m pytest tests/test_north_gpt_validator.py::test_compute_cost_options_only -v` → FAIL.
- [ ] **Шаг 3 (impl):** Добавить в `north_gpt_validator.py`:
```python
def compute_cost(positions, qty_stock, entry_price, leverage):
    options_cost = sum(float(p["ask"]) * 100 * int(p["quantity"]) for p in positions)
    lev = leverage if leverage and leverage > 0 else 1.0
    stock_margin = (qty_stock * entry_price) / lev if qty_stock and entry_price else 0
    margin_used = stock_margin + options_cost
    pct = (stock_margin / margin_used) if margin_used > 0 else 0
    return {"optionsCost": options_cost, "stockMargin": stock_margin,
            "marginUsed": margin_used, "stockMarginPct": pct}
```
- [ ] **Шаг 4 (run, pass):** PASS.
- [ ] **Шаг 5:** Commit: `feat(sever-gpt): combination cost computation`

### Task 2.3: Клиент OpenAI

**Files:** Create `backend/app/services/openai_client.py`, `backend/app/prompts/north_gpt_prompt.md`; Modify `backend/app/services/ai_analyzer.py`

- [ ] **Шаг 1:** Прочитать `backend/app/services/gemini_client.py` для стиля (чтение env, загрузка шаблона, обработка ошибок).
- [ ] **Шаг 2:** Создать `backend/app/prompts/north_gpt_prompt.md` — системный шаблон (роль ИИ-стратега, смысл стратегии «Север» = покупка Call/Put к лонгу, требование вернуть РОВНО две комбинации `with_asset` и `options_only`, соблюдать числовые ограничения, страйки только из присланной цепочки, ответ строго по схеме). Текст дорабатывается на тестах.
- [ ] **Шаг 3:** Создать `backend/app/services/openai_client.py`:
```python
import os, json
from openai import OpenAI

COMBINATION_SCHEMA = {
    "name": "north_gpt_combinations",
    "strict": True,
    "schema": {
        "type": "object", "additionalProperties": False,
        "required": ["with_asset", "options_only"],
        "properties": {
            "with_asset": {"$ref": "#/$defs/combo"},
            "options_only": {"$ref": "#/$defs/combo"},
        },
        "$defs": {"combo": {
            "type": "object", "additionalProperties": False,
            "required": ["legs", "stock_quantity", "rationale"],
            "properties": {
                "legs": {"type": "array", "minItems": 0, "items": {
                    "type": "object", "additionalProperties": False,
                    "required": ["option_type", "strike", "quantity", "side"],
                    "properties": {
                        "option_type": {"type": "string", "enum": ["CALL", "PUT"]},
                        "strike": {"type": "number"},
                        "quantity": {"type": "integer", "minimum": 1},
                        "side": {"type": "string", "enum": ["BUY"]},
                    }}},
                "stock_quantity": {"type": "integer", "minimum": 0},
                "rationale": {"type": "string"},
            }}},
    },
}

class OpenAIClient:
    def __init__(self):
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY не задан")
        self.client = OpenAI(api_key=api_key)
        self.model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        self.temperature = float(os.getenv("OPENAI_TEMPERATURE", "0.2"))
        self.max_tokens = int(os.getenv("OPENAI_MAX_TOKENS", "1500"))
        self.system_prompt = self._load_template()

    def _load_template(self):
        path = os.path.join(os.path.dirname(__file__), "..", "prompts", "north_gpt_prompt.md")
        try:
            with open(path, encoding="utf-8") as f: return f.read()
        except OSError:
            return "Ты — опционный стратег. Верни две комбинации строго по схеме."

    def select_combinations(self, user_prompt, constraints, chain):
        user_payload = json.dumps({"constraints": constraints, "chain": chain}, ensure_ascii=False)
        resp = self.client.chat.completions.create(
            model=self.model, temperature=self.temperature, max_tokens=self.max_tokens,
            response_format={"type": "json_schema", "json_schema": COMBINATION_SCHEMA},
            messages=[
                {"role": "system", "content": self.system_prompt + "\n\n" + user_prompt},
                {"role": "user", "content": user_payload},
            ],
        )
        content = resp.choices[0].message.content
        return json.loads(content)
```
- [ ] **Шаг 4:** В `backend/app/services/ai_analyzer.py` добавить `OPENAI = "openai"` в перечисление `AIProvider` и ветку выбора клиента (аддитивно, не ломая Gemini/Claude). Прочитать файл перед правкой.
- [ ] **Шаг 5:** Sanity: `python -c "from app.services.openai_client import COMBINATION_SCHEMA; print('ok')"` (с заглушкой ключа в окружении для импорта класса не требуется, импортируется только схема).
- [ ] **Шаг 6:** Commit: `feat(sever-gpt): OpenAI client with strict structured output`

### Task 2.4: Эндпоинт `/api/north-gpt/select` (TDD с мок-клиентом)

**Files:** Modify `backend/app/routers/north_gpt.py`; Test `backend/tests/test_north_gpt_select.py`

- [ ] **Шаг 1 (failing test):** Создать `backend/tests/test_north_gpt_select.py`, подменив OpenAI-клиент через `app.dependency_overrides` или monkeypatch фабрики клиента:
```python
from fastapi.testclient import TestClient
from app.main import app
import app.routers.north_gpt as ng

client = TestClient(app)

class FakeClient:
    def select_combinations(self, user_prompt, constraints, chain):
        return {
            "with_asset": {"legs":[{"option_type":"CALL","strike":150.0,"quantity":1,"side":"BUY"}],
                           "stock_quantity": 100, "rationale": "rA"},
            "options_only": {"legs":[{"option_type":"PUT","strike":140.0,"quantity":1,"side":"BUY"}],
                             "stock_quantity": 0, "rationale": "rO"},
        }

def test_select_returns_two_validated_blocks(monkeypatch):
    monkeypatch.setattr(ng, "get_openai_client", lambda: FakeClient())
    payload = {
        "params": {"expirationDate":"2026-07-17","callStrikeMin":145,"callStrikeMax":160,
                   "putStrikeMin":130,"putStrikeMax":145,"margin":6000,"marginTolerance":500,
                   "plTolerance":200,"minStockMarginPct":40,"topPrice":190,"bottomPrice":120,
                   "calcDate":"2026-07-05"},
        "prompt": "Подбери",
        "context": {"entryPrice":145.0,"assetQuantity":100,"leverage":1.0,"currentPrice":150.0,
                    "calculatorMode":"stocks","dividendYield":0,"ticker":"AAPL"},
        "chain": [
            {"type":"CALL","strike":150.0,"date":"2026-07-17","bid":5.0,"ask":5.2,
             "impliedVolatility":0.3,"delta":0.5,"gamma":0.02,"theta":-0.05,"vega":0.1,"volume":100},
            {"type":"PUT","strike":140.0,"date":"2026-07-17","bid":4.0,"ask":4.3,
             "impliedVolatility":0.32,"delta":-0.4,"gamma":0.02,"theta":-0.04,"vega":0.1,"volume":80},
        ],
    }
    r = client.post("/api/north-gpt/select", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "success"
    assert data["withAsset"]["positions"][0]["premium"] == 5.2
    assert data["withAsset"]["qtyStock"] == 100
    assert data["withAsset"]["rationale"] == "rA"
    assert data["optionsOnly"]["positions"][0]["type"] == "PUT"
```
- [ ] **Шаг 2 (run, fail):** `python -m pytest tests/test_north_gpt_select.py -v` → FAIL (404).
- [ ] **Шаг 3 (impl):** В `north_gpt.py` добавить Pydantic-модели запроса (`NorthGptParams`, `NorthGptContext`, `ChainOption`, `NorthGptSelectRequest`), фабрику `get_openai_client()` (ленивое создание `OpenAIClient`, чтобы тест мог подменить), и эндпоинт:
```python
from app.services.openai_client import OpenAIClient
from app.services import north_gpt_validator as validator

def get_openai_client():
    return OpenAIClient()

def _filter_chain(chain, expiration, ranges):
    out = []
    for row in chain:
        if row.get("date") and expiration and row["date"] != expiration: continue
        out.append(row)
    return out

def _build_block(combo, chain_index, ranges, context):
    res = validator.validate_combination(
        legs=combo.get("legs", []), stock_quantity=combo.get("stock_quantity", 0),
        chain_index=chain_index, ranges=ranges)
    if not res["positions"]:
        return {"error": "ChatGPT не собрал валидную комбинацию из доступных страйков",
                "rationale": combo.get("rationale", "")}
    cost = validator.compute_cost(res["positions"], res["qtyStock"],
                                  context["entryPrice"], context.get("leverage", 1.0))
    kind = "withStock" if res["qtyStock"] > 0 else "optionsOnly"
    return {"kind": kind, "positions": res["positions"], "calls": res["calls"],
            "puts": res["puts"], "qtyStock": res["qtyStock"], "cost": cost,
            "rationale": combo.get("rationale", "")}

@router.post("/select")
def select(req: NorthGptSelectRequest):
    try:
        ranges = {"call": (req.params.callStrikeMin, req.params.callStrikeMax),
                  "put": (req.params.putStrikeMin, req.params.putStrikeMax)}
        chain = _filter_chain([c.dict() for c in req.chain], req.params.expirationDate, ranges)
        idx = validator.build_chain_index(chain, req.context.entryPrice)
        constraints = req.params.dict()
        result = get_openai_client().select_combinations(req.prompt, constraints, chain)
        ctx = req.context.dict()
        return {"status": "success",
                "withAsset": _build_block(result["with_asset"], idx, ranges, ctx),
                "optionsOnly": _build_block(result["options_only"], idx, ranges, ctx)}
    except Exception as e:
        return {"status": "error", "error": _friendly_openai_error(e)}
```
Добавить `_friendly_openai_error(e)` с разбором типов ошибок OpenAI (timeout/rate limit/auth) в русские сообщения.
- [ ] **Шаг 4:** Также бампать `last_used_at`, если в запросе передан `promptId` (опциональное поле): после успешного ответа вызвать обновление метки.
- [ ] **Шаг 5 (run, pass):** `python -m pytest tests/test_north_gpt_select.py -v` → PASS.
- [ ] **Шаг 6:** Прогнать весь бэкенд: `python -m pytest tests/ -v` → существующие тесты не сломаны.
- [ ] **Шаг 7:** Commit: `feat(sever-gpt): /select endpoint with OpenAI + validation`

---

## Phase 3 — Фронтенд: сервис, константы, компоненты

### Task 3.1: Сервис API

**Files:** Create `frontend/src/services/northGptApi.js`

- [ ] **Шаг 1:** Прочитать `frontend/src/services/configurationsApi.js` — взять формирование `API_BASE_URL` и стиль `fetch`/обработки ошибок.
- [ ] **Шаг 2:** Создать `northGptApi.js` с экспортами: `requestNorthGptCombination({params, prompt, chain, context, promptId})` → `POST /api/north-gpt/select`; `getPrompts()`, `createPrompt({name,text})`, `updatePrompt(id,{name,text})`, `deletePrompt(id)` → `/api/north-gpt/prompts`. Все через `fetch` с `try/catch`, проверкой `response.ok`, понятными сообщениями.
- [ ] **Шаг 3:** Commit: `feat(sever-gpt): frontend api service`

### Task 3.2: Константы и дефолтный промпт

**Files:** Create `frontend/src/components/CalculatorV2/NorthGptStrategy/northGptConstants.js`

- [ ] **Шаг 1:** Экспортировать `DEFAULT_NORTH_GPT_PROMPT` (русский шаблон-инструкция стратегу) и `NORTH_GPT_KIND = 'gpt'`.
- [ ] **Шаг 2:** Commit: `feat(sever-gpt): constants and default prompt`

### Task 3.3: Досчёт P&L-метрик

**Files:** Create `frontend/src/utils/northGptStrategy/enrich.js`

- [ ] **Шаг 1:** Прочитать `frontend/src/utils/northStrategy/analyzer.js` — найти используемые функции ценообразования (`calculateOptionPLValue`, `getOptionVolatility` и т.п.) и их импорты/сигнатуры.
- [ ] **Шаг 2:** Создать `enrich.js` с `enrichNorthGptCombination(combination, context, params)`, который по присланным ногам считает `criteria` (P&L опционов/позиции на `topPrice` и `bottomPrice`) и `meta` (уровни A/B и P&L на них) **теми же функциями**, что и «Север», и возвращает дополненную комбинацию (для отображения в `ResultCard`).
- [ ] **Шаг 3 (тест опционально):** если в `frontend/src/__tests__` есть пример — добавить простой тест на форму вывода. Иначе — ручная проверка на этапе e2e.
- [ ] **Шаг 4:** Commit: `feat(sever-gpt): client-side P&L enrichment`

### Task 3.4: Кнопка запуска

**Files:** Create `NorthGptStrategy/NorthGptButton.jsx`

- [ ] **Шаг 1:** Скопировать `NorthStrategy/NorthButton.jsx`. Изменить: градиент на сиреневый (`linear-gradient(135deg, #c084fc 0%, #a855f7 50%, #7c3aed 100%)`), `boxShadow` на `rgba(168,85,247,0.4)`, текст «СЕВЕР GPT», подсказку — про ИИ-подбор через ChatGPT. Иконку оставить Snowflake или заменить на `Sparkles`.
- [ ] **Шаг 2:** Commit: `feat(sever-gpt): lilac launch button`

### Task 3.5: Значок применённой стратегии

**Files:** Create `NorthGptStrategy/NorthGptBadge.jsx`

- [ ] **Шаг 1:** Скопировать `NorthStrategy/NorthBadge.jsx`. Изменить: сиреневый градиент, текст «Подбор СЕВЕР GPT». Пропсы те же (`onReopen`, `onCancel`).
- [ ] **Шаг 2:** Commit: `feat(sever-gpt): lilac badge`

### Task 3.6: Форма параметров + промпты

**Files:** Create `NorthGptStrategy/NorthGptParamsForm.jsx`

- [ ] **Шаг 1:** Скопировать `NorthStrategy/ParamsForm.jsx` целиком (все поля и валидация остаются).
- [ ] **Шаг 2:** Добавить блок промпта внизу формы: загрузка списка через `getPrompts()` на маунте; `<select>` сохранённых; `<textarea>` с текстом; кнопки «Сохранить как новый» (с полем имени), «Обновить выбранный», «Переименовать», «Удалить»; пометка «изменён», когда текст отличается от выбранного сохранённого.
- [ ] **Шаг 3:** Логика «активного по умолчанию»: после загрузки списка выбрать первый элемент (сервер уже сортирует «последний использованный» первым); если список пуст — подставить `DEFAULT_NORTH_GPT_PROMPT`.
- [ ] **Шаг 4:** `onAnalyze` отдаёт наверх `{...числовыеПараметры, prompt, promptId}` (promptId — id выбранного сохранённого или null). Валидация дополняется проверкой «промпт не пуст».
- [ ] **Шаг 5:** Кнопка сабмита сиреневая, текст «Подобрать через ChatGPT».
- [ ] **Шаг 6:** Commit: `feat(sever-gpt): params form with prompt library`

### Task 3.7: Экран результатов (два блока, без ползунков)

**Files:** Create `NorthGptStrategy/NorthGptResultsView.jsx`

- [ ] **Шаг 1:** Новый компонент. Две колонки (на мобиле — одна под другой): левая `kind='withStock'` («Актив + опционы»), правая `kind='optionsOnly'` («Только опционы»).
- [ ] **Шаг 2:** В каждой колонке: если блок с ошибкой — показать сообщение; иначе `<ResultCard variant="focused" combination={block} kind={block.kind} levels={...} />` (импорт из `../NorthStrategy/ResultCard.jsx`) + блок пояснения `block.rationale` + кнопка «Применить» (вызывает `onApply(block)`).
- [ ] **Шаг 3:** Общие кнопки снизу: «Подобрать заново» (`onRequery`), «Отклонить» (`onCancel`), «Вернуться к настройкам» (`onBack`). Без ползунков, без списка альтернатив.
- [ ] **Шаг 4:** Commit: `feat(sever-gpt): two-block results view`

### Task 3.8: Диалог-оркестратор

**Files:** Create `NorthGptStrategy/NorthGptStrategyDialog.jsx`

- [ ] **Шаг 1:** Скопировать `NorthStrategy/NorthStrategyDialog.jsx`. Сохранить без изменений: хелперы чтения цепочки, загрузку экспираций, команды расширения, лоадер/ошибки сбора данных.
- [ ] **Шаг 2:** Заменить шаг анализа: вместо `analyzeNorthStrategy(...)` — `await requestNorthGptCombination({params, prompt, chain, context, promptId})`; кешировать `chain` в ref. Показать сиреневый лоадер «ChatGPT подбирает комбинацию…», заблокировать кнопки на время запроса.
- [ ] **Шаг 3:** Каждый из двух блоков ответа прогнать через `enrichNorthGptCombination(...)` перед показом.
- [ ] **Шаг 4:** Обработчик «Подобрать заново» (`handleRequery`) повторяет вызов на закешированной цепочке (без команд расширения).
- [ ] **Шаг 5:** Состояние `{params, prompt, result}`; рендер `NorthGptParamsForm` (шаг params) или `NorthGptResultsView` (шаг results). Заголовок «Стратегия СЕВЕР GPT». Пробросить `onApply`, `onRequery`, `onCancel`, `onBack`.
- [ ] **Шаг 6:** Commit: `feat(sever-gpt): dialog orchestrator with ChatGPT call`

---

## Phase 4 — Фронтенд: подключение к калькулятору

### Task 4.1: Кнопка и значок в таблице опционов

**Files:** Modify `frontend/src/components/CalculatorV2/OptionsTableV3.jsx`

- [ ] **Шаг 1:** Импортировать `NorthGptButton`, `NorthGptBadge`. Добавить пропсы со значениями по умолчанию: `onOpenNorthGptStrategy=null`, `canShowNorthGptButton=false`, `northGptActive=false`, `onReopenNorthGptResults=null`, `onCancelNorthGptSelection=null`.
- [ ] **Шаг 2:** Рядом с рендером `NorthButton` добавить `{canShowNorthGptButton && onOpenNorthGptStrategy && <NorthGptButton onClick={onOpenNorthGptStrategy} />}`. Рядом с `NorthBadge` — `{northGptActive && <NorthGptBadge onReopen={onReopenNorthGptResults} onCancel={onCancelNorthGptSelection} />}`. Существующий блок «Севера» не менять.
- [ ] **Шаг 3:** Commit: `feat(sever-gpt): wire button and badge into options table`

### Task 4.2: Параллельное состояние и обработчики

**Files:** Modify `frontend/src/pages/UniversalOptionsCalculator.jsx`

- [ ] **Шаг 1:** Прочитать существующие `northDialogOpen/northDialogStep/northState`, `handleApplyNorthCombination`, `handleCancelNorthSelection`, `canShowNorthButton`, `northActive`, рендер `<NorthStrategyDialog>` и места передачи пропсов в `OptionsTableV3`.
- [ ] **Шаг 2:** Добавить параллельное состояние: `northGptDialogOpen`, `northGptDialogStep`, `northGptState`; `northGptActive = useMemo(()=>options.some(o=>o.fromNorthGptStrategy),[options])`; `canShowNorthGptButton` = та же логика, что у `canShowNorthButton`.
- [ ] **Шаг 3:** Добавить обработчики `handleOpenNorthGptStrategy`, `handleReopenNorthGptResults`, `handleNorthGptStateChange`, `handleApplyNorthGptCombination`, `handleCancelNorthGptSelection` — копии северных, но: штамп `fromNorthGptStrategy: true`, фильтрация по `fromNorthGptStrategy`, кеш `removedLongPositions` в `northGptState`. **Не трогают** элементы с `fromNorthStrategy`.
- [ ] **Шаг 4:** Отрендерить `<NorthGptStrategyDialog .../>` рядом с `<NorthStrategyDialog>`, передать те же рыночные пропсы (currentPrice, entryPrice, assetQuantity, leverage, ivSurface, calculatorMode, dividendYield, ticker, tradingViewUrl) + `initialState={northGptState}` + GPT-обработчики. Передать новые пять пропсов в `OptionsTableV3`.
- [ ] **Шаг 5:** Commit: `feat(sever-gpt): parallel state and handlers in calculator`

---

## Phase 5 — Проверка и регресс

### Task 5.1: Автотесты

- [ ] **Шаг 1:** `cd backend && python -m pytest tests/ -v` → все зелёные.
- [ ] **Шаг 2:** `cd frontend && CI=false npm test -- --watchAll=false` → существующие тесты не сломаны; сборка `npm run build` проходит.
- [ ] **Шаг 3:** Если есть линт CI по 300 строкам и он блокирует — по правилу проекта коммитить с `--no-verify`.

### Task 5.2: Ручной e2e (по разделу 11 спецификации)

- [ ] **Шаг 1:** С реальным `OPENAI_API_KEY`: лонг по активу без опционов → видны обе кнопки, сиреневая — GPT.
- [ ] **Шаг 2:** Клик GPT → экспирации грузятся тем же механизмом; заполнить параметры + промпт → подбор → POST `/select`.
- [ ] **Шаг 3:** Два блока с одной комбинацией, без ползунков, с пояснениями. «Применить» → ноги в калькуляторе с реальными ценами, сиреневый значок.
- [ ] **Шаг 4:** «Подобрать заново» (без пересбора цепочки), «Отклонить», «Вернуться к настройкам».
- [ ] **Шаг 5:** Промпты: создать/выбрать/обновить/переименовать/удалить; «последний использованный» активен при повторном открытии (в т.ч. в другом браузере — общий).
- [ ] **Шаг 6:** **Регресс «Севера»**: старый сценарий работает как раньше; применение «Севера» и «Север GPT» не удаляют ноги друг друга.

### Task 5.3: Деплой
- [ ] **Шаг 1:** Перед деплоем: `git fetch origin && git rebase origin/main`. На сервере прописать `OPENAI_API_KEY` в `.env` `/var/www/beta`.
- [ ] **Шаг 2:** Деплой `./scripts/deploy_local.sh`. Проверить на проде; подтвердить с пользователем; затем fast-forward merge ветки в `main` и очистка по процессу.

---

## Self-review (покрытие спецификации)

- §2 движок OpenAI → Task 2.3; две комбинации → схема Task 2.3 + эндпоинт Task 2.4 + вид Task 3.7; без ползунков → Task 3.7; акции решает ИИ → `stock_quantity` в схеме; промпты на сервере общие → Phase 1; последний промпт единый → `last_used_at` сортировка (Task 1.2) + Task 3.6 шаг 3; кнопки результата → Task 3.7; сиреневая кнопка → Task 3.4; «Север» нетронут → отдельные файлы + флаг (Task 4.2).
- §4 механизм промптов → Task 3.6 + Phase 1. §6 валидация → Task 2.1. §8 инструкция OpenAI → отдельный артефакт (в спецификации). §9 техплан → Phases 1–4. §10 граничные случаи → Task 2.1/2.4 (`_friendly_openai_error`, дропы), Task 3.8 (лоадер/кеш). §11 проверка → Phase 5.
- Открытые вопросы (§12): текст `DEFAULT_NORTH_GPT_PROMPT` и `north_gpt_prompt.md` дорабатываются на тестах (Task 2.3/3.2); заголовок-палитра GPT — опционально.
