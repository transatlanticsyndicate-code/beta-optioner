/**
 * Селектор направления (Buy/Sell)
 * ЗАЧЕМ: Выбор направления позиции
 * Затрагивает: форма добавления позиций
 */

import React from 'react';

export function DirectionSelector({ value, onChange }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">
        Direction
      </label>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange('buy')}
          className={`py-3 px-4 rounded-lg font-semibold transition-all border-2 ${
            value === 'buy'
              ? 'bg-green-600 border-green-500 text-white shadow-lg'
              : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-600 hover:border-gray-500'
          }`}
        >
          Buy
        </button>
        <button
          type="button"
          onClick={() => onChange('sell')}
          className={`py-3 px-4 rounded-lg font-semibold transition-all border-2 ${
            value === 'sell'
              ? 'bg-red-600 border-red-500 text-white shadow-lg'
              : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-600 hover:border-gray-500'
          }`}
        >
          Sell
        </button>
      </div>
    </div>
  );
}
