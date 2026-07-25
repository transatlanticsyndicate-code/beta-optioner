# fix-expiry-anchor-total

- **Дата:** 2026-07-25
- **Ветка:** fix/expiry-anchor-startiv
- **commit_start:** 9fd713c
- **Файл:** frontend/src/components/CalculatorV2/OptionsTableV3.jsx
- **Статус:** FIX done

## Диагноз (кратко)

Логика «якоря Fact P&L» (P&L = введённый факт + (теоретическая P&L цели − теоретическая
P&L на дату якоря)) продублирована в 4 местах файла. В блоке суммирования ИТОГО
(~строки 220-246) отсутствовала защита `optDaysRemaining > 0`, которая есть в
остальных 3 местах (расчёт P&L строки ~1320, колонка Close ~1535, utils/startPLSnapshot.js
~202). Из-за этого на дату экспирации ИТОГО пересчитывало якорь там, где не должно —
итог переставал совпадать с суммой строк и мог превышать максимально возможный убыток
купленной позиции (сумму премий).

Подробности — см. diagnose.md.

## Что сделано

1. В блок суммирования ИТОГО (OptionsTableV3.jsx, ~строка 220) добавлена защита
   `optDaysRemaining > 0` перед применением якорной поправки — по аналогии с
   защитой в блоке расчёта P&L строки (~строка 1320). Больше ничего в файле не
   менялось.
2. Добавлен jest-тест frontend/src/utils/__tests__/expiryAnchorInvariant.test.js,
   закрепляющий инвариант «на экспирации |ИТОГО| <= премии купленной позиции» и
   равенство ИТОГО сумме строк при наличии защиты. Тест использует реальную
   ценовую функцию calculateOptionPLValue (тот же BSM-движок, что и компонент) на
   данных прод-репро (MKTX, dbConfig=2a797da0-fba4-4332-bbb5-cb95fd482f23).
3. Прогнан `cd frontend && CI=false npm test -- --watchAll=false` — все 4 test suite
   (29 тестов) зелёные.

## Файлы

- Изменён: `frontend/src/components/CalculatorV2/OptionsTableV3.jsx`
- Создан: `frontend/src/utils/__tests__/expiryAnchorInvariant.test.js`
- Создан: `tasks/fix-expiry-anchor-total/README.md` (этот файл)
- Создан: `tasks/fix-expiry-anchor-total/diagnose.md`

## Не сделано в рамках этой фазы

- Коммит и деплой — по условию задачи выполняются на следующем этапе пайплайна.
