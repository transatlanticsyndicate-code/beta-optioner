# CP Buttons — Полная архитектура (twparser v28.0.2)

## Файлы текущей реализации

| Файл | Роль |
|------|------|
| `src/buttons.js` | Инжект кнопок в DOM, проверка состояний, MutationObserver |
| `src/buttonsUI.js` | Создание HTML-элементов кнопок |
| `src/buttonsHandlers.js` | Event delegation, обработка кликов |
| `src/storage.js` | CRUD позиций, chrome.storage, защита от дубликатов и race conditions |
| `src/panel.js` | Нижняя панель: табы, таблица, кнопки действий |
| `src/eventBus.js` | Централизованные события (OPTION_DELETED, ALL_CLEARED, TICKER_CLEARED) |
| `src/optioner.js` | Открытие калькулятора optioner.online |
| `src/parser.js` | Парсинг заголовков и строк таблицы опционов |
| `src/mainInit.js` | Порядок инициализации |
| `background/calculator.js` | Инжект данных в калькулятор (freshFetchAndInject) |
| `background/sync.js` | Двусторонняя синхронизация удалений |
| `background/messageHandler.js` | Маршрутизация chrome.runtime сообщений |
| `tradingview.css` | Стили кнопок и панели |
| `manifest.json` | Content scripts для `tradingview.com/options/*` и `optioner.online` |

---

## 1. Инжект кнопок в DOM

### Порядок инициализации (mainInit.js)
```
loadPositions() → setupButtonDelegation() → injectButtons() →
refreshAllButtonStates() → injectCalculatorButton() →
setupObserver() → setupUrlChangeListener()
```

### Поиск таблицы (buttons.js)
- `findOptionsTable()` — ищет таблицу опционов на странице
- Парсит заголовки для определения позиций колонок

### Создание кнопок (buttonsUI.js)
Для каждой строки таблицы создает 4 кнопки:
```
+C (Buy Call)   → class="tvc-add-btn tvc-add-buy"  data-type="CALL" data-action="Buy"
-C (Sell Call)  → class="tvc-add-btn tvc-add-sell"  data-type="CALL" data-action="Sell"
+P (Buy Put)    → class="tvc-add-btn tvc-add-buy"  data-type="PUT"  data-action="Buy"
-P (Sell Put)   → class="tvc-add-btn tvc-add-sell"  data-type="PUT"  data-action="Sell"
```

Data-атрибуты на каждой кнопке:
- `data-type` — CALL / PUT
- `data-action` — Buy / Sell
- `data-strike` — цена страйка
- `data-label` — оригинальный текст (+C, -C, +P, -P)
- `data-title` — tooltip

Расположение в ячейке страйка: `[+C] [-C] [STRIKE] [+P] [-P]` с gap 8px (flex layout)

### MutationObserver (buttons.js → setupObserver)
- Следит за появлением новых `<tr>` / `[role="row"]` в DOM
- При обнаружении вызывает `injectButtons()` повторно
- Debounce 100ms для защиты от лавинного вызова

### Кнопка "Калькулятор" (buttons.js → injectCalculatorButton)
- Инжектится в заголовок доски опционов (рядом с "By expiration")
- Стиль: бирюзовая (#26c6da), border-radius 20px, box-shadow
- Клик → `openOptionerCalculator(ticker)`

---

## 2. Обработка кликов

### Event Delegation (buttonsHandlers.js → setupButtonDelegation)
```javascript
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.tvc-add-btn');
  if (!btn) return;
  handleOptionClick(btn, btn.dataset.type, btn.dataset.action, parseFloat(btn.dataset.strike));
});
```
Почему delegation: React TradingView пересоздает DOM, inline-обработчики теряются.

### handleOptionClick (buttonsHandlers.js)
1. Находит свежую строку по strike (DOM мог обновиться)
2. Парсит данные опциона из строки таблицы (греки, IV, bid/ask, volume)
3. Вызывает `addPosition(ticker, type, strike, expiration, action, rowData)`
4. Обновляет UI кнопки: текст → ✔, цвет → серый (#6b7280)
5. Ставит красную точку на кнопке экспирации
6. Вызывает `openOptionerCalculator(ticker)` для открытия калькулятора

---

## 3. Хранилище (storage.js)

### Три уровня хранения

**RAM (глобальные переменные content script):**
```javascript
tvc_positions = { 'AAPL': [{...}, {...}], 'TSLA': [{...}] }
tvc_activeTab = 'AAPL'
tvc_panelCollapsed = false
```

**chrome.storage.local (персистентное):**
- Ключ: `tvc_positions` — синхронизируется с RAM
- Переживает перезапуск браузера

**localStorage (для калькулятора и панели):**
- `calculatorState` — состояние калькулятора (инжектируется расширением)
- `tvc_panel_state` — collapse/height панели
- `tvc_last_event` — последнее событие EventBus

### Структура позиции
```javascript
{
  id: unique_id,
  ticker: 'AAPL',
  type: 'CALL',          // или 'PUT'
  action: 'Buy',         // или 'Sell'
  strike: 150,
  expiration: '2026-04-17',
  expirationISO: '2026-04-17',
  bid: 2.50,
  ask: 2.65,
  last: 2.55,
  iv: 0.32,
  volume: 1500,
  delta: 0.45,
  gamma: 0.02,
  theta: -0.05,
  vega: 0.15,
  openInterest: 5000
}
```

### Ключевые функции

| Функция | Описание |
|---------|----------|
| `loadPositions()` | Загрузка из chrome.storage в RAM |
| `savePositions()` | Сохранение RAM → chrome.storage |
| `addPosition(ticker, ...)` | Добавление с проверкой дубликатов |
| `removePosition(ticker, id)` | Удаление + синхронизация с калькулятором |
| `clearPositions(ticker)` | Очистка тикера или всех позиций |
| `syncOptionsFromCalculator(opts)` | Синхронизация состава с калькулятором |
| `exportDiagnosticDump()` | Экспорт диагностики (обнаружение дубликатов) |

### Защита от race conditions
- `lastSaveTimestamp` — игнорировать собственные изменения в storage listener
- `syncInProgress` — предотвращение циклических удалений

### Проверка дубликатов при добавлении
```javascript
isOptionInCalculator(ticker, type, strike, expiration, action)
// Совпадение по: type + strike + expiration + action
```

---

## 4. Нижняя панель (panel.js)

### Структура
- Фиксированная позиция: `position: fixed; bottom: 0; height: 270px; z-index: 9999`
- Компоненты: drag-handle, заголовок, табы тикеров, таблица позиций, кнопки действий

### Табы тикеров
- По одному табу на тикер: `AAPL (3)`, `TSLA (2)`
- `tvc_activeTab` — текущий выбранный таб
- Клик по табу переключает отображаемые позиции

### Таблица позиций
- Столбцы: Asset, Type (CALL/PUT), Strike, Expiration, Remove (×)
- Максимум 5 строк без скролла, 6-я вызывает scroll

### Кнопки действий

| Кнопка | Действие |
|--------|----------|
| Открыть калькулятор | `openOptionerCalculator(tvc_activeTab)` |
| Открыть в новом табе | `chrome.runtime.sendMessage({action: 'openOptionerTabNew'})` |
| Очистить [TICKER] | `clearPositions(ticker)` + синхронизация |
| Очистить всё | `chrome.storage.local.clear()` + очистка localStorage калькулятора + reload |
| Диагностика | `exportDiagnosticDump()` |

### Полная очистка ("Очистить всё")
1. `chrome.storage.local.clear()`
2. `tvc_positions = {}`
3. Находит таб калькулятора и инжектит скрипт очистки:
   - `localStorage.removeItem('calculatorState')`
   - `localStorage.removeItem('tvc_refresh_command')`
   - `localStorage.removeItem('tvc_refresh_result')`
   - `localStorage.removeItem('tvc_command')`
   - `localStorage.removeItem('tvc_full_chain')`
   - `localStorage.removeItem('tvc_status')`
   - `location.reload()`
4. Перерисовка панели
5. Alert: "All data cleared!"

---

## 5. Синхронизация расширение ↔ калькулятор

### Добавление опциона (Extension → Calculator)
```
Клик кнопки +C/+P/-C/-P
  → handleOptionClick() [buttonsHandlers.js]
  → addPosition() [storage.js]
    → tvc_positions[ticker].push(position)
    → savePositions() → chrome.storage.local.set()
  → openOptionerCalculator(ticker) [optioner.js]
    → chrome.runtime.sendMessage({action: 'openOptionerTab', ticker})
      → Background: handleOpenOptionerTab() [calculator.js]
        → Найти/создать таб optioner.online
        → Дождаться загрузки (tabs.onUpdated)
        → freshFetchAndInject()
          → chrome.storage.local.get('tvc_positions')  // СВЕЖИЕ данные!
          → injectDataIntoCalculator()
            → Конвертация в формат калькулятора
            → localStorage.setItem('calculatorState', JSON.stringify(state))
            → location.reload()  // React подхватит новые данные
```

### Удаление из панели → калькулятор
```
Клик × в панели
  → removePosition(ticker, id) [storage.js]
    → Удаление из tvc_positions
    → savePositions()
    → chrome.runtime.sendMessage({action: 'syncDeleteToCalculator', option})
      → Background: handleSyncDeleteToCalculator() [sync.js]
        → chrome.tabs.query() для optioner.online
        → chrome.scripting.executeScript() в табе калькулятора:
          → Удаление из calculatorState по (type + strike + expiration)
          → dispatchEvent(new StorageEvent(...))  // без reload — нет race condition
```

### Удаление из калькулятора → панель
```
Калькулятор удаляет опцион
  → chrome.runtime.sendMessage({action: 'optionDeletedFromCalculator', option})
    → Background: handleOptionDeletedFromCalculator() [sync.js]
      → Фильтрация tvc_positions
      → chrome.storage.local.set()
      → chrome.tabs.sendMessage({action: 'refreshPanel'}) ко всем TV табам
        → Content script: renderPanel() [panel.js]
        → refreshAllButtonStates() [buttons.js] — кнопки возвращаются к исходному виду
```

### Очистка тикера → калькулятор
```
Клик "Очистить [TICKER]" в панели
  → clearPositions(ticker) [storage.js]
    → delete tvc_positions[ticker]
    → savePositions()
    → chrome.runtime.sendMessage({action: 'clearTickerFromCalculator', ticker})
      → Background: handleClearTickerFromCalculator() [sync.js]
        → Найти таб калькулятора
        → Проверить, что калькулятор показывает этот тикер
        → calculatorState.options = []
        → location.reload()
```

### Полная очистка из калькулятора → панель
```
Калькулятор очищает всё
  → chrome.runtime.sendMessage({action: 'clearAllFromCalculator'})
    → Background: handleClearAllFromCalculator() [sync.js]
      → tvc_positions = {}
      → chrome.storage.local.set({tvc_positions: {}})
      → chrome.tabs.sendMessage({action: 'refreshPanel'}) ко всем TV табам
```

---

## 6. EventBus (eventBus.js)

### Типы событий
```javascript
OPTION_DELETED  — удален конкретный опцион
ALL_CLEARED     — очищены все данные
TICKER_CLEARED  — очищен конкретный тикер
OPTIONS_UPDATED — обновлен список опционов
```

### Методы
| Метод | Описание |
|-------|----------|
| `sendOptionDeletedEvent(option)` | Уведомить об удалении опциона |
| `sendAllClearedEvent()` | Уведомить о полной очистке |
| `sendTickerClearedEvent(ticker)` | Уведомить об очистке тикера |
| `subscribeToEvents(callback)` | Подписаться на события |

### Каналы доставки
1. `chrome.runtime.sendMessage({action: 'tvc_event', event})` — между content scripts и background
2. `localStorage.setItem('tvc_last_event', JSON.stringify(event))` — между разными табами

---

## 7. Визуальные состояния кнопок

### Обычное состояние
- Buy (+C, +P): зеленый фон (#26a69a), белый текст
- Sell (-C, -P): красный фон (#ef5350), белый текст
- Размер: 25×25px, border-radius 3px, font 10px bold

### Добавлено в калькулятор
- Текст: ✔
- Фон: серый (#6b7280)
- Tooltip: "Уже добавлено"

### Hover
- `transform: scale(1.1)` с transition 0.15s

### Обновление состояний
- `updateButtonState(btn, isAdded)` — для одной кнопки
- `refreshAllButtonStates()` — для всех кнопок (после удаления опциона)
  - Перебирает все `.tvc-add-btn`
  - Проверяет `isOptionInCalculator()` для каждой
  - Обновляет UI

---

## 8. CSS (tradingview.css)

### Кнопки
```css
.tvc-add-btn { width: 25px; height: 25px; border-radius: 3px; font-size: 10px; font-weight: 600; }
.tvc-add-buy { background: #26a69a; color: white; }
.tvc-add-sell { background: #ef5350; color: white; }
.tvc-add-btn:hover { transform: scale(1.1); }
```

### Панель
```css
#tvc-panel { position: fixed; bottom: 0; left: 0; right: 0; height: 270px; z-index: 9999; background: white; }
.tvc-btn-clear { font-size: 12px; color: gray; }
.tvc-btn-clear-all { background: #ef5350; color: white; }
```

Все стили используют `!important` для перезаписи стилей TradingView.

---

## 9. Manifest — Content Scripts конфигурация

```json
{
  "matches": ["https://*.tradingview.com/options/*"],
  "js": [
    "src/config.js", "src/utils.js", "src/eventBus.js", "src/storage.js",
    "src/parser.js", "src/optioner.js", "src/panel.js",
    "src/buttonsUI.js", "src/buttonsHandlers.js", "src/mainInit.js"
  ],
  "css": ["tradingview.css"],
  "run_at": "document_idle"
}
```

Для калькулятора (optioner.online):
```json
{
  "matches": ["https://optioner.online/*"],
  "js": ["src/config.js", "src/eventBus.js", "src/optioner.js"]
}
```

Background service worker загружает: `calculator.js`, `sync.js`, `messageHandler.js`

---

## 10. Chrome Runtime Messages (полный список)

### Content Script → Background
| Action | Описание | Обработчик |
|--------|----------|------------|
| `openOptionerTab` | Открыть калькулятор с позициями | calculator.js |
| `openOptionerTabNew` | Открыть НОВЫЙ таб калькулятора | calculator.js |
| `syncDeleteToCalculator` | Синхронизировать удаление → калькулятор | sync.js |
| `clearTickerFromCalculator` | Очистить тикер в калькуляторе | sync.js |
| `optionDeletedFromCalculator` | Опцион удален в калькуляторе | sync.js |
| `clearAllFromCalculator` | Полная очистка из калькулятора | sync.js |
| `tvc_event` | EventBus сообщение | messageHandler.js |

### Background → Content Script
| Action | Описание |
|--------|----------|
| `refreshPanel` | Перерисовать панель (после синхронизации) |

---

## 11. Известные проблемы и фиксы (v28.0.1–v28.0.2)

1. **Дубликаты опционов** — добавлена проверка `isOptionInCalculator()` перед добавлением
2. **Смешивание тикеров** — изоляция по ключу тикера в `tvc_positions`
3. **Год экспирации +1** — фикс в parser.js (если год = текущий+1, проверить текущий год)
4. **Нет синхронизации удалений** — добавлен EventBus + sync.js
5. **SUPERBUG: stale data** — `freshFetchAndInject()` вместо данных из замыкания
6. **Race condition при sync** — `lastSaveTimestamp` + `syncInProgress` флаги

---

## 12. Code Review → План переноса в ext2

### Таблица переноса файлов

| Файл | Действие | Комментарий |
|------|----------|-------------|
| `src/buttons.js` | **НЕ переносить** | Дубликат buttonsUI.js, не загружается в manifest |
| `src/buttonsUI.js` | Переносить с правками | Основной файл кнопок. Переписать DOM-селекторы под новую верстку |
| `src/buttonsHandlers.js` | Переносить с правками | Event delegation — ок. Добавить debounce в MutationObserver, сузить observe до контейнера таблицы |
| `src/storage.js` | Переносить с правками | Добавить `action` в проверку дубликатов (сейчас не проверяется). Заменить `lastSaveTimestamp` на флаг `_savingInProgress` |
| `src/parser.js` | **Переписать** | Критично: hardcoded индексы колонок → использовать `columnMap`. Убрать year-fix (баг 1.3). Переписать `getAllExpirations` |
| `src/panel.js` | Переносить as-is | Экранировать тикер в innerHTML. Использовать `sourceUrl` если есть |
| `src/eventBus.js` | Переносить, упростить | Оставить один канал (StorageEvent). Убрать `location.reload()` при удалении |
| `src/optioner.js` | Переносить as-is | — |
| `src/mainInit.js` | Переносить | Убрать init-вызовы не связанные с кнопками |
| `background/calculator.js` | Переносить с правками | Обернуть `injectDataIntoCalculator` в try/finally для сброса `_injectionInProgress` |
| `background/sync.js` | Переносить as-is | — |
| `background/messageHandler.js` | Переносить частично | Только handlers для опционов. Убрать AI/screener/chart. Убрать hardcoded API key |
| `tradingview.css` | Переносить as-is | Убрать неиспользуемые классы: `.tvc-add-both`, `.tvc-qty-input`, `.tvc-exp-select`, `.tvc-delete-btn`, `.tvc-footer`, `.tvc-totals` |
| `manifest.json` | Создать новый | Минимальные permissions: `storage`, `activeTab`, `tabs`, `scripting` (без `debugger`) |
| `src/utils.js` | **Обязательно проверить** | Содержит `findOptionsTable()`, `parseNumber()`, `convertExpDateToISO()`, `getTickerFromUrl()` — критичные для работы |
| `src/domErrorHandler.js` | **Обязательно проверить** | `safeQuerySelector`, `safeQuerySelectorAll` — используются везде |

### Критические проблемы для исправления при переносе

**1. parseOptionRow — hardcoded индексы колонок** (`parser.js:88-133`)
- Сейчас: `callData.bid = parseNumber(cells[strikeIndex - 2])` — жёсткая привязка к индексу
- `parseTableHeaders()` строит `columnMap`, но `parseOptionRow` его **игнорирует**
- Нужно: использовать `columnMap[side].bid` вместо hardcoded смещений
- Риск: тихий баг — bid попадёт в ask, theta в gamma, кнопки работают но данные неверные

**2. Парсинг года экспирации — логика инвертирована** (`parser.js:196-218`)
- Сейчас: если год = текущий+1 и дата не прошла → откатить на текущий год
- Баг: реальная экспирация Mar 2027 будет откачена до Mar 2026
- Нужно: доверять данным из `title` атрибута кнопок экспирации, не корректировать год

**3. addPosition не проверяет action** (`storage.js:80-93`)
- Сейчас: дубликат проверяется по `(type, strike, expirationISO)` — без action
- `isOptionInCalculator` проверяет action — несоответствие
- Баг: Buy CALL 6800 и Sell CALL 6800 считаются дубликатами

**4. MutationObserver на document.body** (`buttonsHandlers.js:161-190`)
- `subtree: true` на body = каждая мутация DOM проходит через callback
- React TradingView тикает котировки постоянно → нагрузка
- Нужно: observe на контейнер таблицы, не на body

**5. Двойная синхронизация удалений** (`storage.js:161-178`)
- При удалении вызываются EventBus + syncDeleteToCalculator одновременно
- EventBus делает `reload()`, sync делает `StorageEvent` — два разных механизма
- Нужно: один канал. StorageEvent без reload предпочтительнее

**6. _injectionInProgress не сбрасывается при ошибке** (`background/calculator.js:44-75`)
- Флаг сбрасывается через `setTimeout(5000)`, но если `injectDataIntoCalculator` бросит исключение — 5 секунд блокировки
- Нужно: `try/finally { _injectionInProgress = false; }`

### Что не переносить
- `buttons.js` — мёртвый дубликат
- AI/screener/chart handlers из `messageHandler.js`
- `debugger` permission из manifest
- Hardcoded API ключ из `messageHandler.js:622`
- Fallback `querySelectorAll('*')` для поиска "By expiration" из `buttonsUI.js:233-242`
