# SDD trace: система статусов сохранённых позиций

**Дата:** 2026-05-05
**Тип:** /develop (новый функционал)
**Статус:** реализация завершена, требуется верификация в браузере + миграция БД

## Контекст

Введена система статусов для сохранённых в БД позиций калькулятора:

- **«В ожидании»** (`pending`) — предварительная схема сделки. Жёлтый лейбл. При открытии калькулятор автоматически запрашивает у расширения TradingView свежие BID / ASK / VOL / IV / Актив.
- **«Зафиксирована»** (`standard`, эквивалент прежнего `is_locked=true`) — реально открытая позиция с замороженными датами входа. Голубой лейбл. Котировки и даты не обновляются.

Переход однонаправленный: `pending → standard`. Реализован отдельной кнопкой «🔒 Зафиксировать» рядом с лейблом статуса (только для позиций из БД со статусом `pending`).

**Дефолт статуса — `standard`** (а не `pending`). Это означает:
- все ранее существующие сохранения после миграции получают `status='standard'` и `is_locked=true` (привычное «обычное сохранение, как раньше»);
- новые сохранения по умолчанию тоже создаются как `standard`;
- `pending` появляется только при явном выборе пользователя в диалоге сохранения.

## Изменённые файлы

### Бэкенд

- [backend/app/models/saved_configuration.py](backend/app/models/saved_configuration.py)
  - Колонка `status: VARCHAR(20)` с `server_default='pending'`, NOT NULL.
  - Новый индекс `idx_saved_config_status`.
  - Поле `status` в `to_dict()`.
- [backend/app/routers/saved_configurations.py](backend/app/routers/saved_configurations.py)
  - В Pydantic-схемах `ConfigurationCreate` / `ConfigurationUpdate` добавлено поле `status` с валидацией (`pending` | `standard`).
  - В `GET /api/configurations` добавлен query-параметр `status` для серверного фильтра.
  - В `create_configuration` и `create_configurations_batch`: при `status='standard'` принудительно `is_locked=true`.
  - В `update_configuration`: 
    - Защита перехода `standard → pending` (HTTP 400).
    - При `pending → standard` — выставляется `entry_date=NOW()`, перезаписывается `state` с проставлением `isLockedPosition=true` для всех опционов/позиций и пересчётом `initialDaysToExpiration`. Используется `flag_modified` для надёжной фиксации изменений в JSON-колонке.
- [backend/migrations/add_status_to_saved_configurations.sql](backend/migrations/add_status_to_saved_configurations.sql) — новый SQL-скрипт миграции для prod-БД.

### Фронтенд

- [frontend/src/services/configurationsApi.js](frontend/src/services/configurationsApi.js) — параметр `status` в `getConfigurations`.
- [frontend/src/components/CalculatorV2/SaveConfigurationDialog.jsx](frontend/src/components/CalculatorV2/SaveConfigurationDialog.jsx) — выбор статуса в верхней части диалога с двумя «карточками» (жёлтая `pending` / голубая `standard`). Передаёт `status` в `onSave`.
- [frontend/src/pages/UniversalOptionsCalculator.jsx](frontend/src/pages/UniversalOptionsCalculator.jsx)
  - Удалены состояния и диалоги для localStorage-режима: `saveConfigDialogOpen`, `lockConfigDialogOpen`, обработчик `handleSaveConfiguration`, два устаревших рендера `SaveConfigurationDialog`.
  - Удалены пропы `onSaveConfiguration`/`onLockConfiguration` из вызова `OptionsTableV3`.
  - Добавлены состояния: `loadedConfigStatus`, `loadedConfigName`, `extensionRefreshState`.
  - `loadConfigurationFromDB` пишет статус и имя позиции, `loadConfiguration` (localStorage) их сбрасывает.
  - Реализована функция `requestExtensionRefreshForLoadedPosition(opts)` + эффект автозапуска при `loadedConfigStatus === 'pending'` с таймаутом 5 сек.
  - Шапка калькулятора: новый блок-лейбл «В ожидании» / «Зафиксирована» рядом с названием позиции, с индикатором обновления и кнопками «Обновить через TradingView» / «🔒 Зафиксировать».
  - Новая функция `handlePromotePendingToStandard` — PUT /api/configurations/{id} с `status='standard'`, локальное обновление UI без перезагрузки страницы.
  - В `handleSaveToDB` пробрасывается `status` в API.
- [frontend/src/pages/DatabaseSavedConfigurations.jsx](frontend/src/pages/DatabaseSavedConfigurations.jsx)
  - Новый фильтр «Статус» (Все / В ожидании / Зафиксирована).
  - Новая колонка «Статус» в таблице с цветным бейджем.
  - Сортировка по статусу (`asc` ставит `pending` выше `standard`).
  - Сетка фильтров расширена с 4 до 5 колонок.

## Цветовая схема UI

- `pending` — жёлтый: `bg-yellow-100 text-yellow-800 border-yellow-400` (тёмная тема: `dark:bg-yellow-900/30 dark:text-yellow-300`).
- `standard` — голубой: `bg-cyan-100 text-cyan-800 border-cyan-400` (тёмная тема: `dark:bg-cyan-900/30 dark:text-cyan-300`).

## Пользовательский flow

1. **Сохранение новой позиции.** Калькулятор → «💾 Сохранить в БД» → диалог → выбор «В ожидании» (по умолчанию) или «Зафиксирована» → «Сохранить».
2. **Открытие позиции.** Список → ссылка-название → калькулятор открывается с цветным лейблом статуса в шапке. Если pending — автоматически запрашивается обновление через расширение.
3. **Расширение не отвечает.** После 5-секундного таймаута появляется красный «⚠ Расширение недоступно» и кнопка «Обновить через TradingView» для повторного запуска.
4. **Перевод pending → standard.** В шапке pending-позиции — кнопка «🔒 Зафиксировать». После подтверждения и сохранения статус и UI обновляются мгновенно.
5. **Фильтрация и сортировка.** На странице списка — селект «Статус» в фильтрах, сортируемая колонка «Статус» в таблице.

## Совместимость

- Старая страница [frontend/src/pages/SavedConfigurations.jsx](frontend/src/pages/SavedConfigurations.jsx) (localStorage) и связанные компоненты не трогались — продолжают работать как раньше, без статусов.
- Старые записи в БД без поля `status`: миграция backfill'ит **все** в `status='standard'` + `is_locked=true`. Это согласуется с правилом «обычное сохранение = зафиксирована» и сохраняет визуальную совместимость со старым поведением.
- Pydantic-схемы делают `status` опциональным с дефолтом `'standard'` — старые клиенты без поля сохраняют записи как зафиксированные.
- На фронте загрузка с fallback на `'standard'` для записей без поля (если миграция ещё не применена).

## Верификация

### Уже проверено (статически)

- Python: `ast.parse` обоих изменённых файлов прошёл без ошибок.
- JS: построчная проверка не выявила синтаксических нарушений (acorn недоступен в worktree без `npm install`).

### Требуется проверить в рантайме

1. **Миграция БД (prod и local SQLite/PG).** Применить [backend/migrations/add_status_to_saved_configurations.sql](backend/migrations/add_status_to_saved_configurations.sql), убедиться, что `status` появилась и backfill сделан корректно.
2. **`npm run build`** во `frontend/` — собрать прод-бандл, ожидаются нулевые ошибки компиляции.
3. **Сценарий «Сохранить В ожидании».** В калькуляторе сохранить позицию с дефолтным статусом → в списке появится жёлтый бейдж, при открытии — жёлтый лейбл в шапке, расширение опрашивается автоматически.
4. **Сценарий «Сохранить Зафиксирована».** Выбрать «Зафиксирована» → даты входа замораживаются, при открытии — голубой лейбл, без обновлений котировок.
5. **Расширение отключено.** Открыть pending-позицию без TradingView-расширения → через 5 сек появляется предупреждение и кнопка ручного обновления.
6. **Фильтр и сортировка.** Открыть список БД, выбрать «В ожидании» в фильтре → отображаются только pending. Кликнуть по заголовку «Статус» → группа сортируется.
7. **Перевод pending → standard.** В шапке pending-позиции нажать «🔒 Зафиксировать», подтвердить → статус меняется на standard, бейдж становится голубым, в БД `is_locked=true`, `entry_date=NOW`.
8. **Защита `standard → pending`.** Попытка PUT с `status='pending'` для зафиксированной записи → HTTP 400 с понятным сообщением.

### Безопасность (SDD VERIFY)

- SQL-инъекций нет: все параметры идут через ORM/параметризованные запросы.
- Pydantic `validator` отсекает любые значения статуса вне `{pending, standard}`.
- Авторизация в PUT/DELETE сохранена (`user_id`-проверка не тронута).
- Секреты не попадают в код (нет API-ключей, паролей).

## Что НЕ входило в скоуп

- Удаление файлов localStorage-страницы и связанной инфраструктуры.
- Миграция данных из localStorage в БД.
- Изменения в UI-кнопках OptionsTableV3 — старые кнопки «Сохранить»/«Зафиксировать» в localStorage уже были скрыты ранее.

## Коммит-сообщения (рекомендация)

```
feat(calc-v2): система статусов сохранённых позиций (В ожидании / Зафиксирована)

Task: feature-position-statuses
Phase: BUILD
Artifacts: backend/app/models/saved_configuration.py, backend/app/routers/saved_configurations.py,
  backend/migrations/add_status_to_saved_configurations.sql,
  frontend/src/components/CalculatorV2/SaveConfigurationDialog.jsx,
  frontend/src/pages/UniversalOptionsCalculator.jsx,
  frontend/src/pages/DatabaseSavedConfigurations.jsx,
  frontend/src/services/configurationsApi.js,
  tasks/feature-position-statuses/2026-05-05_develop-position-statuses.md

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
