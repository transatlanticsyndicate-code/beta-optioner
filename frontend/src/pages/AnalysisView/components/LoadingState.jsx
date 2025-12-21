/**
 * Компонент состояния загрузки
 * ЗАЧЕМ: Отображение индикатора загрузки данных
 * Затрагивает: UI состояния загрузки
 */

import React from 'react';

export function LoadingState() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
        <p className="text-gray-600">Загрузка анализа...</p>
      </div>
    </div>
  );
}
