/**
 * Модуль проверки Greeks опционов
 * ЗАЧЕМ: Предупреждает пользователя о рисковых значениях греков
 *
 * Проверяет Delta, Gamma, Theta для Buy и Sell опционов
 * и возвращает массив предупреждений для отображения в калькуляторе
 *
 * Затрагивает: предупреждения в ExitCalculator
 */

/**
 * Пороговые значения для греков
 * ЗАЧЕМ: Критерии для определения рисковых позиций
 */
export const GREEKS_THRESHOLDS = {
  // Delta
  BUY_DELTA_TOO_LOW: 0.15,    // Слишком далеко OTM
  BUY_DELTA_TOO_HIGH: 0.85,   // Проще купить акцию
  SELL_DELTA_HIGH: 0.35,       // Высокий риск назначения

  // Gamma
  BUY_GAMMA_TOO_LOW: 0.02,    // Не набирает дельту
  SELL_GAMMA_TOO_HIGH: 0.10,  // Резкое изменение дельты

  // Theta (в процентах)
  BUY_THETA_PERCENT: 0.02,    // 2% от премии в день
  SELL_THETA_PERCENT: 0.002,  // 0.2% от маржи в день
};

/**
 * Оценивает маржу для одного Sell-опциона (per share, Reg T)
 * ЗАЧЕМ: Для расчёта порога Theta для продавцов
 *
 * @param {Object} option - опцион
 * @param {number} currentPrice - текущая цена базового актива
 * @returns {number} - маржа per share
 */
function estimateMarginPerShare(option, currentPrice) {
  const strike = parseFloat(option.strike) || 0;
  const premium = parseFloat(option.premium) || parseFloat(option.ask) || 0;
  const otmAmount = option.type === 'CALL'
    ? Math.max(0, strike - currentPrice)
    : Math.max(0, currentPrice - strike);

  if (option.type === 'CALL') {
    const margin = 0.20 * currentPrice + premium - otmAmount;
    return Math.max(margin, 0.10 * currentPrice + premium);
  } else {
    const margin = 0.20 * currentPrice + premium - otmAmount;
    return Math.max(margin, 0.10 * strike + premium);
  }
}

/**
 * Проверяет греки одного опциона и возвращает массив предупреждений
 * ЗАЧЕМ: Каждый опцион проверяется по Delta, Gamma, Theta
 *
 * @param {Object} option - опцион с полями delta, gamma, theta, action, type, strike, premium
 * @param {number} currentPrice - текущая цена базового актива
 * @returns {Array} - массив предупреждений [{type, message}]
 */
export function checkOptionGreeks(option, currentPrice) {
  const warnings = [];
  const isBuy = (option.action || 'Buy') === 'Buy';
  const absDelta = Math.abs(option.delta || 0);
  const gamma = Math.abs(option.gamma || 0);
  const absTheta = Math.abs(option.theta || 0);

  // === DELTA ===
  if (isBuy) {
    if (absDelta > 0 && absDelta < GREEKS_THRESHOLDS.BUY_DELTA_TOO_LOW) {
      warnings.push({
        greek: 'Delta',
        message: `Delta ${absDelta.toFixed(2)} — опцион слишком далеко OTM, практически не реагирует на движение цены`
      });
    }
    if (absDelta > GREEKS_THRESHOLDS.BUY_DELTA_TOO_HIGH) {
      warnings.push({
        greek: 'Delta',
        message: `Delta ${absDelta.toFixed(2)} — проще и дешевле купить саму акцию`
      });
    }
  } else {
    if (absDelta > GREEKS_THRESHOLDS.SELL_DELTA_HIGH) {
      warnings.push({
        greek: 'Delta',
        message: `Delta ${absDelta.toFixed(2)} — слишком высокий риск назначения`
      });
    }
  }

  // === GAMMA ===
  if (isBuy) {
    if (gamma > 0 && gamma < GREEKS_THRESHOLDS.BUY_GAMMA_TOO_LOW) {
      warnings.push({
        greek: 'Gamma',
        message: `Gamma ${gamma.toFixed(3)} — позиция не будет набирать дельту даже при сильном движении цены`
      });
    }
  } else {
    if (gamma > GREEKS_THRESHOLDS.SELL_GAMMA_TOO_HIGH) {
      warnings.push({
        greek: 'Gamma',
        message: `Gamma ${gamma.toFixed(3)} — резкое изменение дельты может мгновенно уничтожить позицию`
      });
    }
  }

  // === THETA ===
  if (absTheta > 0) {
    if (isBuy) {
      // Theta > 2% от стоимости премии в день
      const premium = parseFloat(option.premium) || parseFloat(option.ask) || 0;
      if (premium > 0) {
        const thetaPercent = absTheta / premium;
        if (thetaPercent > GREEKS_THRESHOLDS.BUY_THETA_PERCENT) {
          warnings.push({
            greek: 'Theta',
            message: `Theta ${(thetaPercent * 100).toFixed(1)}% от премии/день — время работает против тебя слишком агрессивно`
          });
        }
      }
    } else {
      // Theta < 0.2% от маржи в день
      const marginPerShare = estimateMarginPerShare(option, currentPrice);
      if (marginPerShare > 0) {
        const thetaPercent = absTheta / marginPerShare;
        if (thetaPercent < GREEKS_THRESHOLDS.SELL_THETA_PERCENT) {
          warnings.push({
            greek: 'Theta',
            message: `Theta ${(thetaPercent * 100).toFixed(2)}% от маржи/день — собираемая премия не оправдывает принятый риск`
          });
        }
      }
    }
  }

  return warnings;
}

/**
 * Проверяет греки всех видимых опционов
 * ЗАЧЕМ: Агрегация предупреждений для отображения в ExitCalculator
 *
 * @param {Array} options - массив опционов
 * @param {number} currentPrice - текущая цена базового актива
 * @returns {Array} - массив предупреждений [{option, warnings}]
 */
export function assessAllGreeks(options, currentPrice) {
  if (!options || options.length === 0 || !currentPrice) return [];

  return options
    .filter(opt => opt.visible !== false)
    .map(option => {
      const warnings = checkOptionGreeks(option, currentPrice);
      if (warnings.length === 0) return null;
      return {
        option: `${option.action} ${option.type} ${option.strike}`,
        action: option.action,
        warnings
      };
    })
    .filter(Boolean);
}
