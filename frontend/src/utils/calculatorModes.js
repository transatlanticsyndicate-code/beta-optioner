/**
 * Константы режимов калькулятора и helper для проверки «акция-подобных» режимов.
 * ЗАЧЕМ: До этого CALCULATOR_MODES жил локально в UniversalOptionsCalculator.jsx,
 * а смежные компоненты сравнивали сырые строки ('stocks', 'futures', 'crypto').
 * После добавления режима ETF (его математика идентична акциям) появилась
 * необходимость в helper isStockLikeMode — чтобы в одном месте знать, какие
 * режимы ведут себя как акции, и не дублировать условие (`stocks || etf`)
 * по нескольким файлам.
 */

export const CALCULATOR_MODES = {
  STOCKS: 'stocks',
  FUTURES: 'futures',
  CRYPTO: 'crypto',
  ETF: 'etf',
};

/**
 * Возвращает true, если режим калькулятора ведёт себя как акция
 * (множитель 100, учёт дивидендов, классификация акций, кнопка СЕВЕР и т.д.).
 * Сейчас это STOCKS и ETF — у них одинаковая математика P&L, отличаются
 * только визуальные маркеры (цвет бейджа в шапке и в карточках сохранённых
 * позиций).
 */
export const isStockLikeMode = (mode) =>
  mode === CALCULATOR_MODES.STOCKS || mode === CALCULATOR_MODES.ETF;
