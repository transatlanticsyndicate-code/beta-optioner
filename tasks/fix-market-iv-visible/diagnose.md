# diagnose.md — fix-market-iv-visible

- **Дата:** 2026-07-29
- **Ветка:** `fix/market-iv-visible`
- **commit_start:** `d3a74dc`
- **Пайплайн:** `/fix`

## Root cause

29.07 приём обновления от расширения был исправлен так, чтобы рыночная IV писалась в
`option.impliedVolatility`, а не в `option.manualIvOverride` ("Fact IV") — правильно, чтобы не
затирать ручные брокерские значения заказчика (см. `frontend/src/utils/extensionRefreshPolicy.js`,
`buildIvPatch`). Побочный эффект: обновление стало невидимым для пользователя по трём причинам.

1. **Колонка «IV» дублирует «Fact IV».**
   `frontend/src/components/CalculatorV2/OptionsTableV3.jsx:1181` рендерит колонку «IV» через
   `getOptionVolatility(option, ..., option.manualIvOverride, ...)`.
   `frontend/src/utils/volatilitySurface.js:385` при заполненном `manualIvOverride` (`> 0`)
   немедленно возвращает ручное значение, **никогда не читая** `option.impliedVolatility`
   (условие на строке 385: `if (manualIvOverride && manualIvOverride > 0) { ... return ... }`,
   ветки с `impliedVolatility` ниже по функции для этого пути недостижимы). У заказчика Fact IV
   заполнена у 116 из 134 ног (87%) — то есть колонка «IV» у подавляющего большинства строк
   визуально равна «Fact IV» и обновление расширением (которое пишет только
   `impliedVolatility`) там никак не видно.

2. **`impliedVolatility` виден только как placeholder** инпута Fact IV
   (`OptionsTableV3.jsx:1230-1234`) — то есть только когда Fact IV пуста. У заказчика это 18 из
   134 ног (13%).

3. **Эффект пересохранения гасит запись в БД для `isLocked` сделок.**
   `frontend/src/pages/UniversalOptionsCalculator.jsx:1166-1183` — вызывает
   `shouldPersistExtensionRefresh({ ..., isLocked, isEditMode })`
   (`frontend/src/utils/extensionRefreshPolicy.js`, `shouldPersistExtensionRefresh`), которая при
   `isLocked === true` возвращает `false` безусловно — сохранение полностью гасится
   независимо от того, какие поля изменились. У заказчика **все 50 сделок зафиксированы**,
   поэтому даже обновлённая рыночная IV/цена БА в состоянии React не переживает перезагрузку
   страницы (после reload подтягивается старое состояние из БД).

## Итог для пользователя

Клик «Да, обновить» в расширении визуально не давал ничего (менялась только цена в шапке, и
та не сохранялась) → выглядело как «срабатывает со второго раза».

## Reproduction steps

1. Открыть зафиксированную (`isLocked`) сделку с заполненной Fact IV хотя бы у одной ноги.
2. Обновить через расширение (rыночная IV меняется в `option.impliedVolatility`).
3. Убедиться, что колонка «IV» не изменилась (показывает то же, что «Fact IV»).
4. Перезагрузить страницу — цена БА и рыночная IV откатываются к значениям из БД.

## Scope

- `frontend/src/components/CalculatorV2/OptionsTableV3.jsx` — рендер колонки «IV», дельта,
  тултипы заголовка/значения (Задача 1). Расчётные пути (`optVolatility` для P&L, `anchorIV`,
  и т.д., использующие `getOptionVolatility`) — НЕ трогаются.
- `frontend/src/utils/extensionRefreshPolicy.js` — `normalizeMarketIv` переиспользуется для
  отображения (уже существует, порог 1.5 совпадает с `enrich.js:31`); `shouldPersistExtensionRefresh`
  расширяется до трёх режимов (`'full' | 'market-only' | 'skip'`); новая чистая функция
  `pickPersistablePatch` (отбор разрешённых полей) + `applyPersistablePatch` (слияние патча с
  состоянием, уже лежащим в БД/localStorage) (Задача 2).
- `frontend/src/pages/UniversalOptionsCalculator.jsx` — эффект пересохранения (~1166-1230)
  переключается на новый трёхрежимный гейт (Задача 2).
- Тесты: `frontend/src/utils/__tests__/extRefreshSaveGate.test.js`,
  `frontend/src/utils/__tests__/extensionRefreshPolicy.test.js` (Задача 3).

## Принятое решение

- Колонка «IV» показывает `option.impliedVolatility` (нормализовано через `normalizeMarketIv`),
  а не `getOptionVolatility(...)`. Дельта под колонкой — market IV минус Start IV (не Fact IV
  минус Start IV, как раньше).
- Для зафиксированных сделок сохранение сужается до полей, которые расширению разрешено менять
  (`currentPrice`; на уровне ноги — `impliedVolatility`, `ivUpdatedFromExtension`, `ivUpdatedAt`),
  накладываемых на **свежепрочитанное** состояние из БД/localStorage (не на снимок формы) — так
  остальные поля (ручные `manualIvOverride*`, `customAsk/Bid`, `actualPL*`, `startSnapshot`,
  количество, страйк, дата) гарантированно не перезаписываются устаревшим/неизменным состоянием
  формы для залоченной сделки.
