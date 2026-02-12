# Документация: Интеграция калькулятора опционов с TradingView Extension

## Обзор

Калькулятор опционов отправляет команды в расширение TradingView через `localStorage`. Расширение читает команды, собирает данные и записывает результат обратно.

**Ключи localStorage:**
- `tvc_refresh_command` — команды от калькулятора к расширению
- `tvc_refresh_result` — результаты от расширения к калькулятору
- `calculatorState` — данные опционов (обновляются расширением)

---

## Типы команд

Калькулятор использует **3 типа команд**:

### 1. `refresh_specific` — Обновление конкретных опционов

**Когда используется**: Кнопка обновления данных (RefreshCw) в таблице опционов

**Формат команды**:
```javascript
localStorage.setItem('tvc_refresh_command', JSON.stringify({
  type: 'refresh_specific',
  options: [
    { date: '2026-01-24', strike: 6900, optionType: 'CALL' },
    { date: '2026-01-24', strike: 6850, optionType: 'PUT' },
    { date: '2026-02-21', strike: 7000, optionType: 'CALL' }
  ],
  refreshUnderlyingPrice: true,
  timestamp: Date.now(),
  processed: false
}));
```

**Описание полей**:
| Поле | Тип | Описание |
|------|-----|----------|
| `type` | string | `'refresh_specific'` — обновить конкретные опционы |
| `options` | array | Массив опционов для обновления |
| `options[].date` | string | Дата экспирации в формате ISO (YYYY-MM-DD) |
| `options[].strike` | number | Страйк опциона |
| `options[].optionType` | string | `'CALL'` или `'PUT'` |
| `refreshUnderlyingPrice` | boolean | Также обновить цену базового актива |
| `timestamp` | number | Unix timestamp команды |
| `processed` | boolean | `false` — команда не обработана |

**Ожидаемое поведение расширения**:
1. Прочитать список опционов из команды
2. Для каждого опциона найти на TradingView данные по date/strike/optionType
3. Обновить bid/ask/IV/греки для каждого опциона
4. Если `refreshUnderlyingPrice: true` — также обновить цену базового актива
5. Записать обновленные данные в `calculatorState`
6. Записать результат в `tvc_refresh_result`

---

### 2. `refresh_range` — Запрос диапазона опционов

**Когда используется**: Волшебная кнопка (Magic) — подбор BuyPUT и BuyCALL

**Формат команды**:
```javascript
localStorage.setItem('tvc_refresh_command', JSON.stringify({
  type: 'refresh_range',
  daysFrom: 1,
  daysTo: 100,
  strikeFrom: -20,
  strikeTo: 20,
  timestamp: Date.now(),
  processed: false
}));
```

**Описание полей**:
| Поле | Тип | Описание |
|------|-----|----------|
| `type` | string | `'refresh_range'` — запросить диапазон |
| `daysFrom` | number | Минимум дней до экспирации от сегодня |
| `daysTo` | number | Максимум дней до экспирации от сегодня |
| `strikeFrom` | number | Нижняя граница страйков (% от текущей цены). `-20` = цена - 20% |
| `strikeTo` | number | Верхняя граница страйков (% от текущей цены). `+20` = цена + 20% |
| `timestamp` | number | Unix timestamp команды |
| `processed` | boolean | `false` — команда не обработана |

**Пример расчета диапазона страйков**:
- `currentPrice = 100`
- `strikeFrom = -20`, `strikeTo = 20`
- Диапазон страйков: от 80 до 120

**Ожидаемое поведение расширения**:
1. Определить текущую цену базового актива
2. Рассчитать диапазон страйков: `[currentPrice * (1 + strikeFrom/100), currentPrice * (1 + strikeTo/100)]`
3. Найти все даты экспирации в диапазоне `[сегодня + daysFrom, сегодня + daysTo]`
4. Собрать все опционы (CALL и PUT) в этих диапазонах
5. Записать данные в `calculatorState`
6. Записать результат в `tvc_refresh_result`

---

### 3. `refresh_single_strike` — Запрос одного страйка

**Когда используется**: Золотая кнопка (Golden) и Супер подбор — подбор с конкретным страйком

**Формат команды**:
```javascript
// Вариант 1: через процент (Golden Selection)
localStorage.setItem('tvc_refresh_command', JSON.stringify({
  type: 'refresh_single_strike',
  daysFrom: 90,
  daysTo: 300,
  strikePercent: 5,
  timestamp: Date.now(),
  processed: false
}));

// Вариант 2: через абсолютный страйк (Супер подбор)
localStorage.setItem('tvc_refresh_command', JSON.stringify({
  type: 'refresh_single_strike',
  daysFrom: 90,
  daysTo: 300,
  strikePercent: 5,       // fallback, если расширение не поддерживает exactStrike
  exactStrike: 70,        // НОВОЕ ПОЛЕ: абсолютное значение страйка
  timestamp: Date.now(),
  processed: false
}));
```

**Описание полей**:
| Поле | Тип | Описание |
|------|-----|----------|
| `type` | string | `'refresh_single_strike'` — запросить один страйк |
| `daysFrom` | number | Минимум дней до экспирации от сегодня |
| `daysTo` | number | Максимум дней до экспирации от сегодня |
| `strikePercent` | number | Процент от текущей цены. `5` = найти страйк ближайший к `currentPrice × 1.05` |
| `exactStrike` | number \| null | **НОВОЕ (опциональное)**. Абсолютное значение страйка. Если присутствует — использовать его **вместо** вычисления через `strikePercent` |
| `timestamp` | number | Unix timestamp команды |
| `processed` | boolean | `false` — команда не обработана |

**Пример 1 — через процент (старое поведение)**:
- `currentPrice = 99`
- `strikePercent = 5`
- Целевая цена = 99 × 1.05 = 103.95
- Ближайший страйк = 105

**Пример 2 — через абсолютный страйк (новое поведение)**:
- `exactStrike = 70`
- Целевая цена = **70** (используется напрямую, без вычислений)
- Ближайший страйк = 70

**Ожидаемое поведение расширения**:
1. Определить текущую цену базового актива
2. **Определить целевой страйк**:
   - Если в команде есть поле `exactStrike` → использовать его напрямую как целевую цену
   - Если `exactStrike` отсутствует → вычислить как раньше: `currentPrice * (1 + strikePercent/100)`
3. Найти ближайший доступный страйк к целевой цене
4. Найти все даты экспирации в диапазоне `[сегодня + daysFrom, сегодня + daysTo]`
5. Собрать все опционы (CALL и PUT) с этим страйком для всех дат
6. Записать данные в `calculatorState` (поле `singleStrikeOptions`)
7. Записать результат в `tvc_refresh_result`

> **⚠️ ВАЖНО для разработчиков расширения**: Поле `exactStrike` — опциональное. Если оно есть в команде, расширение должно использовать его как целевой страйк напрямую, без умножения на `currentPrice`. Это нужно для функции "Супер подбор по одному страйку", где пользователь вводит конкретное значение страйка (например, 70), а не процент.

---

## Сводная таблица кнопок калькулятора

| Кнопка | Шаг | Тип команды | Параметры по умолчанию |
|--------|-----|-------------|------------------------|
| **Refresh** | — | `refresh_specific` | Конкретные опционы из таблицы + цена актива |
| **Magic** | 1 (BuyPUT) | `refresh_range` | `daysFrom=1`, `daysTo=100`, `strikeFrom=-20`, `strikeTo=+20` |
| **Magic** | 2 (BuyCALL) | `refresh_range` | `daysFrom=1`, `daysTo=100`, `strikeFrom=-20`, `strikeTo=+20` |
| **Golden** | 1 (BuyCALL) | `refresh_single_strike` | `daysFrom=90`, `daysTo=300`, `strikePercent=+5` |
| **Golden** | 2 (BuyPUT) | `refresh_single_strike` | `daysFrom=8`, `daysTo=100`, `strikePercent=+5` |
| **Super** (диапазон) | 1/2 | `refresh_range` | `daysFrom=90`, `daysTo=300`, `strikeFrom=1`, `strikeTo=7` |
| **Super** (один страйк) | 1/2 | `refresh_single_strike` | `daysFrom=90`, `daysTo=300`, `exactStrike=70` |

---

## Формат ответа расширения

**Ключ**: `tvc_refresh_result`

```javascript
localStorage.setItem('tvc_refresh_result', JSON.stringify({
  status: 'collecting',  // 'collecting' | 'complete' | 'error'
  progress: 45,          // 0-100, процент выполнения
  message: 'Загрузка даты 3/7...',
  timestamp: Date.now(),
  
  // При status === 'complete':
  data: {
    ticker: 'ESH2026',
    underlyingPrice: 6910.75,
    expirations: 5,      // количество дат экспирации
    options: 150,        // количество опционов
    duration: 45         // время сбора в секундах
  }
}));
```

**Статусы**:
| Статус | Описание |
|--------|----------|
| `collecting` | Сбор данных в процессе, показывать progress bar |
| `complete` | Сбор завершен успешно, данные в `calculatorState` |
| `error` | Ошибка, показать `message` пользователю |

---

## Формат данных опционов

**Ключ**: `calculatorState`

```javascript
{
  "selectedTicker": "CME_MINI:ESH2026",
  "selectedExpirationDate": "2026-01-16",
  "underlyingPrice": 5985.25,
  "options": [
    {
      "id": "1768468327884",
      "action": "Buy",
      "type": "CALL",
      "strike": 6985,
      "date": "2026-01-16",
      "quantity": 1,
      "premium": 16.125,
      "bid": 16,
      "ask": 16.25,
      "volume": 0,
      "oi": 0,
      "visible": true,
      "ticker": "ESH6",
      "lastUpdated": "2026-01-15T09:12:07.884Z",
      "delta": 0.5,
      "gamma": 0.01,
      "theta": -0.05,
      "vega": 0.1,
      "impliedVolatility": 0.25
    }
  ]
}
```

---

## Примечания для разработчика расширения

1. **Поле `type`** — новое, определяет тип команды. Если `type` отсутствует, использовать старую логику.

2. **`refresh_specific`** — требует точного соответствия date/strike/optionType. Обновлять только указанные опционы.

3. **`refresh_single_strike`** — расширение само находит ближайший страйк к целевой цене `currentPrice * (1 + strikePercent/100)`.

4. **Обратная совместимость** — если `type` отсутствует, использовать старую логику с `daysFrom/daysTo/strikeFrom/strikeTo`.

5. **Прогресс** — при длительных операциях обновлять `tvc_refresh_result` с `status: 'collecting'` и актуальным `progress`.

6. **storage event** — калькулятор подписан на `storage` event и автоматически обновится при изменении `calculatorState`.

---

## Файлы калькулятора, затронутые интеграцией

- `frontend/src/hooks/useExtensionData.js` — утилиты отправки команд
- `frontend/src/components/CalculatorV2/OptionsTableV3.jsx` — кнопка Refresh
- `frontend/src/components/CalculatorV2/MagicSelection/MagicSelectionModal.jsx` — волшебная кнопка
- `frontend/src/components/CalculatorV2/GoldenSelection/GoldenSelectionModal.jsx` — золотая кнопка

---

*Документация создана: 2026-01-20*
