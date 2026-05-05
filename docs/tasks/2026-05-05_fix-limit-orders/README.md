# Task: fix-limit-orders

**Дата:** 2026-05-05
**Тип:** /fix
**Статус:** в работе (PHASE 2 — FIX)

## Цель
Кнопки `+C` / `-P` / `+P` / `-C` / `−`, инжектируемые расширением IBKR Bridge в калькулятор `beta.optioner.online/tools/universal-calculator`, должны отправлять в TWS LIMIT-ордер с ценой из калькулятора (Ask для покупки, Bid для продажи), а не MKT.

## Acceptance criteria
- При клике по `+C`/`+P` (BUY) в TWS появляется staged-ордер `LMT @ Ask` (с `transmit=False`).
- При клике по `-C`/`-P` (SELL) — `LMT @ Bid`.
- При клике по `−` (close): для LONG → SELL @ Bid; для SHORT → BUY @ Ask.
- Если в строке нет Bid/Ask (`—` в DOM) — кнопка визуально disabled, фронт не отправляет запрос на bridge.
- Бэкенд при отсутствии `price` отвергает `/open` с HTTP 400.
- TradingView-чейн (`/options/chain/...`) **не затронут** (остаётся MKT).

## Out of scope
- Кнопки в TradingView-таблице (`scan` / `inject` пути в `content.js`).
- Изменение поведения `transmit=False` (трейдер по-прежнему подтверждает в TWS вручную).

## Phases / Artifacts
- PHASE 1 — DIAGNOSE → [diagnose.md](./diagnose.md) ✔
- PHASE 2 — FIX → `2026-05-05_fix-limit-orders.md` (в процессе)
- PHASE 3 — VERIFY → секция в fix-файле
- PHASE 4 — SPEC-SYNC → обновить мини-спеку IBKR Bridge

## Files in scope
| Файл | Расположение |
|---|---|
| `frontend/src/components/CalculatorV2/OptionsTableV3.jsx` | в репо `beta.optioner.online` |
| `EXTENTIONS/IBKR_Bridge/extension/content.js` | вне git (отдельный проект на macOS) |
| `EXTENTIONS/IBKR_Bridge/extension/utils.js` | вне git |
| `EXTENTIONS/IBKR_Bridge/extension/manifest.json` | вне git, версия `+1` |
| `EXTENTIONS/IBKR_Bridge/main_source_backup.py` | вне git |

## Amendments
_(пока пусто)_
