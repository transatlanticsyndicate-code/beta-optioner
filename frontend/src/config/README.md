# Конфигурация блоков Options Calculator

## Описание

Файл `calculatorBlocks.js` позволяет управлять отображением блоков на странице Options Calculator.

## Структура конфигурации

Блоки разделены на три позиции:
- **header** - блоки в шапке страницы
- **left** - блоки в левой колонке (640px)
- **right** - блоки в правой колонке (flex)

### Параметры блока

```javascript
{
  id: 'block-id',              // Уникальный идентификатор
  name: 'Название блока',      // Название для UI
  component: 'ComponentName',  // Имя React компонента
  enabled: true,               // Включен/выключен
  order: 1,                    // Порядок отображения
  required: false,             // Обязательный блок (опционально)
  requiresTicker: false,       // Показывать только если выбран тикер (опционально)
  description: 'Описание'      // Описание блока
}
```

## Как включить/отключить блок

1. Откройте файл `frontend/src/config/calculatorBlocks.js`
2. Найдите нужный блок по `id`
3. Измените параметр `enabled`:
   - `true` - блок отображается
   - `false` - блок скрыт

### Пример

```javascript
{
  id: 'ai-chat',
  name: 'AI чат-ассистент',
  component: 'AIChat',
  enabled: false,  // ← Отключить AI чат
  order: 3,
  description: 'Помощник для анализа позиций и стратегий'
}
```

## Как изменить порядок блоков

Измените параметр `order` у блоков. Блоки сортируются по возрастанию.

### Пример

Чтобы поменять местами "График P&L" и "Сводка по позициям":

```javascript
// Было:
{ id: 'position-summary', order: 1 }
{ id: 'pl-chart', order: 2 }

// Стало:
{ id: 'position-summary', order: 2 }
{ id: 'pl-chart', order: 1 }
```

## Список всех блоков

### Header
- `commission-settings` - Настройки комиссий

### Left Column
- `ticker-selector` - Выбор тикера (обязательный)
- `strategy-presets` - Готовые стратегии
- `position-form` - Форма добавления позиции
- `positions-list` - Список позиций

### Right Column
- `position-summary` - Сводка по позициям
- `pl-chart` - График P&L
- `ai-chat` - AI чат-ассистент

## API функции

### getActiveBlocks(position)
Возвращает активные блоки для указанной позиции.

```javascript
import { getActiveBlocks } from '../config/calculatorBlocks';

const leftBlocks = getActiveBlocks('left');
```

### isBlockEnabled(blockId)
Проверяет, включен ли блок.

```javascript
import { isBlockEnabled } from '../config/calculatorBlocks';

if (isBlockEnabled('ai-chat')) {
  // AI чат включен
}
```

### getBlockById(blockId)
Получает объект блока по ID.

```javascript
import { getBlockById } from '../config/calculatorBlocks';

const block = getBlockById('ai-chat');
console.log(block.name); // "AI чат-ассистент"
```

### getAllBlocks()
Возвращает все блоки (для UI управления).

```javascript
import { getAllBlocks } from '../config/calculatorBlocks';

const allBlocks = getAllBlocks();
```

## Примечания

- Блок `ticker-selector` помечен как `required: true` - его нельзя отключить
- Блоки с `requiresTicker: true` показываются только после выбора тикера
- Изменения в конфиге применяются сразу после перезагрузки страницы
- Не забудьте сохранить файл после изменений
