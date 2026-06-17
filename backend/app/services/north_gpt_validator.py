"""
Валидация и восстановление опционных комбинаций, полученных от ChatGPT.
ЗАЧЕМ: модель присылает только тип/страйк/количество/сторону — мы СВЕРЯЕМ
каждую ногу с реальной цепочкой TradingView и подставляем настоящие цены/греки.
Это гарантирует, что в калькулятор не попадёт несуществующий опцион или
выдуманная цена. Чистая логика без сети — легко тестируется.
"""
from datetime import date


def _skey(strike):
    """Нормализованный ключ страйка (защита от расхождений float)."""
    return round(float(strike), 4)


def _norm_iv(v):
    """IV в долях: если пришло в процентах (>1.5) — делим на 100."""
    if v is None:
        return None
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return v / 100.0 if v > 1.5 else v


def build_chain_index(chain, entry_price):
    """
    Индекс цепочки по (тип, страйк) для O(1) поиска.
    Берём только строки с положительными ask и IV — как в анализаторе «Севера».
    """
    idx = {}
    for row in chain or []:
        t = (row.get("type") or "").upper()
        if t not in ("CALL", "PUT"):
            continue
        ask = row.get("ask")
        iv = row.get("impliedVolatility", row.get("iv"))
        if not ask or float(ask) <= 0:
            continue
        if not iv or float(iv) <= 0:
            continue
        idx[(t, _skey(row["strike"]))] = {**row, "type": t, "_entry": entry_price}
    return idx


def _snapshot(row, qty, entry_price):
    """Полный снимок ноги для калькулятора (action=Buy, premium=ask)."""
    return {
        "action": "Buy",
        "type": row["type"],
        "strike": float(row["strike"]),
        "date": row.get("date"),
        "quantity": int(qty),
        "premium": float(row["ask"]),
        "bid": row.get("bid"),
        "ask": float(row["ask"]),
        "volume": row.get("volume"),
        "oi": row.get("oi", row.get("openInterest")),
        "visible": True,
        "impliedVolatility": _norm_iv(row.get("impliedVolatility", row.get("iv"))),
        "delta": row.get("delta"),
        "gamma": row.get("gamma"),
        "theta": row.get("theta"),
        "vega": row.get("vega"),
        "entryDate": date.today().isoformat(),
        "assetPriceAtEntry": entry_price,
    }


def validate_combination(legs, stock_quantity, chain_index, ranges):
    """
    Проверить и восстановить ноги комбинации по цепочке.
    Возвращает {positions, calls, puts, qtyStock, errors}.
    positions пуст => комбинация невалидна (показать ошибку в блоке).
    """
    errors = []
    merged = {}
    entry_price = None
    if chain_index:
        entry_price = next(iter(chain_index.values())).get("_entry")

    for leg in legs or []:
        t = (leg.get("option_type") or "").upper()
        side = (leg.get("side") or "").upper()
        if t not in ("CALL", "PUT") or side != "BUY":
            errors.append(f"Неверная нога: {leg}")
            continue
        try:
            strike = float(leg.get("strike"))
        except (TypeError, ValueError):
            errors.append(f"Неверный страйк: {leg}")
            continue
        row = chain_index.get((t, _skey(strike)))
        if not row:
            errors.append(f"Страйк не найден в цепочке: {t} {strike}")
            continue
        lo, hi = ranges["call"] if t == "CALL" else ranges["put"]
        if lo is not None and hi is not None and not (lo <= strike <= hi):
            errors.append(f"Страйк вне диапазона: {t} {strike}")
            continue
        qty = max(1, int(leg.get("quantity", 1)))
        key = (t, _skey(strike))
        merged[key] = merged.get(key, 0) + qty

    positions = [_snapshot(chain_index[k], q, entry_price) for k, q in merged.items()]
    calls = [p for p in positions if p["type"] == "CALL"]
    puts = [p for p in positions if p["type"] == "PUT"]
    qty_stock = max(0, int(stock_quantity or 0))
    if not positions:
        errors.append("Не осталось валидных ног")
    return {"positions": positions, "calls": calls, "puts": puts,
            "qtyStock": qty_stock, "errors": errors}


def compute_cost(positions, qty_stock, entry_price, leverage, contract_multiplier=100,
                 mode=None, margin_per_contract=None):
    """
    Стоимость/маржин комбинации (как в «Севере»: опционы по ask * множитель контракта).
    ЗАЧЕМ contract_multiplier: для акций/ETF контракт = 100 единиц базового актива,
    для крипты (Binance) = 1, для фьючерсов = стоимость пункта (pointValue). Без этого
    стоимость опционов и доля актива в марже считались бы неверно. Дефолт 100 — обр. совм.

    ЗАЧЕМ mode/margin_per_contract: у фьючерсов залог под базовый актив — это биржевая
    «маржа за контракт» (кол-во × margin_per_contract), а НЕ «цена × кол-во / плечо», как
    у акций/крипты. Плечо к фьючерсной марже не применяется.
    """
    options_cost = sum(float(p["ask"]) * contract_multiplier * int(p["quantity"]) for p in positions)
    if (mode or "").lower() == "futures":
        # Фьючерс: залог = кол-во контрактов × маржа за контракт (если задана, иначе 0).
        mpc = float(margin_per_contract) if margin_per_contract else 0
        stock_margin = qty_stock * mpc if qty_stock else 0
    else:
        lev = leverage if leverage and leverage > 0 else 1.0
        stock_margin = (qty_stock * entry_price) / lev if qty_stock and entry_price else 0
    margin_used = stock_margin + options_cost
    pct = (stock_margin / margin_used) if margin_used > 0 else 0
    return {
        "optionsCost": options_cost,
        "stockMargin": stock_margin,
        "marginUsed": margin_used,
        "stockMarginPct": pct,
    }
