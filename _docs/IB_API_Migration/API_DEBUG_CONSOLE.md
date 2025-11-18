# 🔍 API Debug Console - Инструмент для тестирования IB API

**Цель:** Визуальная консоль для мониторинга всех запросов к IB API в реальном времени  
**Назначение:** Упростить тестирование и отладку интеграции

---

## 💡 Концепция

Маленькое окошко (консоль), которое показывает:
- ✅ Какие данные загружаются
- ✅ Тип события/запроса
- ✅ Статус (успех/ошибка)
- ✅ Время выполнения
- ✅ Размер данных

**Визуально:**
```
┌─────────────────────────────────────────────────┐
│  🔍 IB API Debug Console                    [×] │
├─────────────────────────────────────────────────┤
│ 10:15:23 ✅ GET_STOCK_PRICE                     │
│          → Ticker: SPY                          │
│          ← Price: $459.80 (120ms)               │
│                                                 │
│ 10:15:24 ✅ GET_EXPIRATION_DATES                │
│          → Ticker: SPY                          │
│          ← 45 dates loaded (850ms)              │
│                                                 │
│ 10:15:25 ✅ GET_OPTIONS_CHAIN                   │
│          → SPY, 2025-10-31                      │
│          ← 156 contracts (1.2s, 45KB)           │
│                                                 │
│ 10:15:26 ❌ GET_GREEKS                          │
│          → Contract: SPY251031C00450000         │
│          ✗ Error: No subscription (500ms)       │
└─────────────────────────────────────────────────┘
```

---

## 🎯 Функциональность

### 1. **Логирование событий**
Каждый запрос к IB API логируется с деталями:

```javascript
{
  timestamp: "10:15:23",
  type: "GET_STOCK_PRICE",
  status: "success",
  request: {
    ticker: "SPY"
  },
  response: {
    price: 459.80,
    change: 2.30
  },
  duration: 120,  // ms
  dataSize: 256   // bytes
}
```

### 2. **Фильтры**
- По типу события (цены, опционы, Greeks, и т.д.)
- По статусу (успех/ошибка)
- По тикеру
- По времени

### 3. **Статистика**
```
┌─────────────────────────────────────┐
│ 📊 Статистика за сессию             │
├─────────────────────────────────────┤
│ Всего запросов:        47           │
│ Успешных:              45 (95.7%)   │
│ Ошибок:                2  (4.3%)    │
│ Средняя скорость:      450ms        │
│ Общий трафик:          2.3 MB       │
└─────────────────────────────────────┘
```

### 4. **Экспорт логов**
- Сохранить в JSON
- Сохранить в CSV
- Скопировать в буфер обмена

---

## 🛠️ Реализация

### Вариант 1: Встроенная консоль в UI (рекомендую)

**Где:** Отдельная вкладка в Developer Tools или плавающее окно

**Технологии:**
- React компонент
- WebSocket для real-time обновлений
- LocalStorage для сохранения логов

**Файлы:**
```
/frontend/src/components/DebugConsole/
  ├── DebugConsole.jsx       # Главный компонент
  ├── EventLog.jsx           # Список событий
  ├── EventDetails.jsx       # Детали события
  ├── Filters.jsx            # Фильтры
  ├── Statistics.jsx         # Статистика
  └── DebugConsole.css       # Стили
```

---

### Вариант 2: Standalone приложение

**Отдельное окно Electron или веб-приложение**

**Плюсы:**
- Не загромождает основной UI
- Можно держать на втором мониторе
- Независимое от основного приложения

**Минусы:**
- Дополнительная разработка
- Нужен отдельный сервер для логов

---

## 📝 Детальная спецификация

### Backend: Логирование API запросов

**Создать `/backend/app/utils/api_logger.py`:**

```python
"""
API Logger для отладки IB API запросов
"""

import time
import json
from datetime import datetime
from typing import Dict, Any, Optional
from enum import Enum

class EventType(Enum):
    """Типы событий API"""
    GET_STOCK_PRICE = "GET_STOCK_PRICE"
    GET_EXPIRATION_DATES = "GET_EXPIRATION_DATES"
    GET_OPTIONS_CHAIN = "GET_OPTIONS_CHAIN"
    GET_GREEKS = "GET_GREEKS"
    GET_HISTORICAL_DATA = "GET_HISTORICAL_DATA"
    PLACE_ORDER = "PLACE_ORDER"
    GET_POSITIONS = "GET_POSITIONS"
    WEBSOCKET_MESSAGE = "WEBSOCKET_MESSAGE"

class APILogger:
    """Логгер для API запросов"""
    
    def __init__(self):
        self.events = []
        self.max_events = 1000  # Хранить последние 1000 событий
    
    def log_event(
        self,
        event_type: EventType,
        request_data: Dict[str, Any],
        response_data: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
        duration_ms: Optional[int] = None,
        data_size: Optional[int] = None
    ):
        """Залогировать событие API"""
        
        event = {
            "id": len(self.events) + 1,
            "timestamp": datetime.now().isoformat(),
            "type": event_type.value,
            "status": "error" if error else "success",
            "request": request_data,
            "response": response_data,
            "error": error,
            "duration_ms": duration_ms,
            "data_size": data_size
        }
        
        self.events.append(event)
        
        # Ограничить размер лога
        if len(self.events) > self.max_events:
            self.events.pop(0)
        
        # Отправить через WebSocket (если подключен)
        self._broadcast_event(event)
        
        return event
    
    def _broadcast_event(self, event: Dict):
        """Отправить событие через WebSocket"""
        # TODO: Implement WebSocket broadcast
        pass
    
    def get_events(
        self,
        event_type: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100
    ):
        """Получить события с фильтрами"""
        
        filtered = self.events
        
        if event_type:
            filtered = [e for e in filtered if e["type"] == event_type]
        
        if status:
            filtered = [e for e in filtered if e["status"] == status]
        
        return filtered[-limit:]
    
    def get_statistics(self):
        """Получить статистику"""
        
        total = len(self.events)
        success = len([e for e in self.events if e["status"] == "success"])
        errors = total - success
        
        durations = [e["duration_ms"] for e in self.events if e["duration_ms"]]
        avg_duration = sum(durations) / len(durations) if durations else 0
        
        data_sizes = [e["data_size"] for e in self.events if e["data_size"]]
        total_traffic = sum(data_sizes) if data_sizes else 0
        
        return {
            "total_requests": total,
            "successful": success,
            "errors": errors,
            "success_rate": (success / total * 100) if total > 0 else 0,
            "avg_duration_ms": round(avg_duration, 2),
            "total_traffic_bytes": total_traffic
        }
    
    def clear(self):
        """Очистить все события"""
        self.events = []

# Глобальный экземпляр логгера
api_logger = APILogger()
```

---

### Декоратор для автоматического логирования

**В том же файле:**

```python
from functools import wraps
import sys

def log_api_call(event_type: EventType):
    """Декоратор для автоматического логирования API вызовов"""
    
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            
            # Извлечь параметры запроса
            request_data = {
                "args": args[1:],  # Пропустить self
                "kwargs": kwargs
            }
            
            try:
                # Выполнить функцию
                result = func(*args, **kwargs)
                
                # Рассчитать метрики
                duration_ms = int((time.time() - start_time) * 1000)
                data_size = sys.getsizeof(json.dumps(result)) if result else 0
                
                # Залогировать успех
                api_logger.log_event(
                    event_type=event_type,
                    request_data=request_data,
                    response_data=result,
                    duration_ms=duration_ms,
                    data_size=data_size
                )
                
                return result
                
            except Exception as e:
                # Залогировать ошибку
                duration_ms = int((time.time() - start_time) * 1000)
                
                api_logger.log_event(
                    event_type=event_type,
                    request_data=request_data,
                    error=str(e),
                    duration_ms=duration_ms
                )
                
                raise
        
        return wrapper
    return decorator
```

---

### Использование в IB Client

**Обновить `/backend/app/services/ib_client.py`:**

```python
from app.utils.api_logger import log_api_call, EventType

class IBClient:
    
    @log_api_call(EventType.GET_STOCK_PRICE)
    def get_stock_price(self, ticker: str) -> Dict:
        """Получить цену акции (с автоматическим логированием)"""
        # ... существующий код ...
        pass
    
    @log_api_call(EventType.GET_EXPIRATION_DATES)
    def get_expiration_dates(self, ticker: str) -> List[str]:
        """Получить даты экспирации (с автоматическим логированием)"""
        # ... существующий код ...
        pass
    
    @log_api_call(EventType.GET_OPTIONS_CHAIN)
    def get_options_chain(self, ticker: str, expiration_date: str) -> List[Dict]:
        """Получить опционную цепочку (с автоматическим логированием)"""
        # ... существующий код ...
        pass
```

---

### API Endpoints для консоли

**Создать `/backend/app/routers/debug.py`:**

```python
from fastapi import APIRouter, WebSocket
from app.utils.api_logger import api_logger

router = APIRouter(prefix="/api/debug", tags=["debug"])

@router.get("/events")
async def get_events(
    event_type: str = None,
    status: str = None,
    limit: int = 100
):
    """Получить события с фильтрами"""
    events = api_logger.get_events(event_type, status, limit)
    return {"status": "success", "events": events}

@router.get("/statistics")
async def get_statistics():
    """Получить статистику"""
    stats = api_logger.get_statistics()
    return {"status": "success", "statistics": stats}

@router.delete("/events")
async def clear_events():
    """Очистить все события"""
    api_logger.clear()
    return {"status": "success", "message": "Events cleared"}

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket для real-time обновлений"""
    await websocket.accept()
    
    # TODO: Implement real-time event streaming
    try:
        while True:
            # Ждать новых событий и отправлять их
            await websocket.receive_text()
    except:
        pass
```

**Подключить в `main.py`:**
```python
from app.routers import debug

app.include_router(debug.router)
```

---

### Frontend: Debug Console компонент

**Создать `/frontend/src/components/DebugConsole/DebugConsole.jsx`:**

```javascript
import React, { useState, useEffect } from 'react';
import './DebugConsole.css';

function DebugConsole({ isOpen, onClose }) {
  const [events, setEvents] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [filter, setFilter] = useState({
    type: 'all',
    status: 'all'
  });

  // Загрузить события
  useEffect(() => {
    if (isOpen) {
      fetchEvents();
      fetchStatistics();
      
      // Обновлять каждые 2 секунды
      const interval = setInterval(() => {
        fetchEvents();
        fetchStatistics();
      }, 2000);
      
      return () => clearInterval(interval);
    }
  }, [isOpen, filter]);

  const fetchEvents = async () => {
    try {
      const params = new URLSearchParams();
      if (filter.type !== 'all') params.append('event_type', filter.type);
      if (filter.status !== 'all') params.append('status', filter.status);
      
      const response = await fetch(`/api/debug/events?${params}`);
      const data = await response.json();
      setEvents(data.events || []);
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  };

  const fetchStatistics = async () => {
    try {
      const response = await fetch('/api/debug/statistics');
      const data = await response.json();
      setStatistics(data.statistics);
    } catch (error) {
      console.error('Error fetching statistics:', error);
    }
  };

  const clearEvents = async () => {
    try {
      await fetch('/api/debug/events', { method: 'DELETE' });
      setEvents([]);
      fetchStatistics();
    } catch (error) {
      console.error('Error clearing events:', error);
    }
  };

  const exportToJSON = () => {
    const dataStr = JSON.stringify(events, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `api-debug-${Date.now()}.json`;
    link.click();
  };

  if (!isOpen) return null;

  return (
    <div className="debug-console">
      <div className="console-header">
        <h3>🔍 IB API Debug Console</h3>
        <button onClick={onClose} className="close-btn">×</button>
      </div>

      {/* Статистика */}
      {statistics && (
        <div className="console-stats">
          <div className="stat-item">
            <span className="stat-label">Всего:</span>
            <span className="stat-value">{statistics.total_requests}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Успешных:</span>
            <span className="stat-value success">
              {statistics.successful} ({statistics.success_rate.toFixed(1)}%)
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Ошибок:</span>
            <span className="stat-value error">{statistics.errors}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Средняя скорость:</span>
            <span className="stat-value">{statistics.avg_duration_ms}ms</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Трафик:</span>
            <span className="stat-value">
              {(statistics.total_traffic_bytes / 1024).toFixed(1)} KB
            </span>
          </div>
        </div>
      )}

      {/* Фильтры */}
      <div className="console-filters">
        <select 
          value={filter.type} 
          onChange={(e) => setFilter({...filter, type: e.target.value})}
        >
          <option value="all">Все типы</option>
          <option value="GET_STOCK_PRICE">Цены акций</option>
          <option value="GET_EXPIRATION_DATES">Даты экспирации</option>
          <option value="GET_OPTIONS_CHAIN">Опционная цепочка</option>
          <option value="GET_GREEKS">Greeks</option>
        </select>

        <select 
          value={filter.status} 
          onChange={(e) => setFilter({...filter, status: e.target.value})}
        >
          <option value="all">Все статусы</option>
          <option value="success">Успешные</option>
          <option value="error">Ошибки</option>
        </select>

        <button onClick={clearEvents} className="btn-clear">
          🗑️ Очистить
        </button>
        <button onClick={exportToJSON} className="btn-export">
          💾 Экспорт
        </button>
      </div>

      {/* Лог событий */}
      <div className="console-events">
        {events.length === 0 ? (
          <div className="no-events">Нет событий</div>
        ) : (
          events.map((event) => (
            <div 
              key={event.id} 
              className={`event-item ${event.status}`}
            >
              <div className="event-header">
                <span className="event-time">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
                <span className={`event-status ${event.status}`}>
                  {event.status === 'success' ? '✅' : '❌'}
                </span>
                <span className="event-type">{event.type}</span>
                <span className="event-duration">{event.duration_ms}ms</span>
              </div>
              
              <div className="event-details">
                <div className="event-request">
                  → {JSON.stringify(event.request)}
                </div>
                {event.response && (
                  <div className="event-response">
                    ← {JSON.stringify(event.response).substring(0, 100)}...
                  </div>
                )}
                {event.error && (
                  <div className="event-error">
                    ✗ {event.error}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default DebugConsole;
```

---

### CSS стили

**Создать `/frontend/src/components/DebugConsole/DebugConsole.css`:**

```css
.debug-console {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 500px;
  max-height: 600px;
  background: #1e1e1e;
  color: #d4d4d4;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  z-index: 10000;
}

.console-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #2d2d2d;
  border-bottom: 1px solid #3e3e3e;
  border-radius: 8px 8px 0 0;
}

.console-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  color: #d4d4d4;
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
}

.close-btn:hover {
  color: #ff6b6b;
}

.console-stats {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  background: #252525;
  border-bottom: 1px solid #3e3e3e;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-label {
  font-size: 10px;
  color: #888;
  text-transform: uppercase;
}

.stat-value {
  font-size: 14px;
  font-weight: 600;
}

.stat-value.success {
  color: #4ade80;
}

.stat-value.error {
  color: #f87171;
}

.console-filters {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  background: #2d2d2d;
  border-bottom: 1px solid #3e3e3e;
}

.console-filters select,
.console-filters button {
  padding: 6px 12px;
  background: #3e3e3e;
  border: 1px solid #4e4e4e;
  color: #d4d4d4;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
}

.console-filters select:hover,
.console-filters button:hover {
  background: #4e4e4e;
}

.console-events {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.no-events {
  text-align: center;
  padding: 40px;
  color: #666;
}

.event-item {
  margin-bottom: 8px;
  padding: 8px;
  background: #2d2d2d;
  border-left: 3px solid #4ade80;
  border-radius: 4px;
}

.event-item.error {
  border-left-color: #f87171;
}

.event-header {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}

.event-time {
  color: #888;
  font-size: 11px;
}

.event-status {
  font-size: 14px;
}

.event-type {
  color: #60a5fa;
  font-weight: 600;
  flex: 1;
}

.event-duration {
  color: #a78bfa;
  font-size: 11px;
}

.event-details {
  font-size: 11px;
  line-height: 1.5;
}

.event-request {
  color: #fbbf24;
}

.event-response {
  color: #4ade80;
}

.event-error {
  color: #f87171;
}

/* Scrollbar */
.console-events::-webkit-scrollbar {
  width: 8px;
}

.console-events::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.console-events::-webkit-scrollbar-thumb {
  background: #4e4e4e;
  border-radius: 4px;
}

.console-events::-webkit-scrollbar-thumb:hover {
  background: #5e5e5e;
}
```

---

### Интеграция в приложение

**Обновить `/frontend/src/App.js`:**

```javascript
import React, { useState } from 'react';
import DebugConsole from './components/DebugConsole/DebugConsole';

function App() {
  const [isDebugOpen, setIsDebugOpen] = useState(false);

  return (
    <div className="App">
      {/* Существующий код */}
      
      {/* Кнопка для открытия консоли */}
      <button 
        className="debug-toggle"
        onClick={() => setIsDebugOpen(!isDebugOpen)}
        title="Debug Console"
      >
        🔍
      </button>

      {/* Debug Console */}
      <DebugConsole 
        isOpen={isDebugOpen} 
        onClose={() => setIsDebugOpen(false)} 
      />
    </div>
  );
}
```

**Добавить стили для кнопки в `App.css`:**

```css
.debug-toggle {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: #667eea;
  border: none;
  font-size: 24px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 9999;
  transition: all 0.3s;
}

.debug-toggle:hover {
  background: #764ba2;
  transform: scale(1.1);
}
```

---

## 🎯 Использование

### Для разработчика:

1. **Запустить приложение**
2. **Нажать кнопку 🔍** в правом нижнем углу
3. **Консоль откроется** и начнет показывать все API запросы
4. **Выполнить действия** в приложении (загрузить опционы, и т.д.)
5. **Наблюдать** за запросами в реальном времени

### Примеры использования:

**Тест 1: Загрузка цены акции**
```
10:15:23 ✅ GET_STOCK_PRICE
         → {"ticker": "SPY"}
         ← {"price": 459.80, "change": 2.30} (120ms)
```

**Тест 2: Загрузка опционной цепочки**
```
10:15:25 ✅ GET_OPTIONS_CHAIN
         → {"ticker": "SPY", "expiration_date": "2025-10-31"}
         ← 156 contracts loaded (1.2s, 45KB)
```

**Тест 3: Ошибка подписки**
```
10:15:26 ❌ GET_GREEKS
         → {"contract_id": "SPY251031C00450000"}
         ✗ Error: No market data subscription (500ms)
```

---

## 📊 Преимущества

✅ **Визуальный мониторинг** - видно все запросы в реальном времени  
✅ **Быстрая отладка** - сразу видно где ошибка  
✅ **Статистика** - понимание производительности  
✅ **Экспорт логов** - можно сохранить для анализа  
✅ **Фильтры** - легко найти нужные события  
✅ **Не требует консоли браузера** - удобный UI  

---

## 🚀 Дополнительные фичи (опционально)

### 1. **WebSocket для real-time**
Вместо polling каждые 2 секунды → WebSocket для мгновенных обновлений

### 2. **Графики производительности**
Визуализация времени выполнения запросов

### 3. **Алерты**
Уведомления при ошибках или медленных запросах

### 4. **Сравнение с Polygon**
Side-by-side сравнение данных IB vs Polygon

### 5. **Replay режим**
Воспроизведение последовательности запросов для тестирования

---

## 📝 Следующие шаги

1. ✅ Создать `api_logger.py`
2. ✅ Добавить декораторы в `ib_client.py`
3. ✅ Создать API endpoints `/api/debug/*`
4. ✅ Создать React компонент `DebugConsole`
5. ✅ Интегрировать в `App.js`
6. ✅ Протестировать на Paper Account

**Время реализации: 4-6 часов**

---

Этот инструмент сильно упростит тестирование и отладку интеграции с IB API! 🎉
