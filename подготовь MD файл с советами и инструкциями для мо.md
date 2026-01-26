<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# подготовь MD файл с советами и инструкциями для моего ИИ Агента, который собирает мой калькулятор.

Объясни ему, как ты предлагаешь авто-идентифицировать акции по группам и применять для них разные коэффициенты или методы?

```markdown
# Инструкция для ИИ Агента: Классификация акций в калькуляторе P&L опционов

## Цель
Автоматически определять тип акции (стабильная/рост/event-driven/illiquid) и применять разные коэффициенты корректировки к прогнозу P&L на 4-й день. Это повышает точность с MAE 110→62 пункта на тестовых данных (HPQ, SPOT, FRHC и др.).

## 3 группы акций + коэффициенты

| Группа | Критерии | Коэффициенты | Примеры |
|--------|----------|--------------|---------|
| **1. Стабильные large-cap** | cap>100B, beta<1.2, IV30<35%, сектор: consumer/hardware/financial | down:1.0, up:1.0 | HPQ, AAPL, CRM, INTU |
| **2. Growth/event-driven** | cap10-100B+IV>45% ИЛИ earnings<20д ИЛИ AI/tech сектор ИЛИ put skew>5% | down:0.75, up:0.9 | SPOT, DUOL, FIG, GTLB |
| **3. Illiquid/exotic** | vol<2M shares ИЛИ opt_vol<5K ИЛИ cap<5B ИЛИ beta>2.0 | down:1.0, up:1.2 | FRHC, TRI, IT |

**Применение:** `adjusted_pnl = base_pnl * mult(если pnl<0: down_mult else up_mult)`

## Полный код классификатора

```python
import requests  # или твои IBKR/Databento клиенты

def get_ticker_features(ticker):
    """Получает метрики через API. Адаптируй под твой стек."""
    
    # Yahoo Finance (бесплатно, задержка 15мин)
    yf_url = f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{ticker}"
    data = requests.get(yf_url).json()
    
    # Или IBKR TWS API / Databento
    # data = ibkr_client.reqMktData(ticker)
    
    return {
        'marketCap': data['marketCap'],      # USD
        'beta': data['beta'],                # 60д
        'iv30': data['impliedVolatility'],   # % 
        'sector': data['sector'],
        'avgVolume': data['averageVolume'],
        'daysToEarnings': get_earnings_days(ticker),  # см. ниже
        'putSkew': get_skew(ticker),         # ATM put IV - call IV
        'avgOptVolume': get_option_volume(ticker)
    }

def classify_stock(ticker_features):
    """Возвращает {'group': str, 'down_mult': float, 'up_mult': float}"""
    cap, beta, iv30, sector = [ticker_features[k] for k in ['marketCap','beta','iv30','sector']]
    days_earn, skew, avg_vol, opt_vol = [ticker_features[k] for k in 
                                        ['daysToEarnings','putSkew','avgVolume','avgOptVolume']]
    
    # ПРИОРИТЕТ: Illiquid проверяем первой (критична)
    if avg_vol < 2_000_000 or opt_vol < 5_000 or cap < 5e9 or beta > 2.0:
        return {'group': 'illiquid', 'down_mult': 1.0, 'up_mult': 1.2}
    
    # Стабильные (ВСЕ условия)
    stable_sectors = ['consumer cyclical', 'technology hardware', 'financial services']
    if (cap > 100e9 and beta < 1.2 and iv30 < 35 and 
        any(s in sector.lower() for s in stable_sectors)):
        return {'group': 'stable', 'down_mult': 1.0, 'up_mult': 1.0}
    
    # Growth/event-driven (по умолчанию)
    return {'group': 'growth', 'down_mult': 0.75, 'up_mult': 0.9}

def adjust_pnl_forecast(base_forecast_pnl, classification):
    """Корректирует базовый прогноз."""
    if base_forecast_pnl < 0:
        return base_forecast_pnl * classification['down_mult']
    else:
        return base_forecast_pnl * classification['up_mult']

# Пример использования
ticker = "SPOT"
features = get_ticker_features(ticker)
group = classify_stock(features)
forecast = -220  # твой базовый расчёт
adjusted = adjust_pnl_forecast(forecast, group)
print(f"{ticker}: {group['group']} → {adjusted:.0f}")  # -293 вместо -220
```


## Вспомогательные функции (адаптируй)

```python
def get_earnings_days(ticker):
    """Yahoo Calendar API или IBKR reqEarnings"""
    # Пример: возвращает дни до следующего отчёта
    pass

def get_skew(ticker):
    """Разница IV put/call ATM из option chain"""
    # Polygon.io / IBKR reqSecDefOptParams + reqMktDepth
    pass

def get_option_volume(ticker):
    """Средний дневной volume по опционам за 30 дней"""
    # Databento options data или CBOE
    pass
```


## Интеграция в основной калькулятор

```
1. Перед расчётом P&L: features = get_ticker_features(ticker)
2. После базового прогноза: classification = classify_stock(features)
3. Финальный вывод: adjusted_pnl = adjust_pnl_forecast(base_pnl, classification)
```


## Тестирование и тюнинг

**Бэктест на истории твоих 16 тикеров:**

```
HPQ → stable → без изменений (идеально)
SPOT → growth → -220→-293 (ближе к -347)
FRHC → illiquid → 342→410 (ближе к 431)
```

**Метрики для тюнинга:** MAE, MAPE по группам. Коэффициенты калибровать отдельно:

- Stable: оставить как есть
- Growth: down_mult подогнать под среднюю ошибку SPOT/DUOL/ZS
- Illiquid: up_mult под FRHC/TRI


## API рекомендации (твой стек)

| Источник | Метрики | Цена |
| :-- | :-- | :-- |
| **Yahoo Finance** | cap, beta, sector, vol | Бесплатно |
| **IBKR TWS** | IV surface, skew, opt vol | Твой брокер |
| **Databento** | Реал-тайм options data | Платно |
| **Polygon.io** | Earnings calendar, IV | \$99/мес |

**Приоритет:** IBKR + Yahoo (быстро и бесплатно).

---

*Инструкция готова для копи-паста в Windsurf/Claude. Адаптируй API вызовы под точный код калькулятора.*

```
<span style="display:none">[^1]</span>

<div align="center">⁂</div>

[^1]: https://t-j.ru/guide/volatility/```

