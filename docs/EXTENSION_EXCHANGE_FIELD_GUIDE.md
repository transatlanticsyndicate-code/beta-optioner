# Инструкция: Добавление поля `exchange` в расширение

## Проблема

Калькулятор генерирует неправильные ссылки на TradingView для некоторых инструментов:
- SE торгуется на NYSE, но калькулятор генерирует NASDAQ ссылку
- Причина: расширение не передаёт информацию о бирже

## Решение

Расширение должно передавать информацию о бирже в двух местах:

### 1. URL параметр при открытии калькулятора

Когда расширение открывает калькулятор, добавить параметр `exchange`:

```javascript
// БЫЛО:
const url = `https://beta.optioner.online/tools/universal-calculator?contract=SE&price=123.45`;
window.open(url);

// СТАЛО:
const exchange = "NYSE";  // Получить со страницы TradingView
const url = `https://beta.optioner.online/tools/universal-calculator?contract=SE&price=123.45&exchange=${exchange}`;
window.open(url);
```

### 2. Поле `exchange` в `calculatorState`

Когда расширение записывает данные опционов в `localStorage`, добавить поле `exchange`:

```javascript
// БЫЛО:
localStorage.setItem('calculatorState', JSON.stringify({
  selectedTicker: "SE",
  underlyingPrice: 123.45,
  options: [...]
}));

// СТАЛО:
localStorage.setItem('calculatorState', JSON.stringify({
  selectedTicker: "SE",
  underlyingPrice: 123.45,
  exchange: "NYSE",  // ← ДОБАВИТЬ ЭТО ПОЛЕ
  options: [...]
}));
```

## Как получить информацию о бирже

На странице TradingView информация о бирже обычно отображается рядом с тикером:
- `NYSE:SE` → биржа = `NYSE`
- `NASDAQ:AAPL` → биржа = `NASDAQ`
- `CME_MINI:ES` → биржа = `CME`

Расширение может получить это значение из:
1. **HTML страницы** — парсить текст рядом с тикером
2. **API TradingView** — если доступен
3. **Таблица опционов** — информация о бирже часто есть в заголовке таблицы

## Примеры значений `exchange`

| Инструмент | Биржа | Значение |
|-----------|-------|---------|
| SE (Sea Limited) | NYSE | `NYSE` |
| AAPL (Apple) | NASDAQ | `NASDAQ` |
| ES (E-mini S&P 500) | CME | `CME` |
| ZL (Soybean Oil) | CBOT | `CBOT` |
| CL (Crude Oil) | NYMEX | `NYMEX` |

## Проверка

После внесения изменений:
1. Открыть опцион SE на TradingView
2. Нажать кнопку "ОТКРЫТЬ КАЛЬКУЛЯТОР" в расширении
3. В калькуляторе нажать на тикер SE
4. Проверить, что ссылка содержит `NYSE%3ASE` (правильно) вместо `NASDAQ%3ASE` (неправильно)

## Обратная совместимость

Если расширение не передаст `exchange`:
- Калькулятор будет угадывать биржу по паттернам тикера (fallback)
- Для большинства акций это будет NASDAQ (по умолчанию)
- Ссылки могут быть неправильными, но калькулятор не сломается

## Файлы калькулятора, которые используют `exchange`

- `frontend/src/hooks/useExtensionData.js` — парсит URL параметр `?exchange=NYSE`
- `frontend/src/pages/UniversalOptionsCalculator.jsx` — функция `getTradingViewLink(ticker, exchange)`

---

**Дата обновления**: 2026-03-31
