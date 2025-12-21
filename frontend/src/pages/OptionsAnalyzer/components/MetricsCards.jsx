/**
 * Карточки метрик анализа опционов
 * ЗАЧЕМ: Отображение ключевых метрик (цена, Max Pain, P/C Ratio и др.)
 * Затрагивает: визуализация данных, форматирование
 */

import React from 'react';

export function MetricsCards({ stockData, metrics }) {
  if (!stockData || !metrics) return null;

  return (
    <div className="metrics-cards">
      <div className="metric-card">
        <div className="metric-label">Цена</div>
        <div className="metric-value">${stockData.price.toFixed(2)}</div>
        <div className={`metric-change ${stockData.change >= 0 ? 'positive' : 'negative'}`}>
          {stockData.change >= 0 ? '+' : ''}{stockData.change_percent.toFixed(2)}%
        </div>
      </div>
      
      <div className="metric-card">
        <div className="metric-label">Max Pain</div>
        <div className="metric-value">${metrics.max_pain.toFixed(2)}</div>
        <div className="metric-hint">{metrics.total_contracts} контрактов</div>
      </div>
      
      <div className="metric-card">
        <div className="metric-label">P/C Ratio</div>
        <div className="metric-value">{metrics.put_call_ratio.volume_ratio.toFixed(2)}</div>
        <div className="metric-hint">
          {metrics.put_call_ratio.volume_ratio < 0.7 ? 'Бычий' : 
           metrics.put_call_ratio.volume_ratio > 1.3 ? 'Медвежий' : 'Нейтральный'}
        </div>
      </div>
      
      <div className="metric-card">
        <div className="metric-label">Gamma Exp.</div>
        <div className="metric-value">
          {Math.abs(metrics.gamma_exposure.total_gamma) > 1000000 
            ? (metrics.gamma_exposure.total_gamma / 1000000).toFixed(1) + 'M'
            : Math.abs(metrics.gamma_exposure.total_gamma) > 1000
            ? (metrics.gamma_exposure.total_gamma / 1000).toFixed(1) + 'K'
            : metrics.gamma_exposure.total_gamma.toFixed(0)}
        </div>
        <div className="metric-hint">
          {metrics.gamma_exposure.total_gamma > 0 ? 'Стабилизация' : 'Волатильность'}
        </div>
      </div>
      
      <div className="metric-card">
        <div className="metric-label">До Экспирации</div>
        <div className="metric-value">{metrics.days_to_expiry || 0} дн.</div>
        <div className="metric-hint">
          {metrics.days_to_expiry < 3 ? 'Критическая зона' : 'Нормально'}
        </div>
      </div>

      <div className="metric-card">
        <div className="metric-label">Объем</div>
        <div className="metric-value">
          {metrics.total_volume > 1000000
            ? (metrics.total_volume / 1000000).toFixed(1) + 'M'
            : (metrics.total_volume / 1000).toFixed(0) + 'K'}
        </div>
        <div className="metric-hint">Опционов</div>
      </div>

      <div className="metric-card">
        <div className="metric-label">Поддержка</div>
        <div className="metric-value">
          ${metrics.key_levels?.support_levels?.[0]?.strike?.toFixed(2) || 'N/A'}
        </div>
        <div className="metric-hint">
          {metrics.key_levels?.support_levels?.[0]?.oi
            ? `OI: ${(metrics.key_levels.support_levels[0].oi / 1000).toFixed(0)}K`
            : 'Нет данных'}
        </div>
      </div>

      <div className="metric-card">
        <div className="metric-label">Сопротивление</div>
        <div className="metric-value">
          ${metrics.key_levels?.resistance_levels?.[0]?.strike?.toFixed(2) || 'N/A'}
        </div>
        <div className="metric-hint">
          {metrics.key_levels?.resistance_levels?.[0]?.oi
            ? `OI: ${(metrics.key_levels.resistance_levels[0].oi / 1000).toFixed(0)}K`
            : 'Нет данных'}
        </div>
      </div>

      <div className="metric-card">
        <div className="metric-label">IV Rank</div>
        <div className="metric-value">
          {metrics.iv_rank?.iv_rank ? `${metrics.iv_rank.iv_rank}%` : 'N/A'}
        </div>
        <div className="metric-hint">
          {metrics.iv_rank?.iv_rank
            ? `${metrics.iv_rank.iv_rank < 25 ? 'Низкая' : metrics.iv_rank.iv_rank > 75 ? 'Высокая' : 'Средняя'} волатильность`
            : 'Расчет...'}
        </div>
      </div>
    </div>
  );
}
