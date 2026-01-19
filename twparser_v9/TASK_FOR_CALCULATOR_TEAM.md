# Задача для команды калькулятора: Интеграция с расширением TradingView Parser v9

## Цель

Добавить в калькулятор кнопку **"Загрузить цепочку опционов"**, которая запускает сбор данных через Chrome-расширение.

---

## Как это работает

```
Калькулятор                    Расширение                    TradingView
     │                              │                              │
     │  1. Записать команду         │                              │
     │  в localStorage              │                              │
     │ ─────────────────────────────>                              │
     │                              │                              │
     │                              │  2. Открыть вкладку          │
     │                              │ ─────────────────────────────>
     │                              │                              │
     │                              │  3. Собрать данные           │
     │                              │ <─────────────────────────────
     │                              │                              │
     │  4. Получить данные          │                              │
     │  из localStorage             │                              │
     │ <─────────────────────────────                              │
     │                              │                              │
```

---

## Шаг 1: Запуск сбора данных

Когда пользователь нажимает кнопку, записать команду в `localStorage`:

```typescript
function startOptionsChainCollection(ticker: string) {
  // Записываем команду для расширения
  localStorage.setItem('tvc_command', JSON.stringify({
    action: 'collectFullChain',
    ticker: ticker,              // Например: 'ESM2026', 'ESH2026'
    maxExpirations: 10,          // Опционально: сколько экспираций собрать (1-20)
    timestamp: Date.now()        // Обязательно: для уникальности
  }));
}
```

### Параметры команды:

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `action` | `'collectFullChain'` | ✅ | Тип команды |
| `ticker` | `string` | ✅ | Тикер контракта: `'ESM2026'`, `'ESH2026'` |
| `maxExpirations` | `number` | ❌ | Лимит экспираций (по умолчанию 5, макс 20) |
| `timestamp` | `number` | ✅ | `Date.now()` |

---

## Шаг 2: Отслеживание статуса

Расширение обновляет статус в `localStorage.tvc_status`:

```typescript
interface TVCStatus {
  status: 'idle' | 'collecting' | 'completed' | 'error';
  progress: number;              // 0-100
  currentExpiration: string;     // "Mar 20"
  totalExpirations: number;      // 5
  collectedExpirations: number;  // 2
  totalOptions: number;          // 40
  error: string | null;          // Сообщение об ошибке
  timestamp: number;             // Date.now()
}

// Слушаем изменения
useEffect(() => {
  const handleStorage = (e: StorageEvent) => {
    if (e.key === 'tvc_status' && e.newValue) {
      const status: TVCStatus = JSON.parse(e.newValue);
      setCollectionStatus(status);
    }
  };
  
  window.addEventListener('storage', handleStorage);
  return () => window.removeEventListener('storage', handleStorage);
}, []);
```

---

## Шаг 3: Получение данных

После завершения сбора данные появляются в `localStorage.tvc_full_chain`:

```typescript
interface TVCFullChain {
  collectedAt: string;           // ISO timestamp
  ticker: string;                // "ESM2026"
  expirations: TVCExpiration[];
}

interface TVCExpiration {
  date: string;                  // "Mar 20"
  dateCode: string;              // "20260320"
  options: TVCOption[];
}

interface TVCOption {
  type: 'CALL' | 'PUT';
  strike: number;                // 6950
  expiration: string;            // "Mar 20"
  expirationISO: string;         // "2026-03-20"
  bid: number;                   // 224.5
  ask: number;                   // 226.0
  price: number;                 // 225.25
  volume: number;                // 1234
  iv: number;                    // 14.1 (процент)
  delta: number;                 // 0.61
  gamma: number;                 // 0.0009
  theta: number;                 // -1.29
  vega: number;                  // 11.24
  rho: number;                   // 7.08
}

// Слушаем данные
useEffect(() => {
  const handleStorage = (e: StorageEvent) => {
    if (e.key === 'tvc_full_chain' && e.newValue) {
      const data: TVCFullChain = JSON.parse(e.newValue);
      setOptionsChainData(data);
    }
  };
  
  window.addEventListener('storage', handleStorage);
  return () => window.removeEventListener('storage', handleStorage);
}, []);
```

---

## Полный пример React-компонента

```tsx
import { useState, useEffect } from 'react';

interface TVCStatus {
  status: 'idle' | 'collecting' | 'completed' | 'error';
  progress: number;
  currentExpiration: string;
  totalExpirations: number;
  collectedExpirations: number;
  totalOptions: number;
  error: string | null;
  timestamp: number;
}

interface TVCFullChain {
  collectedAt: string;
  ticker: string;
  expirations: {
    date: string;
    dateCode: string;
    options: {
      type: 'CALL' | 'PUT';
      strike: number;
      bid: number;
      ask: number;
      iv: number;
      delta: number;
      gamma: number;
      theta: number;
      vega: number;
    }[];
  }[];
}

export function OptionsChainLoader({ ticker }: { ticker: string }) {
  const [status, setStatus] = useState<TVCStatus | null>(null);
  const [chainData, setChainData] = useState<TVCFullChain | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Слушаем изменения localStorage
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'tvc_status' && e.newValue) {
        const data = JSON.parse(e.newValue);
        setStatus(data);
        setIsLoading(data.status === 'collecting');
      }
      
      if (e.key === 'tvc_full_chain' && e.newValue) {
        const data = JSON.parse(e.newValue);
        setChainData(data);
        setIsLoading(false);
      }
    };

    window.addEventListener('storage', handleStorage);
    
    // Проверяем начальное состояние
    const existingData = localStorage.getItem('tvc_full_chain');
    if (existingData) {
      setChainData(JSON.parse(existingData));
    }
    
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Запуск сбора
  const startCollection = () => {
    setIsLoading(true);
    setStatus(null);
    
    localStorage.setItem('tvc_command', JSON.stringify({
      action: 'collectFullChain',
      ticker: ticker,
      maxExpirations: 10,
      timestamp: Date.now()
    }));
  };

  // Подсчёт опционов
  const totalOptions = chainData?.expirations.reduce(
    (sum, exp) => sum + exp.options.length, 0
  ) || 0;

  return (
    <div className="options-chain-loader">
      {/* Кнопка запуска */}
      {!isLoading && (
        <button 
          onClick={startCollection}
          className="btn-primary"
          disabled={!ticker}
        >
          📊 Загрузить цепочку опционов
        </button>
      )}

      {/* Прогресс */}
      {isLoading && status && (
        <div className="progress-container">
          <div 
            className="progress-bar" 
            style={{ width: `${status.progress}%` }}
          />
          <span className="progress-text">
            {status.currentExpiration} ({status.collectedExpirations}/{status.totalExpirations})
          </span>
          <span className="progress-options">
            {status.totalOptions} опционов
          </span>
        </div>
      )}

      {/* Ошибка */}
      {status?.status === 'error' && (
        <div className="error-message">
          ⚠️ {status.error}
          <button onClick={startCollection}>Повторить</button>
        </div>
      )}

      {/* Результат */}
      {chainData && !isLoading && (
        <div className="chain-info">
          ✅ {chainData.ticker}: {chainData.expirations.length} экспираций, {totalOptions} опционов
          <span className="collected-at">
            {new Date(chainData.collectedAt).toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}
```

---

## Важные замечания

### 1. Мгновенная реакция
Расширение реагирует на команду **мгновенно** через `StorageEvent` — не нужно ждать polling.

### 2. Расширение должно быть установлено
Если расширение не установлено, команда просто останется в localStorage. Можно проверить наличие расширения:

```typescript
// Проверка через наличие данных от расширения
const isExtensionInstalled = () => {
  // Если расширение работает, оно обновляет tvc_status
  const status = localStorage.getItem('tvc_status');
  if (status) {
    const data = JSON.parse(status);
    // Проверяем что данные свежие (менее 5 минут)
    return Date.now() - data.timestamp < 5 * 60 * 1000;
  }
  return false;
};
```

### 2. Пользователь должен быть на странице калькулятора
Расширение работает только когда открыта вкладка калькулятора (`localhost:3000` или `futures.optioner.online`).

### 3. Cooldown между сборами
Расширение имеет cooldown 30 секунд между сборами. Если пользователь нажмёт кнопку слишком быстро, сбор не начнётся.

### 4. Лимит экспираций
По умолчанию собирается 5 экспираций. Максимум — 20. Больше = дольше и выше риск бана.

---

## Тестирование

1. Установи расширение из папки `twparser_v9`
2. Открой калькулятор
3. В консоли выполни:
```javascript
localStorage.setItem('tvc_command', JSON.stringify({
  action: 'collectFullChain',
  ticker: 'ESM2026',
  maxExpirations: 3,
  timestamp: Date.now()
}));
```
4. Расширение откроет TradingView и начнёт сбор
5. Через ~15-30 сек данные появятся в `localStorage.tvc_full_chain`

---

## Контакты

Вопросы по интеграции → обращайтесь к команде расширения.
