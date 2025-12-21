/**
 * Компонент карточек метрик анализа
 * ЗАЧЕМ: Отображение ключевых метрик опционного рынка (цена, max pain, P/C ratio, gamma)
 * Затрагивает: UI метрик
 */

import React from 'react';
import {
  formatVolume,
  formatGammaExposure,
  getGammaTrend,
  getPutCallRatio,
  getPutCallTrend
} from '../utils/formatters';

export function MetricsCards({ analysis }) {
  return (
    <>
      {/* Основные метрики */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Цена */}
        <div className="p-4 bg-white rounded-lg border border-gray-200">
          <div className="text-xs text-gray-500 uppercase mb-2 font-medium">Цена</div>
          <div className="text-3xl font-bold mb-1">
            ${analysis.stock_data.price?.toFixed(2)}
          </div>
          <div className={`text-sm font-semibold ${
            analysis.stock_data.change >= 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            {analysis.stock_data.change >= 0 ? '+' : ''}
            {analysis.stock_data.change_percent?.toFixed(2)}%
          </div>
        </div>

        {/* Max Pain */}
        {analysis.metrics.max_pain && (
          <div className="p-4 bg-white rounded-lg border border-gray-200">
            <div className="text-xs text-gray-500 uppercase mb-2 font-medium">Max Pain</div>
            <div className="text-3xl font-bold mb-1">
              ${analysis.metrics.max_pain.toFixed(2)}
            </div>
            <div className="text-xs text-gray-400">
              {analysis.metrics.max_pain_contracts || 0} контрактов
            </div>
          </div>
        )}

        {/* P/C Ratio */}
        {analysis.metrics.put_call_ratio && (
          <div className="p-4 bg-white rounded-lg border border-gray-200">
            <div className="text-xs text-gray-500 uppercase mb-2 font-medium">P/C Ratio</div>
            <div className="text-3xl font-bold mb-1">
              {getPutCallRatio(analysis.metrics.put_call_ratio)}
            </div>
            <div className="text-xs text-gray-400">
              {getPutCallTrend(analysis.metrics.put_call_ratio)}
            </div>
          </div>
        )}

        {/* Gamma Exp */}
        {analysis.metrics.gamma_exposure && (
          <div className="p-4 bg-white rounded-lg border border-gray-200">
            <div className="text-xs text-gray-500 uppercase mb-2 font-medium">Gamma Exp.</div>
            <div className="text-3xl font-bold mb-1">
              {formatGammaExposure(analysis.metrics.gamma_exposure)}
            </div>
            <div className="text-xs text-gray-400">
              {getGammaTrend(analysis.metrics.gamma_exposure)}
            </div>
          </div>
        )}
      </div>

      {/* Дополнительные метрики */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* До экспирации */}
        {analysis.metrics.days_to_expiry !== undefined && (
          <div className="p-4 bg-white rounded-lg border border-gray-200">
            <div className="text-xs text-gray-500 uppercase mb-2 font-medium">До экспирации</div>
            <div className="text-3xl font-bold mb-1">
              {analysis.metrics.days_to_expiry} дн.
            </div>
            <div className="text-xs text-gray-400">Критическая зона</div>
          </div>
        )}

        {/* Объем торгов */}
        <div className="p-4 bg-white rounded-lg border border-gray-200">
          <div className="text-xs text-gray-500 uppercase mb-2 font-medium">Объем торгов</div>
          <div className="text-3xl font-bold mb-1">
            {formatVolume(analysis.stock_data.volume)}
          </div>
          <div className="text-xs text-gray-400">Контрактов за день</div>
        </div>

        {/* High / Low */}
        <div className="p-4 bg-white rounded-lg border border-gray-200">
          <div className="text-xs text-gray-500 uppercase mb-2 font-medium">High / Low</div>
          <div className="text-2xl font-bold mb-1">
            ${analysis.stock_data.high?.toFixed(2)}
          </div>
          <div className="text-sm text-gray-600">
            ${analysis.stock_data.low?.toFixed(2)}
          </div>
        </div>
      </div>
    </>
  );
}
