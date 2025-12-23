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

- [ ] IV передаётся из подбора в `newOption.impliedVolatility`
- [ ] `loadOptionDetails` не перезаписывает существующую IV
- [ ] Функции расчёта P/L используют `getOptionVolatility`
- [ ] IV передаётся в результатах `filterAndRankPutOptions`
- [ ] Логирование показывает одинаковые значения IV в подборе и таблице
- [ ] P/L в подборе совпадает с P/L в таблице после добавления опциона

---

## Связанные файлы

| Файл | Назначение |
|------|------------|
| `pages/OptionsCalculatorBasic.jsx` | Главный компонент калькулятора, `onAddOption`, `loadOptionDetails` |
| `components/CalculatorV2/AIOptionSelector/aiOptionSelectorUtils.js` | Логика подбора опционов, расчёт P/L |
| `components/CalculatorV2/AIOptionSelector/AIOptionSelectorDialog.jsx` | UI подбора, передача опциона в `onAddOption` |
| `components/CalculatorV2/OptionsTable.jsx` | Таблица опционов, отображение P/L |
| `utils/volatilitySurface/projection.js` | Функция `getOptionVolatility` |
| `utils/optionPricing.js` | Функция `calculateOptionPLValue` |

---

## Автор и дата

- **Дата:** 2024-12-23
- **Проект:** Optioner v21
- **Задача:** Унификация расчёта P/L между подбором и таблицей опционов
