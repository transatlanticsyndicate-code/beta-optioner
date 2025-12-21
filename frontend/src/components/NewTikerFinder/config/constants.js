/**
 * Константы для поиска тикеров
 * ЗАЧЕМ: Конфигурация типов инструментов и настроек
 */

import React from 'react';
import { TrendingUp, BarChart3, LineChart, Circle, Bitcoin } from 'lucide-react';

export const INSTRUMENT_TYPES = [
  { value: 'stock', label: 'Акции', icon: <TrendingUp className="h-4 w-4 text-green-500" /> },
  { value: 'futures', label: 'Фьючерсы', icon: <BarChart3 className="h-4 w-4 text-blue-500" /> },
  { value: 'index', label: 'Индексы', icon: <LineChart className="h-4 w-4 text-purple-500" /> },
  { value: 'options', label: 'Опционы', icon: <Circle className="h-4 w-4 text-orange-500" /> },
  { value: 'crypto', label: 'Криптовалюта', icon: <Bitcoin className="h-4 w-4 text-yellow-500" /> },
];

export const TICKER_HISTORY_KEY = 'new_ticker_finder_history';
