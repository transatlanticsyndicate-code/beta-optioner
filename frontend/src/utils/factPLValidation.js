// Валидация поля «Fact P&L» (фактическая P&L, введённая пользователем как якорь).
//
// ЗАЧЕМ: до этого файла поле принимало любое число без проверки — можно было
// ввести Fact P&L, физически невозможный для ноги (например, убыток больше
// уплаченной премии). Отсюда реальный дефект: у фьючерсной ноги стоимостью $44
// был записан якорь +$587 — искажение, которое проекция P&L тянула дальше по
// всей симуляции.
//
// Чистые функции без React — их дёргает OptionsTableV3.jsx (обработчик
// handleActualPLChange и подсказка у жёлтого поля Fact P&L).

/**
 * Уплаченная/полученная за ногу сумма (стоимость ноги) в момент входа.
 *
 * Цена входа берётся в порядке приоритета ручных правок пользователя —
 * тот же порядок, что использует OptionsTableV3 для колонки P&L:
 *   isPremiumModified → customPremium, иначе isAskModified → customAsk,
 *   иначе ask ?? premium.
 *
 * @param {object} option
 * @param {number} contractMultiplier — множитель контракта (100 для акций, pointValue для фьючерсов)
 * @returns {number|null} — положительная сумма в долларах, либо null если цену
 *   входа определить нельзя (нет данных) или она равна нулю (нога с нулевым bid/ask).
 */
export function getLegCost(option, contractMultiplier) {
  if (!option) return null;

  let entryPrice;
  if (option.isPremiumModified) {
    entryPrice = option.customPremium;
  } else if (option.isAskModified) {
    entryPrice = option.customAsk;
  } else {
    entryPrice = option.ask ?? option.premium;
  }

  const price = Number(entryPrice);
  const qty = Number(option.quantity);
  const mult = Number(contractMultiplier);

  if (!Number.isFinite(price) || !Number.isFinite(qty) || !Number.isFinite(mult)) return null;

  const cost = Math.abs(price * qty * mult);
  // Ноги с нулевым bid/ask (например, глубоко вне денег) — стоимость неопределена,
  // блокировку по ней применять нельзя (см. validateFactPL).
  if (!cost) return null;
  return cost;
}

/**
 * Проверка введённого значения Fact P&L на физическую (не)возможность и на
 * подозрительные, но допустимые случаи.
 *
 * @param {object} params
 * @param {number} params.value — введённое пользователем значение Fact P&L
 * @param {object} params.option — нога (нужны action, quantity, цены, entryDate, actualPLDate, actualPLPrice, assetPriceAtEntry)
 * @param {number} params.contractMultiplier
 * @returns {{level: 'ok'|'warn'|'block', message: string}}
 */
export function validateFactPL({ value, option, contractMultiplier }) {
  const numValue = Number(value);
  if (!Number.isFinite(numValue)) {
    return { level: 'ok', message: '' };
  }

  const legCost = getLegCost(option, contractMultiplier);
  // Регистр action не гарантирован (встречается и 'Buy', и 'buy') — сравниваем без учёта регистра.
  const isBuy = String(option?.action || 'Buy').toLowerCase() === 'buy';

  // BLOCK — только физически невозможное. Если legCost неизвестен или 0
  // (нулевой bid/ask), блокировку НИКОГДА не применяем — не с чем сравнивать.
  if (legCost !== null && legCost > 0) {
    if (isBuy && numValue < -legCost) {
      return {
        level: 'block',
        message: `Убыток $${Math.abs(Math.round(numValue))} не может превышать уплаченную премию $${Math.round(legCost)} (купленная нога)`,
      };
    }
    if (!isBuy && numValue > legCost) {
      return {
        level: 'block',
        message: `Прибыль $${Math.round(numValue)} не может превышать полученную премию $${Math.round(legCost)} (проданная нога)`,
      };
    }
  }

  // WARN — якорь введён в день входа при значении больше половины стоимости ноги.
  // ЗАЧЕМ: в день входа P&L физически не может быть большой (нет времени на движение) —
  // это не блокирует (пользователь мог ввести реальные данные брокера), но подозрительно.
  if (
    legCost !== null && legCost > 0 &&
    option?.entryDate && option?.actualPLDate &&
    option.actualPLDate === option.entryDate &&
    Math.abs(numValue) > legCost / 2
  ) {
    return {
      level: 'warn',
      message: `Fact P&L введён в день входа и превышает половину стоимости ноги ($${Math.round(legCost)})`,
    };
  }

  // Намеренно НЕТ проверки «якорная цена актива сильно разошлась с ценой входа»:
  // якорь ставится в момент, когда пользователь вводит фактический P&L от брокера —
  // то есть СЕГОДНЯ, а не на дату входа в сделку. Поэтому расхождение якорной цены
  // с ценой входа — это движение рынка за время жизни позиции, а не ошибка ввода
  // (для выросших акций расхождение >20% — норма). Достоверно проверить, соответствовала
  // ли якорная цена рынку именно на дату ввода, нельзя — для этого нужна история
  // котировок, которой в системе нет.

  return { level: 'ok', message: '' };
}

/**
 * Человекочитаемое описание размера поправки, которую якорь Fact P&L вносит
 * поверх теоретической модели — для подсказки у жёлтого поля Fact P&L.
 *
 * @param {object} params
 * @param {number} params.actualPL — введённый пользователем Fact P&L
 * @param {number} params.plAtAnchor — теоретическая P&L на момент ввода якоря (уже посчитана в рендере строки)
 * @param {number|null} params.legCost — стоимость ноги (для кратности), может быть null
 * @returns {string} — например «поправка к модели +$587 = 13× стоимости ноги», либо '' если посчитать нечего
 */
export function describeAnchorResidual({ actualPL, plAtAnchor, legCost }) {
  if (actualPL === null || actualPL === undefined || plAtAnchor === null || plAtAnchor === undefined) {
    return '';
  }
  const numActual = Number(actualPL);
  const numAnchor = Number(plAtAnchor);
  if (!Number.isFinite(numActual) || !Number.isFinite(numAnchor)) return '';

  const residual = Math.round(numActual - numAnchor);
  const sign = residual > 0 ? '+' : (residual < 0 ? '−' : '');
  const abs = Math.abs(residual);

  let text = `поправка к модели ${sign}$${abs}`;
  if (legCost !== null && legCost !== undefined && legCost > 0 && abs > 0) {
    const multiple = Math.round(abs / legCost);
    if (multiple >= 1) {
      text += ` = ${multiple}× стоимости ноги`;
    }
  }
  return text;
}

/**
 * Человекочитаемое описание результата КАЛИБРОВКИ волатильности якоря Fact P&L —
 * для той же подсказки у поля «Fact P&L», рядом с describeAnchorResidual выше.
 *
 * ЗАЧЕМ: с перехода на калибровку (frontend/src/utils/factPLAnchor.js, applyFactPLAnchor)
 * поправка больше не «постоянная добавка», а подобранная волатильность — пользователю
 * (не программисту) полезно видеть, на что модель подстроилась, а не только сумму
 * расхождения. Для 2 ног из 132 в аудите заказчика (scratchpad/anchor_decay/README.md,
 * §5) введённый факт физически недостижим (подразумеваемая цена опциона отрицательна) —
 * для них вместо волатильности показываем понятное объяснение фолбэка.
 *
 * @param {object} params
 * @param {'calibrated'|'fallback'|'none'} params.mode — результат applyFactPLAnchor.mode.
 * @param {number|null} params.calibratedVolatility — applyFactPLAnchor.calibratedVolatility, %.
 * @param {number|null} params.anchorVolatility — введённая пользователем Fact IV (или
 *   интерполированная волатильность, если Fact IV не задавалась), %, — то, «вместо чего».
 * @param {string|null} [params.reason] — applyFactPLAnchor.reason для режима 'fallback'
 *   ('below-intrinsic' | 'above-max-volatility') — не показывается пользователю напрямую,
 *   только определяет, что факт «невозможен» (обе причины по сути об одном и том же).
 * @returns {string} — например «Модель подобрана под ваш факт: волатильность 46.2% вместо
 *   введённой 46.5%», либо предупреждение о недостижимости факта, либо '' если нечего показать.
 */
export function describeAnchorCalibration({ mode, calibratedVolatility, anchorVolatility, reason } = {}) {
  if (mode === 'calibrated' && calibratedVolatility !== null && calibratedVolatility !== undefined) {
    const calibratedStr = calibratedVolatility.toFixed(1);
    const anchorStr = Number.isFinite(anchorVolatility) ? anchorVolatility.toFixed(1) : null;
    if (anchorStr !== null && Math.abs(calibratedVolatility - anchorVolatility) >= 0.05) {
      return `Модель подобрана под ваш факт: волатильность ${calibratedStr}% вместо введённой ${anchorStr}%`;
    }
    return `Модель подобрана под ваш факт: волатильность ${calibratedStr}%`;
  }

  if (mode === 'fallback') {
    // below-intrinsic / above-max-volatility — обе причины сводятся к одному для
    // пользователя: введённое число невозможно объяснить движением волатильности.
    void reason; // причина используется только для отладки, не выводится в UI
    return 'Введённый факт недостижим для этого опциона (убыток/прибыль больше уплаченной премии) — расчёт ограничен физическим пределом';
  }

  return '';
}
