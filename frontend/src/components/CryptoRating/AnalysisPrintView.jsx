/**
 * Компонент печатной версии анализа криптовалют
 * ЗАЧЕМ: Создание красивого PDF-отчёта для экспорта анализа
 * Затрагивает: страница /tools/crypto-rating
 */

import React, { forwardRef } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';

/**
 * Печатная версия анализа криптовалют
 * Используется для генерации PDF через html2pdf.js
 */
const AnalysisPrintView = forwardRef(({ analysis }, ref) => {
  if (!analysis) return null;

  // Форматирование даты для отчёта
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Текущая дата генерации отчёта
  const generatedAt = new Date().toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div 
      ref={ref}
      className="bg-white text-black p-8"
      style={{ 
        width: '210mm', 
        minHeight: '297mm',
        fontFamily: 'Arial, sans-serif'
      }}
    >
      {/* Заголовок отчёта */}
      <div className="text-center mb-8 pb-6 border-b-2 border-gray-300">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          Анализ изменений Топ-400 криптовалют
        </h1>
        <p className="text-lg text-gray-600">
          Дата анализа: {formatDate(analysis.created_at)}
        </p>
      </div>

      {/* Сводка */}
      <div className="flex justify-center gap-12 mb-8">
        <div className="text-center px-8 py-4 bg-red-50 rounded-lg border border-red-200">
          <div className="flex items-center justify-center gap-2 mb-2">
            <TrendingDown className="h-6 w-6 text-red-600" />
            <span className="text-3xl font-bold text-red-600">
              {analysis.dropped_cryptos?.length || 0}
            </span>
          </div>
          <p className="text-sm text-red-700 font-medium">Выпали из рейтинга</p>
        </div>
        
        <div className="text-center px-8 py-4 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center justify-center gap-2 mb-2">
            <TrendingUp className="h-6 w-6 text-green-600" />
            <span className="text-3xl font-bold text-green-600">
              {analysis.added_cryptos?.length || 0}
            </span>
          </div>
          <p className="text-sm text-green-700 font-medium">Вошли в рейтинг</p>
        </div>
      </div>

      {/* Две колонки: Выпали и Вошли */}
      <div className="grid grid-cols-2 gap-6">
        {/* Выпали из рейтинга */}
        <div>
          <h2 className="text-xl font-bold text-red-700 mb-4 pb-2 border-b-2 border-red-300 flex items-center gap-2">
            <TrendingDown className="h-5 w-5" />
            Выпали из Топ-400
          </h2>
          
          {analysis.dropped_cryptos?.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-red-100">
                  <th className="px-3 py-2 text-left font-semibold text-red-800">№</th>
                  <th className="px-3 py-2 text-left font-semibold text-red-800">Символ</th>
                  <th className="px-3 py-2 text-left font-semibold text-red-800">Название</th>
                </tr>
              </thead>
              <tbody>
                {analysis.dropped_cryptos.map((crypto, index) => (
                  <tr 
                    key={index} 
                    className={index % 2 === 0 ? 'bg-red-50' : 'bg-white'}
                  >
                    <td className="px-3 py-2 text-gray-600">{index + 1}</td>
                    <td className="px-3 py-2 font-medium text-red-700">{crypto.symbol}</td>
                    <td className="px-3 py-2 text-gray-700">{crypto.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-gray-500 italic py-4">Нет изменений</p>
          )}
        </div>

        {/* Вошли в рейтинг */}
        <div>
          <h2 className="text-xl font-bold text-green-700 mb-4 pb-2 border-b-2 border-green-300 flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Вошли в Топ-400
          </h2>
          
          {analysis.added_cryptos?.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-green-100">
                  <th className="px-3 py-2 text-left font-semibold text-green-800">№</th>
                  <th className="px-3 py-2 text-left font-semibold text-green-800">Символ</th>
                  <th className="px-3 py-2 text-left font-semibold text-green-800">Название</th>
                </tr>
              </thead>
              <tbody>
                {analysis.added_cryptos.map((crypto, index) => (
                  <tr 
                    key={index} 
                    className={index % 2 === 0 ? 'bg-green-50' : 'bg-white'}
                  >
                    <td className="px-3 py-2 text-gray-600">{index + 1}</td>
                    <td className="px-3 py-2 font-medium text-green-700">{crypto.symbol}</td>
                    <td className="px-3 py-2 text-gray-700">{crypto.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-gray-500 italic py-4">Нет изменений</p>
          )}
        </div>
      </div>

      {/* Футер — запрет разрыва страницы внутри блока */}
      <div 
        className="mt-12 pt-6 border-t-2 border-gray-300 text-center text-sm text-gray-500"
        style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
      >
        <p>Отчёт сгенерирован: {generatedAt}</p>
        <p className="mt-1">SYNDICATE Platform — Рейтинг криптовалют</p>
      </div>
    </div>
  );
});

AnalysisPrintView.displayName = 'AnalysisPrintView';

export default AnalysisPrintView;
