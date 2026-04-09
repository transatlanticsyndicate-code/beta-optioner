# Миграция CP Buttons: Старая верстка → Новая верстка TradingView

> Дата анализа: 2026-03-25
> Скриншот новой верстки: `tv_options_new_layout.png` (в этой же папке)

---

## 1. Что изменилось в доске опционов

### Общая структура страницы
- URL: `https://www.tradingview.com/options/chain/?symbol=CME_MINI%3AESU2026&series=20260618,20260630,...`
- Новые вкладки в шапке: **Chain**, **Strategy builder**, **Strategy finder**, **Volatility**
- Экспирации передаются через URL-параметр `series` (формат: `YYYYMMDD` через запятую)
- Фильтр страйков: `strikes_filter_value_1=4&strikes_filter_condition=count`

### Структура таблицы — ЧТО ИЗМЕНИЛОСЬ

| Аспект | Старая верстка | Новая верстка |
|--------|---------------|---------------|
| Теги строк | `<tr>` или `[role="row"]` | `<tr class="tr-I7bZhVfy" data-strike="6625">` |
| Теги ячеек | `<td>` или `[role="cell"]` | `<td class="td-I7bZhVfy" data-cell-part="call" data-row-id="6625">` |
| Страйк | Текст в ячейке, парсился регуляркой | **`data-strike` атрибут на `<tr>`** — парсинг не нужен |
| Сторона (Call/Put) | Определялась по индексу колонки | **`data-cell-part="call\|central\|put"`** на каждой `<td>` |
| ID ячейки | Нет | `data-cell-id="CME_MINI:E3D260618C6625"` (тикер:серия+тип+страйк) |
| Колонок Call | ~13 (hardcoded) | **24** |
| Колонок Central | 1 (Strike) | **2** (Strike + IV) |
| Колонок Put | ~13 (hardcoded) | **24** |
| Всего колонок | ~28 | **50** |
| CSS классы | Стабильные | Обфусцированные с хэшами: `tr-I7bZhVfy`, `td-I7bZhVfy` |
| Заголовки | Внутри `<th>` | `<th class="th-lCkuStTk">` с `title` атрибутами |
| Thead | Одна строка | **Две строки**: первая — "Calls" colspan=24 / "Puts" colspan=24, вторая — названия колонок |
| Volume | Простой текст | `<div>` с progressbar: `<div role="progressbar" aria-valuenow="33">` |
| Экспирации | Кнопки с `title="Jan 16, 2026 (1) ESH26"` | Разделители в таблице: `"June 18  ES 97E  ESU"` |

### Порядок колонок (новый — зеркальный!)

**Call сторона (индексы 0-23, справа налево):**
```
[0]  Rho          [12] Ann ask %
[1]  Vega         [13] Ann bid %
[2]  Gamma        [14] Ask %
[3]  Theta        [15] Bid %
[4]  Delta        [16] LTP
[5]  To BE %      [17] Theor
[6]  BE           [18] Spread
[7]  IV spread    [19] Ask
[8]  Ask IV %     [20] Bid
[9]  Bid IV %     [21] Rel dist
[10] Time value   [22] Distance
[11] Intr value   [23] Volume (с progressbar)
```

**Central (индексы 24-25):**
```
[24] Strike
[25] IV
```

**Put сторона (индексы 26-49, слева направо):**
```
[26] Volume (с progressbar)   [38] Intr value
[27] Distance                 [39] Time value
[28] Rel dist                 [40] Bid IV %
[29] Bid                      [41] Ask IV %
[30] Ask                      [42] IV spread
[31] Spread                   [43] BE
[32] Theor                    [44] To BE %
[33] LTP                      [45] Delta
[34] Bid %                    [46] Theta
[35] Ask %                    [47] Gamma
[36] Ann bid %                [48] Vega
[37] Ann ask %                [49] Rho
```

---

## 2. Что это означает для инжекта кнопок

### Что УПРОЩАЕТ работу
1. **`data-strike` на `<tr>`** — не нужно искать страйк в тексте ячеек, просто `row.dataset.strike`
2. **`data-cell-part`** — не нужно считать индексы, можно фильтровать: `td[data-cell-part="call"]`
3. **`data-cell-id`** — содержит полный идентификатор опциона: `CME_MINI:E3D260618C6625` (тикер, серия, тип C/P, страйк)
4. **`data-row-id`** — одинаковый для всех ячеек строки, можно использовать для группировки

### Что УСЛОЖНЯЕТ работу
1. **CSS классы обфусцированы** — `tr-I7bZhVfy` вместо стабильных имён. Нельзя искать по классу, нужны `data-*` атрибуты
2. **50 колонок вместо 28** — больше данных, нужна новая маппинг-таблица
3. **Volume в progressbar** — `<div class="container-fzyZVq6w"><span class="value-fzyZVq6w">6</span>...` — нужно доставать значение из `<span>`
4. **Экспирации** — больше нет отдельных кнопок с `title`. Серии в URL, разделители в таблице
5. **Зеркальный порядок Call** — Call-колонки идут справа налево (Rho → Volume), Put — слева направо

---

## 3. Стратегия инжекта кнопок в новую верстку

### 3.1. Поиск строк данных
```javascript
// СТАРЫЙ подход (хрупкий):
const table = findOptionsTable();  // сложный поиск по классам
const rows = table.querySelectorAll('tr');

// НОВЫЙ подход (надёжный):
const rows = document.querySelectorAll('tr[data-strike]');
// data-strike гарантированно есть только на строках с данными
```

### 3.2. Поиск ячейки страйка
```javascript
// СТАРЫЙ: перебор ячеек, поиск числа регуляркой
const strikeCell = [...cells].find(c => /^[\d,\.\s]+$/.test(c.textContent));

// НОВЫЙ:
const strikeCell = row.querySelector('td[data-cell-part="central"]');
const strike = parseFloat(row.dataset.strike);  // или row.dataset.strike
```

### 3.3. Инжект кнопок в ячейку страйка
```javascript
const strikeCells = row.querySelectorAll('td[data-cell-part="central"]');
// strikeCells[0] = Strike, strikeCells[1] = IV
const strikeCell = strikeCells[0];

// Создать контейнер с кнопками как раньше:
// [+C] [-C] [STRIKE_TEXT] [+P] [-P]
```

### 3.4. Парсинг данных опциона (КРИТИЧНО — переписать)
```javascript
// СТАРЫЙ: hardcoded индексы от strikeIndex
// callData.bid = parseNumber(cells[strikeIndex - 2]);  // ХРУПКО!

// НОВЫЙ: использовать data-cell-part + маппинг заголовков
function parseOptionRow(row) {
    const strike = parseFloat(row.dataset.strike);
    const callCells = row.querySelectorAll('td[data-cell-part="call"]');
    const putCells = row.querySelectorAll('td[data-cell-part="put"]');

    // Call side: колонки [0..23] соответствуют заголовкам [Rho, Vega, ..., Volume]
    // Нужные нам (по индексу в callCells):
    const callData = {
        rho:       parseNumber(callCells[0]),
        vega:      parseNumber(callCells[1]),
        gamma:     parseNumber(callCells[2]),
        theta:     parseNumber(callCells[3]),
        delta:     parseNumber(callCells[4]),
        iv:        parseNumber(callCells[8]),   // Ask IV %
        bid:       parseNumber(callCells[20]),
        ask:       parseNumber(callCells[19]),
        last:      parseNumber(callCells[16]),  // LTP
        volume:    parseVolumeCell(callCells[23]),  // progressbar!
    };

    // Put side: колонки [0..23] соответствуют [Volume, Distance, ..., Rho]
    const putData = {
        volume:    parseVolumeCell(putCells[0]),   // progressbar!
        bid:       parseNumber(putCells[3]),
        ask:       parseNumber(putCells[4]),
        last:      parseNumber(putCells[7]),   // LTP
        iv:        parseNumber(putCells[15]),   // Ask IV %
        delta:     parseNumber(putCells[19]),
        theta:     parseNumber(putCells[20]),
        gamma:     parseNumber(putCells[21]),
        vega:      parseNumber(putCells[22]),
        rho:       parseNumber(putCells[23]),
    };

    return { strike, callData, putData };
}

// Volume в progressbar — нужен отдельный парсер
function parseVolumeCell(cell) {
    const span = cell.querySelector('span.value-fzyZVq6w, span');
    return span ? parseNumber(span.textContent) : parseNumber(cell.textContent);
}
```

**ВАЖНО:** Индексы выше верифицированы по реальным данным от 2026-03-25. Но лучше строить маппинг динамически из `<th>` заголовков — см. раздел 3.5.

### 3.5. Динамический маппинг колонок (рекомендуемый подход)
```javascript
function buildColumnMap() {
    const headers = document.querySelectorAll('thead tr:nth-child(2) th');
    const map = { call: {}, put: {} };
    let callIdx = 0, putIdx = 0;

    // Первые 24 th = Call (в обратном порядке: Rho..Volume)
    // [24] = Strike, [25] = IV
    // Остальные 24 th = Put (прямой порядок: Volume..Rho)

    const callHeaders = [...headers].slice(0, 24);
    const putHeaders = [...headers].slice(26, 50);

    callHeaders.forEach((th, i) => {
        map.call[th.textContent.trim().toLowerCase()] = i;
    });
    putHeaders.forEach((th, i) => {
        map.put[th.textContent.trim().toLowerCase()] = i;
    });

    return map;
}

// Использование:
const map = buildColumnMap();
const callCells = row.querySelectorAll('td[data-cell-part="call"]');
const bid = parseNumber(callCells[map.call['bid']]);
const ask = parseNumber(callCells[map.call['ask']]);
```

### 3.6. Получение экспирации
```javascript
// СТАРЫЙ: из title кнопки экспирации "Jan 16, 2026 (1) ESH26 EW3"
// НОВЫЙ: из data-cell-id на ячейке
// data-cell-id="CME_MINI:E3D260618C6625"
//                        ^^^^^^^^ = 20260618 = June 18, 2026

function getExpirationFromCellId(cellId) {
    // Format: TICKER:SERIES_CODE+DATE+TYPE+STRIKE
    // Example: CME_MINI:E3D260618C6625
    // E3D = series code, 260618 = YYMMDD, C = Call, 6625 = strike
    const match = cellId.match(/(\d{6})[CP]/);
    if (match) {
        const dateStr = match[1]; // "260618"
        const yy = dateStr.slice(0, 2);
        const mm = dateStr.slice(2, 4);
        const dd = dateStr.slice(4, 6);
        return `20${yy}-${mm}-${dd}`;  // "2026-06-18"
    }
    return null;
}

// Альтернативно: из URL-параметра series
// series=20260618,20260630,20260717,20260731,20260821
// Каждая дата — отдельная экспирация в формате YYYYMMDD
```

### 3.7. Получение тикера
```javascript
// Из URL-параметра symbol
const params = new URLSearchParams(window.location.search);
const symbol = params.get('symbol');  // "CME_MINI:ESU2026"

// Или из data-cell-id:
const cellId = cell.dataset.cellId;  // "CME_MINI:E3D260618C6625"
const ticker = cellId.split(':')[0]; // "CME_MINI"
```

### 3.8. MutationObserver
```javascript
// СТАРЫЙ: observe(document.body, {subtree: true}) — тяжело
// НОВЫЙ: observe только контейнер таблицы
const tableContainer = document.querySelector('table')?.parentElement
    || document.querySelector('tr[data-strike]')?.closest('table, [class*="table"]');

if (tableContainer) {
    observer.observe(tableContainer, { childList: true, subtree: true });
}
```

### 3.9. Кнопка "Калькулятор"
```javascript
// СТАРЫЙ: искали "By expiration" текст через 7 fallback-ов
// НОВЫЙ: вставлять рядом с экспирационным фильтром
// Элемент: <span>Expiration</span> или контейнер с "±4 strikes"
// Или создать свой floating-контейнер — не зависеть от DOM TV
```

---

## 4. Критические баги старой реализации, которые НЕЛЬЗЯ перенести

| # | Баг | Файл | Решение в ext2 |
|---|-----|------|----------------|
| 1 | `parseOptionRow` игнорирует `columnMap`, использует hardcoded индексы | `parser.js:88-133` | Использовать `buildColumnMap()` + `data-cell-part` |
| 2 | Year-fix инвертирует логику: откатывает реальный год+1 на текущий | `parser.js:196-218` | Не нужен — брать дату из `data-cell-id` (YYMMDD) |
| 3 | `addPosition` не проверяет `action` в дубликатах | `storage.js:80-93` | Проверять `(type, strike, expiration, action)` |
| 4 | MutationObserver на `document.body` с `subtree:true` | `buttonsHandlers.js:161` | Observe на контейнер таблицы |
| 5 | Двойная синхронизация (EventBus + syncDelete) | `storage.js:161-178` | Один канал: StorageEvent без reload |
| 6 | `_injectionInProgress` не сбрасывается при ошибке | `calculator.js:44-75` | `try/finally` |
| 7 | `querySelectorAll('*')` для поиска "By expiration" | `buttonsUI.js:233-242` | Не нужен — фиксированный якорь или floating |
| 8 | `lastSaveTimestamp` ненадёжен для фильтрации своих изменений | `mainInit.js:169` | Флаг `_savingInProgress` |

---

## 5. Новые data-атрибуты TradingView — полный справочник

### На `<tr>` (строка):
- `data-strike="6625"` — числовое значение страйка

### На `<td>` (ячейка):
- `data-cell-part="call"` / `"central"` / `"put"` — сторона
- `data-cell-id="CME_MINI:E3D260618C6625"` — полный ID опциона (только call/put ячейки)
- `data-row-id="6625"` — ID строки (= страйк)

### На `<th>` (заголовок):
- `title` — полное описание колонки (на английском)
- `style="--column-width: 6ch;"` — ширина колонки

### Формат data-cell-id:
```
CME_MINI:E3D260618C6625
^^^^^^^  ^^^ ^^^^^^ ^ ^^^^
ticker   ser YYMMDD T strike
              C=Call P=Put
```

---

## 6. Чеклист перед реализацией ext2

- [ ] Проверить `src/utils.js` — `findOptionsTable()`, `parseNumber()`, `convertExpDateToISO()` — адаптировать под `data-*` атрибуты
- [ ] Проверить `src/domErrorHandler.js` — нужен ли в ext2
- [ ] Написать новый `parser.js` с динамическим `buildColumnMap()`
- [ ] Написать новый `buttonsUI.js` с инжектом через `data-strike` + `data-cell-part="central"`
- [ ] Убедиться что экспирация берётся из `data-cell-id`, а не из DOM-текста
- [ ] Протестировать на нескольких тикерах (ES, NQ, ZS, акции)
- [ ] Проверить, что количество колонок стабильно (24+2+24) для разных тикеров
- [ ] Проверить поведение при смене экспирации (URL-параметр series)
