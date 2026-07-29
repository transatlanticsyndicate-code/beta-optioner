# fix-market-iv-visible

- **Дата:** 2026-07-29
- **Ветка:** `fix/market-iv-visible`
- **commit_start:** `d3a74dc`
- **Статус:** VERIFY passed (2026-07-29), НЕ закоммичено и НЕ задеплоено (по требованию задачи)
- **Пайплайн:** `/fix`

## Суть бага

Правка 29.07 (перенос рыночной IV из `manualIvOverride` в `impliedVolatility`, чтобы не
затирать брокерские Fact IV) сделала обновление от расширения невидимым: колонка «IV» дублировала
«Fact IV» (у 87% ног Fact IV заполнена), а для 100% зафиксированных сделок заказчика запись в БД
была полностью погашена. Подробности — `diagnose.md`.

## Артефакты

- `diagnose.md` — root cause, шаги воспроизведения, scope.
- `2026-07-29_fix-market-iv-visible.md` — файл-трейл: что изменено, как проверено, риски.
- `frontend/src/components/CalculatorV2/OptionsTableV3.jsx` — колонка «IV» показывает рыночную
  IV, дельта и тултипы пересмотрены (Задача 1).
- `frontend/src/utils/extensionRefreshPolicy.js` — `shouldPersistExtensionRefresh` → 3 режима,
  новые `pickPersistablePatch`/`applyPersistablePatch` (Задача 2).
- `frontend/src/pages/UniversalOptionsCalculator.jsx` — эффект пересохранения переключён на
  трёхрежимный гейт (Задача 2).
- `frontend/src/utils/__tests__/extRefreshSaveGate.test.js`,
  `frontend/src/utils/__tests__/extensionRefreshPolicy.test.js` (Задача 3).

## VERIFY passed (2026-07-29)

- `CI=false npm test -- --watchAll=false`: **19 сьютов, 136 тестов — все зелёные** (было 126).
- `CI=false npm run build`: успешно, build готов к деплою; предупреждения eslint — все
  pre-existing, ни одного нового в изменённых файлах.
- `git diff --stat`: изменены ровно 5 файлов (3 кода + 2 теста), затронутых Задачами 1-3; ничего
  лишнего.
- Security-чек: в дифе нет секретов, `eval`, `innerHTML`, SQL-конкатенации, сетевых вызовов на
  новые адреса — только чтение существующего API (`getConfiguration`) и чистые функции.

## Следующая фаза

По условиям задачи — **без коммита и без деплоя**. Ветка `fix/market-iv-visible` оставлена
готовой к ревью пользователем.
