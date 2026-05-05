# FIX — fix-limit-orders

**Дата:** 2026-05-05
**Phase:** 2 — FIX (+ 3 — VERIFY)
**Pipeline:** /fix
**Связанные артефакты:** [README.md](./README.md), [diagnose.md](./diagnose.md)

## Что сделано
По 4 файла + manifest:

### 1. Калькулятор — `frontend/src/components/CalculatorV2/OptionsTableV3.jsx`
В блоках Bid (строка 758) и Ask (строка 798) добавлены data-атрибуты:
```jsx
<span data-field="bid"  data-bid={option.isBidModified ? (option.customBid ?? '') : (option.bid ?? '')}  ...>
<span data-field="ask"  data-ask={option.isAskModified ? (option.customAsk ?? '') : (option.ask ?? '')}  ...>
```
- `data-bid`/`data-ask` всегда содержат текущее числовое значение (или `''` когда нет данных).
- Учтён ручной режим (`isBidModified`/`isAskModified`) — если пользователь подправил, в data-атрибут идёт `customBid`/`customAsk`.

### 2. Расширение — `EXTENTIONS/IBKR_Bridge/extension/utils.js`
`extractRowData` теперь возвращает дополнительно `bid` и `ask`. Чтение через `row.querySelector('[data-field="bid"]').dataset.bid` с безопасным парсингом в `try { … }`. Если значение пустое, ≤0 или NaN — возвращается `null`.

### 3. Расширение — `EXTENTIONS/IBKR_Bridge/extension/content.js`
Новые функции:
- `pickLimitPrice(rowData, action)` — для BUY возвращает Ask, для SELL — Bid.
- `markButtonDisabled(a, reason)` — добавляет класс `ibkr-btn-disabled`, ставит `pointer-events:none`, `opacity:0.4`, title с пояснением, убирает href.

`injectCalculatorButton` (как для обычной кнопки, так и для close):
- Считает цену по правилу выше.
- Если цены нет → кнопка disabled, fetch не вешается.
- Если цена есть → URL получает `&price=${price}`.
- Перед fetch на клике перечитывает `extractRowData` ещё раз — если за это время цена пропала, отправка отменяется.
- На каждой кнопке выставляется `dataset.priceAvail = '0'/'1'`.

`scanCalculator`:
- Помимо изменения `quantity`, теперь триггерит ре-инжект и при изменении `priceAvail` (для обеих веток — простая кнопка и close-кнопка). Это нужно, чтобы кнопка ожила, когда Bid/Ask наконец придут (или умерла, если данные пропали).

### 4. Бэкенд — `EXTENTIONS/IBKR_Bridge/main_source_backup.py`
В `handle_open`:
- Читается `request.query.get('price')`, парсится через `float()` в `try`, валидируется (>0).
- Если запрос пришёл по калькуляторному пути (без `conid`) и `price` нет/невалиден → `HTTP 400 "Missing or invalid price for limit order"`.
- Если `limit_price is not None` → `Order(orderType='LMT', lmtPrice=limit_price, ...)` с `transmit=False` (трейдер подтверждает в TWS вручную).
- Иначе (TradingView-путь по conid без price) → старое поведение `MKT` сохраняется без изменений.

### 5. Версия расширения — `EXTENTIONS/IBKR_Bridge/extension/manifest.json`
- `5.2 → 5.3`. Описание уточнено («LIMIT-ордеров»).

## VERIFY (Phase 3)

### Синтаксис изменённых файлов
| Файл | Проверка | Результат |
|---|---|---|
| `OptionsTableV3.jsx` | `@babel/parser` (jsx plugin) | OK |
| `utils.js` | `node -c` | OK |
| `content.js` | `node -c` | OK |
| `main_source_backup.py` | `python -m ast.parse` | OK |
| `manifest.json` | `json.load` | OK |

### Логика — пройдено мысленно
1. Чистый запуск, рынок открыт: строка с активным Bid/Ask → `data-bid`/`data-ask` содержат числа → расширение читает оба → кнопка `+C` вешает `&price=${ask}`, `-C` → `&price=${bid}`. Бэк создаёт `LMT` ордер.
2. Рынок закрыт, market-data ещё не пришла: `option.bid === null` → `data-bid=""` → `extractRowData.bid === null` → `pickLimitPrice` вернёт `null` → кнопка визуально disabled, fetch не идёт.
3. Пользователь вручную подправил Bid: `option.isBidModified === true` → в data-атрибут идёт `option.customBid` → расширение работает с поправленной ценой.
4. Кнопка close (`−`) для LONG: `closeAction === 'SELL'` → читаем Bid; для SHORT: `closeAction === 'BUY'` → читаем Ask. Та же disabled-логика.
5. Запоздавшая market-data: первый скан → disabled (`priceAvail='0'`), второй скан → Bid/Ask пришли → `priceAvail='1'` ≠ существующий `'0'` → ре-инжект → активная кнопка.
6. Изменение количества `quantity`: тот же ре-инжект через старую проверку.
7. TradingView-путь (`conid` без `price`) → бэкенд НЕ отвергает, оставляет MKT (out of scope, обратная совместимость сохранена).

### Security check (правило 4 SDD)
- ✅ `price` парсится только через `float(...)` в `try/except`.
- ✅ Никаких новых endpoints, eval, SQL.
- ✅ XSS невозможен — `data-bid`/`data-ask` принимают числовые значения React state, не строки от пользователя.
- ✅ `transmit=False` сохранён — реальная отправка ордера в IBKR происходит только после ручного подтверждения трейдера в TWS.
- ✅ Никаких хардкоженных секретов, .env не трогали.
- ✅ `manifest.json` `host_permissions` не расширялись.

### Ручная верификация (после деплоя)
Чек-лист, который пользователь прогонит вживую:
1. Запустить IBKR Bridge App, подключить TWS paper.
2. Загрузить расширение (версия `5.3`).
3. Открыть `beta.optioner.online/tools/universal-calculator`, добавить активный опцион.
4. Кликнуть `+C` → в TWS появляется `BUY 1 ... LMT @ <ask> DAY` (preview, transmit=False) ✔
5. Кликнуть `-P` → `SELL 1 ... LMT @ <bid>` ✔
6. На неликвидной строке без Bid/Ask кнопка визуально disabled, hover показывает «Без цены отправить нельзя».
7. `curl 'http://localhost:5001/open?symbol=AMD&expiry=20260221&strike=160&right=C&action=BUY&secType=STK&quantity=1'` (без price) → HTTP 400.

## Open follow-ups
- В `extension/styles.css` можно дополнительно прописать стиль `.ibkr-btn-disabled { cursor: not-allowed; }` — сейчас inline-style уже выключает события, но cursor не меняется. Не блокирующее, опционально.
- TradingView-путь оставлен MKT по согласованию с пользователем. При желании в будущем можно прокинуть Ask/Bid из `cachedCallAskIndex`/`cachedCallBidIndex` (они уже считываются) — это отдельная задача.

## SPEC-SYNC заметка
В мини-спеке `docs/EXTENSION_INTEGRATION_API.md` (если потребуется) надо отразить, что `/open` для калькулятора теперь требует параметр `price`, без него возвращается 400. Если документа на этот endpoint ещё нет — оставляю на PHASE 4.
