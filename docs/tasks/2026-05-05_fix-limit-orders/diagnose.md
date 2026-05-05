# DIAGNOSE — fix-limit-orders

**Дата:** 2026-05-05
**Phase:** 1 — DIAGNOSE
**Pipeline:** /fix

## Проблема
В IBKR Bridge кнопки `+C` / `-P` / `+P` / `-C` / `−`, инжектируемые расширением в калькулятор `beta.optioner.online/tools/universal-calculator`, отправляют в TWS staged-ордер `orderType='MKT'`. Маркет-ордер по неликвидным опционам исполняется по плохой цене. Нужен LIMIT-ордер с ценой, взятой из самого калькулятора (Ask для покупки, Bid для продажи).

## Шаги воспроизведения
1. Запустить IBKR Bridge App (`Start IBKR Bridge.command`), подключить TWS (paper, порт 7497).
2. Открыть `beta.optioner.online/tools/universal-calculator`, добавить опцион (например, AMD CALL).
3. Кликнуть по кнопке `+C` справа от строки.
4. В TWS появляется staged-ордер `BUY 1 AMD ... MKT DAY` (вместо `LMT @ Ask`).

## Root cause
1. **Бэкенд `EXTENTIONS/IBKR_Bridge/main_source_backup.py:190-196`** — `Order(...)` хардкодит `orderType='MKT'`, не принимает `lmtPrice`. `handle_open` (строка 91) не читает query-параметр `price`.
2. **Расширение `EXTENTIONS/IBKR_Bridge/extension/content.js:371, 386`** — оба `onclick` (открытие и закрытие позиции) формируют URL `${BRIDGE_URL}/open?...` без `price`. Цена опциона из калькулятора не извлекается ни в `extractRowData` (`extension/utils.js:8-43`), ни где-либо ещё.
3. **Калькулятор `frontend/src/components/CalculatorV2/OptionsTableV3.jsx:757-836`** — `option.bid` / `option.ask` живут только в React state и попадают в DOM только как форматированный текст `$1.23` внутри `<span>`'ов без стабильного селектора. Различаются цветом класса (`text-green-600` vs `text-red-600`), но при ручной правке оба становятся `text-orange-600` — парсинг по цвету ненадёжен.

## Scope (4 файла)
| Файл | Что меняется |
|---|---|
| `frontend/src/components/CalculatorV2/OptionsTableV3.jsx` | Добавить `data-field="bid"` + `data-bid={числовое значение}` и `data-field="ask"` + `data-ask={числовое значение}` на спаны Bid/Ask (с учётом `customBid`/`customAsk`). |
| `EXTENTIONS/IBKR_Bridge/extension/utils.js` | Расширить `extractRowData` — читать `data-bid` и `data-ask` из строки, возвращать в результате. |
| `EXTENTIONS/IBKR_Bridge/extension/content.js` | В `injectCalculatorButton` выбрать цену по правилу Ask=BUY / Bid=SELL (то же для close по `closeAction`). Если цена пустая/0/NaN — кнопка disabled (CSS + tooltip), `fetch` не уходит. Если цена есть — добавлять `&price=X.XX` в URL. |
| `EXTENTIONS/IBKR_Bridge/main_source_backup.py` | В `handle_open` читать `price`. Если задан и >0 — `Order(orderType='LMT', lmtPrice=float(price), ...)`. Если не задан или <=0 — отвергать запрос (HTTP 400). `transmit=False` сохраняем. |

Дополнительно: версия в `EXTENTIONS/IBKR_Bridge/extension/manifest.json` поднимается +1 (правило: всегда бампить версию при изменении расширения).

## DOM-селекторы для Bid/Ask
**Решение:** добавить data-атрибуты в калькулятор (согласовано с пользователем — самый надёжный путь, переживает рестайл/ручную правку).

В `OptionsTableV3.jsx` после патча:
```
<span data-field="bid" data-bid={option.isBidModified ? option.customBid : option.bid} ...>
<span data-field="ask" data-ask={option.isAskModified ? option.customAsk : option.ask} ...>
```

Расширение читает:
```
const bid = parseFloat(row.querySelector('[data-field="bid"]').dataset.bid);
const ask = parseFloat(row.querySelector('[data-field="ask"]').dataset.ask);
```

Преимущества:
- Не зависит от позиции в `gridTemplateColumns` (premium и oi колонки conditional).
- Корректно работает при ручной правке цены (когда цвет переключается на orange).
- Переживает любой restyle.

## Правило выбора цены
| Кнопка | action | source |
|---|---|---|
| `+C` / `+P` | BUY | `data-ask` |
| `-C` / `-P` | SELL | `data-bid` |
| `−` (close LONG) | SELL | `data-bid` |
| `−` (close SHORT) | BUY | `data-ask` |

Если выбранная цена `null`/`0`/`NaN`/`""` — кнопка визуально disabled (`pointer-events: none; opacity: 0.4`), title `«Без цены отправить нельзя — нужны Bid/Ask»`. `fetch` не вызывается.

## План патча для PHASE 2 (FIX)
1. **OptionsTableV3.jsx**: ~4 строки — два `data-field` атрибута и два `data-bid`/`data-ask` с числовым значением.
2. **utils.js**: `extractRowData` дополнить чтением Bid/Ask из data-атрибутов.
3. **content.js**: в `injectCalculatorButton` (открытие и close-ветка) определять цену по таблице выше; если её нет — рендерить кнопку как disabled и не вешать onclick fetch; если есть — добавлять `&price=${price}` в URL.
4. **main_source_backup.py**: `handle_open` читает `request.query.get('price')`. Парсит в `try` через `float(...)`. Если есть и >0 — `lmtPrice = ...`, `orderType='LMT'`. Если нет/<=0 — `web.Response(text="Missing or invalid price", status=400)`. Лог: `print(f"... price={price} -> LMT @ {lmtPrice}")`.
5. `manifest.json` — версия +1.

## Файлы, которые НЕ трогаем
- `extension/content.js:184-239` (TradingView `inject`) — не в scope.
- `cachedCallAskIndex` и сосед — оставить, к расчёту цены в калькуляторе не имеют отношения.
- Бэкенд-маршруты `/positions`, `/get_mapping`, `/set_mode` — не трогаем.
- `transmit=False` — сохраняем (трейдер подтверждает в TWS вручную).

## Согласовано с пользователем
- Источник цены: Ask для BUY, Bid для SELL ✔
- Та же логика для close (`−`) ✔
- Пустая цена → кнопка disabled, не отправлять ✔
- transmit=False сохраняем ✔
- Scope = только калькулятор, TradingView не трогаем ✔
- Селектор = data-атрибуты в калькуляторе ✔
