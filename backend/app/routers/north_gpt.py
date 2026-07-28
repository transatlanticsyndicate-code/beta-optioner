"""
API роутер стратегии «Север GPT»
ЗАЧЕМ: библиотека промптов (CRUD) и эндпоинт ИИ-подбора опционных комбинаций
через ChatGPT. Аутентификации в проекте нет — промпты общие для всех.
"""
import uuid
import time
import threading
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from sqlalchemy import nullslast
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from app.database import get_db
from app.models.north_gpt_prompt import NorthGptPrompt
from app.services import north_gpt_validator as validator
from app.services.openai_client import OpenAIClient

router = APIRouter(prefix="/api/north-gpt", tags=["north_gpt"])


# ============ Pydantic: промпты ============
class PromptCreate(BaseModel):
    name: str
    text: str


class PromptUpdate(BaseModel):
    name: Optional[str] = None
    text: Optional[str] = None


# ============ CRUD библиотеки промптов ============
@router.get("/prompts")
def list_prompts(db: Session = Depends(get_db)):
    """
    Список промптов. Первым идёт последний использованный
    (last_used_at desc, NULL — в конце), затем по дате обновления.
    ЗАЧЕМ: фронтенд берёт первый элемент как активный по умолчанию.
    """
    items = (
        db.query(NorthGptPrompt)
        .order_by(
            nullslast(NorthGptPrompt.last_used_at.desc()),
            NorthGptPrompt.updated_at.desc(),
        )
        .all()
    )
    return {"status": "success", "data": [p.to_dict() for p in items]}


@router.post("/prompts")
def create_prompt(body: PromptCreate, db: Session = Depends(get_db)):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Название промпта не может быть пустым")
    if not (body.text or "").strip():
        raise HTTPException(status_code=400, detail="Текст промпта не может быть пустым")
    prompt = NorthGptPrompt(name=name, text=body.text)
    db.add(prompt)
    db.commit()
    db.refresh(prompt)
    return {"status": "success", "data": prompt.to_dict()}


@router.put("/prompts/{prompt_id}")
def update_prompt(prompt_id: str, body: PromptUpdate, db: Session = Depends(get_db)):
    prompt = db.query(NorthGptPrompt).filter(NorthGptPrompt.id == prompt_id).first()
    if not prompt:
        raise HTTPException(status_code=404, detail="Промпт не найден")
    if body.name is not None:
        new_name = body.name.strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Название промпта не может быть пустым")
        prompt.name = new_name
    if body.text is not None:
        prompt.text = body.text
    db.commit()
    db.refresh(prompt)
    return {"status": "success", "data": prompt.to_dict()}


@router.delete("/prompts/{prompt_id}")
def delete_prompt(prompt_id: str, db: Session = Depends(get_db)):
    prompt = db.query(NorthGptPrompt).filter(NorthGptPrompt.id == prompt_id).first()
    if not prompt:
        raise HTTPException(status_code=404, detail="Промпт не найден")
    db.delete(prompt)
    db.commit()
    return {"status": "success"}


@router.post("/prompts/{prompt_id}/touch")
def touch_prompt(prompt_id: str, db: Session = Depends(get_db)):
    """Отметить промпт как последний использованный (обновить last_used_at)."""
    prompt = db.query(NorthGptPrompt).filter(NorthGptPrompt.id == prompt_id).first()
    if not prompt:
        raise HTTPException(status_code=404, detail="Промпт не найден")
    prompt.last_used_at = func.now()
    db.commit()
    db.refresh(prompt)
    return {"status": "success", "data": prompt.to_dict()}


# ============ Pydantic: подбор комбинаций ============
class NorthGptParams(BaseModel):
    expirationDate: Optional[str] = None
    # Двойная экспирация: при непустом значении (и отличном от основной даты)
    # подбор выполняется отдельно ещё и под эту дату — итого четыре варианта.
    alternativeExpirationDate: Optional[str] = None
    # Считать ли вариант «актив + опционы». False — модель собирает только
    # опционную конструкцию и не тратит токены на вариант с активом.
    # По умолчанию True — обратная совместимость со старым фронтендом.
    withAssetEnabled: Optional[bool] = True
    calcDate: Optional[str] = None
    topPrice: Optional[float] = None
    bottomPrice: Optional[float] = None
    callStrikeMin: Optional[float] = None
    callStrikeMax: Optional[float] = None
    putStrikeMin: Optional[float] = None
    putStrikeMax: Optional[float] = None
    plTolerance: Optional[float] = None
    margin: Optional[float] = None
    marginTolerance: Optional[float] = None
    minStockMarginPct: Optional[float] = None

    class Config:
        extra = "allow"


class NorthGptContext(BaseModel):
    entryPrice: float
    assetQuantity: Optional[float] = None
    leverage: Optional[float] = 1.0
    currentPrice: Optional[float] = None
    calculatorMode: Optional[str] = None
    dividendYield: Optional[float] = None
    ticker: Optional[str] = None
    # Фьючерсы: стоимость пункта (множитель контракта) и маржа за контракт.
    pointValue: Optional[float] = None
    marginPerContract: Optional[float] = None

    class Config:
        extra = "allow"


class NorthGptSelectRequest(BaseModel):
    params: NorthGptParams
    prompt: str = ""
    chain: List[Dict[str, Any]] = []
    context: NorthGptContext
    promptId: Optional[str] = None


# ЗАЧЕМ: фабрика клиента вынесена отдельно, чтобы тесты могли подменить её мок-объектом
def get_openai_client():
    return OpenAIClient()


def _friendly_openai_error(e):
    """Понятное русское сообщение по типу ошибки OpenAI."""
    name = type(e).__name__
    msg = str(e)
    low = msg.lower()
    if name == "AuthenticationError" or "api key" in low or "OPENAI_API_KEY" in msg:
        return "ChatGPT не настроен: отсутствует или неверный ключ API"
    if name == "APITimeoutError" or "timeout" in low or "timed out" in low:
        return "ChatGPT не ответил вовремя, попробуйте ещё раз"
    if name == "RateLimitError" or "rate limit" in low:
        return "Слишком много запросов к ChatGPT, подождите немного"
    return f"Ошибка ChatGPT: {msg}"


def _filter_chain(chain, expiration):
    """Оставить только выбранную экспирацию (защита, фронт уже фильтрует)."""
    out = []
    for row in chain or []:
        d = row.get("date")
        if expiration and d and d != expiration:
            continue
        out.append(row)
    return out


def _compact_chain(chain, multiplier):
    """Компактная цепочка для промпта (меньше токенов): модели не нужны греки кроме delta.

    multiplier — множитель контракта (100 акции / 1 крипта / стоимость пункта фьючерс):
    нужен, чтобы отдать модели ГОТОВУЮ стоимость 1 контракта (cost), иначе модель
    угадывает множитель — для фьючерсов неверно.
    """
    compact = []
    for row in chain:
        ask = row.get("ask")
        try:
            cost = round(float(ask) * multiplier) if ask else None
        except (TypeError, ValueError):
            cost = None
        compact.append({
            "type": (row.get("type") or "").upper(),
            "strike": row.get("strike"),
            "bid": row.get("bid"),
            "ask": row.get("ask"),
            "iv": row.get("impliedVolatility", row.get("iv")),
            "delta": row.get("delta"),
            # Готовый P&L 1 контракта на дату расчёта при цене topPrice / bottomPrice
            # (считается фронтендом тем же движком, что и экран). Модель их складывает.
            "plTop": row.get("plTop"),
            "plBottom": row.get("plBottom"),
            # Готовая стоимость/маржа 1 купленного контракта в долларах (ask × множитель) —
            # тот же базис, что и compute_cost. Модель суммирует для маржи сделки.
            "cost": cost,
        })
    return compact


def _fmt_num(v):
    """Число для подстановки в промпт: без лишнего .0."""
    if v is None:
        return ""
    try:
        f = float(v)
        return str(int(f)) if f == int(f) else str(f)
    except (TypeError, ValueError):
        return str(v)


def _fill_prompt_placeholders(prompt, c):
    """
    Подставить значения параметров вместо плейсхолдеров в тексте промпта.
    ЗАЧЕМ: пользователь пишет промпт со ссылками ({вход}, {цель_верх}, ...),
    а при подборе на их место подставляются реальные числа из параметров.
    Неизвестные плейсхолдеры остаются как есть.
    """
    if not prompt:
        return prompt
    days = ""
    cd = c.get("calcDate")
    if cd:
        try:
            from datetime import date
            y, m, d = (int(x) for x in str(cd).split("-"))
            days = str((date(y, m, d) - date.today()).days)
        except Exception:
            days = ""
    mapping = {
        "{вход}": _fmt_num(c.get("entryPrice")),
        "{текущая}": _fmt_num(c.get("currentPrice")),
        "{цель_верх}": _fmt_num(c.get("topPrice")),
        "{цель_низ}": _fmt_num(c.get("bottomPrice")),
        "{маржин}": _fmt_num(c.get("margin")),
        "{допуск_маржин}": _fmt_num(c.get("marginTolerance")),
        "{допуск_низ}": _fmt_num(c.get("plTolerance")),
        "{плечо}": _fmt_num(c.get("leverage")),
        "{доля_акции}": _fmt_num(c.get("minStockMarginPct")),
        "{страйки_колл}": f"{_fmt_num(c.get('callStrikeMin'))}-{_fmt_num(c.get('callStrikeMax'))}",
        "{страйки_пут}": f"{_fmt_num(c.get('putStrikeMin'))}-{_fmt_num(c.get('putStrikeMax'))}",
        "{дата}": str(cd or ""),
        "{экспирация}": str(c.get("expirationDate") or ""),
        "{дней}": days,
    }
    out = prompt
    for token, value in mapping.items():
        out = out.replace(token, value)
    return out


def _contract_multiplier(context):
    """
    Множитель контракта по режиму калькулятора: крипта (Binance) = 1, фьючерсы =
    стоимость пункта (pointValue), иначе (акции/ETF) = 100.
    ЗАЧЕМ: опционы на акции/ETF — это 100 единиц базового актива, крипто-опционы Binance — 1,
    у фьючерсов цена опциона умножается на стоимость пункта контракта.
    """
    mode = (context.get("calculatorMode") or "").lower()
    if mode == "crypto":
        return 1
    if mode == "futures":
        pv = context.get("pointValue")
        try:
            pv = float(pv)
        except (TypeError, ValueError):
            pv = 0
        return pv if pv > 0 else 1  # фолбэк 1, если стоимость пункта не передана
    return 100


def _build_block(combo, chain_index, ranges, context):
    """Собрать один блок ответа: валидация ног + стоимость + режим."""
    combo = combo or {}
    rationale = combo.get("rationale", "")
    res = validator.validate_combination(
        legs=combo.get("legs", []),
        stock_quantity=combo.get("stock_quantity", 0),
        chain_index=chain_index, ranges=ranges)
    if not res["positions"]:
        return {"error": "ChatGPT не собрал валидную комбинацию из доступных страйков",
                "rationale": rationale}
    cost = validator.compute_cost(
        res["positions"], res["qtyStock"],
        context.get("entryPrice"), context.get("leverage", 1.0),
        _contract_multiplier(context),
        mode=context.get("calculatorMode"),
        margin_per_contract=context.get("marginPerContract"))
    kind = "withStock" if res["qtyStock"] > 0 else "optionsOnly"
    return {"kind": kind, "positions": res["positions"], "calls": res["calls"],
            "puts": res["puts"], "qtyStock": res["qtyStock"], "cost": cost,
            "rationale": rationale}


# ===== Асинхронный подбор =====
# ЗАЧЕМ: gpt-5.5 «думает» 2-3 минуты. Держать HTTP-соединение открытым так долго
# ненадёжно (прокси/таймауты). Поэтому запускаем работу в фоновом потоке, сразу
# отдаём jobId, а фронтенд опрашивает результат через GET /select/{jobId}.
_JOBS = {}
_JOBS_LOCK = threading.Lock()
_EXECUTOR = ThreadPoolExecutor(max_workers=4)
_JOB_TTL = 900  # сек — через сколько забываем старые задачи


def _prune_jobs():
    cutoff = time.time() - _JOB_TTL
    with _JOBS_LOCK:
        for k in [k for k, v in _JOBS.items() if v.get("ts", 0) < cutoff]:
            _JOBS.pop(k, None)


def _select_for_expiration(req, expiration, ctx, ranges, with_asset=True):
    """
    Подбор комбинаций для ОДНОЙ экспирации.
    Возвращает {withAsset, optionsOnly, debug}. Цепочка фильтруется по дате —
    общий плоский список (в двойном режиме содержит обе экспирации) сужается до
    нужной. Это позволяет переиспользовать логику для каждой даты без изменений.

    with_asset=False — вариант «актив + опционы» выключен пользователем: модель
    просят собрать ТОЛЬКО опционную конструкцию (см. select_combinations), поэтому
    токены на ненужный вариант не тратятся, а withAsset в ответе = None.
    """
    p = req.params
    full_chain = _filter_chain(req.chain, expiration)
    idx = validator.build_chain_index(full_chain, ctx.get("entryPrice"))
    # Множитель контракта (100/1/стоимость пункта) — тот же, что в compute_cost.
    mult = _contract_multiplier(ctx)
    compact = _compact_chain(full_chain, mult)
    # Позиционный контекст (вход, текущая цена, плечо) — иначе ИИ не посчитает
    # P&L всей позиции и размер акции. Тикер намеренно НЕ передаём (обезличенность).
    constraints = p.model_dump()
    # Этот вызов подбирает строго под свою дату: фиксируем её и убираем
    # альтернативную, чтобы плейсхолдер {экспирация} и сама модель не путались.
    constraints["expirationDate"] = expiration
    constraints.pop("alternativeExpirationDate", None)
    # Флаг «считать вариант с активом» — служебный, модели он не нужен.
    constraints.pop("withAssetEnabled", None)
    if not with_asset:
        # Порог доли акции относится только к варианту «актив + опционы» —
        # при выключенном варианте не занимаем им внимание модели.
        constraints.pop("minStockMarginPct", None)
    constraints["entryPrice"] = ctx.get("entryPrice")
    constraints["currentPrice"] = ctx.get("currentPrice")
    constraints["leverage"] = ctx.get("leverage")
    # Базис расчёта маржи и P&L актива для модели (совпадает с compute_cost):
    # без него модель угадывает множитель и для фьючерсов промахивается по марже.
    mode = (ctx.get("calculatorMode") or "").lower()
    if mode == "futures":
        # Залог под 1 контракт фьючерса = маржа за контракт; P&L актива × стоимость пункта.
        constraints["assetMarginPerUnit"] = ctx.get("marginPerContract") or 0
        constraints["assetPlMultiplier"] = mult
    else:
        # Акции/крипта: залог под 1 единицу = цена / плечо; P&L актива без множителя.
        lev = ctx.get("leverage") or 1.0
        entry = ctx.get("entryPrice") or 0
        constraints["assetMarginPerUnit"] = (entry / lev) if lev else entry
        constraints["assetPlMultiplier"] = 1
    # Подстановка реальных чисел вместо плейсхолдеров ({вход}, {цель_верх}, ...).
    filled_prompt = _fill_prompt_placeholders(req.prompt, constraints)
    out = get_openai_client().select_combinations(
        filled_prompt, constraints, compact, with_asset=with_asset)
    result, debug = out if isinstance(out, tuple) else (out, {})
    return {
        # Вариант с активом не запрашивали — блок не собираем (модель его и не присылала).
        "withAsset": _build_block(result.get("with_asset"), idx, ranges, ctx) if with_asset else None,
        "optionsOnly": _build_block(result.get("options_only"), idx, ranges, ctx),
        "debug": debug,  # точный запрос и сырой ответ для служебного просмотра
    }


def _do_select(req):
    """Сама работа подбора (выполняется в фоновом потоке). Может бросить исключение."""
    p = req.params
    ranges = {"call": (p.callStrikeMin, p.callStrikeMax),
              "put": (p.putStrikeMin, p.putStrikeMax)}
    ctx = req.context.model_dump()

    alt = p.alternativeExpirationDate
    alt = alt.strip() if isinstance(alt, str) else alt
    dual = bool(alt) and alt != p.expirationDate
    # Выключенный вариант «актив + опционы» — не просим его у модели вовсе.
    # None (старый фронтенд без флага) трактуем как «считать оба».
    with_asset = p.withAssetEnabled is not False

    # Одиночный режим — прежняя форма ответа {withAsset, optionsOnly, debug}.
    if not dual:
        return _select_for_expiration(req, p.expirationDate, ctx, ranges, with_asset)

    # Двойной режим: два независимых подбора (основная + альтернативная дата).
    # Выполняем ПАРАЛЛЕЛЬНО — каждый вызов gpt-5.5 «думает» минуты, поэтому
    # параллельность держит общее время на уровне одного подбора. Локальный пул
    # не конкурирует с основным _EXECUTOR (вызовы сетевые/IO-bound).
    with ThreadPoolExecutor(max_workers=2) as pool:
        fut_primary = pool.submit(_select_for_expiration, req, p.expirationDate, ctx, ranges, with_asset)
        fut_alt = pool.submit(_select_for_expiration, req, alt, ctx, ranges, with_asset)
        primary = fut_primary.result()
        alternative = fut_alt.result()
    return {
        "dual": True,
        "primary": {"expirationDate": p.expirationDate,
                    "withAsset": primary["withAsset"], "optionsOnly": primary["optionsOnly"]},
        "alternative": {"expirationDate": alt,
                        "withAsset": alternative["withAsset"], "optionsOnly": alternative["optionsOnly"]},
        "debug": {"primary": primary["debug"], "alternative": alternative["debug"]},
    }


def _run_select_job(job_id, req):
    try:
        res = _do_select(req)
        with _JOBS_LOCK:
            _JOBS[job_id] = {"status": "done", "result": res, "ts": time.time()}
    except Exception as e:
        with _JOBS_LOCK:
            _JOBS[job_id] = {"status": "error", "error": _friendly_openai_error(e), "ts": time.time()}


@router.post("/select")
def select(req: NorthGptSelectRequest, db: Session = Depends(get_db)):
    """Запустить подбор в фоне; вернуть {status:'pending', jobId}."""
    _prune_jobs()
    # Отметить выбранный промпт как последний использованный (быстро, синхронно).
    if req.promptId:
        prompt = db.query(NorthGptPrompt).filter(NorthGptPrompt.id == req.promptId).first()
        if prompt:
            prompt.last_used_at = func.now()
            db.commit()
    job_id = uuid.uuid4().hex
    with _JOBS_LOCK:
        _JOBS[job_id] = {"status": "pending", "ts": time.time()}
    _EXECUTOR.submit(_run_select_job, job_id, req)
    return {"status": "pending", "jobId": job_id}


@router.get("/select/{job_id}")
def select_result(job_id: str):
    """Опрос результата подбора по jobId."""
    _prune_jobs()
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
    if not job:
        return {"status": "error", "error": "Задача не найдена или устарела — запустите подбор заново."}
    if job["status"] == "pending":
        return {"status": "pending"}
    if job["status"] == "error":
        return {"status": "error", "error": job.get("error", "Ошибка подбора")}
    return {"status": "success", **job["result"]}
