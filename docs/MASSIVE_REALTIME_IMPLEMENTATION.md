# Техническая документация: Внедрение Real-time данных от Massive API

**Дата создания:** 22 декабря 2025  
**Версия:** 1.0  
**Цель:** Полное руководство по внедрению real-time данных от Massive API в проект

---

## 📋 Оглавление

1. [Обзор изменений](#обзор-изменений)
2. [Конфигурация API](#конфигурация-api)
3. [Backend изменения](#backend-изменения)
4. [Frontend изменения](#frontend-изменения)
5. [Индикаторы статуса данных](#индикаторы-статуса-данных)
6. [Тестирование](#тестирование)
7. [Чеклист внедрения](#чеклист-внедрения)

---

## 🎯 Обзор изменений

### Проблема
- Опционный калькулятор показывал delayed данные вместо real-time
- Цены опционов брались из `day.close` (закрытие предыдущего дня)
- Отсутствовала индикация статуса подключения к real-time данным
- Кэширование данных препятствовало обновлению цен

### Решение
- Переход на Massive API (бывший Polygon.io)
- Использование тарифа **Options Advanced** ($199/мес) для real-time опционов
- Извлечение цен из `last_quote` и `last_trade` вместо `day`
- Создание раздельных индикаторов для акций и опционов
- Отключение кэширования опционных данных

---

## 🔑 Конфигурация API

### Переменные окружения

**Backend (.env):**
```bash
# Massive API Key (бывший Polygon.io)
POLYGON_API_KEY=your_massive_api_key_here

# Base URL (может быть изменен на api.massive.com в будущем)
# Сейчас используется api.polygon.io (редирект на Massive)
```

### Тарифные планы Massive

| Тариф | Стоимость | Акции | Опционы |
|-------|-----------|-------|---------|
| Developer | Бесплатно | Delayed (prev day close) | Delayed (15 min) |
| Stocks Advanced | $199/мес | Real-time | Delayed (15 min) |
| Options Advanced | $199/мес | Delayed (prev day close) | **Real-time** ✅ |

**Важно:** Тарифы для акций и опционов **раздельные**. Для real-time опционов нужен именно **Options Advanced**.

---

## 🔧 Backend изменения

### 1. Проверка real-time доступа для опционов

**Файл:** `backend/app/services/polygon_client.py`

**Добавлен метод:** `check_realtime_access_options()`

```python
async def check_realtime_access_options(self) -> Dict[str, Any]:
    """
    Проверка доступа к real-time данным для опционов
    ЗАЧЕМ: Определить тариф пользователя (Developer vs Options Advanced)
    """
    try:
        # Тестовый запрос опционного контракта
        test_ticker = "O:SPY251219C00590000"  # SPY Call опцион
        
        url = f"{self.base_url}/v3/snapshot/options/{test_ticker}"
        params = {"apiKey": self.api_key}
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    
                    # Проверка наличия real-time полей
                    if "results" in data and data["results"]:
                        result = data["results"]
                        
                        # Real-time данные содержат last_quote с актуальными bid/ask
                        has_realtime = (
                            "last_quote" in result and 
                            result["last_quote"] is not None and
                            "bid" in result["last_quote"]
                        )
                        
                        return {
                            "status": "success",
                            "has_realtime": has_realtime,
                            "tier": "options_advanced" if has_realtime else "developer",
                            "delay_minutes": 0 if has_realtime else 15
                        }
                
                elif response.status == 403:
                    # 403 = нет доступа к Options Advanced
                    return {
                        "status": "success",
                        "has_realtime": False,
                        "tier": "developer",
                        "delay_minutes": 15,
                        "message": "Options Advanced subscription required"
                    }
                
                else:
                    return {
                        "status": "error",
                        "has_realtime": False,
                        "tier": "unknown",
                        "message": f"HTTP {response.status}"
                    }
                    
    except Exception as e:
        logger.error(f"Ошибка проверки real-time доступа для опционов: {e}")
        return {
            "status": "error",
            "has_realtime": False,
            "tier": "unknown",
            "message": str(e)
        }
```

### 2. Исправление получения цен опционов

**Файл:** `backend/app/services/options_service.py`

**Метод:** `get_options_chain()`

**Проблема:** Цены брались из `day_data.get("last_quote")` вместо `contract.get("last_quote")`

**Решение:**

```python
async def get_options_chain(self, ticker: str, expiration_date: str) -> Dict[str, Any]:
    """
    Получение цепочки опционов с real-time ценами
    """
    try:
        # Получаем данные от Massive API
        options_data = await self.polygon_client.get_options_chain(ticker, expiration_date)
        
        if not options_data or "results" not in options_data:
            return {"options": [], "underlying_price": None}
        
        contracts = options_data["results"]
        underlying_price = options_data.get("underlying_asset", {}).get("price")
        
        processed_options = []
        
        # 🔍 ЛОГИРОВАНИЕ: Выводим первые 3 контракта для отладки
        logger.info(f"\n{'='*80}")
        logger.info(f"📊 BACKEND: Обработка опционов для {ticker} {expiration_date}")
        logger.info(f"{'='*80}")
        
        for idx, contract in enumerate(contracts[:3]):
            details = contract.get("details", {})
            day_data = contract.get("day", {})
            
            # ✅ ПРАВИЛЬНО: Берем real-time данные из contract.last_quote
            last_quote = contract.get("last_quote", {})
            last_trade = contract.get("last_trade", {})
            
            # Real-time цены
            bid = last_quote.get("bid", 0)
            ask = last_quote.get("ask", 0)
            last_price = last_trade.get("price", 0)
            
            # Определяем is_realtime
            is_realtime = (
                last_quote is not None and 
                bid is not None and 
                ask is not None and
                bid > 0 and ask > 0
            )
            
            logger.info(f"\n🔹 CONTRACT #{idx + 1}: {details.get('contract_type', 'N/A').upper()} Strike ${details.get('strike_price', 0)}")
            logger.info(f"   - bid: {bid}")
            logger.info(f"   - ask: {ask}")
            logger.info(f"   - last: {last_price}")
            logger.info(f"   - is_realtime: {is_realtime}")
            logger.info(f"   - volume: {day_data.get('volume', 0)}")
            logger.info(f"   - open_interest: {day_data.get('open_interest', 0)}")
        
        logger.info(f"{'='*80}\n")
        
        # Обработка всех контрактов
        for contract in contracts:
            details = contract.get("details", {})
            day_data = contract.get("day", {})
            greeks = contract.get("greeks", {})
            
            # Real-time данные
            last_quote = contract.get("last_quote", {})
            last_trade = contract.get("last_trade", {})
            
            option_data = {
                "ticker": details.get("ticker"),
                "type": details.get("contract_type"),
                "strike": details.get("strike_price"),
                "expiration": details.get("expiration_date"),
                
                # Real-time цены из last_quote и last_trade
                "bid": last_quote.get("bid", 0),
                "ask": last_quote.get("ask", 0),
                "last": last_trade.get("price", 0),
                "mid": (last_quote.get("bid", 0) + last_quote.get("ask", 0)) / 2 if last_quote.get("bid") and last_quote.get("ask") else 0,
                
                # Объемы и открытый интерес
                "volume": day_data.get("volume", 0),
                "open_interest": day_data.get("open_interest", 0),
                
                # Greeks
                "delta": greeks.get("delta"),
                "gamma": greeks.get("gamma"),
                "theta": greeks.get("theta"),
                "vega": greeks.get("vega"),
                "implied_volatility": contract.get("implied_volatility"),
                
                # Флаг real-time данных
                "is_realtime": (
                    last_quote is not None and 
                    last_quote.get("bid") is not None and 
                    last_quote.get("ask") is not None
                )
            }
            
            processed_options.append(option_data)
        
        return {
            "options": processed_options,
            "underlying_price": underlying_price
        }
        
    except Exception as e:
        logger.error(f"Ошибка получения опционной цепочки: {e}")
        raise
```

**Ключевые изменения:**
- ✅ `last_quote = contract.get("last_quote", {})` вместо `day_data.get("last_quote")`
- ✅ `last_trade = contract.get("last_trade", {})` для получения последней цены
- ✅ Добавлено логирование первых 3 контрактов для отладки
- ✅ Флаг `is_realtime` для индикации типа данных

### 3. Исправление получения деталей опциона

**Файл:** `backend/app/services/options_service.py`

**Метод:** `get_option_details()`

**Аналогичное исправление:**

```python
async def get_option_details(self, option_ticker: str) -> Dict[str, Any]:
    """
    Получение детальной информации по конкретному опциону
    """
    try:
        # Получаем данные от API
        option_data = await self.polygon_client.get_option_snapshot(option_ticker)
        
        if not option_data or "results" not in option_data:
            raise ValueError(f"Опцион {option_ticker} не найден")
        
        result = option_data["results"]
        details = result.get("details", {})
        day_data = result.get("day", {})
        greeks = result.get("greeks", {})
        
        # ✅ ПРАВИЛЬНО: Real-time данные из result.last_quote
        last_quote = result.get("last_quote", {})
        last_trade = result.get("last_trade", {})
        
        # 🔍 ЛОГИРОВАНИЕ
        logger.info(f"\n{'='*80}")
        logger.info(f"📊 BACKEND: Детали опциона {option_ticker}")
        logger.info(f"   - bid: {last_quote.get('bid', 0)}")
        logger.info(f"   - ask: {last_quote.get('ask', 0)}")
        logger.info(f"   - last: {last_trade.get('price', 0)}")
        logger.info(f"{'='*80}\n")
        
        return {
            "ticker": option_ticker,
            "type": details.get("contract_type"),
            "strike": details.get("strike_price"),
            "expiration": details.get("expiration_date"),
            
            # Real-time цены
            "bid": last_quote.get("bid", 0),
            "ask": last_quote.get("ask", 0),
            "premium": last_trade.get("price", 0),  # Последняя цена сделки
            
            # Остальные данные...
            "volume": day_data.get("volume", 0),
            "open_interest": day_data.get("open_interest", 0),
            "delta": greeks.get("delta"),
            "gamma": greeks.get("gamma"),
            "theta": greeks.get("theta"),
            "vega": greeks.get("vega"),
            "implied_volatility": result.get("implied_volatility"),
            
            "is_realtime": (
                last_quote is not None and 
                last_quote.get("bid") is not None
            )
        }
        
    except Exception as e:
        logger.error(f"Ошибка получения деталей опциона: {e}")
        raise
```

### 4. Новый endpoint для проверки статуса опционов

**Файл:** `backend/app/routers/polygon.py`

**Добавлен endpoint:**

```python
@router.get("/realtime-status-options")
async def get_realtime_status_options(
    polygon_client: PolygonClient = Depends(get_polygon_client)
):
    """
    Проверка статуса real-time доступа для ОПЦИОНОВ
    ЗАЧЕМ: Отображение индикатора статуса на фронтенде
    """
    try:
        # Проверяем доступ к real-time опционам
        status = await polygon_client.check_realtime_access_options()
        
        # Проверяем статус рынка
        market_status = await polygon_client.get_market_status()
        
        return {
            **status,
            "market_status": market_status
        }
        
    except Exception as e:
        logger.error(f"Ошибка проверки статуса опционов: {e}")
        return {
            "status": "error",
            "has_realtime": False,
            "tier": "unknown",
            "message": str(e)
        }
```

---

## 🎨 Frontend изменения

### 1. Отключение кэширования опционных данных

**Файл:** `frontend/src/components/CalculatorV2/StrikeScale.jsx`

**Проблема:** Кэш `marketOICache` хранил старые данные и не обновлялся

**Решение:** Отключить кэширование для real-time данных

```javascript
// Метод loadMarketOI в StrikeScale.jsx

const loadMarketOI = async (dateToLoad) => {
  if (!ticker || !dateToLoad) return;
  
  setLoadingOI(true);
  
  try {
    // ❌ ОТКЛЮЧЕНО: Кэширование для получения real-time данных
    // if (marketOICache[dateToLoad]) {
    //   console.log('✅ Используем кэшированные данные для', dateToLoad);
    //   setMarketOI(marketOICache[dateToLoad]);
    //   return;
    // }
    
    console.log('🔄 Загружаем свежие real-time данные для', ticker, dateToLoad);
    
    // Запрос свежих данных
    const response = await fetch(`/api/polygon/ticker/${ticker}/options?date=${dateToLoad}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Обработка данных...
    const oiData = {};
    
    data.options.forEach(option => {
      const strike = option.strike;
      if (!oiData[strike]) {
        oiData[strike] = { call: 0, put: 0 };
      }
      
      if (option.type === 'call') {
        oiData[strike].call = option.open_interest || 0;
      } else if (option.type === 'put') {
        oiData[strike].put = option.open_interest || 0;
      }
    });
    
    setMarketOI(oiData);
    
    // ❌ НЕ КЭШИРУЕМ для real-time обновлений
    // marketOICache[dateToLoad] = oiData;
    
  } catch (error) {
    console.error('Ошибка загрузки Market OI:', error);
  } finally {
    setLoadingOI(false);
  }
};
```

### 2. Добавление логирования полученных данных

**Файл:** `frontend/src/pages/OptionsCalculatorBasic.jsx`

**Добавлено в метод `loadStrikesForDate`:**

```javascript
const loadStrikesForDate = async (date) => {
  if (!ticker || !date) return;
  
  setLoadingStrikes(true);
  
  try {
    const response = await fetch(`/api/polygon/ticker/${ticker}/options?date=${date}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // 🔍 ЛОГИРОВАНИЕ: Выводим первые 3 опциона для отладки
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 FRONTEND: Получены данные опционов для ${ticker} ${date}`);
    console.log(`${'='.repeat(80)}`);
    
    data.options.slice(0, 3).forEach((opt, idx) => {
      console.log(`\n🔹 OPTION #${idx + 1}: ${opt.type?.toUpperCase()} Strike $${opt.strike}`);
      console.log(`   - bid: ${opt.bid}`);
      console.log(`   - ask: ${opt.ask}`);
      console.log(`   - last: ${opt.last}`);
      console.log(`   - is_realtime: ${opt.is_realtime}`);
      console.log(`   - volume: ${opt.volume}`);
      console.log(`   - open_interest: ${opt.open_interest}`);
    });
    
    console.log(`${'='.repeat(80)}\n`);
    
    // Извлечение страйков
    const uniqueStrikes = [...new Set(data.options.map(opt => opt.strike))].sort((a, b) => a - b);
    
    setAvailableStrikes(uniqueStrikes);
    
  } catch (error) {
    console.error('Ошибка загрузки страйков:', error);
  } finally {
    setLoadingStrikes(false);
  }
};
```

---

## 📊 Индикаторы статуса данных

### Архитектура индикаторов

Созданы **два раздельных индикатора**:
1. **StocksDataIndicator** - для акций
2. **OptionsDataIndicator** - для опционов

### 1. Индикатор акций (StocksDataIndicator)

**Файл:** `frontend/src/components/StocksDataIndicator.js`

```javascript
import React, { useState, useEffect } from 'react';
import './LiveDataIndicator.css';
import massiveLogo from '../assets/massive.png';

const StocksDataIndicator = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkRealtimeStatus();
    // Проверка каждую минуту
    const interval = setInterval(checkRealtimeStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  const checkRealtimeStatus = async () => {
    try {
      const response = await fetch('/api/polygon/realtime-status');
      const data = await response.json();
      
      if (data.status === 'success') {
        setStatus(data);
      }
      setLoading(false);
    } catch (error) {
      console.error('Ошибка проверки статуса акций:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="live-indicator loading">
        <div className="indicator-logo-wrapper">
          <img src={massiveLogo} alt="Massive" className="indicator-logo" />
        </div>
        <span className="indicator-text">Проверка...</span>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  const getIndicatorClass = () => {
    // Рынок закрыт
    if (status.market_status && !status.market_status.is_open) {
      return 'offline';
    }
    
    // Real-time данные
    if (status.has_realtime) {
      return 'live';
    } 
    // Delayed данные
    else if (status.tier === 'developer') {
      return 'delayed';
    } 
    // Offline
    else {
      return 'offline';
    }
  };

  const getIndicatorText = () => {
    // Статусы закрытого рынка
    if (status.market_status && !status.market_status.is_open) {
      const reason = status.market_status.reason;
      if (reason === 'weekend') {
        return 'Акции: Weekend';
      } else if (reason === 'pre_market') {
        return 'Акции: Pre-market';
      } else if (reason === 'after_hours') {
        return 'Акции: Closed';
      }
      return 'Акции: Market Closed';
    }
    
    // Real-time
    if (status.has_realtime) {
      return 'Акции: LIVE';
    } 
    // Delayed (бесплатный тариф - только цена закрытия предыдущего дня)
    else if (status.tier === 'developer' || status.delay_minutes > 0) {
      return 'Акции: Prev Day Close';
    } 
    // Offline
    else {
      return 'Акции: Offline';
    }
  };

  const getTooltipText = () => {
    if (status.market_status && !status.market_status.is_open) {
      return 'Рынок закрыт';
    }
    
    if (status.has_realtime) {
      return 'Real-time данные по акциям';
    } else if (status.tier === 'developer' || status.delay_minutes > 0) {
      return 'Бесплатный тариф: доступна только цена закрытия предыдущего торгового дня';
    } else {
      return 'Данные недоступны';
    }
  };

  return (
    <div 
      className={`live-indicator ${getIndicatorClass()}`}
      title={getTooltipText()}
    >
      <div className="indicator-logo-wrapper">
        <img 
          src={massiveLogo} 
          alt="Massive" 
          className="indicator-logo"
        />
      </div>
      <span className="indicator-text">{getIndicatorText()}</span>
    </div>
  );
};

export default StocksDataIndicator;
```

### 2. Индикатор опционов (OptionsDataIndicator)

**Файл:** `frontend/src/components/OptionsDataIndicator.js`

```javascript
import React, { useState, useEffect } from 'react';
import './LiveDataIndicator.css';
import massiveLogo from '../assets/massive.png';

const OptionsDataIndicator = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkRealtimeStatus();
    const interval = setInterval(checkRealtimeStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  const checkRealtimeStatus = async () => {
    try {
      // Endpoint для опционов
      const response = await fetch('/api/polygon/realtime-status-options');
      const data = await response.json();
      
      if (data.status === 'success') {
        setStatus(data);
      }
      setLoading(false);
    } catch (error) {
      console.error('Ошибка проверки статуса опционов:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="live-indicator loading">
        <div className="indicator-logo-wrapper">
          <img src={massiveLogo} alt="Massive" className="indicator-logo" />
        </div>
        <span className="indicator-text">Проверка...</span>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  const getIndicatorClass = () => {
    if (status.market_status && !status.market_status.is_open) {
      return 'offline';
    }
    
    if (status.has_realtime) {
      return 'live';
    } else if (status.tier === 'developer') {
      return 'delayed';
    } else {
      return 'offline';
    }
  };

  const getIndicatorText = () => {
    if (status.market_status && !status.market_status.is_open) {
      const reason = status.market_status.reason;
      if (reason === 'weekend') {
        return 'Опционы: Weekend';
      } else if (reason === 'pre_market') {
        return 'Опционы: Pre-market';
      } else if (reason === 'after_hours') {
        return 'Опционы: Closed';
      }
      return 'Опционы: Market Closed';
    }
    
    if (status.has_realtime) {
      return 'Опционы: LIVE';
    } else if (status.delay_minutes > 0) {
      return `Опционы: ${status.delay_minutes} min`;
    } else {
      return 'Опционы: Offline';
    }
  };

  const getTooltipText = () => {
    if (status.market_status && !status.market_status.is_open) {
      return 'Рынок закрыт';
    }
    
    if (status.has_realtime) {
      return 'Real-time данные по опционам (Options Advanced)';
    } else if (status.delay_minutes > 0) {
      return `Задержка данных: ${status.delay_minutes} минут`;
    } else {
      return 'Данные недоступны';
    }
  };

  return (
    <div 
      className={`live-indicator ${getIndicatorClass()}`}
      title={getTooltipText()}
    >
      <div className="indicator-logo-wrapper">
        <img 
          src={massiveLogo} 
          alt="Massive" 
          className="indicator-logo"
        />
      </div>
      <span className="indicator-text">{getIndicatorText()}</span>
    </div>
  );
};

export default OptionsDataIndicator;
```

### 3. CSS стили индикаторов

**Файл:** `frontend/src/components/LiveDataIndicator.css`

```css
/* Основной контейнер индикатора */
.live-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  user-select: none;
}

/* Статус LIVE (зеленый) */
.live-indicator.live {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
}

.live-indicator.live:hover {
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  transform: translateY(-1px);
}

/* Статус DELAYED (оранжевый) */
.live-indicator.delayed {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
}

.live-indicator.delayed:hover {
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
  transform: translateY(-1px);
}

/* Статус OFFLINE (серый) */
.live-indicator.offline {
  background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(107, 114, 128, 0.3);
}

/* Статус LOADING (синий) */
.live-indicator.loading {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
}

/* Логотип Massive - контейнер с белой подложкой */
.indicator-logo-wrapper {
  background: white;
  border-radius: 3px;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Логотип Massive - изображение с анимацией */
.indicator-logo {
  width: 16px;
  height: 16px;
  object-fit: contain;
  display: block;
  animation: pulse-logo 2s ease-in-out infinite;
}

/* Анимация для LIVE статуса */
.live-indicator.live .indicator-logo {
  animation: pulse-logo-live 2s ease-in-out infinite;
}

/* Анимация для DELAYED статуса */
.live-indicator.delayed .indicator-logo {
  animation: pulse-logo-delayed 2s ease-in-out infinite;
}

/* Анимация для LOADING статуса */
.live-indicator.loading .indicator-logo {
  animation: pulse-logo-loading 1.5s ease-in-out infinite;
}

/* Анимация мигания LIVE (с увеличением) */
@keyframes pulse-logo-live {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(1.1);
  }
}

/* Анимация мигания DELAYED */
@keyframes pulse-logo-delayed {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* Анимация мигания LOADING */
@keyframes pulse-logo-loading {
  0%, 100% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
}

/* Базовая анимация мигания */
@keyframes pulse-logo {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

/* Текст индикатора */
.indicator-text {
  font-size: 11px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

/* Адаптивные стили для мобильных устройств */
@media (max-width: 768px) {
  .live-indicator {
    padding: 4px 10px;
    font-size: 11px;
  }
  
  .indicator-logo-wrapper {
    padding: 1.5px;
  }
  
  .indicator-logo {
    width: 14px;
    height: 14px;
  }
}
```

### 4. Интеграция индикаторов в навигацию

**Файл:** `frontend/src/components/Layout/TopNav.jsx`

```javascript
import React from 'react';
import { Link } from 'react-router-dom';
import StocksDataIndicator from '../StocksDataIndicator';
import OptionsDataIndicator from '../OptionsDataIndicator';

const TopNav = () => {
  return (
    <nav className="top-nav">
      <div className="nav-left">
        <Link to="/" className="logo">
          Optioner
        </Link>
      </div>
      
      <div className="nav-center">
        {/* Навигационные ссылки */}
      </div>
      
      <div className="nav-right">
        {/* Индикаторы статуса данных */}
        <StocksDataIndicator />
        <OptionsDataIndicator />
      </div>
    </nav>
  );
};

export default TopNav;
```

### 5. Логотип Massive

**Файл:** `frontend/src/assets/massive.png`

- Формат: PNG
- Размер: 16x16px (оригинал может быть больше, масштабируется через CSS)
- Источник: Логотип с сайта massive.com
- Использование: Отображается в индикаторах с белой подложкой

---

## 🧪 Тестирование

### 1. Проверка backend endpoints

**Тест real-time статуса опционов:**
```bash
curl http://localhost:8000/api/polygon/realtime-status-options
```

**Ожидаемый ответ (Options Advanced):**
```json
{
  "status": "success",
  "has_realtime": true,
  "tier": "options_advanced",
  "delay_minutes": 0,
  "market_status": {
    "is_open": true,
    "reason": null
  }
}
```

**Тест получения опционной цепочки:**
```bash
curl http://localhost:8000/api/polygon/ticker/SPY/options?date=2025-12-31
```

**Проверить в ответе:**
- `bid`, `ask`, `last` должны быть > 0
- `is_realtime` должен быть `true`
- Данные должны обновляться в real-time

### 2. Проверка frontend

**Открыть консоль браузера:**
1. Перейти на страницу калькулятора опционов
2. Выбрать тикер (например, SPY)
3. Выбрать дату экспирации
4. Проверить логи в консоли:

```
================================================================================
📊 BACKEND: Обработка опционов для SPY 2025-12-31
================================================================================

🔹 CONTRACT #1: CALL Strike $590
   - bid: 2.45
   - ask: 2.48
   - last: 2.46
   - is_realtime: true
   - volume: 1523
   - open_interest: 8934
```

**Проверить индикаторы:**
- Индикатор "Опционы: LIVE" должен быть зеленым
- Логотип Massive должен мигать
- При наведении должен показываться тултип "Real-time данные по опционам (Options Advanced)"

### 3. Сравнение с терминалом

**Открыть real-time терминал** (например, Thinkorswim, Interactive Brokers)

**Сравнить цены:**
1. Выбрать один и тот же опцион в калькуляторе и терминале
2. Проверить bid/ask/last цены
3. Цены должны совпадать с точностью до $0.01-0.02

**Пример:**
- Терминал: SPY 590 Call - Bid: 2.45, Ask: 2.48
- Калькулятор: SPY 590 Call - Bid: 2.45, Ask: 2.48 ✅

---

## ✅ Чеклист внедрения

### Backend

- [ ] Добавить `POLYGON_API_KEY` в `.env` файл
- [ ] Обновить `polygon_client.py`:
  - [ ] Добавить метод `check_realtime_access_options()`
- [ ] Обновить `options_service.py`:
  - [ ] Исправить `get_options_chain()` - использовать `contract.get("last_quote")`
  - [ ] Исправить `get_option_details()` - использовать `result.get("last_quote")`
  - [ ] Добавить логирование первых 3 контрактов
- [ ] Обновить `polygon.py`:
  - [ ] Добавить endpoint `/realtime-status-options`
- [ ] Перезапустить backend сервер

### Frontend

- [ ] Создать компонент `StocksDataIndicator.js`
- [ ] Создать компонент `OptionsDataIndicator.js`
- [ ] Создать/обновить `LiveDataIndicator.css`
- [ ] Добавить логотип `massive.png` в `src/assets/`
- [ ] Обновить `StrikeScale.jsx`:
  - [ ] Отключить кэширование в методе `loadMarketOI()`
- [ ] Обновить `OptionsCalculatorBasic.jsx`:
  - [ ] Добавить логирование в метод `loadStrikesForDate()`
- [ ] Обновить `TopNav.jsx`:
  - [ ] Импортировать оба индикатора
  - [ ] Добавить индикаторы в навигацию
- [ ] Перезапустить frontend сервер

### Тестирование

- [ ] Проверить endpoint `/realtime-status-options`
- [ ] Проверить endpoint `/ticker/{ticker}/options`
- [ ] Проверить отображение индикаторов в браузере
- [ ] Проверить логи в консоли браузера
- [ ] Проверить логи в консоли backend
- [ ] Сравнить цены с real-time терминалом
- [ ] Проверить работу на мобильных устройствах

### Документация

- [ ] Обновить README.md с информацией о Massive API
- [ ] Документировать переменные окружения
- [ ] Создать changelog с описанием изменений

---

## 📝 Важные замечания

### 1. Тарифы Massive API

**Акции и опционы - раздельные тарифы!**
- Для real-time акций нужен **Stocks Advanced** ($199/мес)
- Для real-time опционов нужен **Options Advanced** ($199/мес)
- Тарифы НЕ включают друг друга

### 2. Структура данных API

**Real-time данные находятся в:**
- `contract.last_quote` - последняя котировка (bid/ask)
- `contract.last_trade` - последняя сделка (price)

**НЕ использовать:**
- `day.last_quote` - это данные закрытия предыдущего дня
- `day.close` - цена закрытия предыдущего дня

### 3. Кэширование

**Для real-time данных кэширование ЗАПРЕЩЕНО!**
- Отключить все механизмы кэширования опционных данных
- Каждый запрос должен получать свежие данные от API

### 4. Логирование

**Обязательно добавить логирование для отладки:**
- Backend: Логировать первые 3 контракта с ценами
- Frontend: Логировать полученные данные в консоль
- Это помогает быстро выявить проблемы с данными

### 5. Индикаторы

**Раздельные индикаторы критически важны:**
- Пользователь должен видеть статус акций и опционов отдельно
- Разные тарифы = разные статусы
- Индикаторы должны обновляться каждую минуту

---

## 🔗 Полезные ссылки

- **Massive API Documentation:** https://polygon.io/docs (редирект на Massive)
- **Massive Dashboard:** https://polygon.io/dashboard (управление подписками)
- **Options Snapshot API:** https://polygon.io/docs/options/get_v3_snapshot_options__underlyingasset___optioncontract
- **Market Status API:** https://polygon.io/docs/stocks/get_v1_marketstatus_now

---

## 📞 Поддержка

При возникновении проблем проверить:
1. API ключ в `.env` файле
2. Активность подписки Options Advanced в Massive Dashboard
3. Логи backend и frontend
4. Статус рынка (открыт/закрыт)
5. Сравнение цен с real-time терминалом

---

**Конец документации**

*Версия: 1.0*  
*Дата: 22 декабря 2025*  
*Автор: AI Assistant (Cascade)*
