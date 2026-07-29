# 2026-07-29 — fix-market-iv-visible

## Что было сломано

29.07 обновление от расширения стало писать рыночную IV в `impliedVolatility` вместо
`manualIvOverride` (правильно, чтобы не затирать ручные брокерские данные). Побочный эффект —
обновление стало невидимым:

1. Колонка «IV» показывала `getOptionVolatility(...)`, которая при заполненной Fact IV
   (87% ног у заказчика) игнорирует `impliedVolatility` и всегда возвращает Fact IV — колонка
   дублировала «Fact IV».
2. `impliedVolatility` был виден только как placeholder Fact IV — то есть только на 13% ног,
   где Fact IV пуста.
3. Эффект пересохранения полностью гасил запись в БД для `isLocked` сделок — у заказчика все
   50 сделок зафиксированы, поэтому обновлённые рыночные данные не переживали перезагрузку.

Подробный root cause с номерами строк — `diagnose.md` в этой папке.

## Что изменено

**Задача 1 — колонка «IV» показывает рыночную IV**
(`frontend/src/components/CalculatorV2/OptionsTableV3.jsx`)

- Рендер значения колонки «IV» переключён с `getOptionVolatility(...)` на
  `option.impliedVolatility`, нормализованный через уже существующую `normalizeMarketIv`
  (`utils/extensionRefreshPolicy.js` — тот же порог 1.5, что и в `enrich.js:31`); при отсутствии
  данных — «—».
- Дельта под колонкой «IV» пересчитана: теперь это разница между рыночной IV (эта колонка) и
  Start IV, а не Fact IV минус Start IV. Цвет по выгоде направления ноги (Buy/Sell) сохранён без
  изменений.
- Добавлен тултип к заголовку «IV»: рыночная волатильность из TradingView, обновляется
  расширением; в P&L используется Fact IV, если заполнена. Тултип у заголовка «Start IV»
  подправлен под новый смысл дельты.
- К значению добавлен тултип «обновлено ДД.ММ.ГГГГ ЧЧ:ММ» из `option.ivUpdatedAt`, когда есть.
- Расчётные пути НЕ тронуты: `optVolatility` для P&L, `anchorIV`, все прочие вызовы
  `getOptionVolatility` продолжают приоритизировать Fact IV как раньше.

**Задача 2 — узкое сохранение для зафиксированных сделок**
(`frontend/src/utils/extensionRefreshPolicy.js`, `frontend/src/pages/UniversalOptionsCalculator.jsx`)

- `shouldPersistExtensionRefresh` расширена с булевого предиката до трёх режимов:
  `'full'` (обычная сделка — как раньше), `'market-only'` (сделка зафиксирована), `'skip'`
  (нет флага/id, либо режим редактирования — приоритет над isLocked).
- Новая чистая функция `pickPersistablePatch({ mode, currentPrice, options })` — в режиме
  `'market-only'` строит патч, где каждая нога содержит ТОЛЬКО `id`, `impliedVolatility`,
  `ivUpdatedFromExtension`, `ivUpdatedAt`.
- Новая чистая функция `applyPersistablePatch(baseState, patch)` — накладывает узкий патч на
  состояние, актуально хранящееся в БД/localStorage (не на снимок формы), сохраняя все
  остальные поля нетронутыми.
- Эффект пересохранения в `UniversalOptionsCalculator.jsx`: для `'market-only'` сначала читает
  свежее состояние через `getConfiguration` (БД) или напрямую `configurations[idx].state`
  (localStorage), затем сохраняет `applyPersistablePatch(...)`. Для `'full'` поведение не
  изменилось. `console.info` с выбранным режимом сохранён для диагностики.

**Задача 3 — тесты**

- `extRefreshSaveGate.test.js` переписан под три режима + добавлены тесты на
  `pickPersistablePatch` (патч не содержит `manualIvOverride`, `actualPL*`, `customAsk/Bid`,
  `startSnapshot`, `quantity`, `strike`, `date`) и `applyPersistablePatch` (слияние с baseState).
- `extensionRefreshPolicy.test.js` — добавлены точечные кейсы нормализации:
  `0.4922 → 49.22`, `49.22 → 49.22`, `undefined → null`.

## Как проверить

- `cd frontend && CI=false npm test -- --watchAll=false` — 19 сьютов, 136 тестов (было 126), все
  зелёные.
- `CI=false npm run build` — успешно, «The build folder is ready to be deployed»; предупреждения
  eslint — все pre-existing, ни одно не в изменённых блоках.

## Риски

- `applyPersistablePatch` для `market-only` делает дополнительный round-trip к БД
  (`getConfiguration`) перед записью — при недоступности API патч просто не применится
  (залогируется ошибка), без порчи данных.
- Комментарий про «известное расхождение (1; 1.5]» в `extensionRefreshPolicy.js` (доли vs
  проценты, бэкенд/`enrich.js` трактуют иначе) теперь актуален и для отображения в колонке
  «IV», так как используется та же функция — не новый риск, тот же, что уже был документирован
  для приёма обновлений.
