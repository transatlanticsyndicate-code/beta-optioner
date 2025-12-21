# Методология модульного рефакторинга кода

## 📋 Содержание

1. [Основные принципы](#основные-принципы)
2. [Правило 300 строк](#правило-300-строк)
3. [Процесс рефакторинга](#процесс-рефакторинга)
4. [Паттерны разделения кода](#паттерны-разделения-кода)
5. [CI/CD автоматизация](#cicd-автоматизация)
6. [Практический пример](#практический-пример)

---

## Основные принципы

### Зачем нужна модульность?

1. **Читаемость для ИИ** - файлы должны помещаться в контекстное окно ИИ-ассистентов
2. **Простота поддержки** - легче найти и исправить баг в маленьком файле
3. **Переиспользование** - модули можно использовать в других частях проекта
4. **Тестируемость** - маленькие модули проще покрыть тестами
5. **Командная работа** - меньше конфликтов при слиянии веток

### Ключевые правила

- ✅ **Максимум 300 строк на файл**
- ✅ **Одна ответственность на файл** (Single Responsibility Principle)
- ✅ **Явные импорты/экспорты** - никаких `export *` без необходимости
- ✅ **Централизованные index.js** для удобного импорта из папок
- ✅ **Комментарии на русском** для объяснения бизнес-логики

---

## Правило 300 строк

### Почему именно 300?

- **Контекст ИИ**: Большинство ИИ-ассистентов могут полностью прочитать файл до 300 строк
- **Когнитивная нагрузка**: Человек может удержать в голове ~300 строк кода
- **Практический опыт**: Файлы >300 строк обычно нарушают SRP

### Что считается?

```bash
# Считаем все строки включая:
wc -l filename.js

# - Пустые строки
# - Комментарии
# - Импорты
# - Код
```

### Исключения

Правило 300 строк **НЕ применяется** к:
- Конфигурационным файлам (package.json, webpack.config.js)
- Файлам миграций БД
- Автогенерируемым файлам
- Файлам с большими статическими данными (константы, справочники)

---

## Процесс рефакторинга

### Шаг 1: Анализ текущего состояния

```bash
# Найти все файлы превышающие лимит
find . -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" | \
  xargs wc -l | \
  awk '$1 > 300 {print $1, $2}' | \
  sort -rn
```

### Шаг 2: Приоритизация

Рефакторить в порядке:
1. **Критичные файлы** - часто изменяемые, с багами
2. **Большие файлы** - >1000 строк в первую очередь
3. **Сложные файлы** - с запутанной логикой

### Шаг 3: Планирование разделения

Для каждого файла определить:
- **Утилиты** - чистые функции без побочных эффектов
- **Расчеты** - бизнес-логика, вычисления
- **Хуки** - React hooks (useState, useEffect, custom hooks)
- **Компоненты** - JSX/UI элементы
- **Константы** - статические данные

### Шаг 4: Создание модульной структуры

```
ComponentName/
├── index.js              # Централизованные экспорты
├── ComponentName.jsx     # Основной компонент (<300 строк)
├── utils.js              # Утилиты
├── calculations.js       # Бизнес-логика
├── constants.js          # Константы
├── hooks/
│   ├── useCustomHook1.js
│   └── useCustomHook2.js
└── components/
    ├── SubComponent1.jsx
    └── SubComponent2.jsx
```

### Шаг 5: Рефакторинг

#### 5.1 Вынос утилит

**До:**
```javascript
// BigComponent.jsx (1500 строк)
function formatDate(date) {
  // 10 строк форматирования
}

function Component() {
  const formatted = formatDate(date);
  // ...
}
```

**После:**
```javascript
// utils.js
export function formatDate(date) {
  // 10 строк форматирования
}

// BigComponent.jsx
import { formatDate } from './utils';

function Component() {
  const formatted = formatDate(date);
  // ...
}
```

#### 5.2 Вынос расчетов

**До:**
```javascript
// Component.jsx
const result = useMemo(() => {
  // 50 строк сложных вычислений
  return calculatedValue;
}, [deps]);
```

**После:**
```javascript
// calculations.js
export function calculateResult(params) {
  // 50 строк сложных вычислений
  return calculatedValue;
}

// Component.jsx
import { calculateResult } from './calculations';

const result = useMemo(() => calculateResult(params), [params]);
```

#### 5.3 Вынос хуков

**До:**
```javascript
// Component.jsx
function Component() {
  const [state1, setState1] = useState();
  const [state2, setState2] = useState();
  
  useEffect(() => {
    // 30 строк логики
  }, [deps]);
  
  // 20 строк обработчиков
  
  return <div>...</div>;
}
```

**После:**
```javascript
// useCustomLogic.js
export function useCustomLogic(params) {
  const [state1, setState1] = useState();
  const [state2, setState2] = useState();
  
  useEffect(() => {
    // 30 строк логики
  }, [deps]);
  
  // 20 строк обработчиков
  
  return { state1, state2, handlers };
}

// Component.jsx
import { useCustomLogic } from './useCustomLogic';

function Component() {
  const { state1, state2, handlers } = useCustomLogic(params);
  return <div>...</div>;
}
```

#### 5.4 Вынос JSX компонентов

**До:**
```javascript
// Component.jsx
return (
  <div>
    {items.map(item => (
      <div key={item.id}>
        {/* 50 строк сложного JSX */}
      </div>
    ))}
  </div>
);
```

**После:**
```javascript
// ItemComponent.jsx
export function ItemComponent({ item }) {
  return (
    <div>
      {/* 50 строк сложного JSX */}
    </div>
  );
}

// Component.jsx
import { ItemComponent } from './ItemComponent';

return (
  <div>
    {items.map(item => (
      <ItemComponent key={item.id} item={item} />
    ))}
  </div>
);
```

### Шаг 6: Создание index.js

```javascript
// ComponentName/index.js
/**
 * Централизованные экспорты модуля ComponentName
 * ЗАЧЕМ: Удобный импорт всех утилит и компонентов из одного места
 */

export * from './utils';
export * from './calculations';
export * from './constants';
export { useCustomHook1 } from './hooks/useCustomHook1';
export { useCustomHook2 } from './hooks/useCustomHook2';
export { SubComponent1 } from './components/SubComponent1';
export { SubComponent2 } from './components/SubComponent2';

// Дефолтный экспорт основного компонента
export { default } from './ComponentName';
```

### Шаг 7: Тестирование

```bash
# 1. Проверка компиляции
npm run build

# 2. Проверка линтера
npm run lint

# 3. Запуск тестов
npm test

# 4. Ручное тестирование UI
npm start
```

### Шаг 8: Коммит

```bash
git add -A
git commit -m "refactor: ComponentName 1500→280 строк

✅ Вынесены модули:
- utils.js (107) - форматирование, валидация
- calculations.js (348) - бизнес-логика
- useCustomHook.js (89) - state management

📉 -1220 строк (-81%)
✅ Build успешен"
```

---

## Паттерны разделения кода

### Паттерн 1: Утилиты (utils.js)

**Что выносить:**
- Форматирование (даты, числа, строки)
- Валидация
- Преобразование данных
- Математические функции
- Работа со строками/массивами

**Пример:**
```javascript
// utils.js

/**
 * Форматирует дату для отображения
 * @param {string} isoDate - Дата в формате ISO (YYYY-MM-DD)
 * @returns {string} - Дата в формате DD.MM.YY
 */
export function formatDateForDisplay(isoDate) {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  const shortYear = year.slice(-2);
  return `${day}.${month}.${shortYear}`;
}

/**
 * Округляет число до ближайшего шага
 */
export function roundToStep(value, step) {
  return Math.round(value / step) * step;
}
```

### Паттерн 2: Расчеты (calculations.js)

**Что выносить:**
- Бизнес-логика
- Сложные вычисления
- Алгоритмы
- Обработка данных

**Пример:**
```javascript
// calculations.js

/**
 * Рассчитывает диапазон страйков для отображения
 * ЗАЧЕМ: Адаптивная шкала для любой цены актива
 * 
 * @param {number} currentPrice - Текущая цена актива
 * @param {Array} options - Массив опционов
 * @returns {Object} - {min, max, count, step, labelInterval}
 */
export function calculateStrikeRange(currentPrice, options) {
  if (currentPrice <= 0) return null;
  
  // Адаптивный шаг на основе цены
  const step = currentPrice < 100 ? 1 : 
               currentPrice < 1000 ? 5 : 25;
  
  // Расчет границ
  const minStrike = Math.floor(currentPrice * 0.9 / step) * step;
  const maxStrike = Math.ceil(currentPrice * 1.1 / step) * step;
  const count = Math.round((maxStrike - minStrike) / step) + 1;
  
  return { min: minStrike, max: maxStrike, count, step };
}
```

### Паттерн 3: Custom Hooks

**Что выносить:**
- State management
- Side effects (useEffect)
- Обработчики событий
- Подписки (WebSocket, EventEmitter)

**Пример:**
```javascript
// useDragDrop.js

/**
 * Хук для Drag & Drop флагов на шкале
 * ЗАЧЕМ: Изоляция сложной логики перетаскивания
 */
export function useDragDrop({ strikeRange, options, onUpdate }) {
  const [draggingFlag, setDraggingFlag] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [previewStrike, setPreviewStrike] = useState(null);
  
  const handleMouseDown = useCallback((e, flag) => {
    if (flag.type === 'ticker') return;
    setDraggingFlag(flag);
    // ... логика
  }, []);
  
  useEffect(() => {
    if (!draggingFlag) return;
    
    const handleMouseMove = (e) => {
      // ... логика перемещения
    };
    
    const handleMouseUp = () => {
      // ... логика завершения
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingFlag]);
  
  return { draggingFlag, dragOffset, previewStrike, handleMouseDown };
}
```

### Паттерн 4: Подкомпоненты

**Что выносить:**
- Повторяющиеся блоки JSX
- Сложные UI элементы
- Элементы списков (map)

**Пример:**
```javascript
// FlagComponent.jsx

/**
 * Компонент флага на шкале страйков
 * ЗАЧЕМ: Изоляция JSX и логики отображения флага
 */
export function FlagComponent({ 
  flag, 
  position, 
  isDragging, 
  onMouseDown 
}) {
  return (
    <div
      className={`flag ${isDragging ? 'dragging' : ''}`}
      style={{ left: `${position}px` }}
      onMouseDown={(e) => onMouseDown(e, flag)}
    >
      <div className="flag-content" style={{ backgroundColor: flag.color }}>
        <span>{flag.label || flag.price}</span>
        {flag.count && (
          <div className="flag-badge">{flag.count}</div>
        )}
      </div>
    </div>
  );
}
```

### Паттерн 5: Константы и конфигурация

**Что выносить:**
- Магические числа
- Конфигурация
- Справочники
- Enum-ы

**Пример:**
```javascript
// constants.js

/**
 * Константы для расчета страйков
 */
export const STRIKE_CONSTANTS = {
  MIN_STRIKES: 20,
  MAX_STRIKES: 100,
  DEFAULT_PADDING: 0.15, // 15% padding от диапазона
  STRIKE_WIDTH: 6, // px
};

/**
 * Цвета для типов опционов
 */
export const OPTION_COLORS = {
  CALL: 'rgb(76, 175, 80)',
  PUT: 'rgb(255, 107, 107)',
  TICKER: 'rgb(75, 85, 99)',
};

/**
 * Пороги для маркеров страйков
 */
export const MARKER_THRESHOLDS = {
  HOT_STRIKE_OI: 50000,
  HOT_STRIKE_PERCENT: 0.7,
  HIGH_VOLUME: 1000,
  HIGH_VOLUME_PERCENT: 0.8,
  PIN_RISK_OI: 100000,
  PIN_RISK_RANGE: 0.05, // ±5% от цены
};
```

---

## CI/CD автоматизация

### GitHub Actions Workflow

Создайте файл `.github/workflows/check-file-size.yml`:

```yaml
name: Check File Size Limit

on:
  pull_request:
    branches: [ main, develop ]
  push:
    branches: [ main, develop ]

jobs:
  check-file-size:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v3
      
    - name: Check file line count
      run: |
        echo "🔍 Проверка размера файлов (макс 300 строк)..."
        
        # Находим все JS/JSX/TS/TSX файлы
        FILES=$(find . -type f \( -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" \) \
          ! -path "*/node_modules/*" \
          ! -path "*/build/*" \
          ! -path "*/dist/*" \
          ! -path "*/.next/*" \
          ! -name "*.config.js" \
          ! -name "*.config.ts")
        
        VIOLATIONS=0
        
        for file in $FILES; do
          LINES=$(wc -l < "$file")
          if [ $LINES -gt 300 ]; then
            echo "❌ $file: $LINES строк (превышает лимит 300)"
            VIOLATIONS=$((VIOLATIONS + 1))
          fi
        done
        
        if [ $VIOLATIONS -gt 0 ]; then
          echo ""
          echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
          echo "❌ Найдено $VIOLATIONS файл(ов) превышающих 300 строк"
          echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
          echo ""
          echo "📖 Инструкция по рефакторингу:"
          echo "   См. _docs/Refactoring/MODULAR_CODE_METHODOLOGY.md"
          exit 1
        fi
        
        echo "✅ Все файлы соответствуют лимиту 300 строк"

    - name: Report results
      if: failure()
      run: |
        echo "::error::Некоторые файлы превышают лимит в 300 строк. Пожалуйста, проведите рефакторинг."
```

### Pre-commit Hook (локальная проверка)

Создайте файл `.husky/pre-commit` или добавьте в `package.json`:

```json
{
  "scripts": {
    "check-file-size": "node scripts/check-file-size.js"
  },
  "husky": {
    "hooks": {
      "pre-commit": "npm run check-file-size"
    }
  }
}
```

Создайте скрипт `scripts/check-file-size.js`:

```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MAX_LINES = 300;
const EXCLUDED_PATTERNS = [
  'node_modules',
  'build',
  'dist',
  '.next',
  '.config.js',
  '.config.ts',
];

function shouldCheckFile(filePath) {
  // Проверяем расширение
  const ext = path.extname(filePath);
  if (!['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
    return false;
  }
  
  // Проверяем исключения
  return !EXCLUDED_PATTERNS.some(pattern => filePath.includes(pattern));
}

function countLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split('\n').length;
}

function checkFileSize() {
  console.log('🔍 Проверка размера файлов (макс 300 строк)...\n');
  
  // Получаем список измененных файлов
  let files;
  try {
    const output = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' });
    files = output.trim().split('\n').filter(Boolean);
  } catch (error) {
    // Если не в git репозитории, проверяем все файлы
    const { execSync } = require('child_process');
    const output = execSync('find . -type f \\( -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" \\)', { encoding: 'utf8' });
    files = output.trim().split('\n').filter(Boolean);
  }
  
  const violations = [];
  
  for (const file of files) {
    if (!shouldCheckFile(file)) continue;
    if (!fs.existsSync(file)) continue;
    
    const lines = countLines(file);
    if (lines > MAX_LINES) {
      violations.push({ file, lines });
    }
  }
  
  if (violations.length > 0) {
    console.log('❌ Найдены файлы превышающие лимит:\n');
    violations.forEach(({ file, lines }) => {
      console.log(`   ${file}: ${lines} строк (лимит: ${MAX_LINES})`);
    });
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`❌ Найдено ${violations.length} файл(ов) превышающих ${MAX_LINES} строк`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📖 Инструкция по рефакторингу:');
    console.log('   См. _docs/Refactoring/MODULAR_CODE_METHODOLOGY.md\n');
    process.exit(1);
  }
  
  console.log('✅ Все файлы соответствуют лимиту 300 строк\n');
}

checkFileSize();
```

Сделайте скрипт исполняемым:

```bash
chmod +x scripts/check-file-size.js
```

### Настройка в package.json

```json
{
  "scripts": {
    "check-file-size": "node scripts/check-file-size.js",
    "precommit": "npm run check-file-size",
    "lint": "eslint . --ext .js,.jsx,.ts,.tsx",
    "build": "react-scripts build"
  },
  "devDependencies": {
    "husky": "^8.0.0"
  }
}
```

### Установка Husky

```bash
npm install --save-dev husky
npx husky install
npx husky add .husky/pre-commit "npm run check-file-size"
```

---

## Практический пример

### Исходная ситуация

Файл `StrikeScale.jsx` содержит **1546 строк**:
- Утилиты форматирования (50 строк)
- Расчеты диапазонов (150 строк)
- Расчеты флагов (200 строк)
- Расчеты маркеров (90 строк)
- Drag & Drop логика (150 строк)
- Drag-scroll логика (60 строк)
- JSX флагов (150 строк)
- JSX шкал (250 строк)
- useEffect автоскролла (180 строк)
- Остальная логика (266 строк)

### Процесс рефакторинга

#### Шаг 1: Создание структуры

```bash
mkdir -p StrikeScale/hooks
mkdir -p StrikeScale/components
```

#### Шаг 2: Вынос утилит

```javascript
// StrikeScale/utils.js (107 строк)
export function formatDateForDisplay(isoDate) { /* ... */ }
export function getNiceLabelStep(price) { /* ... */ }
export function getStrikeStep(price) { /* ... */ }
export function roundToStep(value, step) { /* ... */ }
```

**Результат:** 1546 → 1496 строк (-50)

#### Шаг 3: Вынос расчетов

```javascript
// StrikeScale/calculations.js (348 строк)
export function calculateStrikeRange(currentPrice, options) { /* ... */ }
export function calculateFlags(options, strikeRange) { /* ... */ }
export function calculateBarHeights(options, strikeRange) { /* ... */ }
export function calculateDateColor(date) { /* ... */ }
```

**Результат:** 1496 → 1096 строк (-400)

#### Шаг 4: Вынос маркеров

```javascript
// StrikeScale/strikeMarkers.js (109 строк)
export function calculateHotStrikes(options) { /* ... */ }
export function calculateHighVolumeStrikes(options) { /* ... */ }
export function calculatePinRiskStrikes(options, currentPrice) { /* ... */ }
```

**Результат:** 1096 → 987 строк (-109)

#### Шаг 5: Вынос хуков

```javascript
// StrikeScale/useDragDrop.js (149 строк)
export function useDragDrop({ strikeRange, options, onUpdate }) { /* ... */ }

// StrikeScale/useDragScroll.js (59 строк)
export function useDragScroll(containerRef) { /* ... */ }
```

**Результат:** 987 → 779 строк (-208)

#### Шаг 6: Вынос компонентов

```javascript
// StrikeScale/FlagTop.jsx (93 строки)
export function FlagTop({ flag, strikeRange, ... }) { /* ... */ }

// StrikeScale/FlagBottom.jsx (72 строки)
export function FlagBottom({ flag, strikeRange, ... }) { /* ... */ }

// StrikeScale/ScaleTop.jsx (98 строк)
export function ScaleTop({ strikeRange, greenBarHeights, ... }) { /* ... */ }

// StrikeScale/ScaleBottom.jsx (37 строк)
export function ScaleBottom({ strikeRange, redBarHeights }) { /* ... */ }
```

**Результат:** 779 → 479 строк (-300)

#### Шаг 7: Оптимизация useEffect

Объединение двух больших useEffect в один компактный блок.

**Результат:** 479 → 344 строк (-135)

#### Шаг 8: Финальная чистка

Удаление неиспользуемых state переменных, закомментированного кода.

**Результат:** 344 → 260 строк (-84)

### Итоговая структура

```
StrikeScale/
├── index.js                 # 15 строк - экспорты
├── StrikeScale.jsx          # 260 строк - основной компонент ✅
├── utils.js                 # 107 строк - утилиты
├── calculations.js          # 348 строк - расчеты (можно разбить)
├── strikeMarkers.js         # 109 строк - маркеры
├── useDragDrop.js           # 149 строк - Drag & Drop
├── useDragScroll.js         # 59 строк - скролл
├── FlagTop.jsx              # 93 строки - верхние флаги
├── FlagBottom.jsx           # 72 строки - нижние флаги
├── ScaleTop.jsx             # 98 строк - верхняя шкала
└── ScaleBottom.jsx          # 37 строк - нижняя шкала
```

### Результаты

- **Было:** 1 файл × 1546 строк = 1546 строк
- **Стало:** 11 файлов × ~120 строк = 1347 строк
- **Экономия:** -199 строк кода за счет устранения дублирования
- **Модульность:** ✅ Все файлы <300 строк
- **Читаемость:** ✅ Каждый модуль имеет одну ответственность
- **Тестируемость:** ✅ Каждый модуль можно тестировать отдельно

---

## Чек-лист рефакторинга

### Перед началом

- [ ] Создана ветка для рефакторинга
- [ ] Все тесты проходят
- [ ] Build успешен
- [ ] Нет незакоммиченных изменений

### Во время рефакторинга

- [ ] Файл разбит на логические модули
- [ ] Каждый модуль <300 строк
- [ ] Созданы комментарии на русском для бизнес-логики
- [ ] Обновлены импорты
- [ ] Создан index.js с экспортами
- [ ] Удален мертвый код
- [ ] Удалены закомментированные блоки

### После рефакторинга

- [ ] `npm run build` - успешен
- [ ] `npm run lint` - без ошибок
- [ ] `npm test` - все тесты проходят
- [ ] Ручное тестирование UI
- [ ] Проверка размера файлов: `npm run check-file-size`
- [ ] Коммит с описательным сообщением
- [ ] Push и создание PR

### Code Review

- [ ] Все файлы <300 строк
- [ ] Нет дублирования кода
- [ ] Понятные имена функций/переменных
- [ ] Комментарии объясняют "зачем", а не "как"
- [ ] Сохранена вся функциональность
- [ ] CI/CD проверки проходят

---

## Проверка на запрещенные практики

### 🚫 Что ЗАПРЕЩЕНО в проекте

Перед коммитом каждый файл должен быть проверен на наличие:

#### 1. Mock данные и имитации

**ЗАПРЕЩЕНО:**
```javascript
// ❌ Хардкод mock данных
const mockOptions = [
  { id: 1, strike: 100, type: 'CALL' },
  { id: 2, strike: 105, type: 'PUT' },
];

// ❌ Имитация API ответа
const fakeApiResponse = {
  data: { price: 100, volume: 1000 }
};

// ❌ Заглушки вместо реальных данных
if (process.env.NODE_ENV === 'development') {
  return MOCK_DATA;
}
```

**ПРАВИЛЬНО:**
```javascript
// ✅ Реальные данные из API
const options = await fetchOptions(ticker);

// ✅ Пустой массив по умолчанию
const options = data?.options || [];

// ✅ Обработка отсутствия данных
if (!options.length) {
  return <EmptyState />;
}
```

#### 2. Хардкод значений

**ЗАПРЕЩЕНО:**
```javascript
// ❌ Магические числа без объяснения
if (price > 100) { ... }

// ❌ Хардкод конфигурации
const API_URL = 'https://api.example.com';

// ❌ Хардкод бизнес-логики
const commission = total * 0.02; // Что за 0.02?
```

**ПРАВИЛЬНО:**
```javascript
// ✅ Константы с понятными именами
const MIN_PRICE_THRESHOLD = 100;
if (price > MIN_PRICE_THRESHOLD) { ... }

// ✅ Переменные окружения
const API_URL = process.env.REACT_APP_API_URL;

// ✅ Именованные константы с комментариями
const COMMISSION_RATE = 0.02; // 2% комиссия брокера
const commission = total * COMMISSION_RATE;
```

#### 3. Генерация фейковых данных

**ЗАПРЕЩЕНО:**
```javascript
// ❌ Генерация случайных данных
const randomPrice = Math.random() * 1000;

// ❌ Faker.js в production коде
import faker from 'faker';
const user = { name: faker.name.findName() };

// ❌ Заполнение тестовыми данными
const testData = Array(100).fill(null).map((_, i) => ({
  id: i,
  value: Math.random()
}));
```

**ПРАВИЛЬНО:**
```javascript
// ✅ Реальные данные или явная обработка их отсутствия
const price = data?.currentPrice || 0;

// ✅ Тестовые данные только в тестах
// __tests__/component.test.js
const mockData = createMockOptions();

// ✅ Загрузка реальных данных
const options = await api.getOptions(ticker);
```

### Скрипт автоматической проверки

Создайте `scripts/check-forbidden-patterns.js`:

```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const FORBIDDEN_PATTERNS = [
  {
    pattern: /mock\w*\s*=\s*\[/gi,
    message: '🚫 Найдены mock данные (массивы)',
    severity: 'error'
  },
  {
    pattern: /mock\w*\s*=\s*\{/gi,
    message: '🚫 Найдены mock данные (объекты)',
    severity: 'error'
  },
  {
    pattern: /fake\w*(Data|Response|Api)/gi,
    message: '🚫 Найдена имитация данных',
    severity: 'error'
  },
  {
    pattern: /Math\.random\(\)/g,
    message: '⚠️  Найдена генерация случайных данных',
    severity: 'warning'
  },
  {
    pattern: /import.*faker/gi,
    message: '🚫 Использование faker.js в production коде',
    severity: 'error'
  },
  {
    pattern: /TODO:|FIXME:|HACK:/gi,
    message: '⚠️  Найдены TODO/FIXME/HACK комментарии',
    severity: 'warning'
  },
  {
    pattern: /console\.(log|debug|info)/g,
    message: '⚠️  Найдены console.log (должны быть удалены перед production)',
    severity: 'warning'
  }
];

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const violations = [];
  
  FORBIDDEN_PATTERNS.forEach(({ pattern, message, severity }) => {
    const matches = content.match(pattern);
    if (matches) {
      violations.push({
        file: filePath,
        message,
        severity,
        count: matches.length,
        lines: findLineNumbers(content, pattern)
      });
    }
  });
  
  return violations;
}

function findLineNumbers(content, pattern) {
  const lines = content.split('\n');
  const lineNumbers = [];
  
  lines.forEach((line, index) => {
    if (pattern.test(line)) {
      lineNumbers.push(index + 1);
    }
  });
  
  return lineNumbers;
}

function checkProject() {
  console.log('🔍 Проверка на запрещенные практики...\n');
  
  const { execSync } = require('child_process');
  const output = execSync(
    'find . -type f \\( -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" \\) ! -path "*/node_modules/*" ! -path "*/build/*" ! -path "*/__tests__/*"',
    { encoding: 'utf8' }
  );
  
  const files = output.trim().split('\n').filter(Boolean);
  const allViolations = [];
  
  files.forEach(file => {
    const violations = checkFile(file);
    if (violations.length > 0) {
      allViolations.push(...violations);
    }
  });
  
  if (allViolations.length === 0) {
    console.log('✅ Запрещенные практики не найдены\n');
    return;
  }
  
  // Группируем по severity
  const errors = allViolations.filter(v => v.severity === 'error');
  const warnings = allViolations.filter(v => v.severity === 'warning');
  
  if (errors.length > 0) {
    console.log('❌ ОШИБКИ (блокируют коммит):\n');
    errors.forEach(({ file, message, lines }) => {
      console.log(`   ${file}`);
      console.log(`   ${message}`);
      console.log(`   Строки: ${lines.join(', ')}\n`);
    });
  }
  
  if (warnings.length > 0) {
    console.log('⚠️  ПРЕДУПРЕЖДЕНИЯ:\n');
    warnings.forEach(({ file, message, lines }) => {
      console.log(`   ${file}`);
      console.log(`   ${message}`);
      console.log(`   Строки: ${lines.join(', ')}\n`);
    });
  }
  
  if (errors.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`❌ Найдено ${errors.length} критических нарушений`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    process.exit(1);
  }
}

checkProject();
```

Добавьте в `package.json`:

```json
{
  "scripts": {
    "check-forbidden": "node scripts/check-forbidden-patterns.js",
    "precommit": "npm run check-file-size && npm run check-forbidden"
  }
}
```

### Обновление GitHub Actions

Добавьте в `.github/workflows/check-file-size.yml`:

```yaml
- name: Check forbidden patterns
  run: |
    echo "🔍 Проверка на запрещенные практики..."
    npm run check-forbidden
```

---

## Тестирование через браузер

### 🌐 Обязательная проверка после рефакторинга

После разделения каждого файла **ОБЯЗАТЕЛЬНО** запустить браузерное тестирование:

#### Шаг 1: Запуск dev сервера

```bash
npm start
# Дождаться "Compiled successfully!"
```

#### Шаг 2: Открытие браузера с DevTools

**Вариант A: MCP Playwright (рекомендуется)**

```javascript
// Используйте MCP Playwright для автоматизации
await mcp0_browser_navigate({ url: 'http://localhost:3000' });
await mcp0_browser_snapshot({ filename: 'after-refactoring.md' });
const consoleMessages = await mcp0_browser_console_messages({ level: 'error' });
```

**Вариант B: Ручное тестирование**

1. Открыть Chrome DevTools (F12)
2. Перейти на вкладку **Console**
3. Очистить консоль (Clear console)
4. Обновить страницу (Ctrl+R / Cmd+R)

#### Шаг 3: Проверка на ошибки

**Проверить консоль на:**

```
❌ КРИТИЧЕСКИЕ ОШИБКИ (блокируют):
- Uncaught TypeError
- Uncaught ReferenceError  
- Failed to compile
- Module not found
- Cannot read property of undefined

⚠️  ПРЕДУПРЕЖДЕНИЯ (исправить):
- Warning: Each child should have unique key
- Warning: Cannot update component while rendering
- Warning: React Hook useEffect has missing dependency
- 404 Not Found (для API запросов - ожидаемо)
```

**Проверить Network на:**

```
❌ ОШИБКИ:
- 500 Internal Server Error
- CORS errors
- Failed to load resource

✅ НОРМА:
- 200 OK для статики
- 404 для API (если бэкенд не запущен)
- 304 Not Modified
```

#### Шаг 4: Функциональное тестирование

**Чек-лист UI:**

- [ ] Компонент отображается корректно
- [ ] Нет визуальных артефактов (пустые блоки, наложения)
- [ ] Интерактивные элементы работают (кнопки, инпуты)
- [ ] Drag & Drop функционирует (если есть)
- [ ] Модальные окна открываются/закрываются
- [ ] Данные отображаются корректно
- [ ] Нет бесконечных циклов рендера

**Чек-лист производительности:**

- [ ] Страница загружается < 3 сек
- [ ] Нет лагов при взаимодействии
- [ ] React DevTools: нет лишних ре-рендеров
- [ ] Memory: нет утечек памяти

#### Шаг 5: Автоматизированная проверка

Создайте `scripts/test-browser.js`:

```javascript
#!/usr/bin/env node

const { chromium } = require('playwright');

async function testAfterRefactoring() {
  console.log('🌐 Запуск браузерного тестирования...\n');
  
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Собираем ошибки консоли
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  
  // Собираем сетевые ошибки
  const networkErrors = [];
  page.on('response', response => {
    if (response.status() >= 400 && response.status() !== 404) {
      networkErrors.push({
        url: response.url(),
        status: response.status()
      });
    }
  });
  
  try {
    // Переход на страницу
    console.log('📍 Открытие http://localhost:3000...');
    await page.goto('http://localhost:3000', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    // Ждем загрузки React
    await page.waitForTimeout(2000);
    
    // Делаем скриншот
    await page.screenshot({ 
      path: 'test-results/after-refactoring.png',
      fullPage: true 
    });
    
    console.log('✅ Страница загружена\n');
    
    // Проверяем ошибки
    if (consoleErrors.length > 0) {
      console.log('❌ ОШИБКИ В КОНСОЛИ:\n');
      consoleErrors.forEach(err => console.log(`   ${err}`));
      console.log('');
    }
    
    if (networkErrors.length > 0) {
      console.log('❌ СЕТЕВЫЕ ОШИБКИ:\n');
      networkErrors.forEach(({ url, status }) => {
        console.log(`   ${status} - ${url}`);
      });
      console.log('');
    }
    
    if (consoleErrors.length === 0 && networkErrors.length === 0) {
      console.log('✅ Ошибок не найдено\n');
      console.log('📸 Скриншот: test-results/after-refactoring.png\n');
    } else {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('❌ Найдены ошибки после рефакторинга!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      await browser.close();
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error.message);
    await browser.close();
    process.exit(1);
  }
  
  await browser.close();
}

testAfterRefactoring();
```

Установка зависимостей:

```bash
npm install --save-dev playwright
npx playwright install chromium
```

Добавьте в `package.json`:

```json
{
  "scripts": {
    "test:browser": "node scripts/test-browser.js"
  }
}
```

#### Использование в процессе рефакторинга

```bash
# 1. Запустить dev сервер в отдельном терминале
npm start

# 2. После рефакторинга файла - запустить браузерный тест
npm run test:browser

# 3. Если ошибок нет - коммитить
git add -A
git commit -m "refactor: Component 500→280 строк"
```

---

## Автоматическое создание тасок для ИИ

### 📋 Workflow для ИИ-ассистента

После анализа этого документа ИИ должен:

#### 1. Проанализировать проект

```bash
# Найти все файлы >300 строк
find . -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" | \
  xargs wc -l | \
  awk '$1 > 300 {print $1, $2}' | \
  sort -rn > large-files.txt
```

#### 2. Создать таски для каждого файла

Для каждого файла >300 строк создать файл таски в `_docs/tasks/refactoring/`:

**Шаблон таски:** `REFACTOR_[ComponentName].md`

```markdown
# Рефакторинг: [ComponentName]

**Статус:** 🔴 Не начато

**Приоритет:** Высокий / Средний / Низкий

**Текущий размер:** [N] строк

**Целевой размер:** <300 строк

---

## Анализ файла

**Путь:** `path/to/ComponentName.jsx`

**Основные блоки кода:**
- [ ] Утилиты: ~[N] строк
- [ ] Расчеты: ~[N] строк  
- [ ] Хуки: ~[N] строк
- [ ] JSX компоненты: ~[N] строк
- [ ] useEffect: ~[N] строк

**Зависимости:**
- Импортирует: [список файлов]
- Используется в: [список компонентов]

---

## План рефакторинга

### Этап 1: Подготовка
- [ ] Создать ветку `refactor/component-name`
- [ ] Убедиться что все тесты проходят
- [ ] Создать структуру папок `ComponentName/`

### Этап 2: Вынос утилит
- [ ] Создать `utils.js`
- [ ] Перенести функции: [список]
- [ ] Обновить импорты
- [ ] **Тест:** `npm run build`
- [ ] **Тест:** `npm run test:browser`

### Этап 3: Вынос расчетов
- [ ] Создать `calculations.js`
- [ ] Перенести функции: [список]
- [ ] Обновить импорты
- [ ] **Тест:** `npm run build`
- [ ] **Тест:** `npm run test:browser`

### Этап 4: Вынос хуков
- [ ] Создать `useCustomHook.js`
- [ ] Перенести логику: [описание]
- [ ] Обновить компонент
- [ ] **Тест:** `npm run build`
- [ ] **Тест:** `npm run test:browser`

### Этап 5: Вынос компонентов
- [ ] Создать `SubComponent.jsx`
- [ ] Перенести JSX: [описание]
- [ ] Обновить основной компонент
- [ ] **Тест:** `npm run build`
- [ ] **Тест:** `npm run test:browser`

### Этап 6: Финализация
- [ ] Создать `index.js` с экспортами
- [ ] Удалить мертвый код
- [ ] Проверить размер: `wc -l ComponentName.jsx`
- [ ] **Тест:** `npm run build`
- [ ] **Тест:** `npm run test:browser`
- [ ] **Тест:** `npm run check-forbidden`
- [ ] **Тест:** `npm run lint`

---

## Чек-лист тестирования (ОБЯЗАТЕЛЬНО)

### ✅ Компиляция
- [ ] `npm run build` - успешен
- [ ] `npm run lint` - без ошибок
- [ ] Нет TypeScript ошибок

### ✅ Браузерное тестирование
- [ ] `npm start` - запускается без ошибок
- [ ] Console: нет ошибок (красных сообщений)
- [ ] Network: нет 500 ошибок
- [ ] Компонент отображается корректно
- [ ] Все интерактивные элементы работают
- [ ] Нет визуальных артефактов

### ✅ Функциональное тестирование
- [ ] Основной функционал работает
- [ ] Drag & Drop работает (если есть)
- [ ] Формы отправляются корректно
- [ ] Модальные окна открываются/закрываются
- [ ] Данные загружаются и отображаются

### ✅ Проверка кода
- [ ] `npm run check-file-size` - все файлы <300 строк
- [ ] `npm run check-forbidden` - нет запрещенных практик
- [ ] Нет mock данных
- [ ] Нет хардкода
- [ ] Нет console.log в production коде

### ✅ Документация
- [ ] Обновлены комментарии
- [ ] Создан `index.js` с описанием модуля
- [ ] Обновлен README (если нужно)

---

## Роль: Тестировщик

**Ответственный:** [ИИ-ассистент в роли Tester]

**Задачи:**
1. Запустить все автоматические тесты
2. Провести браузерное тестирование
3. Проверить консоль на ошибки
4. Проверить Network на ошибки
5. Протестировать весь функционал компонента
6. Заполнить чек-лист тестирования
7. Дать разрешение на коммит (✅ / ❌)

**Критерии приемки:**
- ✅ Все тесты проходят
- ✅ Нет ошибок в консоли
- ✅ Функционал работает полностью
- ✅ Все файлы <300 строк
- ✅ Нет запрещенных практик

---

## Коммит

```bash
git add -A
git commit -m "refactor: ComponentName [N]→[M] строк

✅ Созданы модули:
- utils.js ([N] строк)
- calculations.js ([N] строк)
- useCustomHook.js ([N] строк)
- SubComponent.jsx ([N] строк)

📉 -[N] строк (-[X]%)
✅ Build успешен
✅ Все тесты пройдены
✅ Браузерное тестирование: OK"
```

---

**Дата создания:** [дата]  
**Исполнитель:** [ИИ-ассистент]  
**Тестировщик:** [ИИ-ассистент в роли Tester]  
**Статус:** 🔴 Не начато → 🟡 В процессе → 🟢 Завершено
```

#### 3. Скрипт автоматического создания тасок

Создайте `scripts/create-refactoring-tasks.js`:

```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TASKS_DIR = '_docs/tasks/refactoring';

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  // Подсчет блоков
  let utilsLines = 0;
  let calculationsLines = 0;
  let hooksLines = 0;
  let jsxLines = 0;
  let effectsLines = 0;
  
  let inFunction = false;
  let inUseEffect = false;
  let inJSX = false;
  
  lines.forEach(line => {
    // Простая эвристика для определения блоков
    if (line.includes('function ') && !line.includes('return')) utilsLines++;
    if (line.includes('useMemo') || line.includes('calculate')) calculationsLines++;
    if (line.includes('useState') || line.includes('useCallback')) hooksLines++;
    if (line.includes('useEffect')) effectsLines++;
    if (line.includes('return (') || line.includes('<div')) jsxLines++;
  });
  
  return {
    total: lines.length,
    utils: utilsLines,
    calculations: calculationsLines,
    hooks: hooksLines,
    jsx: jsxLines,
    effects: effectsLines
  };
}

function getPriority(lineCount) {
  if (lineCount > 1000) return 'Высокий';
  if (lineCount > 500) return 'Средний';
  return 'Низкий';
}

function createTask(filePath, analysis) {
  const componentName = path.basename(filePath, path.extname(filePath));
  const taskFileName = `REFACTOR_${componentName}.md`;
  const taskPath = path.join(TASKS_DIR, taskFileName);
  
  const template = `# Рефакторинг: ${componentName}

**Статус:** 🔴 Не начато

**Приоритет:** ${getPriority(analysis.total)}

**Текущий размер:** ${analysis.total} строк

**Целевой размер:** <300 строк

---

## Анализ файла

**Путь:** \`${filePath}\`

**Основные блоки кода:**
- [ ] Утилиты: ~${analysis.utils} строк
- [ ] Расчеты: ~${analysis.calculations} строк  
- [ ] Хуки: ~${analysis.hooks} строк
- [ ] JSX компоненты: ~${analysis.jsx} строк
- [ ] useEffect: ~${analysis.effects} строк

**Зависимости:**
- Импортирует: [требуется анализ]
- Используется в: [требуется анализ]

---

## План рефакторинга

### Этап 1: Подготовка
- [ ] Создать ветку \`refactor/${componentName.toLowerCase()}\`
- [ ] Убедиться что все тесты проходят
- [ ] Создать структуру папок \`${componentName}/\`

### Этап 2: Вынос утилит
- [ ] Создать \`utils.js\`
- [ ] Перенести утилиты
- [ ] **Тест:** \`npm run build && npm run test:browser\`

### Этап 3: Вынос расчетов
- [ ] Создать \`calculations.js\`
- [ ] Перенести расчеты
- [ ] **Тест:** \`npm run build && npm run test:browser\`

### Этап 4: Вынос хуков
- [ ] Создать custom hooks
- [ ] **Тест:** \`npm run build && npm run test:browser\`

### Этап 5: Вынос компонентов
- [ ] Создать подкомпоненты
- [ ] **Тест:** \`npm run build && npm run test:browser\`

### Этап 6: Финализация
- [ ] Создать \`index.js\`
- [ ] Проверить размер: \`wc -l ${componentName}.jsx\`
- [ ] **Тест:** Полный чек-лист

---

## Чек-лист тестирования (ОБЯЗАТЕЛЬНО)

### ✅ Компиляция
- [ ] \`npm run build\` - успешен
- [ ] \`npm run lint\` - без ошибок

### ✅ Браузерное тестирование
- [ ] \`npm start\` - запускается
- [ ] Console: нет ошибок
- [ ] Network: нет 500 ошибок
- [ ] Компонент работает корректно

### ✅ Проверка кода
- [ ] \`npm run check-file-size\` - OK
- [ ] \`npm run check-forbidden\` - OK
- [ ] Нет mock данных
- [ ] Нет хардкода

---

## Роль: Тестировщик

**Задачи:**
1. Запустить все тесты
2. Браузерное тестирование
3. Проверить консоль
4. Протестировать функционал
5. Дать разрешение на коммит

**Критерии приемки:**
- ✅ Все тесты проходят
- ✅ Нет ошибок в консоли
- ✅ Функционал работает
- ✅ Все файлы <300 строк

---

**Дата создания:** ${new Date().toISOString().split('T')[0]}  
**Статус:** 🔴 Не начато
`;

  fs.writeFileSync(taskPath, template);
  return taskPath;
}

function main() {
  console.log('📋 Создание тасок для рефакторинга...\n');
  
  // Создаем директорию для тасок
  if (!fs.existsSync(TASKS_DIR)) {
    fs.mkdirSync(TASKS_DIR, { recursive: true });
  }
  
  // Находим все большие файлы
  const output = execSync(
    'find . -type f \\( -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" \\) ! -path "*/node_modules/*" ! -path "*/build/*"',
    { encoding: 'utf8' }
  );
  
  const files = output.trim().split('\n').filter(Boolean);
  const largeFiles = [];
  
  files.forEach(file => {
    const lineCount = execSync(`wc -l < "${file}"`, { encoding: 'utf8' }).trim();
    if (parseInt(lineCount) > 300) {
      largeFiles.push({ path: file, lines: parseInt(lineCount) });
    }
  });
  
  if (largeFiles.length === 0) {
    console.log('✅ Все файлы соответствуют лимиту 300 строк\n');
    return;
  }
  
  // Сортируем по размеру (самые большие первыми)
  largeFiles.sort((a, b) => b.lines - a.lines);
  
  console.log(`Найдено ${largeFiles.length} файлов для рефакторинга:\n`);
  
  const createdTasks = [];
  
  largeFiles.forEach(({ path: filePath, lines }) => {
    console.log(`📄 ${filePath}: ${lines} строк`);
    const analysis = analyzeFile(filePath);
    const taskPath = createTask(filePath, analysis);
    createdTasks.push(taskPath);
  });
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Создано ${createdTasks.length} тасок`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📁 Таски находятся в:', TASKS_DIR);
  console.log('\n📖 Следующие шаги:');
  console.log('   1. Просмотрите созданные таски');
  console.log('   2. Назначьте приоритеты');
  console.log('   3. Начните рефакторинг с самых больших файлов\n');
}

main();
```

Добавьте в `package.json`:

```json
{
  "scripts": {
    "create-tasks": "node scripts/create-refactoring-tasks.js"
  }
}
```

#### 4. Использование

```bash
# Создать таски для всех больших файлов
npm run create-tasks

# Результат: созданы файлы в _docs/tasks/refactoring/
# - REFACTOR_StrikeScale.md
# - REFACTOR_OptionsBoard.md
# - REFACTOR_Calculator.md
# ...
```

#### 5. Workflow для ИИ

После запуска `npm run create-tasks` ИИ-ассистент должен:

1. **Прочитать все созданные таски**
2. **Отсортировать по приоритету**
3. **Для каждой таски:**
   - Переключиться в роль **Developer**
   - Выполнить рефакторинг по плану
   - Переключиться в роль **Tester**
   - Выполнить полный чек-лист тестирования
   - Дать разрешение на коммит
   - Обновить статус таски: 🔴 → 🟡 → 🟢

---

## FAQ

### Q: Что делать если файл calculations.js получился 348 строк?

**A:** Есть несколько вариантов:
1. Разбить на `calculations/index.js` + подмодули
2. Вынести вспомогательные функции в `calculationHelpers.js`
3. Если это чистые независимые функции - оставить как есть (348 близко к 300)

### Q: Нужно ли разбивать файлы с константами?

**A:** Нет, если это просто список констант. Правило 300 строк не применяется к:
- Конфигурационным файлам
- Файлам с константами/справочниками
- Автогенерируемым файлам

### Q: Как быть с legacy кодом?

**A:** Рефакторить постепенно:
1. Начать с самых проблемных файлов
2. Рефакторить при внесении изменений (Boy Scout Rule)
3. Выделить время на технический долг (10-20% спринта)

### Q: Что если после рефакторинга появились баги?

**A:** Это нормально. Поэтому важно:
1. Делать рефакторинг в отдельной ветке
2. Тщательно тестировать после каждого шага
3. Делать маленькие коммиты
4. Использовать git bisect для поиска проблемы

### Q: Как убедить команду следовать правилу 300 строк?

**A:** 
1. Показать преимущества на примере
2. Настроить автоматические проверки (CI/CD)
3. Включить в Definition of Done
4. Проводить code review с фокусом на модульность

---

## Полезные команды

```bash
# Найти все большие файлы
find . -name "*.js" -o -name "*.jsx" | xargs wc -l | awk '$1 > 300' | sort -rn

# Проверить один файл
wc -l path/to/file.js

# Запустить локальную проверку
npm run check-file-size

# Установить pre-commit hook
npx husky add .husky/pre-commit "npm run check-file-size"

# Проверить build после рефакторинга
npm run build

# Запустить тесты
npm test

# Проверить линтер
npm run lint
```

---

## Заключение

Модульный код - это не просто правило, а **инвестиция в будущее проекта**:

- ✅ Легче поддерживать
- ✅ Проще онбордить новых разработчиков
- ✅ Меньше багов
- ✅ Быстрее разработка
- ✅ Лучше работа с ИИ-ассистентами

**Правило 300 строк** - это не ограничение, а **инструмент для написания качественного кода**.

---

## Дополнительные ресурсы

- [Clean Code by Robert Martin](https://www.amazon.com/Clean-Code-Handbook-Software-Craftsmanship/dp/0132350882)
- [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)
- [Refactoring by Martin Fowler](https://refactoring.com/)
- [React Patterns](https://reactpatterns.com/)

---

**Версия документа:** 1.0  
**Дата создания:** 21.12.2024  
**Автор:** Команда разработки  
**Статус:** ✅ Утверждено
