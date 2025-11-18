# План: Добавление табов "График" и "Доска" в калькулятор

## Цель
Добавить табы "График" и "Доска" в калькулятор опционов (как в образце Андрея), чтобы пользователь мог переключаться между графиком P&L и доской опционов.

## Образец
- Проект Андрея: `http://localhost:3000/calculators-new`
- Файл: `_docs/design-samples/andrey-v0-dashboard/repo/app/calculators-new/page.tsx`
- Строки: 1193-1218

## Структура табов в образце
```tsx
<Tabs defaultValue="chart" className="w-full">
  <TabsList className="w-full grid grid-cols-2">
    <TabsTrigger value="chart">График</TabsTrigger>
    <TabsTrigger value="board">Доска</TabsTrigger>
  </TabsList>

  <TabsContent value="chart">
    <Card>
      {/* График P&L */}
    </Card>
  </TabsContent>

  <TabsContent value="board">
    <Card>
      {/* Доска опционов */}
    </Card>
  </TabsContent>
</Tabs>
```

## Текущее состояние
- Файл: `frontend/src/pages/OptionsCalculatorV2.jsx`
- График P&L: компонент `PLChart` (строки ~780-800)
- Шкала цен: компонент `PriceScale` (строки ~800-900)
- Оба компонента отображаются одновременно, без табов

## Шаги реализации

### 1. Импорт компонента Tabs
- [x] Добавить импорт `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` из `../components/ui/tabs`
- [x] Проверить, что компоненты существуют в `frontend/src/components/ui/`

### 2. Создать state для активного таба
- [x] State не нужен - используется `defaultValue` в компоненте Tabs
- [x] По умолчанию активен таб "График" (defaultValue="chart")

### 3. Обернуть блоки в Tabs
- [x] Найти блок с графиком P&L (PLChart) - строка 824
- [x] Найти блок со шкалой цен (PriceScale) - строка 790
- [x] Обернуть оба блока в структуру Tabs

### 4. Настроить TabsList
- [x] Создать TabsList с двумя кнопками
- [x] TabsTrigger для "График" (value="chart")
- [x] TabsTrigger для "Доска" (value="board")
- [x] Применить стили: `className="w-full grid grid-cols-2"`

### 5. Создать TabsContent для графика
- [x] TabsContent с value="chart"
- [x] Внутри разместить компонент PLChart
- [x] Сохранить все props для PLChart

### 6. Создать TabsContent для доски
- [x] TabsContent с value="board"
- [x] Внутри разместить компонент PriceScale
- [x] Сохранить все props для PriceScale

### 7. Проверить стили
- [x] Убедиться, что Card обернут правильно
- [x] Проверить отступы (pt-4, pb-4, px-6)
- [x] Проверить высоту контейнеров

### 8. Тестирование
- [x] Dev сервер уже запущен на порту 3000
- [x] Установлен пакет @radix-ui/react-tabs
- [x] Проверить переключение между табами в браузере
- [x] Убедиться, что график отображается в табе "График"
- [x] Таб "Доска" готов для нового компонента (заглушка)
- [x] PriceScale возвращен на исходное место (Блок 4)

## Файлы для изменения
1. `frontend/src/pages/OptionsCalculatorV2.jsx` - основной файл
2. Возможно `frontend/src/components/ui/tabs.jsx` - если компонент отсутствует

## Примерная структура кода

```jsx
{/* Блок 6 - График/Доска с табами */}
<Tabs defaultValue="chart" className="w-full">
  <TabsList className="w-full grid grid-cols-2">
    <TabsTrigger value="chart">График</TabsTrigger>
    <TabsTrigger value="board">Доска</TabsTrigger>
  </TabsList>

  <TabsContent value="chart">
    <Card className="w-full relative overflow-hidden">
      <CardContent className="p-[20px]">
        <PLChart
          options={displayOptions}
          positions={positions}
          currentPrice={currentPrice}
          daysRemaining={daysRemaining}
          volatility={volatility}
          chartDisplayMode={chartDisplayMode}
        />
      </CardContent>
    </Card>
  </TabsContent>

  <TabsContent value="board">
    <Card className="w-full relative overflow-hidden">
      <CardContent className="p-[20px]">
        <PriceScale
          priceScaleRef={priceScaleRef}
          handlePriceScaleMouseDown={handlePriceScaleMouseDown}
          handlePriceScaleMouseMove={handlePriceScaleMouseMove}
          handlePriceScaleMouseUp={handlePriceScaleMouseUp}
          handlePriceScaleMouseLeave={handlePriceScaleMouseLeave}
          greenBarHeights={greenBarHeights}
          redBarHeights={redBarHeights}
          currentPrice={currentPrice}
        />
      </CardContent>
    </Card>
  </TabsContent>
</Tabs>
```

## Заметки
- Компоненты Tabs используют Radix UI (как в образце)
- Стили должны совпадать с общим дизайном калькулятора
- При переключении табов контент должен плавно меняться
- Активный таб должен быть визуально выделен

## ⚠️ ВАЖНО: Дизайн
**Образец Андрея используется ТОЛЬКО как референс структуры табов!**

### Что берем из образца:
- ✅ Структуру компонентов Tabs (TabsList, TabsTrigger, TabsContent)
- ✅ Идею разделения на 2 таба: "График" и "Доска"
- ✅ Сетку `grid-cols-2` для кнопок табов

### Что НЕ меняем:
- ❌ Текущий дизайн нашего калькулятора
- ❌ Стили компонентов PLChart и PriceScale
- ❌ Цвета, отступы, размеры (кроме необходимых для табов)
- ❌ Функциональность существующих компонентов
- ❌ Любые другие элементы интерфейса

### Итого:
Просто **оборачиваем существующие блоки** в табы для переключения между ними.
Весь остальной дизайн и функциональность остаются без изменений.

## Статус
✅ **ВЫПОЛНЕНО** - 16 октября 2025

### Итоговая реализация:
- ✅ Добавлены табы "График" и "Доска"
- ✅ Таб "График" отображает компонент PLChart
- ✅ Таб "Доска" содержит заглушку для будущего компонента
- ✅ PriceScale остался на своем месте (Блок 4 - Шкала цен)
- ✅ Установлен пакет @radix-ui/react-tabs
- ✅ Приложение успешно компилируется

### Следующий шаг:
Создание нового компонента для таба "Доска"

## Дата создания
16 октября 2025
