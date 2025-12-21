/**
 * Опционные стратегии для калькулятора V2
 * Взято из Quick Strategies предыдущей версии калькулятора
 */

export const optionsStrategies = {
  longCall: {
    id: 'longCall',
    name: 'Long Call',
    nameRu: 'Длинный колл',
    sentiment: 'bullish', // bullish, bearish, neutral
    description: 'Покупка колл-опциона. Прибыль при росте цены.',
    shortDescription: 'Прибыль при росте цены',
    risk: 'Ограниченный (премия)',
    reward: 'Неограниченный',
    positions: (price) => [
      {
        action: 'Buy',
        type: 'CALL',
      }
    ]
  },
  longPut: {
    id: 'longPut',
    name: 'Long Put',
    nameRu: 'Длинный пут',
    sentiment: 'bearish',
    description: 'Покупка пут-опциона. Прибыль при падении цены.',
    shortDescription: 'Прибыль при падении цены',
    risk: 'Ограниченный (премия)',
    reward: 'Высокий',
    positions: (price) => [
      {
        action: 'Buy',
        type: 'PUT',
      }
    ]
  },
  shortCall: {
    id: 'shortCall',
    name: 'Short Call',
    nameRu: 'Короткий колл',
    sentiment: 'bearish',
    description: 'Продажа колл-опциона. Прибыль если цена не растет.',
    shortDescription: 'Прибыль если цена не растет',
    risk: 'Неограниченный',
    reward: 'Ограниченный (премия)',
    positions: (price) => [
      {
        action: 'Sell',
        type: 'CALL',
      }
    ]
  },
  shortPut: {
    id: 'shortPut',
    name: 'Short Put',
    nameRu: 'Короткий пут',
    sentiment: 'bullish',
    description: 'Продажа пут-опциона. Прибыль если цена не падает.',
    shortDescription: 'Прибыль если цена не падает',
    risk: 'Высокий',
    reward: 'Ограниченный (премия)',
    positions: (price) => [
      {
        action: 'Sell',
        type: 'PUT',
      }
    ]
  },
  bullCallSpread: {
    id: 'bullCallSpread',
    name: 'Bull Call Spread',
    nameRu: 'Спред, бычий колл',
    sentiment: 'bullish',
    description: 'Покупка колла + продажа колла выше. Умеренная прибыль при росте.',
    shortDescription: 'Умеренная прибыль при росте',
    risk: 'Ограниченный',
    reward: 'Ограниченный',
    positions: (price) => [
      {
        action: 'Buy',
        type: 'CALL',
      },
      {
        action: 'Sell',
        type: 'CALL',
      }
    ]
  },
  bearCallSpread: {
    id: 'bearCallSpread',
    name: 'Bear Call Spread',
    nameRu: 'Спред, медвежий колл',
    sentiment: 'bearish',
    description: 'Продажа колла + покупка колла выше. Прибыль при падении.',
    shortDescription: 'Прибыль при падении',
    risk: 'Ограниченный',
    reward: 'Ограниченный',
    positions: (price) => [
      {
        action: 'Sell',
        type: 'CALL',
      },
      {
        action: 'Buy',
        type: 'CALL',
      }
    ]
  },
  bearPutSpread: {
    id: 'bearPutSpread',
    name: 'Bear Put Spread',
    nameRu: 'Спред, медвежий пут',
    sentiment: 'bearish',
    description: 'Покупка пута + продажа пута ниже. Умеренная прибыль при падении.',
    shortDescription: 'Умеренная прибыль при падении',
    risk: 'Ограниченный',
    reward: 'Ограниченный',
    positions: (price) => [
      {
        action: 'Buy',
        type: 'PUT',
      },
      {
        action: 'Sell',
        type: 'PUT',
      }
    ]
  },
  bullPutSpread: {
    id: 'bullPutSpread',
    name: 'Bull Put Spread',
    nameRu: 'Спред, бычий пут',
    sentiment: 'bullish',
    description: 'Продажа пута + покупка пута ниже. Прибыль при росте.',
    shortDescription: 'Прибыль при росте',
    risk: 'Ограниченный',
    reward: 'Ограниченный',
    positions: (price) => [
      {
        action: 'Sell',
        type: 'PUT',
      },
      {
        action: 'Buy',
        type: 'PUT',
      }
    ]
  },
  straddle: {
    id: 'straddle',
    name: 'Long Straddle',
    nameRu: 'Стрэддл',
    sentiment: 'neutral',
    description: 'Покупка колла и пута ATM. Прибыль при сильном движении в любую сторону.',
    shortDescription: 'Прибыль при сильном движении',
    risk: 'Ограниченный (2 премии)',
    reward: 'Высокий',
    positions: (price) => [
      {
        action: 'Buy',
        type: 'CALL',
      },
      {
        action: 'Buy',
        type: 'PUT',
      }
    ]
  },
  strangle: {
    id: 'strangle',
    name: 'Long Strangle',
    nameRu: 'Стрэнгл',
    sentiment: 'neutral',
    description: 'Покупка OTM колла и пута. Дешевле стрэддла, нужно большее движение.',
    shortDescription: 'Прибыль при большом движении',
    risk: 'Ограниченный (2 премии)',
    reward: 'Высокий',
    positions: (price) => [
      {
        action: 'Buy',
        type: 'CALL',
      },
      {
        action: 'Buy',
        type: 'PUT',
      }
    ]
  },
  ironCondor: {
    id: 'ironCondor',
    name: 'Iron Condor',
    nameRu: 'Железный кондор',
    sentiment: 'neutral',
    description: 'Продажа стрэнгла + покупка дальних опционов. Прибыль в диапазоне.',
    shortDescription: 'Прибыль в диапазоне цен',
    risk: 'Ограниченный',
    reward: 'Ограниченный',
    positions: (price) => [
      {
        action: 'Sell',
        type: 'PUT',
      },
      {
        action: 'Sell',
        type: 'CALL',
      },
      {
        action: 'Buy',
        type: 'PUT',
      },
      {
        action: 'Buy',
        type: 'CALL',
      }
    ]
  },
  butterfly: {
    id: 'butterfly',
    name: 'Butterfly Spread',
    nameRu: 'Спред бабочка',
    sentiment: 'neutral',
    description: 'Покупка 2 ATM + продажа 1 выше и 1 ниже. Прибыль если цена не движется.',
    shortDescription: 'Прибыль при стабильной цене',
    risk: 'Ограниченный',
    reward: 'Ограниченный',
    positions: (price) => [
      {
        action: 'Buy',
        type: 'CALL',
      },
      {
        action: 'Sell',
        type: 'CALL',
      },
      {
        action: 'Buy',
        type: 'CALL',
      }
    ]
  },
  ironButterfly: {
    id: 'ironButterfly',
    name: 'Iron Butterfly',
    nameRu: 'Железная бабочка',
    sentiment: 'neutral',
    description: 'Продажа ATM стрэддла + покупка дальних опционов.',
    shortDescription: 'Прибыль при минимальном движении',
    risk: 'Ограниченный',
    reward: 'Ограниченный',
    positions: (price) => [
      {
        action: 'Sell',
        type: 'CALL',
      },
      {
        action: 'Sell',
        type: 'PUT',
      },
      {
        action: 'Buy',
        type: 'CALL',
      },
      {
        action: 'Buy',
        type: 'PUT',
      }
    ]
  }
};

// Получить список всех стратегий
export const getAllStrategies = () => {
  return Object.values(optionsStrategies);
};

// Получить стратегию по ID
export const getStrategyById = (id) => {
  return optionsStrategies[id];
};

// Применить стратегию (сгенерировать позиции)
export const applyStrategy = (strategyId, currentPrice) => {
  const strategy = optionsStrategies[strategyId];
  if (!strategy) return [];
  
  return strategy.positions(currentPrice);
};
