/**
 * Компонент истории тикеров
 * ЗАЧЕМ: Отображение недавно использованных тикеров
 */

import React from 'react';
import { Clock, Trash2 } from 'lucide-react';

export function TickerHistory({ history, onSelect, onRemove }) {
  if (history.length === 0) return null;

  return (
    <div className="mt-2 p-3 bg-muted/50 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Недавние</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {history.map((item, index) => (
          <div
            key={index}
            className="group flex items-center gap-1 px-2 py-1 bg-background border rounded hover:bg-accent cursor-pointer transition-colors"
          >
            <span onClick={() => onSelect(item.ticker, item.instrumentType)} className="text-sm font-mono">
              {item.ticker}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item.ticker);
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
