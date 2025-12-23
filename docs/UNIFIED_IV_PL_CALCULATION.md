# Унификация расчёта P/L и волатильности между подбором опционов и таблицей

## Описание проблемы

При подборе опционов (AI Option Selector) и отображении в таблице опционов (Options Table) использовались **разные источники волатильности (IV)**, что приводило к расхождению в расчётах P/L для одного и того же опциона.

### Симптомы проблемы:
- P/L в окне подбора опционов отличается от P/L в таблице опционов
- При добавлении подобранного опциона в таблицу, значения P/L меняются
- Волатильность в логах подбора не совпадает с волатильностью в таблице

### Корневая причина:
1. **Подбор опционов** получает IV из API цепочки опционов (`getOptionsChain`)
2. **Таблица опционов** получает IV из API деталей опциона (`getOptionDetails`)
3. Эти два API могут возвращать **разные значения IV** для одного опциона
4. При добавлении опциона из подбора, IV **не передавалась** в объект опциона
5. При загрузке деталей опциона, IV из API **перезаписывала** любое существующее значение

---

## Решение

### Принцип: "Единый источник истины для IV"

IV, использованная при подборе опциона, должна сохраняться и использоваться в таблице опционов для согласованности P/L.

---

## Необходимые изменения

### 1. Передача IV при добавлении опциона из подбора

**Файл:** `pages/OptionsCalculatorBasic.jsx` (или аналогичный главный компонент калькулятора)

**Место:** Функция `onAddOption` в компоненте AI подбора опционов

**Было:**
```javascript
const newOption = {
  id: newOptionId,
  action: option.action || 'Buy',
  type: option.type || 'PUT',
  strike: option.strike,
  date: option.expirationDate,
  quantity: 1,
  premium: option.premium || 0,
  bid: option.bid || 0,
  ask: option.ask || 0,
  volume: option.volume || 0,
  oi: option.openInterest || 0,
  delta: option.delta || 0,
  visible: true,
  isLoadingDetails: true,
  bestExitDay: bestExitDay,
};
```

**Стало:**
```javascript
const newOption = {
  id: newOptionId,
  action: option.action || 'Buy',
  type: option.type || 'PUT',
  strike: option.strike,
  date: option.expirationDate,
  quantity: 1,
  premium: option.premium || 0,
  bid: option.bid || 0,
  ask: option.ask || 0,
  volume: option.volume || 0,
  oi: option.openInterest || 0,
  delta: option.delta || 0,
  // ВАЖНО: Передаём IV из подбора для согласованности P/L
  // ЗАЧЕМ: IV из подбора должна совпадать с IV в таблице
  impliedVolatility: option.iv || option.impliedVolatility || 0,
  visible: true,
  isLoadingDetails: true,
  bestExitDay: bestExitDay,
};
```

---

### 2. Сохранение IV при загрузке деталей опциона

**Файл:** `pages/OptionsCalculatorBasic.jsx` (или аналогичный)

**Место:** Функция `loadOptionDetails` — обновление опциона после загрузки деталей

**Было:**
```javascript
setOptions(prevOptions => 
  prevOptions.map(opt => 
    opt.id === optionId ? {
      ...opt,
      premium: details.premium || 0,
      bid: details.bid || 0,
      ask: details.ask || 0,
      // ... другие поля
      impliedVolatility: details.implied_volatility || 0,  // ❌ Перезаписывает IV
      isLoadingDetails: false,
    } : opt
  )
);
```

**Стало:**
```javascript
setOptions(prevOptions => 
  prevOptions.map(opt => 
    opt.id === optionId ? {
      ...opt,
      premium: details.premium || 0,
      bid: details.bid || 0,
      ask: details.ask || 0,
      // ... другие поля
      // ВАЖНО: Сохраняем IV из подбора если она уже есть
      // ЗАЧЕМ: Согласованность P/L между подбором и таблицей
      impliedVolatility: opt.impliedVolatility || details.implied_volatility || 0,  // ✅ Приоритет существующей IV
      isLoadingDetails: false,
    } : opt
  )
);
```

---

### 3. Использование единой функции расчёта волатильности

**Файл:** `utils/volatilitySurface/projection.js`

Убедитесь, что функция `getOptionVolatility` используется во всех местах расчёта P/L:

```javascript
/**
 * Вычисляет индивидуальную волатильность для опциона
 * ЗАЧЕМ: Единая функция для расчёта IV во всех модулях
 * @returns {number} Волатильность в процентах (например, 25 для 25%)
 */
export const getOptionVolatility = (
  option, 
  currentDaysToExpiration = null, 
  simulatedDaysToExpiration = null, 
  ivSurface = null
) => {
  const optIV = option.impliedVolatility || option.implied_volatility;
  if (!optIV || optIV <= 0) {
    return DEFAULT_IV_PERCENT; // Fallback (обычно 25%)
  }
  
  // Конвертируем в проценты если в десятичном формате
  const currentIVPercent = optIV < 1 ? optIV * 100 : optIV;
  
  // Если есть данные о времени — используем прогнозируемую IV
  if (currentDaysToExpiration !== null && simulatedDaysToExpiration !== null && 
      simulatedDaysToExpiration < currentDaysToExpiration && simulatedDaysToExpiration > 0) {
    const projectedIV = getProjectedIV(option, currentDaysToExpiration, simulatedDaysToExpiration, ivSurface);
    return projectedIV;
  }
  
  return currentIVPercent;
};
```

---

### 4. Обновление функций расчёта P/L в подборе опционов

**Файл:** `components/CalculatorV2/AIOptionSelector/aiOptionSelectorUtils.js`

**Функции:** `calculatePutPLBlackScholes`, `calculateCallPLBlackScholes`

```javascript
import { getOptionVolatility } from '../../../utils/volatilitySurface';
import { calculateOptionPLValue } from '../../../utils/optionPricing';

export function calculatePutPLBlackScholes(putOption, targetPrice, daysRemaining, currentDaysToExpiration = null) {
  // Используем getOptionVolatility как в таблице опционов
  // ЗАЧЕМ: Единый источник волатильности для согласованности P/L
  const currentDays = currentDaysToExpiration !== null ? currentDaysToExpiration : daysRemaining;
  const optionVolatility = getOptionVolatility(putOption, currentDays, daysRemaining);
  
  // Используем ту же функцию что и калькулятор, передавая волатильность явно
  const pl = calculateOptionPLValue(putOption, targetPrice, targetPrice, daysRemaining, optionVolatility);
  return pl;
}
```

---

### 5. Передача IV в результатах подбора

**Файл:** `components/CalculatorV2/AIOptionSelector/aiOptionSelectorUtils.js`

**Функция:** `filterAndRankPutOptions` (и аналогичные для CALL)

Убедитесь, что IV передаётся в результат:

```javascript
results.push({
  expirationDate: expData.date,
  daysUntil: expData.daysUntil,
  strike: put.strike,
  premium: put.premium,
  bid: put.bid,
  ask: put.ask,
  volume: put.volume,
  openInterest: put.openInterest,
  delta: put.delta,
  iv: put.iv,  // ✅ ВАЖНО: Передаём IV
  ...riskCheck
});
```

---

## Использование цен BID и ASK для расчёта P/L

### Критически важно!

Для корректного расчёта P/L **обязательно** должны быть доступны цены BID и ASK в подборе опционов.

### Правило использования цен:

| Действие | Цена входа | Обоснование |
|----------|------------|-------------|
| **Buy** (покупка) | **ASK** | Покупаем по цене продавца (ask) |
| **Sell** (продажа) | **BID** | Продаём по цене покупателя (bid) |

### Реализация в коде:

**Файл:** `utils/optionPricing.js`

```javascript
const getEntryPrice = (option = {}) => {
  const isBuy = isBuyAction(option);
  
  if (isBuy) {
    // Покупка: входим по ASK (цена продавца)
    const ask = toNumber(option.ask);
    if (ask > 0) return ask;
  } else {
    // Продажа: входим по BID (цена покупателя)
    const bid = toNumber(option.bid);
    if (bid > 0) return bid;
  }
  
  // Fallback на premium если bid/ask недоступны
  return Math.max(0, toNumber(option.premium));
};
```

### Проверка наличия BID/ASK в подборе:

**Файл:** `components/CalculatorV2/AIOptionSelector/aiOptionSelectorUtils.js`

```javascript
// При нормализации данных из API
const normalizedPuts = filteredPuts.map(opt => {
  const bid = opt.bid || 0;
  const ask = opt.ask || 0;
  // ...
  return {
    strike,
    premium,
    bid,  // ✅ ОБЯЗАТЕЛЬНО передаём BID
    ask,  // ✅ ОБЯЗАТЕЛЬНО передаём ASK
    // ...
  };
});

// Логирование для проверки
const withBidAsk = normalizedPuts.filter(p => p.bid > 0 && p.ask > 0).length;
if (withBidAsk < normalizedPuts.length) {
  console.warn(`⚠️ Некоторые опционы БЕЗ bid/ask данных!`);
}
```

### Передача BID/ASK при добавлении опциона:

```javascript
const newOption = {
  // ...
  bid: option.bid || 0,  // ✅ Передаём BID
  ask: option.ask || 0,  // ✅ Передаём ASK
  premium: option.premium || 0,  // Fallback
  // ...
};
```

---

## Формат данных IV

### API возвращает IV в десятичном формате:
- `0.25` = 25%
- `0.50` = 50%

### Функция `getOptionVolatility` возвращает IV в процентах:
- `25` = 25%
- `50` = 50%

### Конвертация:
```javascript
// Десятичный → Проценты
const ivPercent = ivDecimal < 1 ? ivDecimal * 100 : ivDecimal;

// Проценты → Десятичный
const ivDecimal = ivPercent > 1 ? ivPercent / 100 : ivPercent;
```

---

## Диагностика и логирование

Для отладки расхождений добавьте логирование:

### В подборе опционов:
```javascript
console.log(`[AISelector] 📈 Strike $${option.strike}: rawIV=${option.iv}, IV=${optionVolatility.toFixed(1)}%`);
```

### В таблице опционов:
```javascript
const rawIV = option.impliedVolatility || option.implied_volatility;
console.log(`[Таблица] 📈 Strike $${option.strike}: rawIV=${rawIV}, IV=${(optionVolatility * 100).toFixed(1)}%`);
```

---

## Чек-лист проверки

- [ ] **BID и ASK** передаются из подбора в `newOption`
- [ ] Функция `getEntryPrice` использует ASK для Buy и BID для Sell
- [ ] IV передаётся из подбора в `newOption.impliedVolatility`
- [ ] `loadOptionDetails` не перезаписывает существующую IV
- [ ] Функции расчёта P/L используют `getOptionVolatility`
- [ ] IV передаётся в результатах `filterAndRankPutOptions`
- [ ] **ivSurface** передаётся в `OptionSelectionResult` и далее в `usePositionExitCalculator`
- [ ] **dividendYield** передаётся в `OptionSelectionResult` и далее в `usePositionExitCalculator`
- [ ] Логирование показывает одинаковые значения BID/ASK/IV в подборе и таблице
- [ ] Цены закрытия опциона совпадают в блоках "Результат подбора" и "Расчёт выхода"
- [ ] P/L в подборе совпадает с P/L в таблице после добавления опциона

---

## 6. Передача ivSurface и dividendYield в компонент результатов подбора

**Файл:** `components/CalculatorV2/OptionSelectionResult/index.jsx`

**Проблема:** Компонент `OptionSelectionResult` не получал параметры `ivSurface` и `dividendYield`, что приводило к расхождению в расчёте теоретической цены опциона между блоком "Результат подбора" и блоком "Расчёт выхода".

**Симптом:** Цена закрытия опциона в блоке "Результат подбора BuyPUT" отличается от цены в блоке "Расчёт выхода из позиции" при одинаковых условиях (IV, дни до экспирации, цена актива).

**Было:**
```javascript
export function OptionSelectionResult({
  selectionParams = null,
  options = [],
  positions = [],
  currentPrice = 0
}) {
  // ...
  const plDown = usePositionExitCalculator({
    underlyingPrice: targetDownPrice,
    daysPassed: daysAfterEntry,
    options,
    positions,
    currentPrice
    // ❌ ivSurface и dividendYield не передаются
  });
}
```

**Стало:**
```javascript
export function OptionSelectionResult({
  selectionParams = null,
  options = [],
  positions = [],
  currentPrice = 0,
  ivSurface = null,        // ✅ Добавлен параметр
  dividendYield = 0        // ✅ Добавлен параметр
}) {
  // ...
  const plDown = usePositionExitCalculator({
    underlyingPrice: targetDownPrice,
    daysPassed: daysAfterEntry,
    options,
    positions,
    currentPrice,
    ivSurface,              // ✅ Передаём ivSurface
    dividendYield           // ✅ Передаём dividendYield
  });
}
```

**Передача параметров из главного компонента:**

**Файл:** `pages/OptionsCalculatorBasic.jsx`

```javascript
<OptionSelectionResult
  selectionParams={optionSelectionParams}
  options={displayOptions}
  positions={positions}
  currentPrice={currentPrice}
  ivSurface={ivSurface}                              // ✅ Передаём IV Surface
  dividendYield={useDividends ? dividendYield : 0}   // ✅ Передаём dividend yield
/>
```

**Почему это критично:**

1. **ivSurface** используется в `getOptionVolatility` для точной интерполяции волатильности между датами экспирации
2. Без `ivSurface` используется упрощённая модель роста IV, которая даёт другой результат
3. **dividendYield** влияет на расчёт теоретической цены опциона по модели Black-Scholes-Merton
4. Разные значения этих параметров приводят к расхождению в теоретической цене опциона и P/L

---

## Связанные файлы

| Файл | Назначение |
|------|------------|
| `pages/OptionsCalculatorBasic.jsx` | Главный компонент калькулятора, `onAddOption`, `loadOptionDetails` |
| `components/CalculatorV2/AIOptionSelector/aiOptionSelectorUtils.js` | Логика подбора опционов, расчёт P/L |
| `components/CalculatorV2/AIOptionSelector/AIOptionSelectorDialog.jsx` | UI подбора, передача опциона в `onAddOption` |
| `components/CalculatorV2/OptionsTable.jsx` | Таблица опционов, отображение P/L |
| `components/CalculatorV2/OptionSelectionResult/index.jsx` | Блок результатов подбора, использует `usePositionExitCalculator` |
| `hooks/usePositionExitCalculator.js` | Хук расчёта P/L при выходе, использует `ivSurface` и `dividendYield` |
| `utils/volatilitySurface/projection.js` | Функция `getOptionVolatility`, использует `ivSurface` для интерполяции |
| `utils/optionPricing.js` | Функция `calculateOptionPLValue`, использует `dividendYield` |

---

## Автор и дата

- **Дата:** 2024-12-23
- **Проект:** Optioner v21
- **Задача:** Унификация расчёта P/L между подбором и таблицей опционов
