/**
 * Заголовок таблицы опционов
 * ЗАЧЕМ: Отображение колонок таблицы
 */

import React from 'react';

export function TableHeader() {
  return (
    <thead className="bg-gray-50">
      <tr>
        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Видимость</th>
        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Тип</th>
        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Страйк</th>
        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Дата</th>
        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Премия</th>
        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Кол-во</th>
        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">P&L</th>
        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ликвидность</th>
        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Действия</th>
      </tr>
    </thead>
  );
}
