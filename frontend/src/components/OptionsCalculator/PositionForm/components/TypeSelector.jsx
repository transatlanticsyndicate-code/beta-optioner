/**
 * Селектор типа опциона (Call/Put)
 * ЗАЧЕМ: Выбор типа опциона
 * Затрагивает: форма добавления позиций
 */

import React from 'react';

export function TypeSelector({ value, onChange }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">
        Type
      </label>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange('call')}
          className={`py-3 px-4 rounded-lg font-semibold transition-all border-2 ${
            value === 'call'
              ? 'bg-blue-600 border-blue-500 text-white shadow-lg'
              : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-600 hover:border-gray-500'
          }`}
        >
          Call
        </button>
        <button
          type="button"
          onClick={() => onChange('put')}
          className={`py-3 px-4 rounded-lg font-semibold transition-all border-2 ${
            value === 'put'
              ? 'bg-orange-600 border-orange-500 text-white shadow-lg'
              : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-600 hover:border-gray-500'
          }`}
        >
          Put
        </button>
      </div>
    </div>
  );
}
