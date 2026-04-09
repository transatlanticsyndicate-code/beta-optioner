# ext2 v1.0.0 — Архитектура

## Потоки данных

### Добавление опциона (+C/+P/-C/-P)
```
Клик кнопки .ext2-btn (event delegation на document)
  → buttonsHandlers.js: handleOptionClick()
    → Находит строку: document.querySelector('tr[data-strike="..."]')
    → parser.js: buildColumnMap() + parseOptionRow(row, columnMap)
    → Экспирация из data-cell-id (YYMMDD — без парсинга дат)
  → storage.js: addPosition() [проверка дубликатов: type+strike+exp+action]
    → chrome.storage.local.set({tvc_positions})
  → panel.js: showPanel() + renderPanel()
  → optioner.js: openOptionerCalculator(ticker)
    → chrome.runtime.sendMessage({action: 'ext2_openOptionerTab'})
      → background/calculator.js: handleOpenOptionerTab()
        → Найти/создать таб optioner.online
        → freshFetchAndInject() [SUPERBUG fix: свежие данные из storage]
          → injectDataIntoCalculator()
            → chrome.scripting.executeScript на табе калькулятора
            → localStorage.setItem('calculatorState', ...)
            → location.reload()
```

### Удаление из панели → калькулятор
```
Клик × в панели
  → storage.js: removePosition(ticker, id)
    → chrome.storage.local.set({tvc_positions})
    → chrome.runtime.sendMessage({action: 'ext2_syncDeleteToCalculator'})
      → background/sync.js: handleSyncDeleteToCalculator()
        → chrome.scripting.executeScript на калькуляторе
        → Удаляет из calculatorState по (type + strike + date)
        → dispatchEvent(StorageEvent) — БЕЗ reload
```

### Удаление из калькулятора → панель
```
optioner.js на optioner.online слушает localStorage changes
  → chrome.runtime.sendMessage({action: 'optionDeletedFromCalculator'})
    → background/sync.js: handleOptionDeletedFromCalculator()
      → Фильтрует tvc_positions в chrome.storage
      → chrome.tabs.sendMessage({action: 'refreshPanel'}) → TV tabs
        → mainInit.js: loadPositions() + renderPanel() + refreshAllButtonStates()
```

### Полный сброс ("Очистить всё")
```
Клик в панели
  → tvc_positions = {}, chrome.storage.local.set({tvc_positions: {}})
  → chrome.runtime.sendMessage({action: 'ext2_clearCalculator'})
    → background: executeScript на калькуляторе
      → localStorage.removeItem('calculatorState') + reload
  → renderPanel() [покажет "Нет позиций"]
  → refreshAllButtonStates() [снимет все галочки]
```

## Парсинг новой верстки TradingView

### Структура таблицы (50 колонок)
```
<tr data-strike="6625">
  <td data-cell-part="call" data-cell-id="CME_MINI:E3D260618C6625">...</td>  ×24
  <td data-cell-part="central">6,625</td>                                     ×2
  <td data-cell-part="put" data-cell-id="CME_MINI:E3D260618P6625">...</td>   ×24
</tr>
```

### Маппинг колонок (buildColumnMap)
Динамически из `<thead tr:nth-child(2) th>`:
- Call [0-23]: Rho, Vega, Gamma, Theta, Delta, ..., Volume
- Central [24-25]: Strike, IV
- Put [26-49]: Volume, ..., Delta, Theta, Gamma, Vega, Rho

### Экспирация из data-cell-id
```
CME_MINI:E3D260618C6625
              ^^^^^^ = YYMMDD → 2026-06-18
                    ^ = C(Call) / P(Put)
```

## Chrome Runtime Messages

| Action | Направление | Обработчик |
|--------|-------------|------------|
| `ext2_openOptionerTab` | content → BG | calculator.js |
| `ext2_openOptionerTabNew` | content → BG | calculator.js |
| `ext2_syncDeleteToCalculator` | content → BG | sync.js |
| `ext2_clearTickerFromCalculator` | content → BG | sync.js |
| `ext2_clearCalculator` | content → BG | background.js |
| `optionDeletedFromCalculator` | calc → BG | sync.js |
| `clearAllFromCalculator` | calc → BG | sync.js |
| `refreshPanel` | BG → content | mainInit.js |
| `showPanel` | popup → content | mainInit.js |

## Отличия от twparser v28

| Аспект | twparser v28 | ext2 v1.0 |
|--------|-------------|-----------|
| Поиск строк | `findOptionsTable()` + перебор | `tr[data-strike]` |
| Страйк | Regex по тексту ячейки | `row.dataset.strike` |
| Колонки | Hardcoded индексы | `buildColumnMap()` из `<th>` |
| Экспирация | Парсинг текста + year-fix баг | `data-cell-id` (YYMMDD) |
| Дубликаты | Без action в проверке | `(type, strike, exp, action)` |
| Observer | `document.body` subtree | Контейнер таблицы |
| Sync каналы | EventBus + syncDelete (два) | StorageEvent (один, без reload) |
| Race condition | lastSaveTimestamp | `_ext2_savingInProgress` флаг |
| injection guard | setTimeout(5000) | try/finally |
