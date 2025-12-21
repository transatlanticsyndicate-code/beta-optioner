/**
 * Утилиты форматирования для архива сделок
 * ЗАЧЕМ: Форматирование дат, типов и статусов сделок
 * Затрагивает: отображение данных в таблице
 */

import React from 'react';
import { TrendingUp, BarChart3, Activity, Target, Bitcoin } from 'lucide-react';

// Форматирование даты
export const formatDate = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Форматирование типа сделки
export const formatDealType = (type) => {
  const types = {
    stocks: { label: 'Акции', icon: TrendingUp, color: 'text-green-500' },
    futures: { label: 'Фьючерсы', icon: Activity, color: 'text-blue-500' },
    indices: { label: 'Индексы', icon: BarChart3, color: 'text-purple-500' },
    options: { label: 'Опционы', icon: Target, color: 'text-orange-500' },
    crypto: { label: 'Критовалюта', icon: Bitcoin, color: 'text-yellow-500' }
  };
  const typeInfo = types[type];
  if (!typeInfo) return type;
  
  const IconComponent = typeInfo.icon;
  return (
    <div className="flex items-center gap-2">
      <IconComponent className={`h-4 w-4 ${typeInfo.color}`} />
      {typeInfo.label}
    </div>
  );
};

// Форматирование статуса
export const formatStatus = (status) => {
  const statuses = {
    'ПРОЕКТ': { label: 'ПРОЕКТ', color: 'text-black' },
    'В РАБОТЕ': { label: 'В РАБОТЕ', color: 'text-orange-600' },
    'ЗАКРЫТА': { label: 'ЗАКРЫТА', color: 'text-gray-500' }
  };
  const statusInfo = statuses[status] || { label: status, color: 'text-gray-500' };
  return <span className={`font-medium ${statusInfo.color}`}>{statusInfo.label}</span>;
};
