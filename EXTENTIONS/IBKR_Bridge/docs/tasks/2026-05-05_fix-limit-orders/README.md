# Task: fix-limit-orders

**Started:** 2026-05-05
**Type:** /fix
**commit_start:** N/A (not a git repo)
**Status:** ✅ FIX готов, ждёт ручной верификации

## Problem
Сейчас при клике по кнопке `+C/-P/+P/-C/−` в калькуляторе bridge порождает в TWS staged-ордер с `orderType='MKT'`. Нужен LIMIT-ордер с ценой, взятой из калькулятора:
- BUY → Ask
- SELL → Bid
- Close LONG → SELL @ Bid; Close SHORT → BUY @ Ask
- Если цена пустая/0 → визуально disabled, фронт не отправляет на bridge.

## Scope
- `extension/content.js` — чтение Bid/Ask из строки калькулятора (через data-атрибуты), правило выбора, передача `&price=...`, блокировка при отсутствии цены.
- `extension/utils.js` — `extractRowData` теперь возвращает `bid` и `ask`.
- `main_source_backup.py` — приём `price`, переключение на `orderType='LMT'` с `lmtPrice`. Без `price` (для пути из калькулятора) → HTTP 400.
- `extension/manifest.json` — версия 5.2 → 5.3.
- *Сторонний файл (вне этого репо):* `frontend/src/components/CalculatorV2/OptionsTableV3.jsx` в `beta.optioner.online` — добавлены `data-bid` и `data-ask` атрибуты на спаны Bid/Ask.

## Artifacts
- [x] [diagnose.md](./diagnose.md)
- [x] [2026-05-05_fix-limit-orders.md](./2026-05-05_fix-limit-orders.md) — fix-trail + verify
