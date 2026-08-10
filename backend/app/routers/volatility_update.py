"""
API актуализации Fact P&L и Fact IV по выгрузке позиций из торгового терминала.

ЗАЧЕМ: раз в неделю фактическая прибыль/убыток и подразумеваемая волатильность
по каждой ноге вносились в сохранённые сделки вручную. При полусотне активных
сделок это часы работы и риск опечаток. Терминал выгружает те же данные файлом —
этот эндпоинт сопоставляет файл с базой и записывает значения сам.

Разбор файла — app/services/watchlist_csv.py, правило сопоставления —
app/services/volatility_update.py. Здесь только работа с базой и сборка отчёта.

Auth: как и в остальных роутерах проекта, сейчас отключён глобально.
"""
import logging
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.database import get_db
from app.models.saved_configuration import SavedConfiguration
from app.services.volatility_update import apply_positions_to_deal, build_position_index
from app.services.watchlist_csv import parse_anchor_date_from_filename, parse_watchlist_csv
from app.utils.trading_date import get_trading_today_iso

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/volatility-update", tags=["volatility_update"])

# Ограничение размера файла. Реальная выгрузка на 140 позиций — около 8 КБ,
# 5 МБ с огромным запасом покрывают любой счёт и отсекают случайную загрузку
# чего-то постороннего вместо CSV.
MAX_FILE_SIZE = 5 * 1024 * 1024


def _fail(message: str, status_code: int = 400):
    """Ошибка в формате, который понимает parseApiError на фронте."""
    raise HTTPException(status_code=status_code, detail={"code": "volatility_update_error", "message": message})


@router.post("/apply")
async def apply_volatility_update(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Прочитать CSV-выгрузку и записать значения в активные сделки калькулятора.

    P/L Open → Fact P&L, Impl Vol → Fact IV. Нога обновляется только при совпадении
    количества контрактов с файлом. Возвращает отчёт о проделанной работе.
    """
    filename = file.filename or ''
    if not filename.lower().endswith('.csv'):
        _fail('Нужен файл в формате CSV — выгрузка позиций из терминала.')

    # Читаем кусками с потолком, а не целиком: file.read() без ограничения затянул бы
    # в память любой присланный объём, и проверка размера ПОСЛЕ чтения от этого не спасает.
    raw = b''
    try:
        while True:
            chunk = await file.read(64 * 1024)
            if not chunk:
                break
            raw += chunk
            if len(raw) > MAX_FILE_SIZE:
                _fail('Файл слишком большой — ожидается выгрузка позиций, а не архив данных.')
    except HTTPException:
        raise
    except Exception as error:
        logger.error(f'[VolatilityUpdate] Не удалось прочитать файл: {error}')
        _fail('Не удалось прочитать файл. Попробуйте приложить его заново.')

    if not raw:
        _fail('Файл пустой.')

    # utf-8-sig снимает BOM, который Excel/терминал добавляют в начало файла:
    # без этого первая колонка заголовка не совпала бы с 'Symbol'.
    try:
        content = raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        try:
            content = raw.decode('cp1252')
        except Exception:
            _fail('Не удалось распознать кодировку файла. Сохраните выгрузку в UTF-8.')

    try:
        parsed = parse_watchlist_csv(content)
    except Exception as error:
        logger.error(f'[VolatilityUpdate] Ошибка разбора файла: {error}')
        _fail('Файл не удалось разобрать — похоже, это не выгрузка позиций из терминала.')

    if not parsed['hasHeader']:
        _fail('В файле не найдена таблица позиций (строка с колонками Symbol, P/L Open, Impl Vol).')
    if not parsed['positions']:
        _fail('В файле не нашлось ни одной распознанной позиции.')

    anchor_date = parse_anchor_date_from_filename(filename)
    anchor_date_source = 'filename'
    if not anchor_date:
        anchor_date = get_trading_today_iso()
        anchor_date_source = 'today'

    index = build_position_index(parsed['positions'])

    try:
        configurations = (
            db.query(SavedConfiguration)
            .filter(SavedConfiguration.status == 'standard')
            .all()
        )
    except Exception as error:
        logger.error(f'[VolatilityUpdate] Ошибка чтения сделок: {error}')
        _fail('Не удалось прочитать сохранённые сделки из базы.', status_code=500)

    deals_report: List[Dict[str, Any]] = []
    matched_keys = set()
    legs_updated = 0
    updated_option_keys: List[str] = []

    for config in configurations:
        state = config.state if isinstance(config.state, dict) else None
        if state is None:
            continue

        ticker = config.ticker or state.get('selectedTicker')
        outcome = apply_positions_to_deal(state, ticker, index, anchor_date)
        matched_keys.update(outcome['matchedKeys'])

        if not outcome['updated'] and not outcome['qtyMismatches'] and not outcome['notInFile']:
            continue

        if outcome['updated']:
            # SQLAlchemy не отслеживает изменения ВНУТРИ JSON-колонки — без этой
            # отметки правки в state молча не сохранятся (тот же приём применяется
            # при переводе сделки в статус standard в saved_configurations.py).
            flag_modified(config, 'state')
            legs_updated += len(outcome['updated'])
            updated_option_keys.extend(item['optionKey'] for item in outcome['updated'])

        deals_report.append({
            'dealId': str(config.id),
            'dealName': config.name,
            'ticker': ticker,
            'updated': outcome['updated'],
            'qtyMismatches': outcome['qtyMismatches'],
            'notInFile': outcome['notInFile'],
        })

    try:
        db.commit()
    except Exception as error:
        db.rollback()
        logger.error(f'[VolatilityUpdate] Ошибка сохранения: {error}')
        _fail('Не удалось сохранить изменения в базу. Изменения отменены.', status_code=500)

    symbols_without_deal = [
        position['symbol']
        for key, position in index.items()
        if key not in matched_keys
    ]

    deals_updated = sum(1 for deal in deals_report if deal['updated'])

    logger.info(
        f'[VolatilityUpdate] Файл {filename}: позиций {len(parsed["positions"])}, '
        f'сделок обновлено {deals_updated}, ног обновлено {legs_updated}'
    )

    return {
        'fileName': filename,
        'anchorDate': anchor_date,
        'anchorDateSource': anchor_date_source,
        'rowsTotal': parsed['rowsTotal'],
        'positionsParsed': len(parsed['positions']),
        'unparsedRows': parsed['unparsed'],
        'dealsScanned': len(configurations),
        'dealsUpdated': deals_updated,
        'legsUpdated': legs_updated,
        'deals': deals_report,
        'symbolsWithoutDeal': symbols_without_deal,
        'updatedOptionKeys': updated_option_keys,
    }
