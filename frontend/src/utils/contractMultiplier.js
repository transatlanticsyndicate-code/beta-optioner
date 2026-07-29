// Чистая функция резолва множителя контракта — вынесена из useMemo в
// UniversalOptionsCalculator.jsx, чтобы правило "нет настроек фьючерса → null,
// а НЕ акционные 100" можно было покрыть unit-тестами без рендера компонента.
//
// ЗАЧЕМ null, а не 100: раньше режим FUTURES без выбранного фьючерса тихо
// откатывался на акционный множитель 100 — P&L завышался/занижался в разы.
// null явно говорит "нет данных"; вызывающий код (isFuturesMissingSettings)
// блокирует суммирование ИТОГО на этом сигнале, а точечные места отображения
// показывают прочерк вместо неверного числа.

import { CALCULATOR_MODES } from './calculatorModes';

/**
 * Резолвит множитель контракта по режиму калькулятора.
 *
 * @param {string} mode — режим калькулятора (stocks/futures/crypto/etf)
 * @param {{pointValue?: number}|null} selectedFuture — выбранный фьючерс (если есть)
 * @param {string} [ticker] — не используется здесь напрямую (оставлен для совместимости
 *   сигнатуры с местом вызова в компоненте, где есть доп. фолбэк через getFutureByTicker) —
 *   резолвер работает только от selectedFuture; поиск по тикеру — забота вызывающего кода.
 * @returns {number|null} множитель, либо null если для FUTURES нет настроек
 */
export function resolveContractMultiplier(mode, selectedFuture, ticker) {
  if (mode === CALCULATOR_MODES.FUTURES) {
    if (selectedFuture && selectedFuture.pointValue) {
      return selectedFuture.pointValue;
    }
    return null; // Нет настроек фьючерса — "нет данных", НЕ акционные 100
  }
  if (mode === CALCULATOR_MODES.CRYPTO) {
    return 1; // Крипто-опционы не умножаются на 100
  }
  return 100; // STOCKS/ETF — стандартный множитель для акций
}
