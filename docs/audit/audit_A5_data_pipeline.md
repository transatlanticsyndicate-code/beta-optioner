# Аудит A5 — Пайплайн данных и ввода (только чтение)

Дата: 2026-07-25. Репозиторий: `/Users/andres/Desktop/WINDSURF/beta.optioner.online`, ветка `fix/sever-gpt-double-exp-diag`.
Код НЕ изменялся. Все пути абсолютные от корня репозитория.

---

## 1. assetPriceAtEntry ≠ реальная цена входа (31 случай) — ПОДТВЕРЖДЕНО

### Где пишется

**A. «Север GPT» (основной источник округлённых чисел).**

Цепочка: форма подбора → бэкенд → снимок ноги → калькулятор.

1. `frontend/src/components/CalculatorV2/NorthGptStrategy/NorthGptParamsForm.jsx:376-388`
   Поле **«Точка входа в БА ($)»** — редактируемый `<Input type="number">`.
   Дефолт (`:105`): `initialValues?.entryPrice ?? basePrice`, где
   `basePrice = entryPrice || currentPrice` (`:91`).
   `entryPrice` приходит из `frontend/src/pages/UniversalOptionsCalculator.jsx:5045`
   → `longPositionsEntry?.price` → средневзвешенная цена **вручную заведённых**
   LONG-позиций БА (`UniversalOptionsCalculator.jsx:2688-2694`).
   Подпись под полем прямо предлагает править: «Точка входа может отличаться —
   поправьте при необходимости» (`:386`).
2. `NorthGptParamsForm.jsx:353` — значение уходит как `entryPrice: toNum(entry)`.
3. `backend/app/routers/north_gpt.py:337` — `build_chain_index(full_chain, ctx.get("entryPrice"))`.
4. `backend/app/services/north_gpt_validator.py:43` — кладётся в каждую строку цепочки как `_entry`.
5. `backend/app/services/north_gpt_validator.py:67` — **`"assetPriceAtEntry": entry_price`**
   в снимке КАЖДОЙ ноги (`_snapshot`).
6. `frontend/src/pages/UniversalOptionsCalculator.jsx:2843-2851`
   (`handleApplyNorthGptCombination`) — ноги кладутся в `options` как есть,
   `assetPriceAtEntry` не пересчитывается по факту сохранения.

**Вывод:** `assetPriceAtEntry` = число, которое пользователь ввёл в форме подбора
(или унаследовал из вручную заведённой LONG-позиции), а НЕ рыночная цена
на момент сохранения. Отсюда «круглые» 30.00 / 35.00 / 350.00 / 62.50.

**Дополнительный эффект:** та же округлённая цифра затирает цену LONG-позиции БА —
`UniversalOptionsCalculator.jsx:2863` и `:2874`:
```
const newPrice = Number(combination.positions?.[0]?.assetPriceAtEntry) || 0;
... price: newPrice > 0 ? newPrice : (Number(template.price) || 0)
```
То есть при виде «актив + опционы» позиция акции получает цену покупки
из формы подбора, а не реальную. (Тот же код в «Севере»: `:2749`, `:2762`.)

**B. Ручное добавление ноги** — `UniversalOptionsCalculator.jsx:2530-2550`
(`addOption`): `assetPriceAtEntry: currentPrice || 0`, где `currentPrice` — цена
в шапке. При открытой сохранённой сделке `currentPrice` восстанавливается из
СОХРАНЁННОГО состояния (`:3814` `setCurrentPrice(config.state.currentPrice || 0)`),
а не из live-цены → добавленная сегодня нога получит цену БА недельной давности.

**C. Из расширения** — `EXTENTIONS/OptionsCPbuttons/background/calculator.js:92`
`assetPriceAtEntry: pos.underlyingPrice || 0` — тут цена реальная, спарсенная с TV;
далее приоритеты `UniversalOptionsCalculator.jsx:1647`, `:2127`.

**D. Ручная правка в таблице** — `frontend/src/components/CalculatorV2/OptionsTableV3.jsx:1238-1246`
(поле «Цена БА при входе», флаг `isAssetPriceModified`).

### Влияние на Start P&L — МАЛОЕ (важное уточнение)

`assetPriceAtEntry` попадает в снимок (`frontend/src/utils/startPLSnapshot.js:67, :85`)
и далее передаётся третьим аргументом в `calculateStockOptionPLValue`
(`startPLSnapshot.js:194`, `OptionsTableV3.jsx:214`, `:1388`, `:1425`).
Но в `frontend/src/utils/optionPricing.js:224-233` третий параметр
явно помечен: `@param {number} currentPrice - текущая цена (не используется в BS,
для совместимости)` — он нигде в теле функции не используется
(`optionPricing.js:234-265`). Для фьючерсов (`calculateFuturesOptionPLValue`)
его вообще не передают.

**Следствие:** ошибка в `assetPriceAtEntry` НЕ искажает ни колонку P&L, ни Start P&L
напрямую. Она бьёт по трём другим местам:
1. **Цена LONG-позиции БА** (см. выше) — прямая ошибка в общем P&L сделки:
   при CPRT 30.00 vs 29.66 и 100 акциях это −$34 на позицию.
2. **План выхода** — `frontend/src/components/CalculatorV2/CalculatorDealTabs/ExitPlanTable.jsx:195, 235, 300, 332, 530`:
   `basePrice = option.assetPriceAtEntry || currentPrice` — целевые цены срезок
   считаются в процентах ОТ этой базы. Ошибка 0.5-2 % едет во все ступени выхода.
3. **Отображение** колонки «Цена БА при входе» (`OptionsTableV3.jsx:1255`).

### Отдельный дефект отображения (legacy)
`frontend/src/components/CalculatorV2/OptionsTable.jsx:1035`:
`option.assetPriceAtEntry.toFixed(option.assetPriceAtEntry >= 100 ? 0 : 2)` —
для цен ≥ 100 показывает 0 знаков (352.11 → «352»). Файл `OptionsTable.jsx`
в текущем UI НЕ используется (импортируется только `OptionsTableV3`,
`UniversalOptionsCalculator.jsx:72`) — это мёртвый код, но при разборе старых
скриншотов может вводить в заблуждение.

---

## 2. CCI: startSnapshot.actualPLPrice = 1.00 при цене актива 74.26

### Как записывается actualPLPrice

`frontend/src/components/CalculatorV2/OptionsTableV3.jsx:453-475`
(`handleActualPLChange`) — при вводе Fact P&L:
```
handleFieldChange(optionId, 'actualPLPrice', targetPrice || currentPrice);
// targetPrice = цена из блока «Симуляция»
```
То есть **якорная цена берётся с ползунка симуляции**, а не с рынка.
Валидации значения нет вообще (нет сверки с `currentPrice` / `assetPriceAtEntry`,
нет нижней границы).

Далее `frontend/src/utils/startPLSnapshot.js:75, :90` кладёт это значение в снимок
при «Зафиксировать» / сохранении в standard
(`UniversalOptionsCalculator.jsx:4192-4196`, `:4267-4274`).

### Два правдоподобных механизма получения 1.00

**(a) Ползунок/поле симуляции.**
`frontend/src/components/CalculatorV2/PriceAndTimeSettings.jsx:108`
`calculatedMinPrice = minPrice || (currentPrice > 0 ? currentPrice * 0 : 0)` —
**минимум ползунка равен 0**, максимум `currentPrice * 2`.
`handlePriceInputChange` (`:111-121`) применяет `setTargetPrice` на КАЖДОМ нажатии
клавиши, если промежуточное число попадает в диапазон. Т.е. при наборе
«1…» (начало любого числа) `targetPrice` мгновенно становится 1, и если
в этот момент вводится Fact P&L — в якорь уедет 1.00.

**(b) Перекрёстное заражение из глобального хранилища правок — более вероятный
и более опасный механизм.**
`frontend/src/pages/UniversalOptionsCalculator.jsx:413-418`:
```
const getOptionKey = (option) => `${strike}-${type}-${date}`;   // ТИКЕРА НЕТ
```
Ключ не содержит тикер/инструмент. По этому ключу в `localStorage`
(`optioner_user_overrides`, `:403-410`, `:432`) складываются ручные правки
(`:2397`): `quantity, customPremium, customBid, customAsk, entryDate,
actualPL, actualPLDate, actualPLPrice, actualPLQuantity, manualIvOverride,
manualIvOverrideDate, assetPriceAtEntry, isAssetPriceModified`.
Применяются они при загрузке любой конфигурации из localStorage
(`:3408-3419`), при слиянии данных расширения (`:2003-2119`, в частности
`:2046` `actualPLPrice` и `:2106` `assetPriceAtEntry`) и при восстановлении
состояния (`:1736-1745`).

Хранилище чистится только полным сбросом калькулятора
(`:1186` `localStorage.removeItem('optioner_user_overrides')`).

**Итог:** любая нога другой сделки/другого тикера с тем же
`страйк-тип-дата` подставляет свои `actualPL / actualPLPrice / assetPriceAtEntry /
quantity` в текущую. Для дешёвого инструмента (или крипты) `actualPLPrice`
вполне может быть 1.00 — и он попадает в CCI при 74.26.

### Почему это дорого

`actualPLPrice` — единственное из «якорных» полей, которое реально идёт
в Black-Scholes: `OptionsTableV3.jsx:1421-1425` и `:235-239`,
`startPLSnapshot.js:223-227`, `frontend/src/hooks/usePositionExitCalculator.js:490, :688`:
```
const anchorPrice = option.actualPLPrice || currentPrice;
plAtAnchor = calculateStockOptionPLValue(tempOpt, anchorPrice, ...)
pl = actualPL * ratio + (pl − plAtAnchor)
```
При anchorPrice = 1.00 опцион на 74.26 считается глубоко вне/в деньгах,
`plAtAnchor` — мусор, и вся дельта P&L (и Start P&L) у этой ноги некорректна.

---

## 3. bid/ask, VOL = 0, «низкая ликвидность»

### Заморозка при isLocked
- Приём обновлений от расширения: `UniversalOptionsCalculator.jsx:1016-1042` —
  `bid/ask/volume/assetPriceAtEntry` обновляются **только при статусе `pending`**;
  при `standard` они считаются снимком входа и не трогаются.
- Автосохранение в localStorage выключено для `isLocked`
  (`UniversalOptionsCalculator.jsx:3610-3616`, `:3636-3641`).
- Effective bid/ask с учётом ручных правок берутся в
  `startPLSnapshot.js:52-58` и `optionPricing.js:190-203` (`getEntryPrice`:
  Buy → ASK, Sell → BID, fallback → premium).

### Volume — откуда и почему нули

**В цепочке TradingView колонка Volume ЕСТЬ, колонки Open Interest НЕТ.**
(раскладка: `EXTENTIONS/OptionsCPbuttons/Docs/CPButtons/MIGRATION.md:50,61`,
`ARCHITECTURE.md:72-74`, скриншот `Docs/CPButtons/tv_options_new_layout.png`.)

Путь поля:
`EXTENTIONS/OptionsCPbuttons/src/parser.js:12-44` (`buildColumnMap` по `<th>`,
ключ = `textContent.trim().toLowerCase()`) → `:47-53` (`parseCellValue`,
volume лежит внутри progressbar-ячейки, читается через `span[class*="value"]`)
→ `:79` (`volume: get('volume')`) → `:164`/`:190` → `src/storage.js:52, :91`
→ `background/calculator.js:73` (`volume: pos.volume || 0`)
→ `frontend/src/hooks/useExtensionData.js:89-91` → `OptionsTableV3.jsx:1079-1088`.

Шесть независимых причин нулей:
1. **`oi` захардкожен в 0** — `frontend/src/hooks/useExtensionData.js:91`
   («OI не используется (нет в TradingView)»),
   `EXTENTIONS/OptionsCPbuttons/background/calculator.js:74`,
   `frontend/src/utils/northStrategy/analyzer.js:102`.
2. **Крипта: `volume: 0` захардкожен** —
   `EXTENTIONS/binance_parser/background/calculator.js:71`;
   `binance_parser/src/buttons.js:83-108` поле вообще не возвращает,
   `binance_parser/src/storage.js:31` не имеет такого параметра
   (хотя `binance_parser/src/parser.js:125` volume парсит — результат никуда не идёт).
3. **Volume обновляется только при `pending`** —
   `UniversalOptionsCalculator.jsx:975-976`, `:1018`, `:1030-1032`.
   Зафиксированные сделки volume не получают никогда.
4. **Фильтр по IV выбрасывает ногу целиком** —
   `EXTENTIONS/OptionsCPbuttons/background/dbConfigRefresh.js:1337-1338`
   (`newIV == null` → опцион не попадает в команду вместе с bid/ask/volume).
5. **Для bid/ask/volume запрещён fallback по индексам** —
   `background/pendingParser.js:149-152`, `dbConfigRefresh.js:~937-939`.
   Если текст `<th>` не ровно `volume` — индекс `undefined` → `null`.
6. **TV рисует «—»** на неликвидных страйках, а `parseNumber`
   (`EXTENTIONS/OptionsCPbuttons/src/utils.js:6-11`) возвращает **0**, а не null —
   «нет данных» и «реальный ноль» неразличимы.

Ручное добавление: `UniversalOptionsCalculator.jsx:2540` (`volume: null, oi: null`),
`:4620`, `:4843` (`option.volume || 0`).
«Север GPT» переносит volume из цепочки как есть
(`backend/app/services/north_gpt_validator.py:58`).

### «Низкая ликвидность» — предупреждение системно ложное

`frontend/src/utils/liquidityCheck.js:68-140` (`assessLiquidity`). Скоринг со 100:
- OI < 100 → **−40** (`:80-82`), < 500 → −20, < 1000 → −10
- volume < 10 → **−30** (`:92-94`), < 50 → −15, < 100 → −5
- спред > 20 % → −30, > 10 % → −15, > 5 % → −5; bid или ask = 0 → −40 (`:106-120`)
- `VERY_LOW` при score < 40 (`:130`), предупреждение при score < 60 (`:124-132`)

**`oi` всегда 0 → −40 всегда, плюс volume 0 → −30 → score ≤ 30 → `VERY_LOW`
для ЛЮБОЙ ноги из расширения, независимо от реальной ликвидности.**
Текст подсказки при этом честно пишет «Очень низкий OI: 0».
У крипты дополнительно `bid === ask === markPrice`
(`binance_parser/src/buttons.js:96-97`,
`binance_parser/background/calculator.js:66-68`) → спред 0, но OI/volume всё топят.

Где это видно:
- Иконка у колонки OI — `OptionsTableV3.jsx:1049-1077`, но колонка **скрыта**:
  `UniversalOptionsCalculator.jsx:4822` передаёт `hideColumns={['premium','oi']}`.
- **Единственная видимая плашка** — вкладка «Сделка»:
  расчёт `frontend/src/hooks/usePositionExitCalculator.js:207-221`
  → `UniversalOptionsCalculator.jsx:4333` → рендер `:4732-4734`
  → `frontend/src/components/CalculatorV2/ExitCalculator/components/LiquidityWarning.jsx:12-47`.
- Побочный баг: `LiquidityWarning.jsx:35-36` читает `w.oi`, `w.volume`, `w.message`,
  а `usePositionExitCalculator.js:210-218` кладёт только
  `{option, level, warnings, score}` → в подсказке всегда
  «OI: undefined, Volume: undefined» и пустое сообщение.

### bid/ask — детали
- Парсинг: `EXTENTIONS/OptionsCPbuttons/src/parser.js:75-76`, `:100`
  (`price = LTP || (bid+ask)/2`), `src/storage.js:70` (`entry = (bid+ask)/2`).
- **Нога отбрасывается, если `ask <= 0`** — `src/parser.js:156`, `:178`:
  в `tvc_full_chain` (источник для «Севера/Север GPT») неликвид просто не попадает.
- Приём: `frontend/src/hooks/useExtensionData.js:63-68`
  (`premium = ask` при Buy, `bid` при Sell), `:382-383`.
- Крипта: реального стакана нет — `bid = ask = markPrice`.
- Редактирование bid/ask в UI блокируется при `isLockedPosition`:
  `OptionsTableV3.jsx:964-967`, `:1008-1011`; «обновить все» пропускает
  залоченные (`:485`).
- **Расширение про `isLocked` не знает** — гейт только по
  `universalCalc_loadedConfigStatus` (`UniversalOptionsCalculator.jsx:975-976`,
  зеркало в localStorage `:3115-3123`).

---

## 4. Серии-двойники {TICKER}1 (adjusted) — ДА, парсер может схватить не ту серию

**Во всём расширении нет ни одного упоминания root symbol / adjusted /
суффикса «1».** Проверено grep по `EXTENTIONS/OptionsCPbuttons/src/` и `background/`.

### Где выбирается символ

Никакого `symbol-search` API нет. Биржа берётся из захардкоженных таблиц:
- `EXTENTIONS/OptionsCPbuttons/background/dbConfigRefresh.js:44-51`
  (`DB_TICKER_EXCHANGE_MAP` — 18 тикеров) и `:53-64` (regex фьючерсов);
  `buildTvOptionsUrl` `:70-105`. **Строка 82: если тикер неизвестен —
  `symbol = ticker` голым, и TradingView резолвит сам.**
  Для CPRT / B / ISRG / CCI и любых CBOE-имён — именно этот путь.
- `frontend/src/pages/UniversalOptionsCalculator.jsx:1121-1144`
  (`getTradingViewLink`) — то же самое, `:1141`.
- `EXTENTIONS/OptionsCPbuttons/background/calculator.js:176` — `sourceUrl` без биржи.
- Тикер/биржа из URL: `EXTENTIONS/OptionsCPbuttons/src/utils.js:14-24`, `:34-43`.

### Восемь мест, где серия теряется

1. **Root выбрасывается при разборе `data-cell-id`** —
   `EXTENTIONS/OptionsCPbuttons/src/utils.js:46-53`: из `CBOE:ABC1260618C100`
   берётся только `260618`. Отличить `ABC` от `ABC1` дальше невозможно. *(первопричина)*
2. **`dumpFullChain` кладёт обе серии в одну цепочку** —
   `EXTENTIONS/OptionsCPbuttons/src/parser.js:135-198`: перебираются ВСЕ видимые
   `tr[data-strike]`, тикер один на всю цепочку из URL (`:138`).
3. **Клик `+C/+P` берёт первую подходящую строку** —
   `EXTENTIONS/OptionsCPbuttons/src/buttonsHandlers.js:35-45`: фильтр только
   по экспирации, `break` на первом совпадении, fallback `allRows[0]`.
4. **Парсер строки читает только ПЕРВУЮ группу с нужной датой** —
   `EXTENTIONS/OptionsCPbuttons/background/pendingParser.js:88-95` и копия в
   `dbConfigRefresh.js:~878-890`: секция ищется по `startsWith("June 18")`,
   на следующем `groupCell` — `break`. Реальный заголовок группы в TV —
   `June 18 | 85 DTE | E3D`, **root-бейдж прямо там и игнорируется**.
   Если adjusted-серия отрисована выше — bid/ask/IV/греки берутся из неё.
5. **«Север» переиспользует вкладку TV чужого символа** —
   `EXTENTIONS/OptionsCPbuttons/background/background.js:109` и `:226`:
   `tabs.find(t => t.url.toUpperCase().includes(desiredTicker)) || tabs[0]`
   (для `ABC` подойдёт вкладка `ABC1`); `:116`/`:234` — `needNav`
   определяется через `urlHasNorthFilters()` (`:168-182`), которая
   **символ не проверяет вообще**.
6. **«Север» схлопывает серии-двойники** —
   `EXTENTIONS/OptionsCPbuttons/src/northSupport.js:57-59`: дедуп по дате,
   вычисленной из бейджа «N DTE» → вторая серия молча теряется.
7. **Раскрытие группы по подстроке cell-id** —
   `EXTENTIONS/OptionsCPbuttons/src/northSupport.js:329-330`:
   `td[data-cell-id*="260618C"]` совпадёт с любым root.
8. **Health-check привязывает цену к тикеру подстрокой** —
   `EXTENTIONS/OptionsCPbuttons/src/healthCheck.js:176-179`: `text.includes(ticker)`,
   текст с `ABC1` содержит `ABC` → цена adjusted-серии проходит как `confidence: 'high'`.

### Что защищает (мало)

- `frontend/src/components/CalculatorV2/NorthStrategy/NorthStrategyDialog.jsx:153, :300` —
  строгое сравнение тикера цепочки. Единственная жёсткая проверка символа
  во всём пайплайне (и она в устаревшем «Севере»).
- `UniversalOptionsCalculator.jsx:955-962` — гейт по тикеру команды
  `sendPrIV_tocallc`, но сравнивается `configData.ticker` (тикер калькулятора)
  с `selectedTicker` — проверка тавтологична, от adjusted-серии не спасает.
- После навигации вкладки TV (`dbConfigRefresh.js:741-748`,
  `pendingRefresh.js:150-155`) **никто не проверяет, какой символ реально открылся**.

### Сопоставление ног — root/тикер не участвует нигде

| Файл:строка | Ключ |
|---|---|
| `EXTENTIONS/OptionsCPbuttons/background/pendingRefresh.js:214-218` | `type` + `|Δstrike| < 1` + `expirationISO === date` |
| `frontend/src/pages/UniversalOptionsCalculator.jsx:986-997` | `type` + **`|Δstrike| < 0.5`** + дата по строке |
| `frontend/src/pages/UniversalOptionsCalculator.jsx:1579-1604`, `:2009-2035` | `type` + `Δstrike < 0.001` + дата **«±48 часов»** |
| `EXTENTIONS/OptionsCPbuttons/background/calculator.js:123-135` | `` `${type}_${strike}_${date}` `` |
| `EXTENTIONS/OptionsCPbuttons/src/storage.js:57-63` | `type + strike + expiration + action` |

**Вывод:** нога adjusted-серии смэтчится с обычной без единого препятствия.
Дополнительно допуск ±0.5 / ±1.0 по страйку может смэтчить соседний страйк
на плотной сетке (шаг 0.5/1.0 — типично для дешёвых бумаг).

---

## 5. Автообновление при открытии сделки — ГЛАВНЫЙ РИСК ЗАТИРАНИЯ

### Что и когда запускается

Роутер расширения `EXTENTIONS/OptionsCPbuttons/background/calcTabRouter.js:63-80`:
- URL вкладки содержит `dbConfig=` → читается `universalCalc_loadedConfigStatus`;
- **status = `pending`** → `checkPendingRefreshCommands` **без подтверждения**,
  один раз на загрузку/F5 вкладки (`:69-74`, триггер `:113-134`, задержка 4 с);
- **status = `standard`** → `autoRefreshDbConfig` → оверлей «Обновить? Да/Нет»
  (`EXTENTIONS/OptionsCPbuttons/background/dbConfigRefresh.js:686-691`),
  плюс alarm каждые 30 секунд (`calcTabRouter.js:88-106`), дедуп по вкладке
  сбрасывается при каждом F5 (`:127-129`).

### Что перезаписывается в калькуляторе

`frontend/src/pages/UniversalOptionsCalculator.jsx:923-1075`:
- `:970-972` — **`currentPrice` в шапке** перезаписывается всегда (оба статуса).
- `:1004-1014` — **`manualIvOverride` (= колонка «Fact IV») перезаписывается
  в ОБОИХ статусах**, вместе с `manualIvOverrideDate = сегодня` и флагом
  `ivUpdatedFromExtension`. Заголовок колонки — `OptionsTableV3.jsx:769`,
  ручной ввод — `:426-448`.
- `:1016-1042` — только при `pending`: `bid`, `ask` (со сбросом
  `isBidModified/isAskModified` и `customBid/customAsk` в null!), `volume`,
  и **`assetPriceAtEntry = newPrice`** со сбросом `isAssetPriceModified`.
- Греки из команды игнорируются (`:920`).

### Сохраняется ли в БД без действий пользователя — ДА

`:1061-1063` выставляет `needExtRefreshSaveRef.current = true`, и эффект
`:1078-1116` немедленно вызывает `updateConfiguration(loadedConfigId, {state: {...}})`.
**Проверки `isLocked` / `isEditMode` в этом эффекте НЕТ** (в отличие от
localStorage-автосохранения `:3610-3623`). То есть зафиксированная сделка
перезаписывается в БД молча.

`backend/app/models/saved_configuration.py:30`:
`updated_at = Column(..., onupdate=func.now())` → **`updatedAt` меняется при каждом
таком сохранении**, включая срабатывание автообновления при простом открытии
pending-сделки.

### Итоговый риск для недельных коррекций заказчика

1. Заказчик раз в неделю правит **Fact IV** (`manualIvOverride`) и **Fact P&L**.
2. Открытие сделки в браузере с включённым расширением:
   - `pending` — автоматически, без спроса: Fact IV затирается рыночной IV с TV,
     bid/ask/volume/цена БА при входе тоже, **ручные правки bid/ask сбрасываются**
     (`customBid/customAsk = null`, `:1022-1028`);
   - `standard` — после клика «Да» в оверлее: **Fact IV всё равно затирается**
     (гейта по статусу для IV нет).
3. Изменения тут же уходят в БД, `updatedAt` обновляется — восстановить
   старое значение из истории нельзя (версий нет).

Fact P&L (`actualPL`, `actualPLPrice`, `actualPLDate`) командой обновления
не трогается — он рискует иначе, через `optioner_user_overrides` (см. п.2b).

---

## 6. Фьючерсы (ZWU2026, ZCU2026)

### 6.1 pointValue / маржа — где разъезжаются

Источник правды — БД (`backend/app/routers/futures_settings.py:73/120/153/199`,
модель `backend/app/models/futures_setting.py`), кэш — localStorage,
дефолты — `frontend/src/utils/futuresSettings.js:18-63` (ZW=50, ZC=50,
`marginPerContract = null`).
Привязка к тикеру: `extractBaseTicker` (`futuresSettings.js:104`) корректно
даёт `ZWU2026 → ZW`, `ZCU2026 → ZC`; `getFutureByTicker` (`:178`).

**(a) Фолбэк множителя для фьючерсов = 100, а не 1 — САМОЕ ОПАСНОЕ.**
`frontend/src/pages/UniversalOptionsCalculator.jsx:208-216`:
```
if (calculatorMode === FUTURES && selectedFuture) return selectedFuture.pointValue || 1;
if (calculatorMode === CRYPTO) return 1;
return 100;                       // ← фьючерс без настроек падает сюда
```
При ненайденных настройках шапка честно рисует «Цена пункта: —»
(`:4465-4471`), а расчёт молча берёт 100. Для ZW/ZC (реальные 50) это
**завышение P&L ровно вдвое**.
`getContractMultiplier` (`frontend/src/utils/universalPricing.js:387`) и
`getPointValue` (`futuresSettings.js:135`, фолбэк 1) — **мёртвый код**,
нигде не вызываются; импорт `getPointValue` в `UniversalOptionsCalculator.jsx:95`
не используется.

**(b) Множитель НЕ сохраняется в снимок сделки.** Ни в `state`
(`UniversalOptionsCalculator.jsx:1091`, `:4021`, `:4100`, `:4203`, `:4323`;
`SaveConfigurationDialog.jsx:213-244`), ни в `startSnapshot` — там это записано
явно: `frontend/src/utils/startPLSnapshot.js:26`
(«dividendYield/contractMultiplier — берутся текущие в момент расчёта»).
→ Любая правка настроек фьючерса **ретроактивно меняет P&L всех старых сделок**
по этому тикеру. Удаление строки настроек → множитель молча становится 100 (см. «а»).
Переименование тикера (`futures_settings.py:181`) рвёт связь — сделка ссылается
на тикер строкой, не по id.

**(c) Гонка с синхронизацией настроек.** `syncFuturesSettingsFromServer()`
асинхронный (`frontend/src/App.js:29` → `futuresSettings.js:366`), а
`getFutureByTicker` вызывается синхронно при восстановлении конфигурации
(`UniversalOptionsCalculator.jsx:3485`, `:3884`, `:1686`, `:1496`, `:692`).
`setSelectedFuture` после прихода серверных настроек не пересчитывается
(нет ни эффекта, ни storage-listener) → вся сессия считает по дефолтам.

**(d) Маржа.** `getMarginPerContract` (`futuresSettings.js:159`) при отсутствии
данных возвращает `null`, и вклад позиции в маржин = 0
(`frontend/src/components/CalculatorV2/PositionFinancialControl.jsx:52-53`,
warning-иконка `:67-70`). У ZW/ZC в дефолтах маржа = null.
В подборе «Север GPT» фьючерсная маржа считается по другой формуле
(`backend/app/services/north_gpt_validator.py:129-135`) — `qty × margin_per_contract`,
плечо не применяется.

### 6.2 daysPassed = 0 — это след, а не рабочее значение

Сохранённое `state.daysPassed` при открытии **намеренно игнорируется**
и пересчитывается от даты входа: `UniversalOptionsCalculator.jsx:3252-3253`
и `:3279-3282` (localStorage), `:3776-3778` и `:3804-3807` (БД),
применение `:3449` / `:3858`, `setUserAdjustedDays(false)` `:3236/:3452/:3859`.

Ноль попал в БД потому, что: сделка сохраняется в день входа
(`baseDate == today` → 0, `SaveConfigurationDialog.jsx:206, :240`), а после
фиксации автосохранение выключено (`:3610-3616`, `:3638`), и бэкенд `daysPassed`
не трогает никогда (`saved_configurations.py` — 0 упоминаний).

**Диагностически важно:** единственный путь, который пересохраняет
зафиксированную сделку в БД, — обновление от расширения
(`UniversalOptionsCalculator.jsx:1061-1063` → `:1078-1116`). Значит
`state.daysPassed = 0` у фьючерсных сделок = **расширение их ни разу не
обновляло с момента входа**. Второй маркер того же — отсутствие у ног
`manualIvOverrideDate` / `ivUpdatedFromExtension` (`:1008-1011`).

Отдельный дефект: `maxDays` без фолбэка в `UniversalOptionsCalculator.jsx:2245-2264`
(при непарсящейся дате экспирации → 0) зажимает `daysPassed` в 0, конфликтуя
со вторым эффектом в `PriceAndTimeSettings.jsx:104` (там фолбэк 30).

### 6.3 Почему фьючерсы не обновляются

Отдельной «фьючерсной ветки» в расширении нет — поток единый. Но:

- Обновляются **только сделки, открытые по URL с `?dbConfig=`**
  (`EXTENTIONS/OptionsCPbuttons/background/calcTabRouter.js:63`).
- Для `standard` обновление **требует клика «Да» в оверлее**
  (`calcTabRouter.js:76` → `dbConfigRefresh.js:690`).
- Биржа для URL: `EXTENTIONS/OptionsCPbuttons/background/dbConfigRefresh.js:53-67`
  — `/^(ZC|ZS|ZW|ZM|ZL)[A-Z]\d+$/ → CBOT`. ZW/ZC матчатся, но
  ZO / ZR / KE — нет (`exchange = null` → TV отдаст не то / 404).
  Три несинхронных списка тикеров: `dbConfigRefresh.js:44-67`,
  `futuresSettings.js:18-63`, `instrumentTypeDetector.js:31-40`.
- **Парсер цены ломает формат зерновых.** `dbConfigRefresh.js:1020`
  и `EXTENTIONS/OptionsCPbuttons/src/utils.js:85-124` вырезают всё, кроме цифр:
  CBOT-котировка `545'6` (тик 1/8 цента) превращается в `5456` вместо 545.75.
  Если цена БА не снята за 10 попыток (`dbConfigRefresh.js:1030-1032`,
  `:1072-1077`) — обновление прерывается целиком, ни IV, ни bid/ask не долетают.
- Парсер строки: `EXTENTIONS/OptionsCPbuttons/background/pendingParser.js:97`
  (`cells.length < 30`), `:125` (`sVal >= 1 && sVal < 100000`), `:127`
  (`|sVal − strike| < 1`) — при другой раскладке колонок в CBOT-чейне вернёт null.
- Приёмный гейт по тикеру строгий (`UniversalOptionsCalculator.jsx:955-962`):
  `ZWU2026` vs `ZWU26` vs `CBOT:ZWU2026` — молчаливый пропуск.

### 6.4 Прочее из общего кода
- Режим определяется по паттерну тикера (`UniversalOptionsCalculator.jsx:1680-1693`),
  настройки — `getFutureByTicker(ticker)` (`:3484-3491`, `:3883-3888`).
  При ненайденных настройках — только `console.warn`, `selectedFuture = null`.
- В сохранённом `state` (`:1090-1095`, `:4203-4215`) **`pointValue` / маржа
  НЕ сохраняются** — при каждом открытии берутся текущие из настроек.
  Изменение настроек фьючерса задним числом молча меняет P&L старых сделок.
- Фьючерсная маржа в подборе: `backend/app/services/north_gpt_validator.py:116-143` —
  `stock_margin = qty × margin_per_contract`, плечо не применяется;
  у акций/крипты — `qty × entry_price / leverage`. Разные формулы, разные источники.
- `daysPassed` при открытии сохранённой сделки **всегда пересчитывается заново**
  и сохранённое значение игнорируется: `UniversalOptionsCalculator.jsx:3776-3807`
  (DB) и `:3252-3282` (localStorage), затем `setDaysPassed(calculatedDaysPassed)`
  и `setUserAdjustedDays(false)` (`:3858-3859`). Далее
  `PriceAndTimeSettings.jsx:156-165` ещё раз двигает ползунок на «сегодня».
  Т.е. `daysPassed = 0` в сохранённом state — это **след сохранения**, а не
  рабочее значение; оно ни на что не влияет при открытии.

---

## 7. Даты: entryDate ног vs сделки vs createdAt, UTC vs локаль

### Источники дат — три разных часовых базы

| Поле | Где пишется | База |
|---|---|---|
| `option.entryDate` (ручное добавление) | `UniversalOptionsCalculator.jsx:2546`, `:4631`, `:4854` — `new Date().toISOString().split('T')[0]` | **UTC** |
| `option.entryDate` («Север GPT») | `backend/app/services/north_gpt_validator.py:66` — `date.today().isoformat()` | **локальное время СЕРВЕРА** |
| `option.actualPLDate` | `OptionsTableV3.jsx:461` — `toISOString()` | **UTC** |
| `option.manualIvOverrideDate` | `OptionsTableV3.jsx:438` и `UniversalOptionsCalculator.jsx:982` | **UTC** |
| `manualIvOverrideDisplayDate` | `OptionsTableV3.jsx:439` — `toLocaleDateString('ru-RU')` | **локаль браузера** |
| `config.entry_date` (при «Зафиксировать») | `backend/app/routers/saved_configurations.py:316-319` — `datetime.utcnow()` | **UTC** |
| `config.created_at` / `updated_at` | `backend/app/models/saved_configuration.py:29-30` — `func.now()` | **локальное время БД** (TIMESTAMP без tz) |
| `initialDaysToExpiration` (бэкенд) | `saved_configurations.py:321, :331-339` — от `now_dt.date()` (UTC) | UTC |
| `initialDaysToExpiration` (фронт) | `UniversalOptionsCalculator.jsx:3356-3362` — от `savedDate` через локальные `getFullYear/Month/Date` | локаль |

### Конкретные риски ±1 день

1. **Заказчик в Панаме (UTC−5).** Любое действие после 19:00 локального времени
   даёт `toISOString()` уже следующей календарной даты. Значит `entryDate`
   ноги, `actualPLDate` и `manualIvOverrideDate` могут быть на день впереди
   реального дня сделки. `manualIvOverrideDisplayDate` при этом покажет
   локальную (правильную) дату — расхождение видно глазом в подсказке
   (`OptionsTableV3.jsx:1186-1187`).
2. **Смешение UTC-метки и локальной полуночи.**
   `frontend/src/utils/dateUtils.js:70-78` (`parseDateAtStartOfDay`) сначала
   нормализует значение через `normalizeDateString`, а тот для полной ISO-метки
   делает `new Date(v).toISOString().split('T')[0]` (`dateUtils.js:62-67`) —
   т.е. берёт **UTC-дату**, потом строит **локальную полночь**
   (`new Date("YYYY-MM-DDT00:00:00")`). Для `config.entryDate = 2026-05-12T01:00Z`
   у пользователя в UTC−5 (реально 11 мая 20:00) получится 12 мая →
   `daysPassed` и `initialDaysToExpiration` занижены на 1.
   Ровно там это и используется: `UniversalOptionsCalculator.jsx:3789`, `:3264`.
3. **`entry_date` (UTC) vs `created_at` (время БД).** Фолбэк
   `configEntryDate = config.entryDate || config.createdAt`
   (`UniversalOptionsCalculator.jsx:3782`, `:3257`) может взять метку в другой
   часовой базе. Если сервер БД не в UTC — расхождение до суток.
4. **`entryDate` от «Севера GPT» считается на сервере** (`date.today()`), а всё
   остальное — в браузере по UTC. При сервере в другом часовом поясе ноги
   одной и той же комбинации могут получить дату, отличную от «сегодня»
   пользователя.
5. **Допуск ±48 часов при сопоставлении дат экспирации**
   (`UniversalOptionsCalculator.jsx:1588-1592`, `:2022-2024`) — маскирует ошибку
   на день, но заодно может смэтчить соседнюю экспирацию (пятница/понедельник).
6. `enrich.js` (`frontend/src/utils/northGptStrategy/enrich.js:19-25`) считает дни
   строго в UTC (`T00:00:00Z`) — тут согласовано; но
   `NorthGptParamsForm.jsx:24-28, :39-46` тоже UTC, а `calcDate` пользователь
   видит как локальную дату в `<input type="date">`.

---

## Топ-приоритеты (сводно)

| # | Находка | Ключевое место | Эффект |
|---|---|---|---|
| 1 | `optioner_user_overrides` — ключ без тикера (`strike-TYPE-date`), глобальное localStorage-хранилище | `UniversalOptionsCalculator.jsx:413-418`, `:2397`, `:2046`, `:2106`, `:3408-3419` | Перекрёстное заражение `actualPL/actualPLPrice/assetPriceAtEntry/quantity` между разными сделками и тикерами. Объясняет CCI = 1.00 |
| 2 | Автосохранение в БД после обновления от расширения **без проверки `isLocked`** + перезапись Fact IV в обоих статусах | `UniversalOptionsCalculator.jsx:1004-1014`, `:1061-1063`, `:1078-1116` | Молчаливое затирание недельных ручных коррекций; `updatedAt` меняется |
| 3 | `assetPriceAtEntry` = число, введённое в форме «Север GPT», а не рыночная цена; той же цифрой затирается цена LONG-позиции | `NorthGptParamsForm.jsx:376-388` → `north_gpt_validator.py:67`; `UniversalOptionsCalculator.jsx:2863-2874` | 31 расхождение 0.5-2 %; ошибка в P&L актива и в целевых ценах плана выхода |
| 4 | `actualPLPrice` берётся с ползунка симуляции, без валидации | `OptionsTableV3.jsx:466`; минимум ползунка = 0 (`PriceAndTimeSettings.jsx:108`) | Единственное якорное поле, попадающее в BSM; при мусоре вся дельта P&L неверна |
| 5 | Root/серия теряется на входе; матчинг ног везде по `type+strike+date`; вкладка TV переиспользуется по подстроке | `src/utils.js:46-53`; `background.js:109/168-182`; `pendingParser.js:88-95`; `UniversalOptionsCalculator.jsx:986-997` | Adjusted-серия `{TICKER}1` неотличима от обычной |
| 6 | `oi` захардкожен 0 + volume почти всегда 0 | `useExtensionData.js:91`, `background/calculator.js:74`, `liquidityCheck.js:80-94` | «Низкая ликвидность» срабатывает всегда — предупреждение бесполезно |
| 7 | Фолбэк множителя для FUTURES = **100**, а не 1; pointValue не в снапшоте | `UniversalOptionsCalculator.jsx:208-216`; `startPLSnapshot.js:26` | P&L зерновых завышается вдвое при отсутствии настроек; правка настроек меняет P&L задним числом |
| 8 | Три разные часовые базы дат (UTC браузера / локаль сервера / время БД) | `dateUtils.js:62-78`; `north_gpt_validator.py:66`; `saved_configuration.py:29-30` | ±1 день у пользователя в UTC−5 |

---

## Приложение: сводки субагентов

Полные разборы расширения (символы/volume/bid-ask) и фьючерсов
интегрированы выше в разделы 3, 4 и 6.
