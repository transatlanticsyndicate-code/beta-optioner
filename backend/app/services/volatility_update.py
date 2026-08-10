"""
Сопоставление позиций из выгрузки терминала с ногами сохранённых сделок калькулятора.

ЗАЧЕМ: разбор файла (watchlist_csv.py) отвечает только за «что написано в файле».
Здесь — правило «какую ногу какой сделки этим обновить», вынесенное из роутера,
чтобы его можно было прогонять тестами и «сухим» прогоном без базы.

ПРАВИЛА (согласованы с заказчиком):
  - обновляются только АКТИВНЫЕ сделки (status='standard') — отбор делает роутер;
  - нога обновляется, только если её количество СОВПАДАЕТ с количеством в файле.
    В файле количество — суммарная позиция по счёту, а в сделке может лежать её
    часть; при расхождении молча записать значение нельзя — оно относилось бы к
    другому размеру позиции. Такие ноги уходят в отчёт;
  - уже заполненные Fact P&L / Fact IV перезаписываются: данные терминала считаем
    более свежими, в этом и смысл актуализации;
  - ноги, которых нет в файле, не трогаем — их перечисляем в отчёте;
  - значения IV записываются как есть, без фильтрации.

Про цену якоря: в файле нет цены базового актива, поэтому actualPLPrice и
actualPLPriceSource обнуляются. Оставить старую цену рядом со свежим фактом было
бы хуже — расчёт соединил бы факт этой недели с ценой акции месячной давности.
При пустом поле калькулятор подставляет текущую цену (см. фолбэк
`opt.actualPLPrice || currentPrice` в OptionsTableV3.jsx).
"""
from typing import Any, Dict, List, Optional


def build_position_index(positions: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """
    Индекс позиций из файла по ключу «ТИКЕР|СТРАЙК-ТИП-ЭКСПИРАЦИЯ».

    Дубликаты в файле не ожидаются (терминал агрегирует позицию по символу);
    если всё же встретятся — побеждает первая строка, остальные не теряются,
    их видно по счётчику rowsTotal против длины индекса.
    """
    index: Dict[str, Dict[str, Any]] = {}
    for position in positions:
        key = make_key(position['ticker'], position['strike'], position['type'], position['expiration'])
        index.setdefault(key, position)
    return index


def make_key(ticker: Any, strike: Any, option_type: Any, expiration: Any) -> str:
    """
    Ключ сопоставления ноги: тикер + страйк + тип + дата экспирации.

    Страйк приводится к числу, а не сравнивается строкой: в базе он лежит как
    JSON-число (65 или 67.5), в файле — как текст, и '65' против '65.0' не должны
    расходиться.
    """
    normalized_ticker = str(ticker or '').strip().upper()
    try:
        normalized_strike = float(strike)
    except (TypeError, ValueError):
        normalized_strike = 0.0
    normalized_type = str(option_type or '').strip().upper()
    normalized_date = str(expiration or '').split('T')[0]
    return f'{normalized_ticker}|{normalized_strike:.4f}-{normalized_type}-{normalized_date}'


def make_frontend_option_key(ticker: Any, option: Dict[str, Any]) -> str:
    """
    Ключ ноги в том виде, в каком его строит фронтенд (utils/optionKey.js):
    `ТИКЕР|страйк-ТИП-ГГГГ-ММ-ДД`, где страйк подставлен «как в JavaScript».

    ЗАЧЕМ: по этим ключам браузер хранит локальные ручные правки и накладывает их
    поверх данных из базы при открытии сделки. После импорта фронт обязан снять
    свои старые правки Fact P&L / Fact IV по обновлённым ногам — иначе они
    перекроют то, что мы только что записали.
    """
    normalized_ticker = str(ticker or '').strip().upper()
    strike = option.get('strike') or 0
    # В JavaScript `${65}` даёт '65', а не '65.0' — повторяем это поведение,
    # иначе ключ не совпадёт с тем, что лежит в localStorage браузера.
    if isinstance(strike, float) and strike.is_integer():
        strike_text = str(int(strike))
    else:
        strike_text = str(strike)
    option_type = str(option.get('type') or '').strip().upper()
    date = str(option.get('date') or '').split('T')[0]
    return f'{normalized_ticker}|{strike_text}-{option_type}-{date}'


def _leg_label(option: Dict[str, Any]) -> str:
    """Человекочитаемое имя ноги для отчёта: 'CALL 65 · 2026-10-16'."""
    option_type = str(option.get('type') or '?').upper()
    strike = option.get('strike')
    date = str(option.get('date') or '?').split('T')[0]
    return f'{option_type} {strike} · {date}'


def apply_positions_to_deal(
    state: Dict[str, Any],
    ticker: Any,
    index: Dict[str, Dict[str, Any]],
    anchor_date: str,
) -> Dict[str, Any]:
    """
    Применить данные файла к одной сделке. Меняет state НА МЕСТЕ.

    :param state: содержимое поля state сохранённой сделки (с ключом options)
    :param ticker: тикер сделки
    :param index: индекс позиций из файла (build_position_index)
    :param anchor_date: дата, которой помечаем факт (YYYY-MM-DD)
    :return: {updated: [...], qtyMismatches: [...], notInFile: [...], matchedKeys: [...]}
             updated — что записали, matchedKeys — ключи позиций файла, которым
             нашлась нога (нужны, чтобы посчитать «в файле есть, сделки нет»).
    """
    result: Dict[str, Any] = {
        'updated': [],
        'qtyMismatches': [],
        'notInFile': [],
        'matchedKeys': [],
    }

    options = state.get('options') if isinstance(state, dict) else None
    if not isinstance(options, list):
        return result

    for option in options:
        if not isinstance(option, dict):
            continue
        # Нога без страйка/типа/даты — незаполненная строка калькулятора, пропускаем молча.
        if not option.get('strike') or not option.get('type') or not option.get('date'):
            continue

        key = make_key(ticker, option.get('strike'), option.get('type'), option.get('date'))
        position = index.get(key)

        if position is None:
            result['notInFile'].append({'leg': _leg_label(option)})
            continue

        result['matchedKeys'].append(key)

        deal_quantity = _abs_int(option.get('quantity'))
        file_quantity = _abs_int(position.get('quantity'))
        if deal_quantity is None or file_quantity is None or deal_quantity != file_quantity:
            result['qtyMismatches'].append({
                'leg': _leg_label(option),
                'symbol': position['symbol'],
                'quantityInDeal': option.get('quantity'),
                'quantityInFile': position.get('quantity'),
            })
            continue

        previous_pl = option.get('actualPL')
        previous_iv = option.get('manualIvOverride')

        option['actualPL'] = position['pl']
        option['actualPLDate'] = anchor_date
        option['actualPLQuantity'] = deal_quantity
        # Цены базового актива в файле нет — см. пояснение в шапке модуля.
        option['actualPLPrice'] = None
        option['actualPLPriceSource'] = None

        if position.get('iv') is not None:
            option['manualIvOverride'] = position['iv']
            option['manualIvOverrideDate'] = anchor_date
            option['manualIvOverrideDisplayDate'] = anchor_date
            # Снимаем зелёную подсветку «значение от расширения»: теперь значение
            # пришло из выгрузки терминала и является ручной корректировкой.
            option['ivUpdatedFromExtension'] = False

        result['updated'].append({
            'leg': _leg_label(option),
            'symbol': position['symbol'],
            'quantity': deal_quantity,
            'previousPL': previous_pl,
            'newPL': position['pl'],
            'previousIv': previous_iv,
            'newIv': position.get('iv'),
            'optionKey': make_frontend_option_key(ticker, option),
        })

    return result


def _abs_int(value: Any) -> Optional[int]:
    """
    Количество контрактов по модулю.

    ЗАЧЕМ модуль: в сделке количество может быть записано со знаком направления
    (проданная нога — отрицательное), а терминал в этой колонке даёт размер позиции.
    Сравнивать надо размеры, а не знаки.
    """
    try:
        return abs(int(round(float(value))))
    except (TypeError, ValueError):
        return None
