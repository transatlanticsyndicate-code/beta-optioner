# P&L TOTAL — единый источник истины с табличной строкой

**Источник:** beta.optioner.online (старый калькулятор, CalculatorV2)
**Дата фиксации поведения:** 2026-05-05
**Передача в:** calc.optioner.online (переписка с нуля)
**Статус в старом проекте:** реализовано и задеплоено в продакшен (v39)
**Связанные handoff:** `fact-pl-anchor-quantity-scaling.md`, `signed-amounts-base-asset-block.md`, `leverage-base-asset.md`

---

## 1. Зачем

В блоке «Базовый актив» есть строка **P&L TOTAL** — суммарный финансовый результат портфеля в текущей точке симуляции (цена БА + дни). По смыслу это простая арифметика:

```
P&L TOTAL = P&L базового актива + Σ P&L опционов
```

Никаких BSM/IV/якорей для самого сложения не нужно — это просто сумма чисел, которые пользователь уже видит: P&L актива в той же карточке и P&L каждого опциона в столбце «P&L» таблицы.

Выявленный баг: P&L TOTAL расходился с этой суммой. Пример (KO, LONG 100 @ $78.19, Buy CALL 72.5 qty=1 ASK=$9, Fact IV=21.4%, симулируемая цена $79.28):

| Что показано | Что должно быть |
|---|---|
| P&L актива: +$109 | +$109 |
| P&L опциона (строка): −$20 | −$20 |
| **P&L TOTAL: +$147** | **+$89** |

Импакт: пользователь видит противоречивые числа в одном экране. Доверие к расчётам падает, по неверному TOTAL принимаются торговые решения.

---

## 2. Корень

В старом проекте P&L каждого опциона рассчитывался **в двух независимых местах**:

1. **Строка таблицы** (`OptionsTableV3.jsx`) — вызывает `calculateStockOptionPLValue` с полным набором пользовательских правок: `manualIvOverride` (Fact IV), `assetPriceAtEntry`, `manualPremium`, кастомные Bid/Ask, классификация акции, якорь Fact P&L.
2. **P&L TOTAL** (`calculatePortfolioPLAtPrice` в `metricsCalculator.js`) — пересчитывал заново с **урезанным** набором: использовал только рыночную IV и `currentPrice` как baseline.

Разница входных данных → разный теоретический P&L → разные итоговые числа.

В кейсе выше:
- Таблица: IV = 21.4% (Fact IV) → теоретическая цена опциона ≈ $8.80 → P&L = (8.80 − 9.00) × 100 = −$20.
- TOTAL: IV = 23.98% (рыночная) → теоретическая цена опциона ≈ $9.38 → P&L = (9.38 − 9.00) × 100 ≈ +$38.
- TOTAL = +$109 + $38 = **+$147** вместо корректных **+$89**.

Каждая новая фича редактирования опциона (Fact IV, Fact P&L, кастомная премия и т.д.) добавлялась только в табличный путь, а второй путь оставался отстающим — расхождение копилось со временем.

---

## 3. Решение

**Цель:** P&L каждого опциона должен считаться по единому правилу. Любая правка пользователя (Fact IV, Fact P&L, кастомные Bid/Ask, премия, цена актива при входе, классификация акции) автоматически попадает и в строку таблицы, и в P&L TOTAL — без ручной синхронизации двух кодовых путей.

В старом проекте для скорости фикса сделали **зеркалирование**: расчёт опциона в `calculatePortfolioPLAtPrice` приведён в полное соответствие с расчётом строки таблицы. Это техдолг (та же логика дублирована), но он минимизирует риск при правке в проде.

**В новом проекте сразу делать иначе** — вынести расчёт P&L одного опциона в одну утилиту:

```
calculateRowPL(option, params) → number
```

И вызывать её **из обоих мест**: и при отрисовке столбца «P&L» в таблице, и при суммировании в P&L TOTAL. Тогда любая будущая фича (новая корректировка, новый источник IV, новый якорь) автоматически работает в обоих местах.

---

## 4. Параметры, которые ОБЯЗАНЫ участвовать в расчёте P&L одного опциона

| Параметр | Источник | Что даёт |
|---|---|---|
| `option.strike`, `option.type`, `option.action` | базовые поля опциона | определение модели (Call/Put, Buy/Sell) |
| `option.quantity` | редактируется пользователем | масштабирование P&L |
| `entryPrice` | ASK/BID/customAsk/customBid/customPremium через `getEntryPrice(option)` | цена покупки/продажи опциона |
| `targetPrice` (или `currentPrice` как fallback) | блок «Симуляция» | цена БА для расчёта теоретической цены опциона |
| `option.assetPriceAtEntry` или `currentPrice` (fallback) | сохраняется при добавлении опциона | spot для модели BSM (важно: НЕ `currentPrice` всегда) |
| `optionDaysRemaining` | от `daysPassed` симуляции | дни до экспирации в точке симуляции |
| `optionVolatility` через `getOptionVolatility(... manualIvOverride, todaySimDays)` | Fact IV если задан, иначе IV-поверхность | волатильность для BSM |
| `dividendYield` | настройка калькулятора | дивидендная доходность для BSM |
| `contractMultiplier` | настройка калькулятора | множитель контракта (100 для акций, pointValue для фьючерсов) |
| `rfr` (risk-free rate) | `null` для акций (FRED), `0` для крипто | безрисковая ставка |
| `stockClassification` | классификация тикера | для `adjustPLByStockGroup` (только режим stocks) |
| `option.actualPL`, `option.actualPLDate`, `option.actualPLPrice`, `option.actualPLQuantity` | ввод Fact P&L | якорная формула с масштабированием по количеству |
| `calculatorMode` | акции / фьючерсы / крипто | выбор модели Black-76 vs BSM |

---

## 5. Алгоритм расчёта P&L одного опциона (псевдокод)

```
function calculateOptionRowPL(option, sim):
    # 1. Подготовка
    tempOption = applyManualPriceOverrides(option)   # customPremium / customBid / customAsk
    optionAssetPrice = option.assetPriceAtEntry || sim.currentPrice
    daysRemaining = computeDaysRemaining(option, sim.daysPassed)

    # 2. Волатильность с учётом Fact IV
    volatility = getOptionVolatility(option, ..., manualIvOverride=option.manualIvOverride, ...)

    # 3. AI-волатильность, если включена и закэширована
    if sim.aiEnabled and aiCache[key]:
        volatility = aiCache[key]

    # 4. Базовый теоретический P&L через BSM/Black-76
    if calculatorMode == 'futures':
        pl = calculateFuturesOptionPLValue(tempOption, sim.targetPrice, daysRemaining, multiplier, volatility)
    else:
        pl = calculateOptionPLValue(tempOption, sim.targetPrice, optionAssetPrice, daysRemaining, volatility, dividendYield, multiplier, rfr)

    # 5. Корректировка по группе акции (только stocks)
    if calculatorMode == 'stocks' and stockClassification:
        pl = adjustPLByStockGroup(pl, stockClassification)

    # 6. Якорь Fact P&L (если заполнен и дата якоря <= текущая дата симуляции)
    if option.actualPL is not null and sim.daysPassed >= anchorDaysPassed:
        plAtAnchor = computePLAtAnchor(option, ...)         # та же логика что на шагах 1-5, но с anchorPrice/anchorDays/anchorIV
        ratio = currentQty / actualPLQuantity                # см. handoff fact-pl-anchor-quantity-scaling.md
        pl = option.actualPL * ratio + (pl - plAtAnchor)

    return pl
```

P&L TOTAL получает сумму:

```
totalPL = underlyingPL(positions, sim) + Σ calculateOptionRowPL(option, sim) for option in options
```

`underlyingPL` — линейная формула по позициям БА (LONG/SHORT × quantity × (price − entry)), для фьючерсов с учётом `pointValue`. Эта часть проста и не дублируется.

---

## 6. Что делает функция-зеркало в старом проекте

В файле `frontend/src/utils/metricsCalculator.js` функция `calculatePortfolioPLAtPrice` теперь:

1. Передаёт `manualIvOverride` и `todaySimDays` в `getOptionVolatility` (как таблица).
2. Использует `option.assetPriceAtEntry || currentPrice` третьим параметром BSM (как таблица).
3. Применяет `adjustPLByStockGroup` при `calculatorMode === STOCKS && stockClassification`.
4. Применяет якорную формулу Fact P&L с масштабированием по количеству:
   `pl = option.actualPL × (currentQty / actualPLQuantity) + (pl − plAtAnchor)`.
5. Возвращает `{ underlyingPL, optionsPL, totalPL }`, где `totalPL = underlyingPL + optionsPL`.

Все эти шаги — точная копия логики, разбросанной в трёх местах внутри `OptionsTableV3.jsx` (P&L строки, Close Price, ИТОГО).

---

## 7. Как делать в новом проекте

### 7.1. Архитектура — единый pure-функциональный модуль

```
src/calc/
  pricing/
    bsm.ts                 # чистая модель Black-Scholes, без UI
    black76.ts             # Black-76 для фьючерсов
    optionPnL.ts           # calculateOptionRowPL — единая точка
  selectors/
    portfolioPL.ts         # underlyingPL + Σ optionPnL
```

### 7.2. UI всегда читает результат селектора

Таблица опциона рендерит P&L строки через `selectors/portfolioPL.ts`. Карточка «Базовый актив» рендерит P&L TOTAL через тот же селектор. Никакой компонент **не пересчитывает** P&L самостоятельно — все запрашивают у общего селектора.

### 7.3. Тесты на согласованность

```
test('P&L TOTAL равен сумме P&L строк', () => {
    const portfolio = makePortfolio(...);
    const rowsSum = portfolio.options.map(o => calculateOptionRowPL(o, sim)).reduce((a,b)=>a+b, 0);
    const total = calculatePortfolioPL(portfolio, sim).optionsPL;
    expect(total).toBeCloseTo(rowsSum, 2);
});
```

Этот тест должен **проваливаться**, если кто-то добавил новую правку (например, `customExpiration`) только в одном из путей. Он же страхует от нашего бага в будущем.

### 7.4. Что точно НЕ должно быть в коде

- `calculatePortfolioPLAtPrice`, `calculatePLDataForMetrics`, `calculateStepPL`, табличный inline-расчёт — **четыре разных места** с одной и той же формулой. В новом проекте — одно.
- Параметры с дефолтами, которые «забываются» при вызове (например, `manualIvOverride` без значения по умолчанию). Используй TypeScript: обязательные параметры — обязательные.
- «Пересчитать заново для скорости» — не оптимизация, а источник багов.

---

## 8. Сценарии для тестирования

Конструкция: KO, LONG 100 @ $78.19, Buy CALL 72.5 qty=1, ASK=$9, Fact IV=21.4%, симуляция: цена $79.28.

| # | Действия | Что должно совпасть |
|---|---|---|
| T1 | Без правок (Fact IV пусто, Fact P&L пусто) | P&L строки = P&L_optionsTOTAL. P&L TOTAL = P&L актива + P&L строки |
| T2 | Заполнен Fact IV (например, 21.4%) | Та же IV в обоих расчётах. P&L TOTAL = P&L актива + P&L строки |
| T3 | Заполнен Fact P&L при qty=1 | Якорь применяется в обоих расчётах. P&L TOTAL = P&L актива + P&L строки |
| T4 | Изменить количество с 1 на 5 при заполненном Fact P&L | P&L строки масштабируется ×5. P&L TOTAL = P&L актива + P&L строки (×5 для опционной части) |
| T5 | Изменить премию вручную (`customPremium`) | Cверка по обоим путям, должны совпасть |
| T6 | Изменить custom Bid/Ask | Сверка по обоим путям, должны совпасть |
| T7 | Изменить `assetPriceAtEntry` (через расширение) | Используется в обоих расчётах, P&L TOTAL = сумма строк |
| T8 | Несколько опционов разных типов и сторон (Buy CALL + Sell PUT + LONG акция) | P&L TOTAL = P&L актива + Σ P&L строк |
| T9 | Режим фьючерсов (Black-76) | Та же согласованность |
| T10 | Режим крипто (rfr = 0) | Та же согласованность |

Поведенческий критерий: **разница между `P&L TOTAL` и `P&L актива + Σ P&L_строк` должна быть равна нулю** (с точностью до округления до сотых).

---

## 9. Чек-лист переноса в новый калькулятор

- [ ] Один pure-модуль `calculateOptionRowPL(option, sim) → number` — единственный источник P&L одного опциона.
- [ ] Селектор `calculatePortfolioPL(portfolio, sim) → { underlyingPL, optionsPL, totalPL }` — единственный источник P&L TOTAL. Внутри использует `calculateOptionRowPL`, не дублирует формулу.
- [ ] Таблица опционов и блок «Базовый актив» рендерят значения **только** из селектора. Никаких inline-вычислений.
- [ ] Все параметры из §4 — обязательные в сигнатуре `calculateOptionRowPL`. TypeScript обеспечивает что забыть нельзя.
- [ ] Тест T1–T10 на согласованность (см. §7.3 + §8) включён в CI.
- [ ] Якорь Fact P&L (см. handoff `fact-pl-anchor-quantity-scaling.md`) — реализован внутри `calculateOptionRowPL`, не как отдельный слой.

---

## 10. Открытые вопросы для нового проекта

1. **Кеш расчётов.** Если на одной отрисовке селектор вызывается несколько раз с одними параметрами (таблица + карточка + график), есть смысл мемоизировать. В старом проекте мемоизации нет — пересчитывается каждый раз. Вопрос производительности; нужен профилирующий замер.
2. **Стрим P&L через RxJS / signals / observables.** Когда параметров много (qty, цена, дни, IV-override и т.д.), реактивная модель сама гарантирует, что все потребители видят согласованные числа. Альтернатива React-`useMemo` с большим массивом deps.
3. **Серверный расчёт P&L.** В старом проекте всё считается на клиенте. В новом можно вынести `calculateOptionRowPL` в backend (Python/FastAPI) и кешировать на сервере — особенно для тяжёлых сценариев (AI-IV, симуляции). Архитектурное решение, в этот фикс не входит.
4. **Численная точность.** При малых разницах (например, P&L = $0.001) формат `Math.round(value)` может округлить до 0, и пользователь увидит «нулевой» P&L при ненулевом result. Не критично для текущего кейса, но в новом UI стоит явно показывать precision.

---

## 11. История в старом проекте

| Дата | Коммит | Описание |
|---|---|---|
| ранее | — | Расчёт P&L одного опциона дублировался в `OptionsTableV3.jsx`, `calculatePortfolioPLAtPrice`, `calculatePLDataForMetrics`, `usePositionExitCalculator`, `ExitPlanTable.jsx`. |
| 2026-05-04 | `fbfb075` + `b25c8ce` | Фикс масштабирования якоря Fact P&L по количеству. Привёл табличный путь в порядок, но `calculatePortfolioPLAtPrice` остался не синхронизированным — баг P&L TOTAL обнаружился. |
| 2026-05-05 | `3456681` | **Фикс:** `calculatePortfolioPLAtPrice` синхронизирован с табличной формулой (Fact IV, assetPriceAtEntry, классификация, якорь). Версия v38 → v39. |

**Файлы, затронутые фиксом 2026-05-05:**

- `frontend/src/utils/metricsCalculator.js` — `calculatePortfolioPLAtPrice` теперь повторяет логику строки таблицы (передача `manualIvOverride` + `todaySimDays` в `getOptionVolatility`, использование `assetPriceAtEntry`, `adjustPLByStockGroup`, якорная формула Fact P&L с масштабированием по количеству). Добавлен опциональный параметр `stockClassification`. Импорт `adjustPLByStockGroup` и `calculateDaysToExpirationFromToday`.
- `frontend/src/components/CalculatorV2/PositionFinancialControl.jsx` — принимает `stockClassification` через props и пробрасывает в `calculatePortfolioPLAtPrice`.
- `frontend/src/pages/UniversalOptionsCalculator.jsx` — передаёт `stockClassification={null}` в `<PositionFinancialControl>` (классификация для калькулятора пока не используется, но проп явно объявлен для готовности).
- `frontend/src/components/Layout/TopNav.jsx` — версия v38 → v39.
