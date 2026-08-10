"""
Сквозной тест эндпоинта актуализации: загрузка реального файла → запись в сделки → отчёт.

ЗАЧЕМ отдельно от test_volatility_update.py: там правила проверяются на чистых
функциях, здесь — что они доезжают через HTTP и реально сохраняются в базе
(включая отметку изменения JSON-колонки, без которой правки молча теряются).

База — временный SQLite-файл на время теста, к рабочим данным отношения не имеет.
"""
import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models.saved_configuration import SavedConfiguration

FIXTURE = os.path.join(os.path.dirname(__file__), 'fixtures', '2026-08-09-watchlist.csv')


@pytest.fixture()
def session(tmp_path):
    """Изолированная база на один тест."""
    engine = create_engine(f'sqlite:///{tmp_path}/test.db', connect_args={'check_same_thread': False})
    Base.metadata.create_all(bind=engine, tables=[SavedConfiguration.__table__])
    maker = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    db = maker()
    app.dependency_overrides[get_db] = lambda: db
    yield db
    app.dependency_overrides.pop(get_db, None)
    db.close()


def make_deal(name, ticker, options, status='standard'):
    return SavedConfiguration(
        id=str(uuid.uuid4()),
        name=name,
        author='Тест',
        ticker=ticker,
        status=status,
        is_locked=True,
        state={'selectedTicker': ticker, 'options': options},
    )


def leg(strike, option_type, date, quantity, **extra):
    base = {'id': strike, 'action': 'Buy', 'type': option_type, 'strike': strike,
            'date': date, 'quantity': quantity, 'ask': 1.0}
    base.update(extra)
    return base


def upload(client):
    with open(FIXTURE, 'rb') as handle:
        return client.post(
            '/api/volatility-update/apply',
            files={'file': ('2026-08-09-watchlist.csv', handle.read(), 'text/csv')},
        )


def test_full_flow(session):
    # AA: обе ноги совпадают по количеству → обновятся.
    # ADSK: одна нога с другим количеством → в расхождения; одна нога не из файла.
    # CRM: черновик → не трогаем вовсе.
    session.add_all([
        make_deal('Сделка AA', 'AA', [
            leg(65, 'CALL', '2026-10-16', 4),
            leg(40, 'PUT', '2026-10-16', 3),
        ]),
        make_deal('Сделка ADSK', 'ADSK', [
            leg(240, 'CALL', '2026-09-18', 5),          # в файле +1 → расхождение
            leg(999, 'PUT', '2026-09-18', 1),           # такой позиции в файле нет
        ]),
        make_deal('Черновик CRM', 'CRM', [
            leg(210, 'CALL', '2026-08-21', 9),
        ], status='pending'),
    ])
    session.commit()

    client = TestClient(app)
    response = upload(client)
    assert response.status_code == 200, response.text
    report = response.json()

    assert report['anchorDate'] == '2026-08-09'
    assert report['anchorDateSource'] == 'filename'
    assert report['positionsParsed'] == 138
    assert report['unparsedRows'] == []
    assert report['dealsScanned'] == 2          # черновик не читаем
    assert report['dealsUpdated'] == 1
    assert report['legsUpdated'] == 2

    # Значения реально сохранились в базе.
    session.expire_all()
    aa = session.query(SavedConfiguration).filter_by(name='Сделка AA').one()
    call_leg = aa.state['options'][0]
    assert call_leg['actualPL'] == -232.65
    assert call_leg['actualPLDate'] == '2026-08-09'
    assert call_leg['actualPLQuantity'] == 4
    assert call_leg['manualIvOverride'] == 53.93
    assert call_leg['actualPLPrice'] is None

    # Черновик остался нетронутым.
    crm = session.query(SavedConfiguration).filter_by(name='Черновик CRM').one()
    assert 'actualPL' not in crm.state['options'][0]

    # Расхождение по количеству и нога вне файла попали в отчёт.
    adsk = next(deal for deal in report['deals'] if deal['dealName'] == 'Сделка ADSK')
    assert adsk['updated'] == []
    assert adsk['qtyMismatches'][0]['quantityInDeal'] == 5
    assert adsk['qtyMismatches'][0]['quantityInFile'] == 1
    assert len(adsk['notInFile']) == 1

    # Ключи для очистки локальных правок в браузере.
    assert 'AA|65-CALL-2026-10-16' in report['updatedOptionKeys']

    # Символы из файла, которым не нашлось сделки.
    assert '.CRM260821C210' in report['symbolsWithoutDeal']
    assert '.AA261016C65' not in report['symbolsWithoutDeal']


def test_repeat_import_is_idempotent(session):
    session.add(make_deal('Сделка AA', 'AA', [leg(65, 'CALL', '2026-10-16', 4)]))
    session.commit()

    client = TestClient(app)
    first = upload(client).json()
    second = upload(client).json()

    assert first['legsUpdated'] == second['legsUpdated'] == 1
    session.expire_all()
    aa = session.query(SavedConfiguration).filter_by(name='Сделка AA').one()
    assert aa.state['options'][0]['actualPL'] == -232.65


def test_rejects_non_csv(session):
    client = TestClient(app)
    response = client.post(
        '/api/volatility-update/apply',
        files={'file': ('positions.txt', 'что-то не то'.encode(), 'text/plain')},
    )
    assert response.status_code == 400
    assert 'CSV' in response.json()['detail']['message']


def test_rejects_file_without_positions_table(session):
    client = TestClient(app)
    response = client.post(
        '/api/volatility-update/apply',
        files={'file': ('2026-08-09-something.csv', 'просто,текст\n1,2\n'.encode(), 'text/csv')},
    )
    assert response.status_code == 400
