"""
Тесты валидации/восстановления комбинаций «Север GPT».
ЗАЧЕМ: галлюцинации страйков и выдуманные цены не должны попадать в калькулятор.
"""
from app.services.north_gpt_validator import (
    build_chain_index, validate_combination, compute_cost,
)

CHAIN = [
    {"type": "CALL", "strike": 150.0, "date": "2026-07-17", "bid": 5.0, "ask": 5.2,
     "impliedVolatility": 0.30, "delta": 0.5, "gamma": 0.02, "theta": -0.05, "vega": 0.1, "volume": 100},
    {"type": "PUT", "strike": 140.0, "date": "2026-07-17", "bid": 4.0, "ask": 4.3,
     "impliedVolatility": 0.32, "delta": -0.4, "gamma": 0.02, "theta": -0.04, "vega": 0.1, "volume": 80},
]
RANGES = {"call": (145.0, 160.0), "put": (130.0, 145.0)}


def test_valid_legs_get_real_prices():
    idx = build_chain_index(CHAIN, entry_price=145.0)
    out = validate_combination(
        legs=[{"option_type": "CALL", "strike": 150.0, "quantity": 1, "side": "BUY"}],
        stock_quantity=0, chain_index=idx, ranges=RANGES)
    assert len(out["positions"]) == 1
    assert out["positions"][0]["premium"] == 5.2  # ask из цепочки
    assert out["positions"][0]["action"] == "Buy"
    assert out["positions"][0]["assetPriceAtEntry"] == 145.0


def test_nonexistent_strike_dropped():
    idx = build_chain_index(CHAIN, entry_price=145.0)
    out = validate_combination(
        legs=[{"option_type": "CALL", "strike": 999.0, "quantity": 1, "side": "BUY"}],
        stock_quantity=0, chain_index=idx, ranges=RANGES)
    assert out["positions"] == []
    assert out["errors"]


def test_out_of_range_strike_dropped():
    idx = build_chain_index(CHAIN, entry_price=145.0)
    out = validate_combination(
        legs=[{"option_type": "PUT", "strike": 140.0, "quantity": 1, "side": "BUY"}],
        stock_quantity=0, chain_index=idx, ranges={"call": (145, 160), "put": (141, 145)})
    assert out["positions"] == []


def test_sell_side_rejected():
    idx = build_chain_index(CHAIN, entry_price=145.0)
    out = validate_combination(
        legs=[{"option_type": "CALL", "strike": 150.0, "quantity": 1, "side": "SELL"}],
        stock_quantity=0, chain_index=idx, ranges=RANGES)
    assert out["positions"] == []


def test_duplicate_legs_merged():
    idx = build_chain_index(CHAIN, entry_price=145.0)
    out = validate_combination(
        legs=[{"option_type": "CALL", "strike": 150.0, "quantity": 1, "side": "BUY"},
              {"option_type": "CALL", "strike": 150.0, "quantity": 2, "side": "BUY"}],
        stock_quantity=0, chain_index=idx, ranges=RANGES)
    assert len(out["positions"]) == 1
    assert out["positions"][0]["quantity"] == 3


def test_zero_ask_excluded_from_index():
    chain = [{"type": "CALL", "strike": 150.0, "date": "2026-07-17", "bid": 0, "ask": 0,
              "impliedVolatility": 0.3}]
    idx = build_chain_index(chain, entry_price=145.0)
    assert idx == {}


def test_compute_cost_options_only():
    positions = [{"type": "CALL", "ask": 5.2, "quantity": 1},
                 {"type": "PUT", "ask": 4.3, "quantity": 1}]
    c = compute_cost(positions, qty_stock=0, entry_price=145.0, leverage=1.0)
    assert round(c["optionsCost"], 2) == round((5.2 + 4.3) * 100, 2)
    assert c["stockMargin"] == 0
    assert c["marginUsed"] == c["optionsCost"]


def test_compute_cost_with_stock():
    positions = [{"type": "CALL", "ask": 5.2, "quantity": 1}]
    c = compute_cost(positions, qty_stock=100, entry_price=145.0, leverage=1.0)
    assert c["stockMargin"] == 100 * 145.0
    assert c["marginUsed"] == 100 * 145.0 + 5.2 * 100
    assert 0 < c["stockMarginPct"] < 1
