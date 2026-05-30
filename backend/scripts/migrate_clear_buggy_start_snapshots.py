"""
Одноразовая миграция: чистка buggy-формата startSnapshot из state.options[].

ЗАЧЕМ: Предыдущая версия snapshot хранила результат вызова getOptionVolatility
(поле `iv`) — единое число IV на момент сохранения с симуляцией = 0. Из-за этого
при движении ползунка дней колонка «Start P&L» оставалась с константой, а
колонка «P&L» каждый раз заново проецировала IV — колонки расходились даже без
пользовательских корректировок.

Новый формат snapshot хранит СЫРЫЕ IV-входы (impliedVolatility, manualIvOverride,
manualIvOverrideDate), и пересчёт IV происходит на каждой симуляционной точке
той же функцией, что использует колонка «P&L».

Чтобы не смешивать форматы — удаляем все существующие startSnapshot. Старые
позиции покажут прочерк, корректный snapshot создастся при следующем
«Сохранить» / «Зафиксировать». Заодно (на всякий случай) подчищаем legacy
поле startPL, если где-то осталось.

Запуск:
    python scripts/migrate_clear_buggy_start_snapshots.py
"""

import sys
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.dirname(SCRIPT_DIR)
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from sqlalchemy.orm.attributes import flag_modified

from app.database import SessionLocal
from app.models.saved_configuration import SavedConfiguration


def migrate():
    db = SessionLocal()
    try:
        configs = db.query(SavedConfiguration).all()
        total_configs = len(configs)
        touched_configs = 0
        cleared_snapshots = 0
        cleared_legacy_pl = 0

        for config in configs:
            state = config.state or {}
            options = state.get('options')
            if not isinstance(options, list):
                continue

            changed_in_config = False
            for opt in options:
                if not isinstance(opt, dict):
                    continue
                if 'startSnapshot' in opt:
                    del opt['startSnapshot']
                    cleared_snapshots += 1
                    changed_in_config = True
                if 'startPL' in opt:
                    del opt['startPL']
                    cleared_legacy_pl += 1
                    changed_in_config = True

            if changed_in_config:
                config.state = state
                flag_modified(config, 'state')
                touched_configs += 1

        if touched_configs:
            db.commit()
        else:
            db.rollback()

        print(f"[migrate_clear_buggy_start_snapshots] всего конфигураций: {total_configs}")
        print(f"[migrate_clear_buggy_start_snapshots] затронуто конфигураций: {touched_configs}")
        print(f"[migrate_clear_buggy_start_snapshots] удалено startSnapshot: {cleared_snapshots}")
        print(f"[migrate_clear_buggy_start_snapshots] удалено legacy startPL: {cleared_legacy_pl}")
    except Exception as exc:
        db.rollback()
        print(f"[migrate_clear_buggy_start_snapshots] ОШИБКА: {exc}", file=sys.stderr)
        raise
    finally:
        db.close()


if __name__ == '__main__':
    migrate()
