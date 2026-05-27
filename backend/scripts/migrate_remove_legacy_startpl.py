"""
Одноразовая миграция: вычистка legacy-поля `startPL` из state.options[] всех
сохранённых конфигураций.

ЗАЧЕМ: Между первой (неверной) реализацией колонки «Start P&L» и текущим релизом
в БД могли попасть записи, у которых option.startPL хранится как одно число
(статичный снимок). Новая логика хранит вместо этого option.startSnapshot —
объект с исходными входными данными для динамического пересчёта. Чтобы не
смешивать старое и новое поведение, удаляем все legacy-ключи `startPL`.

Запуск:
    python scripts/migrate_remove_legacy_startpl.py
"""

import sys
import os

# Подмешиваем корень бэкенда в sys.path, чтобы импорт app.* работал
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
        touched_options = 0

        for config in configs:
            state = config.state or {}
            options = state.get('options')
            if not isinstance(options, list):
                continue

            changed_in_config = False
            for opt in options:
                if not isinstance(opt, dict):
                    continue
                if 'startPL' in opt:
                    del opt['startPL']
                    touched_options += 1
                    changed_in_config = True

            if changed_in_config:
                config.state = state
                flag_modified(config, 'state')
                touched_configs += 1

        if touched_configs:
            db.commit()
        else:
            db.rollback()

        print(f"[migrate_remove_legacy_startpl] всего конфигураций: {total_configs}")
        print(f"[migrate_remove_legacy_startpl] затронуто конфигураций: {touched_configs}")
        print(f"[migrate_remove_legacy_startpl] удалено ключей startPL: {touched_options}")
    except Exception as exc:
        db.rollback()
        print(f"[migrate_remove_legacy_startpl] ОШИБКА: {exc}", file=sys.stderr)
        raise
    finally:
        db.close()


if __name__ == '__main__':
    migrate()
