import React, { useEffect, useState } from 'react';
import './DataSourceIndicator.css';

/**
 * Индикатор источника данных
 * Показывает пользователю откуда берутся данные (Mock, IB Gateway, Polygon, etc.)
 */
export default function DataSourceIndicator() {
  const [sourceInfo, setSourceInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    fetchDataSourceInfo();
    
    // Обновляем каждые 60 секунд
    const interval = setInterval(fetchDataSourceInfo, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchDataSourceInfo = async () => {
    try {
      const response = await fetch('/api/data-source/info');
      if (!response.ok) {
        throw new Error('Failed to fetch data source info');
      }
      const data = await response.json();
      setSourceInfo(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching data source info:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return null; // Или показать skeleton
  }

  if (error || !sourceInfo || isHidden) {
    return null; // Не показываем индикатор если ошибка или скрыт
  }

  const { source_name, is_mock, icon, description, available_tickers } = sourceInfo;

  const handleClose = () => {
    setIsHidden(true);
  };

  return (
    <div className={`data-source-indicator ${is_mock ? 'mock' : 'production'}`}>
      <div className="data-source-indicator__icon">{icon}</div>
      <div className="data-source-indicator__content">
        <div className="data-source-indicator__name">{source_name}</div>
        <div className="data-source-indicator__description">{description}</div>
        {is_mock && available_tickers && (
          <div className="data-source-indicator__tickers">
            <strong>Доступные тикеры:</strong> {available_tickers.join(', ')}
          </div>
        )}
      </div>
      {is_mock && (
        <div className="data-source-indicator__badge">DEMO</div>
      )}
      <button 
        className="data-source-indicator__close" 
        onClick={handleClose}
        title="Скрыть до перезагрузки страницы"
      >
        ×
      </button>
    </div>
  );
}
