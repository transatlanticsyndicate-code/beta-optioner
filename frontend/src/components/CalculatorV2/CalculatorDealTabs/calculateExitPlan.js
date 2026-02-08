/**
 * Утилита расчёта плана выхода из позиции
 * ЗАЧЕМ: Переиспользуемая логика для позитивного (Buy CALL) и негативного (Buy PUT) сценариев
 * Затрагивает: CalculatorDealTabs — используется для расчёта exitPlan и exitPlanPut
 */

import { calculateOptionTheoreticalPrice as calculateStockOptionTheoreticalPrice } from '../../../utils/optionPricing';
import { calculateFuturesOptionTheoreticalPrice } from '../../../utils/futuresPricing';
import { getOptionVolatility } from '../../../utils/volatilitySurface';
import { calculateDaysRemainingUTC, getOldestEntryDate } from '../../../utils/dateUtils';
import { CALCULATOR_MODES } from '../../../utils/universalPricing';

/**
 * Рассчитывает план выхода из позиции
 * @param {Object} params — параметры расчёта
 * @param {Array} params.filteredOptions — отфильтрованные опционы (Buy CALL или Buy PUT)
 * @param {number} params.totalOptionsCount — общее количество контрактов
 * @param {number} params.stepsCount — количество шагов выхода
 * @param {number} params.targetAssetPriceDollars — целевая цена актива в $
 * @param {number} params.daysPassed — количество прошедших дней
 * @param {Object} params.ivSurface — поверхность волатильности
 * @param {number} params.dividendYield — дивидендная доходность
 * @param {number} params.contractMultiplier — множитель контракта
 * @param {string} params.calculatorMode — режим калькулятора (stocks/futures)
 * @param {Object|null} params.dealInfo — информация о сделке
 * @param {boolean} params.fullQuantityPerStep — каждый шаг получает полное количество опционов (для PUT)
 * @param {number|null} params.targetAssetPriceDollarsExit — целевая цена актива для выхода (для PUT)
 * @returns {Array} — массив шагов плана выхода
 */
export function calculateExitPlan({
  filteredOptions,
  totalOptionsCount,
  stepsCount,
  targetAssetPriceDollars,
  daysPassed,
  ivSurface,
  dividendYield,
  contractMultiplier,
  calculatorMode,
  dealInfo,
  fullQuantityPerStep = false,
  targetAssetPriceDollarsExit = null,
}) {
  if (!dealInfo || totalOptionsCount <= 0 || stepsCount <= 0 || filteredOptions.length === 0) {
    return [];
  }

  const totalOptions = totalOptionsCount;
  const steps = stepsCount;
  const baseQuantity = Math.floor(totalOptions / steps);
  const remainder = totalOptions % steps;

  // Получаем первый опцион для расчёта цен
  const firstOption = filteredOptions[0];

  // Цена входа опциона (ASK для Buy)
  let entryPrice = 0;

  if (firstOption) {
    if (firstOption.isPremiumModified && firstOption.customPremium !== undefined) {
      entryPrice = parseFloat(firstOption.customPremium) || 0;
    } else if (firstOption.action === 'Buy') {
      entryPrice = parseFloat(firstOption.ask) || parseFloat(firstOption.premium) || 0;
    } else {
      entryPrice = parseFloat(firstOption.bid) || parseFloat(firstOption.premium) || 0;
    }
  }

  // Подготовка общих параметров для расчёта теоретической цены
  const oldestEntryDate = firstOption ? getOldestEntryDate(filteredOptions) : null;
  const currentDaysToExpiration = firstOption ? calculateDaysRemainingUTC(firstOption, 0, 30, oldestEntryDate) : 0;
  const simulatedDaysToExpiration = firstOption ? calculateDaysRemainingUTC(firstOption, daysPassed, 30, oldestEntryDate) : 0;
  const optionVolatility = firstOption ? getOptionVolatility(
    firstOption, currentDaysToExpiration, simulatedDaysToExpiration, ivSurface, 'simple'
  ) : 0;
  const tempOption = firstOption ? {
    ...firstOption,
    premium: firstOption.isPremiumModified ? firstOption.customPremium : firstOption.premium,
  } : null;

  // Функция расчёта теоретической цены опциона при заданной цене актива
  // ЗАЧЕМ: Переиспользуется для расчёта цены на каждом шаге (CALL: линейная интерполяция, PUT: отдельный расчёт)
  const calcTheoPrice = (assetPrice) => {
    if (!tempOption) return 0;
    if (calculatorMode === CALCULATOR_MODES.FUTURES) {
      return calculateFuturesOptionTheoreticalPrice(
        tempOption, assetPrice, simulatedDaysToExpiration, optionVolatility
      );
    }
    return calculateStockOptionTheoreticalPrice(
      tempOption, assetPrice, simulatedDaysToExpiration, optionVolatility, dividendYield
    );
  };

  // Рассчитываем целевую цену закрытия опциона
  const targetClosePrice = calcTheoPrice(targetAssetPriceDollars);

  // Для PUT сценария: отдельный расчёт цены выхода при другой целевой цене актива
  const hasExitPrice = targetAssetPriceDollarsExit !== null && targetAssetPriceDollarsExit !== undefined;
  const exitClosePrice = hasExitPrice ? calcTheoPrice(targetAssetPriceDollarsExit) : null;

  // Формируем план выхода
  const plan = [];
  let accumulatedProfit = 0;

  if (hasExitPrice && fullQuantityPerStep) {
    // Режим PUT: шаг 1 (Вход) — цена опциона при цене актива для входа
    // Шаг 2 (Выход) — цена опциона при цене актива для выхода
    const entryOptionPrice = targetClosePrice;
    const exitOptionPrice = exitClosePrice;
    const profit = (exitOptionPrice - entryOptionPrice) * totalOptions * contractMultiplier;

    plan.push({
      step: 1,
      quantity: totalOptions,
      optionPrice: Math.round(entryOptionPrice * 100) / 100,
      profit: 0,
      accumulated: 0,
    });
    plan.push({
      step: 2,
      quantity: totalOptions,
      optionPrice: Math.round(exitOptionPrice * 100) / 100,
      profit: Math.round(profit),
      accumulated: Math.round(profit),
    });
  } else {
    // Стандартный режим (CALL): линейная интерполяция от entryPrice до targetClosePrice
    const priceStep = steps > 0 ? (targetClosePrice - entryPrice) / steps : 0;

    for (let i = 1; i <= steps; i++) {
      const quantity = fullQuantityPerStep ? totalOptions : (i <= remainder ? baseQuantity + 1 : baseQuantity);
      const optionPrice = entryPrice + priceStep * i;
      const stepProfit = (optionPrice - entryPrice) * quantity * contractMultiplier;
      accumulatedProfit += stepProfit;

      plan.push({
        step: i,
        quantity: quantity,
        optionPrice: Math.round(optionPrice * 100) / 100,
        profit: Math.round(stepProfit),
        accumulated: Math.round(accumulatedProfit),
      });
    }
  }

  return plan;
}
