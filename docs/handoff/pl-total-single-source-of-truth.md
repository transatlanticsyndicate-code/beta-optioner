# P&L TOTAL — единый источник истины с табличной строкой

**Источник:** beta.optioner.online (старый калькулятор, CalculatorV2)
**Дата фиксации поведения:** 2026-05-05 (актуально на момент v42 на проде)
**Передача в:** calc.optioner.online (переписка с нуля)
**Статус в старом проекте:** реализовано и задеплоено в продакшен (v42)
**Связанные handoff:** `fact-pl-anchor-quantity-scaling.md`, `signed-amounts-base-asset-block.md`, `leverage-base-asset.md`

---

## 1. Зачем

В блоке «Базовый актив» есть строка **P&L TOTAL** — суммарный финансовый результат портфеля в текущей точке симуляции (цена БА + дни). По смыслу это простая арифметика:

```
P&L TOTAL = P&L актива + ИТОГО таблицы опционов
```

Никаких BSM/IV/якорей для самого сложения не нужно — это просто сумма чисел, которые пользователь уже видит на экране: P&L актива в той же карточке и значение «ИТОГО:» в таблице опционов.

Выявленный баг: P&L TOTAL расходился со строкой ИТОГО таблицы. Разница могла быть в десятки и сотни долларов в зависимости от положения ползунка дней симуляции и наличия Fact IV/Fact P&L. Пример (KO, LONG 100 @ $78.19, Buy CALL 72.5 qty=1 ASK=$9, Fact IV=21.4%, симулируемая цена $79.28):

| Что показано | Что должно быть |
|---|---|
| P&L актива: +$109 | +$109 |
| P&L опциона (строка): −$20 | −$20 |
| **P&L TOTAL: +$147** | **+$89** |

Импакт: пользователь видит противоречивые числа в одном экране. Доверие к расчётам падает, по неверному TOTAL принимаются торговые решения.

---

## 2. Корень

В старом проекте P&L каждого опциона исторически рассчитывался **в двух независимых местах**:

1. **Строка таблицы** (`OptionsTableV3.jsx`) — вызывает `calculateStockOptionPLValue` с полным набором пользовательских правок: `manualIvOverride` (Fact IV), `assetPriceAtEntry`, ручная премия, кастомные Bid/Ask, классификация акции, якорь Fact P&L.
2. **P&L TOTAL** (`calculatePortfolioPLAtPrice` в `metricsCalculator.js`) — пересчитывал заново, но с **урезанным** набором: использовал только рыночную IV и `currentPrice` как baseline, не применял якорь Fact P&L.

Разница входных данных → разный теоретический P&L → разные итоговые числа.

Каждая новая фича редактирования опциона (Fact IV, Fact P&L, кастомная премия и т.д.) добавлялась только в табличный путь, а второй путь оставался отстающим — расхождение копилось со временем.

Важная деталь: даже если оба пути синхронно используют один и тот же набор формул и параметров, остаётся риск расхождения из-за **проекции IV** и других тонкостей `getOptionVolatility`, которые сложно точно повторить. Поэтому идея «зеркалировать формулу» в обоих местах хрупкая.

---

## 3. Решение, выбранное в старом проекте

**Не зеркалировать, а пробросить.** Вместо двух независимых расчётов одного и того же — расчёт делается **только в таблице**, а его результат поднимается вверх в карточку «Базовый актив» через React-callback. Карточка просто складывает: `P&L TOTAL = underlyingPL + полученное ИТОГО`. Никаких BSM-формул в карточке не остаётся.

Структурно гарантирует, что **число в P&L TOTAL = числу в строке «ИТОГО:» таблицы** — потому что это одно и то же значение. Любая будущая фича редактирования опциона (новая IV, новый якорь, кастомная цена) автоматически попадает в TOTAL без какой-либо синхронизации.

---

## 4. Архитектура (как реализовано в старом проекте)

```
                ┌─────────────────────────┐
                │ UniversalOptionsCalculator (страница)
                │   useState: optionsTableTotalPL ◄──┐
                └─────────┬─────────────┬───────────┘
                          │             │
                          ▼             ▼
        <OptionsTableV3              <PositionFinancialControl
          options=...                    optionsTotalPL={optionsTableTotalPL}
          onOptionsTotalPLChange  ─────┐ />
            ={setOptionsTableTotalPL}  │
        />                             │
                                       │ React.useEffect
        ┌──────────────────────────────┘
        │
        ▼
  В OptionsTableV3:
    React.useMemo → optionsTableTotalPL
        ├─ filter visible options
        ├─ для каждого: calculateStockOptionPLValue + adjustPLByStockGroup
        │  + якорная формула Fact P&L (с масштабированием по количеству)
        └─ reduce → сумма

    React.useEffect([optionsTableTotalPL, onOptionsTotalPLChange])
        └─ onOptionsTotalPLChange(optionsTableTotalPL)

  То же значение рисуется в JSX строки «ИТОГО:» таблицы.
```

В `PositionFinancialControl.jsx`:

```
useMemo (deps: positions, currentPrice, targetPrice, calculatorMode, contractMultiplier, optionsTotalPL):
    underlyingPL = Σ для visible positions:
        LONG  → (simPrice − entry) × qty × multiplier
        SHORT → (entry − simPrice) × qty × multiplier
    totalPL = underlyingPL + optionsTotalPL
    return { underlyingPL, totalPL }
```

Никакой BSM-логики, никаких опционов — только линейная формула по базовому активу плюс готовое число от таблицы.

---

## 5. Какие параметры влияют на P&L одного опциона (расчёт в таблице)

Это критичный список для нового калькулятора. Если расчёт в новом проекте не учитывает любой из этих параметров, число будет расходиться с тем, что видел пользователь в старом UI.

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
| `option.actualPL`, `option.actualPLDate`, `option.actualPLPrice`, `option.actualPLQuantity` | ввод Fact P&L | якорная формула с масштабированием по количеству — см. `fact-pl-anchor-quantity-scaling.md` |
| `calculatorMode` | акции / фьючерсы / крипто | выбор модели Black-76 vs BSM |

---

## 6. Алгоритм расчёта P&L одного опциона (псевдокод)

```
function calculateOptionRowPL(option, sim):
    # 1. Подготовка
    tempOption = applyManualPriceOverrides(option)   # customPremium / customBid / customAsk
    optionAssetPrice = option.assetPriceAtEntry || sim.currentPrice
    daysRemaining = computeDaysRemaining(option, sim.daysPassed)

    # 2. Волатильность с учётом Fact IV
    volatility = getOptionVolatility(option, ..., manualIvOverride=option.manualIvOverride, ...)

    # 3. AI-волатильность, если включена и закэширована (приоритет ниже manualIvOverride)
    if sim.aiEnabled and not option.manualIvOverride:
        volatility = aiCache[key] || volatility

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
        ratio = currentQty / actualPLQuantity                # см. fact-pl-anchor-quantity-scaling.md
        pl = option.actualPL * ratio + (pl - plAtAnchor)

    return pl
```

P&L TOTAL — простое сложение:

```
totalPL = underlyingPL(positions, sim) + Σ calculateOptionRowPL(option, sim) for option in visible options
```

`underlyingPL` — линейная формула по позициям БА (LONG/SHORT × quantity × (price − entry)), для фьючерсов с учётом `pointValue`. Эта часть проста и не дублируется.

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

В отличие от старого проекта (где расчёт зашит в JSX таблицы и поднимается через React-callback), в новом — централизованный селектор, который не знает про React. Это даёт юнит-тестируемость без рендера.

### 7.3. Тесты на согласованность

```
test('P&L TOTAL равен сумме P&L строк', () => {
    const portfolio = makePortfolio(...);
    const rowsSum = portfolio.options.map(o => calculateOptionRowPL(o, sim)).reduce((a,b)=>a+b, 0);
    const total = calculatePortfolioPL(portfolio, sim).optionsPL;
    expect(total).toBeCloseTo(rowsSum, 2);
});
```

Этот тест должен **проваливаться**, если кто-то добавил новую правку (например, `customExpiration`) только в одном из путей. Он же страхует от повторения сегодняшнего бага.

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
| T5 | Изменить премию вручную (`customPremium`) | Сверка по обоим путям, должны совпасть |
| T6 | Изменить custom Bid/Ask | Сверка по обоим путям, должны совпасть |
| T7 | Изменить `assetPriceAtEntry` (через расширение) | Используется в обоих расчётах, P&L TOTAL = сумма строк |
| T8 | Несколько опционов разных типов и сторон (Buy CALL + Sell PUT + LONG акция) | P&L TOTAL = P&L актива + Σ P&L строк |
| T9 | Режим фьючерсов (Black-76) | Та же согласованность |
| T10 | Режим крипто (rfr = 0) | Та же согласованность |
| T11 | Двигать ползунок дней симуляции 0→max | На каждой позиции ползунка: P&L TOTAL = P&L актива + ИТОГО таблицы (равенство устойчиво) |
| T12 | Скрыть один опцион (visible=false) | Скрытый опцион не влияет ни на ИТОГО таблицы, ни на P&L TOTAL |

Поведенческий критерий: **разница между `P&L TOTAL` и `P&L актива + Σ P&L_строк` должна быть равна нулю** (с точностью до округления до сотых) **при любом положении ползунка дней и цены симуляции**.

---

## 9. Чек-лист переноса в новый калькулятор

- [ ] Один pure-модуль `calculateOptionRowPL(option, sim) → number` — единственный источник P&L одного опциона.
- [ ] Селектор `calculatePortfolioPL(portfolio, sim) → { underlyingPL, optionsPL, totalPL }` — единственный источник P&L TOTAL. Внутри использует `calculateOptionRowPL`, не дублирует формулу.
- [ ] Таблица опционов и блок «Базовый актив» рендерят значения **только** из селектора. Никаких inline-вычислений.
- [ ] Все параметры из §5 — обязательные в сигнатуре `calculateOptionRowPL`. TypeScript обеспечивает что забыть нельзя.
- [ ] Тесты T1–T12 на согласованность (см. §7.3 + §8) включены в CI.
- [ ] Якорь Fact P&L (см. handoff `fact-pl-anchor-quantity-scaling.md`) — реализован внутри `calculateOptionRowPL`, не как отдельный слой.

---

## 10. Что реально стоит в старом проекте

> Эта секция фиксирует фактическое состояние кода на момент v42 — для тех, кто решит залезть в старый репозиторий и сверить.

- В `OptionsTableV3.jsx` — `React.useMemo`, который вычисляет `optionsTableTotalPL` (одно и то же значение для отображения в строке «ИТОГО:» и для подъёма наверх). Inline-формула расчёта одной строки P&L всё ещё дублируется в трёх местах (P&L строки, Close Price, ИТОГО) — это техдолг, в новом проекте его сразу не воспроизводить.
- `React.useEffect` в `OptionsTableV3.jsx` пробрасывает `optionsTableTotalPL` наверх через prop `onOptionsTotalPLChange`.
- В `UniversalOptionsCalculator.jsx` — `useState` `optionsTableTotalPL`, его setter передаётся в `<OptionsTableV3>`, само значение — в `<PositionFinancialControl>` через prop `optionsTotalPL`.
- В `PositionFinancialControl.jsx` — `useMemo` считает только `underlyingPL` локально (линейная формула по позициям БА) и складывает с `optionsTotalPL`. Никакой BSM, никакой собственной IV — простое сложение.
- Старая функция `calculatePortfolioPLAtPrice` в `metricsCalculator.js` **удалена** — она больше нигде не используется.

Якорная формула Fact P&L всё ещё дублируется в 6 местах (3 в `OptionsTableV3.jsx`, 2 в `usePositionExitCalculator.js`, 1 в `ExitPlanTable.jsx`) — см. отдельный handoff `fact-pl-anchor-quantity-scaling.md`.

---

## 11. Открытые вопросы для нового проекта

1. **Кеш расчётов.** Если на одной отрисовке селектор вызывается несколько раз с одними параметрами (таблица + карточка + график), есть смысл мемоизировать. В старом проекте мемоизация частичная (`useMemo` в таблице), но архитектурно не системная.
2. **Стрим P&L через RxJS / signals / observables.** Когда параметров много (qty, цена, дни, IV-override и т.д.), реактивная модель сама гарантирует, что все потребители видят согласованные числа. Альтернатива React-`useMemo` с большим массивом deps.
3. **Серверный расчёт P&L.** В старом проекте всё считается на клиенте. В новом можно вынести `calculateOptionRowPL` в backend (Python/FastAPI) и кешировать на сервере — особенно для тяжёлых сценариев (AI-IV, симуляции). Архитектурное решение, в этот фикс не входит.
4. **Численная точность.** При малых разницах (например, P&L = $0.001) формат `Math.round(value)` может округлить до 0, и пользователь увидит «нулевой» P&L при ненулевом результате. Не критично для текущего кейса, но в новом UI стоит явно показывать precision.

---

## 12. История в старом проекте

| Дата | Коммит | Описание |
|---|---|---|
| ранее | — | Расчёт P&L одного опциона дублировался в `OptionsTableV3.jsx`, `calculatePortfolioPLAtPrice`, `calculatePLDataForMetrics`, `usePositionExitCalculator`, `ExitPlanTable.jsx`. |
| 2026-05-04 | `fbfb075` + `b25c8ce` | Фикс масштабирования якоря Fact P&L по количеству. Привёл табличный путь в порядок, но `calculatePortfolioPLAtPrice` остался не синхронизированным — баг P&L TOTAL обнаружился. |
| 2026-05-05 | `3456681` | **Промежуточная попытка фикса:** «зеркалирование» — `calculatePortfolioPLAtPrice` синхронизирована с табличной формулой (Fact IV, assetPriceAtEntry, классификация, якорь). Версия v38 → v39. **Решение оказалось хрупким** — при движении ползунка дней расхождения возвращались из-за тонкостей проекции IV. |
| 2026-05-05 | `53823abb` + `a904a8af` | **Финальное решение:** ИТОГО таблицы поднимается наверх через React-callback, P&L TOTAL = P&L актива + готовое ИТОГО. Функция `calculatePortfolioPLAtPrice` удалена. Версия v39 → v40. |
| 2026-05-05 | `8d87741` | Объединение всех параллельных доработок (включая этот фикс) в `main`. Версия v42. |

**Файлы, затронутые финальным фиксом 2026-05-05:**

- `frontend/src/components/CalculatorV2/OptionsTableV3.jsx` — добавлены `React.useMemo optionsTableTotalPL`, `React.useEffect onOptionsTotalPLChange`, новый prop `onOptionsTotalPLChange`. JSX строки «ИТОГО:» переключён на готовое значение из useMemo.
- `frontend/src/components/CalculatorV2/PositionFinancialControl.jsx` — убран импорт и вызов `calculatePortfolioPLAtPrice`. Локальный расчёт `underlyingPL` (линейная формула). Новый prop `optionsTotalPL`. P&L TOTAL = underlyingPL + optionsTotalPL.
- `frontend/src/pages/UniversalOptionsCalculator.jsx` — добавлен `useState optionsTableTotalPL`, прокинут setter в `<OptionsTableV3>`, значение — в `<PositionFinancialControl>`.
- `frontend/src/utils/metricsCalculator.js` — функция `calculatePortfolioPLAtPrice` удалена, оставлен комментарий-надгробие с пояснением.
- `frontend/src/components/Layout/TopNav.jsx` — версия бампилась несколько раз: v37 → v38 → v39 → v40 → v42 (через объединение веток).
