import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Plot from 'react-plotly.js';
// Импорт из старого модуля для режима "Акции" (обратная совместимость)
import {
  calculateOptionPLValue as calculateStockOptionPLValue,
  calculateOptionExpirationPLValue as calculateStockOptionExpirationPLValue,
  calculateOptionTheoreticalPrice,
  calculateIntrinsicValue,
  PRICING_CONSTANTS,
  adjustPLByStockGroup,
} from '../../utils/optionPricing';
// Импорт из нового модуля для режима "Фьючерсы"
import {
  calculateFuturesOptionPLValue,
  calculateFuturesOptionExpirationPLValue,
} from '../../utils/futuresPricing';
import { hasRemainingDaysUTC, getOldestEntryDate, isOptionActiveAtDay, calculateDaysRemainingPreciseET, calculateDaysToExpirationFromTodayPreciseET } from '../../utils/dateUtils';
import { getOptionVolatility } from '../../utils/volatilitySurface';
import { isStockLikeMode } from '../../utils/calculatorModes';
import { getCryptoBasisRate } from '../../utils/cryptoRateSettings';

// Режимы калькулятора
// ETF математически эквивалентен STOCKS — отличается только бейдж в UI.
const CALCULATOR_MODES = {
  STOCKS: 'stocks',
  FUTURES: 'futures',
  CRYPTO: 'crypto',
  ETF: 'etf'
};

/**
 * Компонент графика прибыли/убытка (P&L Chart) с использованием Plotly.js
 * 
 * IMPORTANT: Используем daysPassed (прошедшие дни) вместо daysRemaining
 * Каждый опцион имеет свой initialDaysToExpiration (вычисляется из даты)
 * actualDaysRemaining = max(0, initialDaysToExpiration - daysPassed)
 * 
 * Адаптирован из V1 для работы с V2
 */
function PLChart({ options = [], currentPrice = 0, positions = [], showOptionLines = true, daysPassed = 0, showProbabilityZones = true, targetPrice = 0, ivSurface = null, dividendYield = 0, isAIEnabled = false, aiVolatilityMap = {}, fetchAIVolatility = null, selectedTicker = '', calculatorMode = 'stocks', contractMultiplier = 100, stockClassification = null }) {
  // DEBUG: Закомментировано для production
  // console.log('🤖 [PLChart] Получены пропсы:', {
  //   isAIEnabled,
  //   targetPrice,
  //   selectedTicker,
  //   aiVolatilityMapKeys: Object.keys(aiVolatilityMap || {}),
  //   aiVolatilityMapSize: Object.keys(aiVolatilityMap || {}).length
  // });

  // Отслеживание темы
  const [isDarkMode, setIsDarkMode] = useState(
    document.documentElement.classList.contains('dark')
  );

  // Отслеживание видимого диапазона для динамического пересчета данных
  const [xAxisRange, setXAxisRange] = useState(null);

  // Слушаем изменения темы
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          setIsDarkMode(document.documentElement.classList.contains('dark'));
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);

  // Функция расчета P&L для позиции базового актива
  // ЗАЧЕМ: Для фьючерсов P&L = разница в пунктах × quantity × pointValue
  // Для крипто и акций P&L = разница в цене × quantity
  const calculateUnderlyingPL = useCallback((price, position) => {
    if (!position || !position.type) return 0;

    const { type, quantity, price: entryPrice } = position;
    const entryPriceNum = Number(entryPrice) || 0;

    // Множитель для фьючерсов (pointValue), для крипто и акций = 1
    const multiplier = calculatorMode === CALCULATOR_MODES.FUTURES ? contractMultiplier : 1;

    if (type === 'LONG') {
      return (price - entryPriceNum) * quantity * multiplier;
    } else if (type === 'SHORT') {
      return (entryPriceNum - price) * quantity * multiplier;
    }
    return 0;
  }, [calculatorMode, contractMultiplier]);

  // Универсальная функция расчёта P&L опциона в зависимости от режима
  // ЗАЧЕМ: Единая точка входа для расчётов — автоматически выбирает модель (BSM, Black-76 или крипто)
  const calculateOptionPLValue = useCallback((option, price, currentPriceVal, daysRemaining, volatility, divYield) => {
    if (calculatorMode === CALCULATOR_MODES.FUTURES) {
      // Режим "Фьючерсы" — используем Black-76 с pointValue
      return calculateFuturesOptionPLValue(option, price, daysRemaining, contractMultiplier, volatility);
    }
    if (calculatorMode === CALCULATOR_MODES.CRYPTO) {
      // Режим "Крипто" — множитель 1, ставка = настраиваемый форвардный базис
      // (по умолчанию 0 — старое поведение, см. cryptoRateSettings.js)
      return calculateStockOptionPLValue(option, price, currentPriceVal, daysRemaining, volatility, divYield, contractMultiplier, getCryptoBasisRate());
    }
    // Режим "Акции" — множитель 100, ставка ФРС (null = берём из FRED)
    return calculateStockOptionPLValue(option, price, currentPriceVal, daysRemaining, volatility, divYield, contractMultiplier, null);
  }, [calculatorMode, contractMultiplier]);

  // Универсальная функция расчёта P&L на экспирации
  const calculateOptionExpirationPLValue = useCallback((option, price) => {
    if (calculatorMode === CALCULATOR_MODES.FUTURES) {
      return calculateFuturesOptionExpirationPLValue(option, price, contractMultiplier);
    }
    if (calculatorMode === CALCULATOR_MODES.CRYPTO) {
      // Режим "Крипто" — используем расчёт для акций с множителем 1
      return calculateStockOptionExpirationPLValue(option, price, contractMultiplier);
    }
    // Режим "Акции" — используем расчёт для акций с множителем 100
    return calculateStockOptionExpirationPLValue(option, price, contractMultiplier);
  }, [calculatorMode, contractMultiplier]);

  // Расчет данных для графика
  const chartData = useMemo(() => {
    if (!currentPrice || (options.length === 0 && positions.length === 0)) {
      return null;
    }

    const visibleOptions = options.filter(opt => opt.visible);
    const visiblePositions = positions.filter(pos => pos.visible !== false);

    // График отображается, если есть видимые опционы ИЛИ видимые позиции базового актива
    if (visibleOptions.length === 0 && visiblePositions.length === 0) {
      return null;
    }

    // Диапазон цен для графика - расширенный для поддержки zoom/pan
    // Если есть видимый диапазон (xAxisRange) - используем его
    // Иначе используем ±50% от текущей цены
    let minPrice, maxPrice;

    if (xAxisRange && xAxisRange[0] !== undefined && xAxisRange[1] !== undefined) {
      // При zoom/pan используем видимый диапазон
      minPrice = xAxisRange[0];
      maxPrice = xAxisRange[1];
    } else {
      // По умолчанию: ±50% от текущей цены
      const priceRange = 0.50;
      minPrice = currentPrice * (1 - priceRange);
      maxPrice = currentPrice * (1 + priceRange);
    }

    const chartPoints = 500; // Больше точек для гладкой кривой при zoom
    const step = (maxPrice - minPrice) / chartPoints;

    // Массив цен для оси X
    const prices = [];
    for (let price = minPrice; price <= maxPrice; price += step) {
      prices.push(price);
    }

    // Расчет P&L для каждого опциона и позиций базового актива
    const traces = [];
    const totalPLArray = new Array(prices.length).fill(0);

    // Сначала добавляем P&L от позиций базового актива
    visiblePositions.forEach((position) => {
      const positionPLArray = prices.map(price => calculateUnderlyingPL(price, position));

      // Добавляем к общему P&L
      positionPLArray.forEach((pl, i) => {
        totalPLArray[i] += pl;
      });

      // Цвет и стиль линии с прозрачностью 75%
      // Зеленая пунктирная линия для LONG позиций, красная для SHORT
      const color = position.type === 'LONG' ? 'rgba(34, 197, 94, 0.75)' : 'rgba(239, 68, 68, 0.75)';
      const positionType = position.type === 'LONG' ? 'LONG' : 'SHORT';
      const positionQty = Math.abs(parseFloat(position.quantity) || 0);

      // Trace для позиции базового актива (только если showOptionLines = true)
      if (showOptionLines) {
        traces.push({
          x: prices,
          y: positionPLArray,
          type: 'scatter',
          mode: 'lines',
          name: `${positionType} ${positionQty} ${position.ticker || 'SHARES'}`,
          line: {
            color: color,
            width: 4,
            dash: 'dot'
          },
          hovertemplate: `<b>${positionType} ${positionQty} ${position.ticker || 'SHARES'}</b><br>` +
            `Entry: $${(Number(position.price) || 0).toFixed(2)}<br>` +
            'P&L: %{text}<br>' +
            '<extra></extra>',
          text: positionPLArray.map(pl => pl >= 0 ? `$${pl.toFixed(2)}` : `-$${Math.abs(pl).toFixed(2)}`)
        });
      }
    });

    // Палитра цветов для опционов (разные цвета для каждого)
    const optionColors = [
      'rgba(59, 130, 246, 0.5)',    // синий
      'rgba(249, 115, 22, 0.5)',    // оранжевый
      'rgba(168, 85, 247, 0.5)',    // фиолетовый
      'rgba(34, 197, 94, 0.5)',     // зеленый
      'rgba(239, 68, 68, 0.5)',     // красный
      'rgba(14, 165, 233, 0.5)',    // голубой
      'rgba(236, 72, 153, 0.5)',    // розовый
      'rgba(251, 146, 60, 0.5)',    // оранжевый светлый
    ];

    // Вычисляем самую старую дату входа среди всех опционов
    // ЗАЧЕМ: Для индивидуального расчёта daysPassed для каждого опциона
    const oldestEntryDate = getOldestEntryDate(options);

    visibleOptions.forEach((option, index) => {
      // Проверяем, активен ли опцион на текущий день симуляции
      // ЗАЧЕМ: Если целевая дата раньше даты входа опциона, он ещё не куплен
      const isActive = isOptionActiveAtDay(option, daysPassed, oldestEntryDate);

      // ВАЖНО: При ручной премии обнуляем ask/bid, чтобы getEntryPrice() использовал premium
      // Если нет - передаем ручные Bid/Ask, если они изменены
      const tempOption = {
        ...option,
        premium: option.isPremiumModified ? option.customPremium : option.premium,
        ask: option.isPremiumModified ? 0 : (option.isAskModified ? option.customAsk : option.ask),
        bid: option.isPremiumModified ? 0 : (option.isBidModified ? option.customBid : option.bid),
      };
      const { action, type, strike } = option;

      // Вычисляем индивидуальный daysRemaining для каждого опциона
      // ВАЖНО: Передаём oldestEntryDate для корректного расчёта actualDaysPassed
      // Точная (ET, дробная) версия — значение идёт прямо в ценообразование (calculateOptionPLValue
      // ниже) и в IV-интерполяцию (getOptionVolatility), гардов на этом значении в блоке нет.
      const optionDaysRemaining = calculateDaysRemainingPreciseET(option, daysPassed, 30, oldestEntryDate);

      // Получаем IV из API через единую функцию (как в usePositionExitCalculator)
      // currentDays = daysRemaining без daysPassed, simulatedDays = с учётом daysPassed
      // ivSurface используется для точной интерполяции IV между датами экспирации
      const currentDaysToExpiration = calculateDaysRemainingPreciseET(option, 0, 30, oldestEntryDate);
      // ЗАЧЕМ: передаём manualIvOverride (ручная Fact IV) и todaySimDaysForOpt — иначе кривая
      // графика игнорирует ручную волатильность, введённую заказчиком, и расходится с таблицей
      const todaySimDaysForOpt = calculateDaysToExpirationFromTodayPreciseET(option);
      let optionVolatility = getOptionVolatility(option, currentDaysToExpiration, optionDaysRemaining, ivSurface, 'simple', null, option.manualIvOverride, todaySimDaysForOpt);

      // Используем AI волатильность если доступна
      if (isAIEnabled && aiVolatilityMap && selectedTicker && targetPrice) {
        const cacheKey = `${selectedTicker}_${option.strike}_${option.date}_${targetPrice.toFixed(2)}_${optionDaysRemaining}`;
        const aiVolatility = aiVolatilityMap[cacheKey];

        if (aiVolatility) {
          console.log('🤖 [PLChart/chartData] Используем AI волатильность:', {
            strike: option.strike,
            standardIV: optionVolatility,
            aiIV: aiVolatility,
            cacheKey
          });
          optionVolatility = aiVolatility;
        }
      }

      // DEBUG: Закомментировано для production
      // console.log(`🤖 [PLChart/plArray] Strike ${option.strike}: optionVolatility=${optionVolatility}, isAIEnabled=${isAIEnabled}, isActive=${isActive}`);

      // Если опцион ещё не куплен, P/L = 0 (не участвует в расчёте)
      const plArray = prices.map((price) =>
        isActive ? calculateOptionPLValue(tempOption, price, currentPrice, optionDaysRemaining, optionVolatility, dividendYield) : 0
      );

      plArray.forEach((pl, i) => {
        totalPLArray[i] += pl;
      });

      // Выбираем уникальный цвет для каждого опциона
      const color = optionColors[index % optionColors.length];

      // Trace для опциона (только если showOptionLines = true И опцион активен)
      // ЗАЧЕМ: Не рисуем линию опциона, если он ещё не куплен
      if (showOptionLines && isActive) {
        traces.push({
          x: prices,
          y: plArray,
          type: 'scatter',
          mode: 'lines',
          name: `${action} ${type} $${strike}`,
          line: {
            color: color,
            width: 1,
            dash: 'solid'
          },
          hovertemplate: '<b>%{fullData.name}</b><br>' +
            'P&L: %{text}<br>' +
            '<extra></extra>',
          text: plArray.map(pl => pl >= 0 ? `$${pl.toFixed(2)}` : `-$${Math.abs(pl).toFixed(2)}`)
        });
      }
    });

    // Применяем корректировку P&L на основе группы акции (только для режима stocks)
    // ЗАЧЕМ: Разные типы акций требуют разных коэффициентов корректировки прогноза
    if (isStockLikeMode(calculatorMode) && stockClassification) {
      for (let i = 0; i < totalPLArray.length; i++) {
        totalPLArray[i] = adjustPLByStockGroup(totalPLArray[i], stockClassification);
      }
    }

    // Поиск точки схождения всех опционов (где все линии пересекаются максимально близко)
    // ЗАЧЕМ: Показать пользователю цену, при которой все опционы сходятся
    // Сохраняем данные для добавления в конце (чтобы точка была поверх всех элементов)
    let convergencePointTrace = null;

    if (visibleOptions.length >= 2 && showOptionLines) {
      // Вычисляем P&L каждого опциона для каждой цены
      // ВАЖНО: Используем UTC для консистентности между часовыми поясами
      const optionPLArrays = visibleOptions.map(option => {
        // ВАЖНО: При ручной премии обнуляем ask/bid, чтобы getEntryPrice() использовал premium
        // ЗАЧЕМ: учитываем ручные правки bid/ask (isAskModified/isBidModified), как в основной кривой —
        // иначе точка схождения считается по другим bid/ask, чем сама кривая
        const tempOption = {
          ...option,
          premium: option.isPremiumModified ? option.customPremium : option.premium,
          ask: option.isPremiumModified ? 0 : (option.isAskModified ? option.customAsk : option.ask),
          bid: option.isPremiumModified ? 0 : (option.isBidModified ? option.customBid : option.bid),
        };
        // Точная (ET, дробная) версия — те же дни, что использует основная кривая выше
        // (значение идёт прямо в ценообразование и IV-интерполяцию, гардов здесь нет).
        const optionDaysRemaining = calculateDaysRemainingPreciseET(option, daysPassed, 30, oldestEntryDate);
        const currentDaysToExpiration = calculateDaysRemainingPreciseET(option, 0, 30, oldestEntryDate);
        // ЗАЧЕМ: те же недостающие аргументы (manualIvOverride, todayDaysToExpiration), что и в основной кривой —
        // иначе точка схождения считается по другой волатильности, чем сама кривая
        const todaySimDaysForOpt = calculateDaysToExpirationFromTodayPreciseET(option);
        let optionVolatility = getOptionVolatility(option, currentDaysToExpiration, optionDaysRemaining, ivSurface, 'simple', null, option.manualIvOverride, todaySimDaysForOpt);

        // Используем AI волатильность если доступна
        if (isAIEnabled && aiVolatilityMap && options.length > 0 && targetPrice) {
          const ticker = options[0]?.ticker || '';
          if (ticker) {
            const cacheKey = `${ticker}_${option.strike}_${option.date}_${targetPrice.toFixed(2)}_${optionDaysRemaining}`;
            const aiVolatility = aiVolatilityMap[cacheKey];
            if (aiVolatility) {
              optionVolatility = aiVolatility;
            }
          }
        }

        return prices.map(price =>
          calculateOptionPLValue(tempOption, price, currentPrice, optionDaysRemaining, optionVolatility, dividendYield)
        );
      });

      // Ищем цену с минимальным разбросом между всеми опционами
      let minSpread = Infinity;
      let bestPriceIdx = 0;

      prices.forEach((price, idx) => {
        const plValues = optionPLArrays.map(arr => arr[idx]);
        const maxPL = Math.max(...plValues);
        const minPL = Math.min(...plValues);
        const spread = maxPL - minPL;

        // Ищем минимальный разброс (точку схождения)
        if (spread < minSpread) {
          minSpread = spread;
          bestPriceIdx = idx;
        }
      });

      // Сохраняем точку схождения только если разброс ≤ 10% от максимального P&L текущих опционов
      // Берём P&L опционов именно в точке схождения, а не по всему графику
      const plValuesAtConvergence = optionPLArrays.map(arr => arr[bestPriceIdx]);
      const maxAbsPL = Math.max(...plValuesAtConvergence.map(Math.abs));
      const threshold = maxAbsPL * 0.1; // 10% порог

      if (minSpread <= threshold && maxAbsPL > 0) {
        const convergencePrice = prices[bestPriceIdx];
        const convergencePL = totalPLArray[bestPriceIdx];

        convergencePointTrace = {
          x: [convergencePrice],
          y: [convergencePL],
          type: 'scatter',
          mode: 'markers',
          name: 'Точка схождения',
          marker: {
            color: '#f59e0b', // оранжевый/янтарный
            size: 16,
            symbol: 'diamond',
            line: {
              color: '#ffffff',
              width: 3
            }
          },
          hovertemplate: '<b>Точка схождения опционов</b><br>' +
            `Цена: $${convergencePrice.toFixed(2)}<br>` +
            `Разброс: $${minSpread.toFixed(2)}<br>` +
            '<extra></extra>',
          showlegend: true
        };
      }
    }

    // Если есть опционы с оставшимися днями > 0, добавляем линию для дня экспирации с прозрачностью 50%
    // ВАЖНО: Используем UTC для консистентности между часовыми поясами
    const hasOptionsWithDaysRemaining = visibleOptions.some(option =>
      hasRemainingDaysUTC(option, daysPassed)
    );

    if (hasOptionsWithDaysRemaining) {
      const expirationPLArray = new Array(prices.length).fill(0);

      // Сначала добавляем P&L от позиций базового актива (они не зависят от экспирации)
      visiblePositions.forEach((position) => {
        const positionPLArray = prices.map(price => calculateUnderlyingPL(price, position));
        positionPLArray.forEach((pl, i) => {
          expirationPLArray[i] += pl;
        });
      });

      // Затем добавляем P&L от опционов на экспирации
      visibleOptions.forEach((option) => {
        // ВАЖНО: При ручной премии обнуляем ask/bid, чтобы getEntryPrice() использовал premium
        // ЗАЧЕМ: учитываем ручные правки bid/ask (isAskModified/isBidModified), как в основной кривой —
        // иначе пунктир экспирации отличается от кривой на величину ручной правки bid/ask
        const tempOption = {
          ...option,
          premium: option.isPremiumModified ? option.customPremium : option.premium,
          ask: option.isPremiumModified ? 0 : (option.isAskModified ? option.customAsk : option.ask),
          bid: option.isPremiumModified ? 0 : (option.isBidModified ? option.customBid : option.bid),
        };
        prices.forEach((price, i) => {
          const pl = calculateOptionExpirationPLValue(tempOption, price);
          expirationPLArray[i] += pl;
        });
      });

      const expirationHoverArray = expirationPLArray.map(pl => Math.abs(pl) < 0.01 ? 0 : pl);

      // Зеленая часть экспирации (прибыль) с прозрачностью 50%
      const expirationGreenY = expirationPLArray.map(pl => pl >= 0 ? pl : null);
      traces.push({
        x: prices,
        y: expirationGreenY,
        type: 'scatter',
        mode: 'lines',
        name: 'Expiration P&L (Profit)',
        line: {
          color: 'rgba(16, 185, 129, 0.5)', // зеленый с 50% прозрачностью
          width: 3,
          dash: 'dot'
        },
        showlegend: false,
        hoverinfo: 'skip'
      });

      // Красная часть экспирации (убыток) с прозрачностью 50%
      const expirationRedY = expirationPLArray.map(pl => pl < 0 ? pl : null);
      traces.push({
        x: prices,
        y: expirationRedY,
        type: 'scatter',
        mode: 'lines',
        name: 'Expiration P&L',
        line: {
          color: 'rgba(239, 68, 68, 0.5)', // красный с 50% прозрачностью
          width: 3,
          dash: 'dot'
        },
        showlegend: false,
        hoverinfo: 'skip'
      });

      traces.push({
        x: prices,
        y: expirationPLArray,
        type: 'scatter',
        mode: 'lines',
        name: 'Expiration Day P&L',
        line: {
          color: 'rgba(0,0,0,0)',
          width: 0
        },
        customdata: expirationHoverArray,
        hovertemplate: '<b>В день экспирации</b><br>' +
          'P&L: $%{customdata:.2f}<br>' +
          '<extra></extra>',
        showlegend: false
      });
    }

    // Trace для суммарного P&L - разделяем на зеленую (выше 0) и красную (ниже 0) части
    // Зеленая часть (прибыль)
    const greenY = totalPLArray.map(pl => pl >= 0 ? pl : null);
    const totalHoverArray = totalPLArray.map(pl => Math.abs(pl) < 0.01 ? 0 : pl);
    traces.push({
      x: prices,
      y: greenY,
      type: 'scatter',
      mode: 'lines',
      name: 'Total P&L',
      line: {
        color: '#10B981', // зеленый
        width: 4
      },
      showlegend: true,
      hoverinfo: 'skip'
    });

    // Красная часть (убыток)
    const redY = totalPLArray.map(pl => pl < 0 ? pl : null);
    traces.push({
      x: prices,
      y: redY,
      type: 'scatter',
      mode: 'lines',
      name: 'Total P&L',
      line: {
        color: '#EF4444', // красный
        width: 4
      },
      showlegend: false,
      hoverinfo: 'skip'
    });

    traces.push({
      x: prices,
      y: totalPLArray,
      type: 'scatter',
      mode: 'lines',
      name: 'Total P&L (значение)',
      line: {
        color: 'rgba(0,0,0,0)',
        width: 0
      },
      customdata: totalHoverArray,
      hovertemplate: '<b>Total P&L</b><br>' +
        'P&L: $%{customdata:.2f}<br>' +
        '<extra></extra>',
      showlegend: false
    });

    // Заливка зон прибыли и убытка
    const profitZone = {
      x: prices,
      y: totalPLArray.map(pl => pl > 0 ? pl : 0),
      type: 'scatter',
      mode: 'none',
      fill: 'tozeroy',
      fillcolor: 'rgba(16, 185, 129, 0.15)', // зеленый с прозрачностью
      name: 'Profit Zone',
      showlegend: false,
      hoverinfo: 'skip'
    };

    const lossZone = {
      x: prices,
      y: totalPLArray.map(pl => pl < 0 ? pl : 0),
      type: 'scatter',
      mode: 'none',
      fill: 'tozeroy',
      fillcolor: 'rgba(239, 68, 68, 0.15)', // красный с прозрачностью
      name: 'Loss Zone',
      showlegend: false,
      hoverinfo: 'skip'
    };

    // Добавляем зоны в начало (чтобы они были под линиями)
    traces.unshift(lossZone);
    traces.unshift(profitZone);

    // Поиск breakeven points
    const breakevenPoints = [];
    for (let i = 1; i < totalPLArray.length; i++) {
      const prev = totalPLArray[i - 1];
      const curr = totalPLArray[i];

      // Пересечение нуля
      if ((prev < 0 && curr > 0) || (prev > 0 && curr < 0)) {
        const ratio = Math.abs(prev) / (Math.abs(prev) + Math.abs(curr));
        const breakeven = prices[i - 1] + (prices[i] - prices[i - 1]) * ratio;
        breakevenPoints.push(breakeven);
      }
    }

    // Расчет зон вероятности удален - больше не используется

    // Цвета темы
    const themeColors = {
      background: isDarkMode ? 'hsl(0, 0%, 4%)' : 'hsl(0, 0%, 100%)',
      paper: isDarkMode ? 'hsl(0, 0%, 4%)' : 'hsl(0, 0%, 100%)',
      text: isDarkMode ? 'hsl(0, 0%, 90%)' : 'hsl(222.2, 47.4%, 11.2%)',
      grid: isDarkMode ? 'hsl(0, 0%, 20%)' : 'hsl(214.3, 31.8%, 91.4%)',
      currentPrice: '#06b6d4',
      breakeven: '#f59e0b',
      zeroline: '#06b6d4',
      annotationBg: isDarkMode ? 'rgba(10, 10, 10, 0.95)' : 'rgba(255, 255, 255, 0.95)'
    };

    // Shapes для линий
    const shapes = [
      // Горизонтальная линия на уровне 0
      {
        type: 'line',
        x0: minPrice,
        x1: maxPrice,
        y0: 0,
        y1: 0,
        line: {
          color: themeColors.zeroline,
          width: 2,
          dash: 'dot'
        }
      },
      // Вертикальная линия текущей цены
      {
        type: 'line',
        x0: currentPrice,
        x1: currentPrice,
        yref: 'paper',
        y0: 0,
        y1: 1,
        line: {
          color: themeColors.currentPrice,
          width: 1,
          dash: 'dash'
        }
      }
    ];

    // Добавляем вертикальную линию симулированной цены (если отличается от текущей)
    if (targetPrice && targetPrice !== currentPrice && targetPrice >= minPrice && targetPrice <= maxPrice) {
      shapes.push({
        type: 'line',
        x0: targetPrice,
        x1: targetPrice,
        yref: 'paper',
        y0: 0,
        y1: 1,
        line: {
          color: '#6b7280', // gray-500
          width: 1,
          dash: 'solid'
        }
      });
    }

    // Розовые зоны вероятности удалены - больше не используются

    // Добавляем вертикальные линии для breakeven points
    breakevenPoints.forEach(point => {
      shapes.push({
        type: 'line',
        x0: point,
        x1: point,
        yref: 'paper',
        y0: 0,
        y1: 1,
        line: {
          color: themeColors.breakeven,
          width: 1,
          dash: 'dot'
        }
      });
    });


    // Annotations для меток
    const annotations = [
      // Метка текущей цены
      {
        x: currentPrice,
        y: 1,
        yref: 'paper',
        text: `Current: $${currentPrice.toFixed(2)}`,
        showarrow: false,
        xanchor: 'center',
        yanchor: 'bottom',
        font: {
          color: themeColors.currentPrice,
          size: 12,
          weight: 'bold'
        },
        bgcolor: themeColors.annotationBg,
        borderpad: 6,
        bordercolor: themeColors.currentPrice,
        borderwidth: 1
      }
    ];

    // Добавляем метку симулированной цены (если отличается от текущей)
    if (targetPrice && targetPrice !== currentPrice && targetPrice >= minPrice && targetPrice <= maxPrice) {
      annotations.push({
        x: targetPrice,
        y: 0.95,
        yref: 'paper',
        text: `Target: $${targetPrice.toFixed(2)}`,
        showarrow: false,
        xanchor: 'center',
        yanchor: 'bottom',
        font: {
          color: '#6b7280', // gray-500
          size: 12,
          weight: 'bold'
        },
        bgcolor: themeColors.annotationBg,
        borderpad: 6,
        bordercolor: '#6b7280', // gray-500
        borderwidth: 1
      });
    }

    // Метки зон вероятности и POP удалены - больше не используются

    // Метки для breakeven points (размещаем вверху графика)
    const maxPL = Math.max(...totalPLArray);
    breakevenPoints.forEach((point, index) => {
      annotations.push({
        x: point,
        y: maxPL,
        text: `BE: $${point.toFixed(2)}`,
        showarrow: false,
        xanchor: 'center',
        yanchor: 'bottom',
        font: {
          color: themeColors.breakeven,
          size: 11,
          weight: 'bold'
        },
        bgcolor: themeColors.annotationBg,
        borderpad: 5,
        bordercolor: themeColors.breakeven,
        borderwidth: 1
      });
    });

    // Layout для графика
    const layout = {
      paper_bgcolor: themeColors.paper,
      plot_bgcolor: themeColors.background,
      xaxis: {
        gridcolor: themeColors.grid,
        color: themeColors.text,
        tickformat: '$,.2f',
        zeroline: true,
        zerolinecolor: themeColors.zeroline,
        zerolinewidth: 2,
        showline: true,
        linecolor: themeColors.grid,
        fixedrange: false
      },
      yaxis: {
        title: {
          text: 'Profit / Loss',
          font: {
            color: themeColors.text,
            size: 14
          }
        },
        gridcolor: themeColors.grid,
        color: themeColors.text,
        tickformat: '$,.0f',
        zeroline: true,
        zerolinecolor: themeColors.zeroline,
        zerolinewidth: 2,
        showline: true,
        linecolor: themeColors.grid,
        fixedrange: false
      },
      hovermode: 'x unified',
      showlegend: true,
      legend: {
        x: 0.02,
        y: 0.98,
        bgcolor: isDarkMode ? 'rgba(26, 26, 26, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        bordercolor: themeColors.grid,
        borderwidth: 1,
        font: {
          color: themeColors.text,
          size: 12
        }
      },
      shapes: shapes,
      annotations: annotations,
      margin: {
        l: 100,
        r: 40,
        t: 80,
        b: 70
      },
      autosize: true,
      dragmode: 'pan'
    };

    // Config для кнопок управления - оставляем только lasso2d и select2d для удаления
    const config = {
      displayModeBar: true,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
      displaylogo: false,
      scrollZoom: false,
      toImageButtonOptions: {
        format: 'png',
        filename: 'options_pl_chart',
        height: 800,
        width: 1200,
        scale: 2
      }
    };


    // Добавляем точку схождения в самом конце, чтобы она была поверх всех элементов
    if (convergencePointTrace) {
      traces.push(convergencePointTrace);
    }

    return {
      traces,
      layout,
      config
    };
  }, [options, currentPrice, positions, isDarkMode, showOptionLines, daysPassed, showProbabilityZones, xAxisRange, calculateUnderlyingPL, targetPrice, ivSurface, dividendYield, isAIEnabled, aiVolatilityMap, calculateOptionPLValue, calculateOptionExpirationPLValue]);

  if (!chartData) {
    return (
      <div className="h-[400px] flex items-center justify-center border border-dashed border-gray-300 rounded-lg">
        <div className="text-center">
          <p className="text-muted-foreground mb-2">График недоступен</p>
          <p className="text-sm text-muted-foreground/70">
            Добавьте опционы или позиции базового актива для отображения графика
          </p>
        </div>
      </div>
    );
  }

  const { traces, layout, config } = chartData;

  // Обработчик для пересчета данных при zoom/pan
  const handleRelayout = (relayoutData) => {
    // Игнорируем события от кнопок autoscale и reset
    if (relayoutData['xaxis.autorange'] !== undefined || relayoutData['yaxis.autorange'] !== undefined) {
      console.log('📊 Autoscale/Reset detected, clearing xAxisRange');
      setXAxisRange(null);
      return;
    }

    // Когда пользователь зумирует или сдвигает график,
    // обновляем видимый диапазон для пересчета данных
    if (relayoutData['xaxis.range[0]'] !== undefined && relayoutData['xaxis.range[1]'] !== undefined) {
      setXAxisRange([relayoutData['xaxis.range[0]'], relayoutData['xaxis.range[1]']]);
      console.log('📊 Graph zoomed/panned:', relayoutData['xaxis.range[0]'], 'to', relayoutData['xaxis.range[1]']);
    }
  };

  return (
    <div className="w-full">
      <div className="w-full h-[600px]">
        <Plot
          data={traces}
          layout={{
            ...layout,
            autosize: true,
            margin: {
              l: 100,
              r: 40,
              t: 80,
              b: 70
            }
          }}
          config={config}
          style={{ width: '100%', height: '100%' }}
          useResizeHandler={true}
          onRelayout={handleRelayout}
        />
      </div>
      {/* ЗАЧЕМ: кривая — чистая теория (BSM/Black-76), она не учитывает ручную поправку Fact P&L,
          которую заказчик вводит из брокера — эту поправку применяет только таблица. Без подписи
          точка кривой при текущей цене могла молча разойтись с колонкой P&L и вызвать недоверие к графику. */}
      <p className="w-full text-center text-[11px] text-muted-foreground/60 mt-1">
        График — теоретический расчёт по модели, без учёта ручной поправки Fact P&L
      </p>
    </div>
  );
}

/**
 * Вспомогательная функция для расчета P&L данных
 * ЗАЧЕМ: Единая точная модель для расчета метрик (MAX прибыль, MAX убыток, Break-even)
 * 
 * Поддерживает два режима:
 * - 'stocks': Black-Scholes-Merton с дивидендами
 * - 'futures': Black-76 с pointValue
 * 
 * IMPORTANT: Используем daysPassed (прошедшие дни) вместо daysRemaining
 * Каждый опцион имеет свой initialDaysToExpiration (вычисляется из даты)
 * actualDaysRemaining = max(0, initialDaysToExpiration - daysPassed)
 * 
 * @param {Array} options - массив опционов
 * @param {number} currentPrice - текущая цена актива
 * @param {Array} positions - массив позиций базового актива
 * @param {number} daysPassed - прошедшие дни от сегодня (слайдер)
 * @param {Object} ivSurface - IV Surface для интерполяции (опционально)
 * @param {number} dividendYield - дивидендная доходность (только для stocks)
 * @param {boolean} isAIEnabled - включен ли AI
 * @param {Object} aiVolatilityMap - кэш AI волатильности
 * @param {number} targetPrice - целевая цена
 * @param {string} selectedTicker - тикер
 * @param {string} calculatorMode - режим калькулятора ('stocks' | 'futures')
 * @param {number} contractMultiplier - множитель контракта (100 для акций, pointValue для фьючерсов)
 * @returns {Object} - { prices, totalPLArray } для расчета метрик
 */
export function calculatePLDataForMetrics(options = [], currentPrice = 0, positions = [], daysPassed = 0, ivSurface = null, dividendYield = 0, isAIEnabled = false, aiVolatilityMap = {}, targetPrice = 0, selectedTicker = '', calculatorMode = 'stocks', contractMultiplier = 100) {
  if (!currentPrice || (options.length === 0 && positions.length === 0)) {
    return { prices: [], totalPLArray: [] };
  }

  const visibleOptions = options.filter(opt => opt.visible !== false);
  const visiblePositions = positions.filter(pos => pos.visible !== false);

  if (visibleOptions.length === 0 && visiblePositions.length === 0) {
    return { prices: [], totalPLArray: [] };
  }

  // Диапазон цен для расчёта метрик (±100% от текущей цены, НА ДАТУ ЭКСПИРАЦИИ)
  // ЗАЧЕМ: для стратегий с неограниченным риском (naked Sell CALL/PUT) нужен более широкий
  // диапазон, чтобы MAX убыток / MAX прибыль отражали реалистичный худший сценарий.
  const priceRange = 1.00;
  // Нижняя граница не должна быть нулём — Black-Scholes использует log(S), и S=0 даст -Infinity.
  const minPrice = Math.max(0.01, currentPrice * (1 - priceRange));
  const maxPrice = currentPrice * (1 + priceRange);

  const chartPoints = 500;
  const step = (maxPrice - minPrice) / chartPoints;

  // Массив цен для оси X
  const prices = [];
  for (let price = minPrice; price <= maxPrice; price += step) {
    prices.push(price);
  }

  // Расчет P&L для каждой цены
  const totalPLArray = new Array(prices.length).fill(0);

  // Добавляем P&L от позиций базового актива (линейная зависимость)
  // ЗАЧЕМ: Для фьючерсов P&L = разница в пунктах × quantity × pointValue
  // Для акций P&L = разница в цене × quantity (множитель не применяется к акциям напрямую)
  visiblePositions.forEach((position) => {
    prices.forEach((price, i) => {
      const { type, quantity, price: entryPrice } = position;
      const entryPriceNum = Number(entryPrice) || 0;
      let pl = 0;
      if (type === 'LONG') {
        // Для фьючерсов: (текущая цена - цена входа) × quantity × pointValue
        // Для акций: (текущая цена - цена входа) × quantity
        pl = (price - entryPriceNum) * quantity * (calculatorMode === CALCULATOR_MODES.FUTURES ? contractMultiplier : 1);
      } else if (type === 'SHORT') {
        pl = (entryPriceNum - price) * quantity * (calculatorMode === CALCULATOR_MODES.FUTURES ? contractMultiplier : 1);
      }
      totalPLArray[i] += pl;
    });
  });

  // Добавляем P&L от опционов (используем единую функцию из optionPricing.js)
  // ВАЖНО: Используем UTC для консистентности между часовыми поясами
  // Вычисляем самую старую дату входа для индивидуального расчёта daysPassed
  const oldestEntryDate = getOldestEntryDate(options);

  visibleOptions.forEach((option) => {
    // Проверяем, активен ли опцион на текущий день симуляции
    // ЗАЧЕМ: Если целевая дата раньше даты входа опциона, он ещё не куплен
    if (!isOptionActiveAtDay(option, daysPassed, oldestEntryDate)) {
      return; // Пропускаем неактивные опционы
    }

    // Вычисляем индивидуальный daysRemaining для этого опциона
    // ВАЖНО: Передаём oldestEntryDate для корректного расчёта actualDaysPassed
    // Точная (ET, дробная) версия — значение идёт прямо в ценообразование (calculateOptionPLValue/
    // calculateFuturesOptionPLValue ниже) и в IV-интерполяцию, гардов на этом значении в блоке нет
    // (активность ноги уже проверена выше через isOptionActiveAtDay — целочисленную функцию).
    const optionDaysRemaining = calculateDaysRemainingPreciseET(option, daysPassed, 30, oldestEntryDate);
    // Получаем IV из API через единую функцию (как в usePositionExitCalculator)
    // ivSurface используется для точной интерполяции IV между датами экспирации
    const currentDaysToExpiration = calculateDaysRemainingPreciseET(option, 0, 30, oldestEntryDate);
    // ЗАЧЕМ: метрики (MAX прибыль/убыток, Break-even) должны учитывать ручную Fact IV,
    // как и таблица — иначе метрики расходятся с колонкой Fact IV в таблице
    const todaySimDaysForOpt = calculateDaysToExpirationFromTodayPreciseET(option);
    let optionVolatility = getOptionVolatility(option, currentDaysToExpiration, optionDaysRemaining, ivSurface, 'simple', null, option.manualIvOverride, todaySimDaysForOpt);

    // Используем AI волатильность если доступна
    if (isAIEnabled && aiVolatilityMap && selectedTicker && targetPrice) {
      const cacheKey = `${selectedTicker}_${option.strike}_${option.date}_${targetPrice.toFixed(2)}_${optionDaysRemaining}`;
      const aiVolatility = aiVolatilityMap[cacheKey];
      if (aiVolatility) {
        console.log('🤖 [PLChart/calculatePLDataForMetrics] Используем AI волатильность:', {
          strike: option.strike,
          standardIV: optionVolatility,
          aiIV: aiVolatility,
          cacheKey
        });
        optionVolatility = aiVolatility;
      }
    }

    prices.forEach((price, i) => {
      // ВАЖНО: При ручной премии обнуляем ask/bid, чтобы getEntryPrice() использовал premium
      // Если нет - передаем ручные Bid/Ask, если они изменены
      const tempOption = {
        ...option,
        premium: option.isPremiumModified ? option.customPremium : option.premium,
        ask: option.isPremiumModified ? 0 : (option.isAskModified ? option.customAsk : option.ask),
        bid: option.isPremiumModified ? 0 : (option.isBidModified ? option.customBid : option.bid),
      };
      // Выбираем модель расчёта в зависимости от режима калькулятора
      // ЗАЧЕМ: Режим "Фьючерсы" использует Black-76, режимы "Акции" и "Крипто" — BSM
      let pl;
      if (calculatorMode === CALCULATOR_MODES.FUTURES) {
        pl = calculateFuturesOptionPLValue(tempOption, price, optionDaysRemaining, contractMultiplier, optionVolatility);
      } else {
        // Для крипто — настраиваемый форвардный базис (по умолчанию 0 — старое
        // поведение, см. cryptoRateSettings.js), для акций — из FRED (null)
        const rfr = calculatorMode === CALCULATOR_MODES.CRYPTO ? getCryptoBasisRate() : null;
        pl = calculateStockOptionPLValue(tempOption, price, currentPrice, optionDaysRemaining, optionVolatility, dividendYield, contractMultiplier, rfr);
      }
      totalPLArray[i] += pl;
    });
  });

  return { prices, totalPLArray };
}

export default PLChart;
