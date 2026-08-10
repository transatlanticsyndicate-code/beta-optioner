"""
Разбор CSV-выгрузки позиций из торгового терминала (watchlist «Current account positions»).

ЗАЧЕМ: Fact P&L и Fact IV в сохранённых сделках калькулятора вносились вручную,
по одной ноге. Терминал умеет выгружать текущие позиции файлом, где по каждому
опциону уже есть и фактическая P/L, и подразумеваемая волатильность — этот модуль
превращает такой файл в список позиций, пригодный для сопоставления со сделками.

Модуль НАМЕРЕННО не знает ни про базу, ни про FastAPI — только текст на входе и
структуры на выходе. Так его можно прогонять тестами на реальном файле без БД.

Формат файла (проверено на выгрузке 2026-08-09):

    Watchlist 'Current account positions'
    <пустая строка>
    Current account positions
    Symbol,P/L Open,Pos Qty,Bid,Ask,Avg Price,Impl Vol
    .AA261016C65,($232.65),+4,.83,1.10,$1.54,53.93%
    .ADSK260918C240,"$1,767.34",+1,21.50,25.90,$6.02,57.44%

Особенности, из-за которых нельзя обойтись простым split(','):
  - суммы больше тысячи закавычены и содержат запятую-разделитель разрядов;
  - убыток записан скобками, а не минусом: ($232.65) = −232.65;
  - строки над заголовком — служебные, их в таблице нет.
"""
import csv
import io
import re
from typing import Any, Dict, List, Optional

# Символ опциона: .AA261016C65 → тикер AA, экспирация 2026-10-16, CALL, страйк 65.
# Страйк бывает дробным (.CCI261016P67.5), поэтому точка в конце допускается.
# Тикер — только буквы: в выгрузке терминала цифры сразу после тикера означают дату,
# и любой символ с цифрой в тикере разобрать однозначно нельзя — такие строки
# осознанно уходят в «нераспознанные» и показываются пользователю в отчёте.
_SYMBOL_RE = re.compile(r'^\.([A-Za-z]+)(\d{6})([CP])(\d+(?:\.\d+)?)$')

# Дата в имени файла: 2026-08-09-watchlist.csv
_FILENAME_DATE_RE = re.compile(r'(\d{4}-\d{2}-\d{2})')

# Названия колонок в заголовке таблицы. Ищем по имени, а не по номеру —
# чтобы перестановка колонок в терминале не сломала разбор.
_COL_SYMBOL = 'symbol'
_COL_PL = 'p/l open'
_COL_QTY = 'pos qty'
_COL_IV = 'impl vol'


def parse_anchor_date_from_filename(filename: Optional[str]) -> Optional[str]:
    """
    Достать дату выгрузки из имени файла (YYYY-MM-DD).

    ЗАЧЕМ: внутри файла даты нет, а факт нужно пометить датой, на которую он снят,
    а не датой загрузки. Если в имени даты нет — вызывающий код подставит сегодня.
    """
    if not filename:
        return None
    match = _FILENAME_DATE_RE.search(filename)
    return match.group(1) if match else None


def parse_money(raw: Any) -> Optional[float]:
    """
    Сумма из терминала в число: '($232.65)' → −232.65, '"$1,767.34"' → 1767.34.

    Скобки — это убыток (бухгалтерская запись отрицательного числа).
    """
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None

    negative = text.startswith('(') and text.endswith(')')
    if negative:
        text = text[1:-1]

    # Убираем всё, кроме цифр, точки и минуса: $ , пробелы, неразрывные пробелы.
    cleaned = re.sub(r'[^0-9.\-]', '', text)
    if not cleaned or cleaned in ('-', '.', '-.'):
        return None

    try:
        value = float(cleaned)
    except ValueError:
        return None

    return -value if negative else value


def parse_quantity(raw: Any) -> Optional[int]:
    """Количество контрактов: '+4' → 4, '-3' → −3."""
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    cleaned = re.sub(r'[^0-9\-]', '', text)
    if not cleaned or cleaned == '-':
        return None
    try:
        return int(cleaned)
    except ValueError:
        return None


def parse_percent(raw: Any) -> Optional[float]:
    """Волатильность: '53.93%' → 53.93."""
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    cleaned = re.sub(r'[^0-9.\-]', '', text)
    if not cleaned or cleaned in ('-', '.', '-.'):
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_symbol(raw: Any) -> Optional[Dict[str, Any]]:
    """
    Разобрать символ опциона.

    Возвращает {ticker, expiration (YYYY-MM-DD), type ('CALL'|'PUT'), strike (float)}
    либо None, если символ не соответствует формату терминала.

    Год двузначный: '26' → 2026. Файл содержит только текущие позиции, опционов
    с экспирацией в прошлом веке в нём быть не может.
    """
    if raw is None:
        return None
    match = _SYMBOL_RE.match(str(raw).strip())
    if not match:
        return None

    ticker, date_part, kind, strike = match.groups()
    year = 2000 + int(date_part[0:2])
    month = int(date_part[2:4])
    day = int(date_part[4:6])
    if not (1 <= month <= 12 and 1 <= day <= 31):
        return None

    try:
        strike_value = float(strike)
    except ValueError:
        return None

    return {
        'ticker': ticker.upper(),
        'expiration': f'{year:04d}-{month:02d}-{day:02d}',
        'type': 'CALL' if kind.upper() == 'C' else 'PUT',
        'strike': strike_value,
    }


def _find_header(row: List[str]) -> Optional[Dict[str, int]]:
    """Если строка — заголовок таблицы, вернуть карту «имя колонки → номер»."""
    normalized = [str(cell or '').strip().lower() for cell in row]
    if _COL_SYMBOL not in normalized:
        return None
    mapping = {}
    for index, name in enumerate(normalized):
        if name:
            mapping[name] = index
    # Без P/L и IV файл бесполезен — считаем, что это не тот заголовок.
    if _COL_PL not in mapping or _COL_IV not in mapping:
        return None
    return mapping


def _cell(row: List[str], columns: Dict[str, int], name: str) -> Optional[str]:
    index = columns.get(name)
    if index is None or index >= len(row):
        return None
    return row[index]


def parse_watchlist_csv(content: str) -> Dict[str, Any]:
    """
    Разобрать содержимое файла целиком.

    Возвращает:
      positions — список позиций: {symbol, ticker, expiration, type, strike,
                                   pl, quantity, iv}
      unparsed  — строки, похожие на позицию, но не разобранные (для отчёта)
      hasHeader — найден ли заголовок таблицы (если нет — файл не тот)
      rowsTotal — сколько строк с данными просмотрено после заголовка
    """
    reader = csv.reader(io.StringIO(content))

    columns: Optional[Dict[str, int]] = None
    positions: List[Dict[str, Any]] = []
    unparsed: List[Dict[str, str]] = []
    rows_total = 0

    for row in reader:
        if not row or all(not str(cell or '').strip() for cell in row):
            continue

        if columns is None:
            columns = _find_header(row)
            # Служебные строки над заголовком («Watchlist ...») просто пропускаем.
            continue

        symbol_raw = (_cell(row, columns, _COL_SYMBOL) or '').strip()
        if not symbol_raw:
            continue
        # Повторный заголовок (в файле может быть несколько списков) — пересобираем карту.
        repeated_header = _find_header(row)
        if repeated_header is not None:
            columns = repeated_header
            continue

        rows_total += 1

        parsed = parse_symbol(symbol_raw)
        pl = parse_money(_cell(row, columns, _COL_PL))
        quantity = parse_quantity(_cell(row, columns, _COL_QTY))
        iv = parse_percent(_cell(row, columns, _COL_IV))

        if parsed is None:
            unparsed.append({'symbol': symbol_raw, 'reason': 'символ не распознан'})
            continue
        if pl is None:
            unparsed.append({'symbol': symbol_raw, 'reason': 'не прочитан P/L'})
            continue
        if quantity is None:
            unparsed.append({'symbol': symbol_raw, 'reason': 'не прочитано количество'})
            continue

        positions.append({
            'symbol': symbol_raw,
            'pl': pl,
            'quantity': quantity,
            # IV может отсутствовать — это не повод терять P/L по позиции.
            'iv': iv,
            **parsed,
        })

    return {
        'positions': positions,
        'unparsed': unparsed,
        'hasHeader': columns is not None,
        'rowsTotal': rows_total,
    }
