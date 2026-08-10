"""
Тесты актуализации Fact P&L / Fact IV по выгрузке из торгового терминала.

ЗАЧЕМ: цена ошибки здесь высокая — неверно разобранный символ или пропущенное
правило совпадения количества молча запишет чужой факт в сделку, и пользователь
увидит искажённый прогноз, не заметив подмены. Поэтому разбор файла и правило
сопоставления покрыты отдельно, без базы, включая прогон на реальной выгрузке.
"""
import os

from app.services.volatility_update import (
    apply_positions_to_deal,
    build_position_index,
    make_frontend_option_key,
)
from app.services.watchlist_csv import (
    parse_anchor_date_from_filename,
    parse_money,
    parse_percent,
    parse_quantity,
    parse_symbol,
    parse_watchlist_csv,
)

FIXTURE = os.path.join(os.path.dirname(__file__), 'fixtures', '2026-08-09-watchlist.csv')


def read_fixture() -> str:
    with open(FIXTURE, encoding='utf-8-sig') as handle:
        return handle.read()


# ===== Разбор отдельных значений =====

def test_parse_symbol_call():
    assert parse_symbol('.AA261016C65') == {
        'ticker': 'AA', 'expiration': '2026-10-16', 'type': 'CALL', 'strike': 65.0,
    }


def test_parse_symbol_put_with_fractional_strike():
    assert parse_symbol('.CCI261016P67.5') == {
        'ticker': 'CCI', 'expiration': '2026-10-16', 'type': 'PUT', 'strike': 67.5,
    }


def test_parse_symbol_single_letter_ticker():
    # .B261016C45 — тикер из одной буквы, легко спутать с частью даты.
    assert parse_symbol('.B261016C45')['ticker'] == 'B'


def test_parse_symbol_rejects_garbage():
    assert parse_symbol('AAPL') is None
    assert parse_symbol('.AA26101XC65') is None
    assert parse_symbol('') is None


def test_parse_money_negative_in_brackets():
    assert parse_money('($232.65)') == -232.65


def test_parse_money_thousands_separator():
    assert parse_money('$1,767.34') == 1767.34
    assert parse_money('($2,143.32)') == -2143.32


def test_parse_money_empty():
    assert parse_money('') is None
    assert parse_money(None) is None


def test_parse_quantity_and_percent():
    assert parse_quantity('+4') == 4
    assert parse_quantity('-3') == -3
    assert parse_percent('53.93%') == 53.93
    assert parse_percent('1.67%') == 1.67


def test_anchor_date_from_filename():
    assert parse_anchor_date_from_filename('2026-08-09-watchlist.csv') == '2026-08-09'
    assert parse_anchor_date_from_filename('watchlist.csv') is None
    assert parse_anchor_date_from_filename(None) is None


# ===== Разбор файла целиком =====

def test_parse_real_file():
    result = parse_watchlist_csv(read_fixture())

    assert result['hasHeader'] is True
    # В реальной выгрузке 138 строк позиций и все они должны быть разобраны.
    assert result['rowsTotal'] == 138
    assert len(result['positions']) == 138
    assert result['unparsed'] == []

    first = result['positions'][0]
    assert first['symbol'] == '.AA261016C65'
    assert first['ticker'] == 'AA'
    assert first['type'] == 'CALL'
    assert first['strike'] == 65.0
    assert first['expiration'] == '2026-10-16'
    assert first['pl'] == -232.65
    assert first['quantity'] == 4
    assert first['iv'] == 53.93


def test_parse_file_skips_service_rows():
    # Служебные строки над заголовком не должны попасть в позиции.
    symbols = [p['symbol'] for p in parse_watchlist_csv(read_fixture())['positions']]
    assert all(symbol.startswith('.') for symbol in symbols)


def test_parse_file_without_header():
    result = parse_watchlist_csv('просто текст\nбез таблицы\n')
    assert result['hasHeader'] is False
    assert result['positions'] == []


# ===== Правило сопоставления =====

def make_state(**overrides):
    option = {
        'id': 1,
        'action': 'Buy',
        'type': 'CALL',
        'strike': 65,
        'date': '2026-10-16',
        'quantity': 4,
        'ask': 1.10,
    }
    option.update(overrides)
    return {'options': [option]}


POSITIONS = [{
    'symbol': '.AA261016C65',
    'ticker': 'AA',
    'expiration': '2026-10-16',
    'type': 'CALL',
    'strike': 65.0,
    'pl': -232.65,
    'quantity': 4,
    'iv': 53.93,
}]


def test_writes_fact_values_when_quantity_matches():
    state = make_state()
    index = build_position_index(POSITIONS)

    result = apply_positions_to_deal(state, 'AA', index, '2026-08-09')

    option = state['options'][0]
    assert option['actualPL'] == -232.65
    assert option['actualPLDate'] == '2026-08-09'
    assert option['actualPLQuantity'] == 4
    assert option['manualIvOverride'] == 53.93
    assert option['manualIvOverrideDate'] == '2026-08-09'
    assert len(result['updated']) == 1
    assert result['qtyMismatches'] == []


def test_anchor_price_is_cleared():
    # В файле нет цены базового актива — старая цена рядом со свежим фактом
    # дала бы неверный расчёт, поэтому обнуляется.
    state = make_state(actualPLPrice=71.2, actualPLPriceSource='market')
    apply_positions_to_deal(state, 'AA', build_position_index(POSITIONS), '2026-08-09')

    assert state['options'][0]['actualPLPrice'] is None
    assert state['options'][0]['actualPLPriceSource'] is None


def test_overwrites_existing_values():
    state = make_state(actualPL=-100.0, manualIvOverride=40.0)
    apply_positions_to_deal(state, 'AA', build_position_index(POSITIONS), '2026-08-09')

    assert state['options'][0]['actualPL'] == -232.65
    assert state['options'][0]['manualIvOverride'] == 53.93


def test_skips_leg_when_quantity_differs():
    state = make_state(quantity=2)
    result = apply_positions_to_deal(state, 'AA', build_position_index(POSITIONS), '2026-08-09')

    assert result['updated'] == []
    assert len(result['qtyMismatches']) == 1
    assert result['qtyMismatches'][0]['quantityInDeal'] == 2
    assert result['qtyMismatches'][0]['quantityInFile'] == 4
    assert 'actualPL' not in state['options'][0]


def test_quantity_compared_by_absolute_value():
    # Проданная нога хранится с отрицательным количеством, в файле — размер позиции.
    state = make_state(quantity=-4, action='Sell')
    result = apply_positions_to_deal(state, 'AA', build_position_index(POSITIONS), '2026-08-09')

    assert len(result['updated']) == 1
    assert state['options'][0]['actualPLQuantity'] == 4


def test_leg_absent_from_file_is_untouched():
    state = make_state(strike=999)
    result = apply_positions_to_deal(state, 'AA', build_position_index(POSITIONS), '2026-08-09')

    assert result['updated'] == []
    assert len(result['notInFile']) == 1
    assert 'actualPL' not in state['options'][0]


def test_other_ticker_does_not_match():
    state = make_state()
    result = apply_positions_to_deal(state, 'BB', build_position_index(POSITIONS), '2026-08-09')

    assert result['updated'] == []
    assert len(result['notInFile']) == 1


def test_integer_and_float_strike_match():
    # В базе страйк может лежать и как 65, и как 65.0 — ключ должен совпасть.
    for strike in (65, 65.0):
        state = make_state(strike=strike)
        result = apply_positions_to_deal(state, 'AA', build_position_index(POSITIONS), '2026-08-09')
        assert len(result['updated']) == 1, f'страйк {strike!r} не сопоставился'


def test_frontend_option_key_matches_javascript_format():
    # Ключ должен совпадать с utils/optionKey.js: `${strike}` в JS даёт '65', не '65.0'.
    assert make_frontend_option_key('aa', {'strike': 65, 'type': 'call', 'date': '2026-10-16'}) == 'AA|65-CALL-2026-10-16'
    assert make_frontend_option_key('AA', {'strike': 65.0, 'type': 'CALL', 'date': '2026-10-16'}) == 'AA|65-CALL-2026-10-16'
    assert make_frontend_option_key('CCI', {'strike': 67.5, 'type': 'PUT', 'date': '2026-10-16'}) == 'CCI|67.5-PUT-2026-10-16'
