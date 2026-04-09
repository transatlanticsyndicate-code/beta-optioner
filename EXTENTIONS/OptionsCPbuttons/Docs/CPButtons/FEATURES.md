# ext2 v1.0.0 — Options CP Buttons

> Отдельное расширение для кнопок +C +P -C -P на доске опционов TradingView
> Совместимо с калькулятором optioner.online (общий tvc_positions)

## 1. Кнопки в таблице опционов
- **+C** (Buy Call), **-C** (Sell Call), **+P** (Buy Put), **-P** (Sell Put)
- Инжектятся через `tr[data-strike]` + `td[data-cell-part="central"]`
- Экспирация из `data-cell-id` (формат YYMMDD) — баг с годом невозможен
- Визуальная обратная связь: кнопка → галочка ✔
- MutationObserver на контейнер таблицы (не на body)
- Event delegation — клики работают после пересоздания DOM

## 2. Кнопка "Калькулятор" в шапке
- После кнопки "Volatility" в навигации
- Открывает калькулятор optioner.online с текущими позициями

## 3. Нижняя панель (Bottom Panel)
- Фиксированная панель внизу (270px, тёмная тема)
- Табы по тикерам: `ESU2026 (3)`
- Таблица: Action, Type, Strike, Exp, Remove (×)
- Кнопки: Калькулятор, +Новая вкладка, Очистить [TICKER], Очистить всё
- Сворачивание/закрытие (× и −)

## 4. Popup (иконка расширения)
- Переключение сервера: Production / Localhost
- Кнопка "Показать панель"
- Статистика: количество позиций и тикеров

## 5. Хранилище
- **RAM**: `tvc_positions = {ticker: [positions]}`
- **chrome.storage.local** ключ `tvc_positions` (совместимость с калькулятором)
- Проверка дубликатов: `(type, strike, expiration, action)`
- Флаг `_ext2_savingInProgress` вместо timestamp

## 6. Синхронизация расширение ↔ калькулятор
- **Добавление**: кнопка → storage → background → calculatorState → reload
- **Удаление из панели → калькулятор**: StorageEvent (без reload)
- **Удаление из калькулятора → панель**: optionDeletedFromCalculator → refreshPanel
- **Очистка**: через background ext2_clearCalculator
- **Content script optioner.js** на optioner.online для двусторонней синхронизации

## 7. Парсинг (новая верстка TradingView 2026-03)
- Динамический `buildColumnMap()` из `<th>` заголовков
- 50 колонок: 24 Call + 2 Central (Strike, IV) + 24 Put
- `data-cell-part` для разделения Call/Put
- `data-cell-id` содержит экспирацию и тип опциона

## Файлы расширения
```
ext2_v1.0.0/
├── manifest.json        — MV3, permissions: storage, tabs, scripting
├── popup.html/js        — переключение сервера, показать панель
├── ext2.css             — стили кнопок и панели (тёмная тема)
├── optioner.js          — content script для optioner.online (sync)
├── src/
│   ├── config.js        — STORAGE_KEY, environments, LOG_TAG
│   ├── utils.js         — parseNumber, getTickerFromUrl, getExpirationFromCellId
│   ├── parser.js        — buildColumnMap, parseOptionRow
│   ├── storage.js       — CRUD tvc_positions, isOptionInCalculator
│   ├── optioner.js      — openOptionerCalculator
│   ├── panel.js         — bottom panel UI
│   ├── buttonsUI.js     — inject buttons, updateButtonState
│   ├── buttonsHandlers.js — event delegation, MutationObserver
│   └── mainInit.js      — initialization, message listeners
└── background/
    ├── background.js    — message router
    ├── calculator.js    — freshFetchAndInject, injectDataIntoCalculator
    └── sync.js          — bidirectional sync (StorageEvent)
```
