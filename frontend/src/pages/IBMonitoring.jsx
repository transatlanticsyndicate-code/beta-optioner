import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './IBMonitoring.css';

/**
 * Страница мониторинга IB Gateway
 * Показывает статус подключения, статистику запросов, ошибки и тесты
 * Доступна ТОЛЬКО на production
 */
export default function IBMonitoring() {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [testingAsset, setTestingAsset] = useState(null);

  // Проверка что мы на production
  const isProduction = process.env.REACT_APP_ENV === 'production';

  useEffect(() => {
    // Если не production - показываем заглушку
    if (!isProduction) {
      setIsLoading(false);
      return;
    }

    // Загружаем данные
    fetchStatus();
    fetchHistory();

    // Обновляем каждые 10 секунд
    const interval = setInterval(() => {
      fetchStatus();
      fetchHistory();
    }, 10000);

    return () => clearInterval(interval);
  }, [isProduction]);

  const fetchStatus = async () => {
    try {
      const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/api/ib/status`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch IB status:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/api/ib/requests/history?hours=24`);
      
      if (response.ok) {
        const data = await response.json();
        setHistory(data);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  };

  const testAsset = async (assetType, ticker = 'SPY') => {
    setTestingAsset(assetType);
    
    try {
      const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      const response = await fetch(
        `${API_URL}/api/ib/test/${assetType}?ticker=${ticker}`,
        { method: 'POST' }
      );
      
      const result = await response.json();
      
      setTestResults(prev => ({
        ...prev,
        [assetType]: result
      }));
      
      // Обновляем статус после теста
      setTimeout(fetchStatus, 500);
    } catch (err) {
      setTestResults(prev => ({
        ...prev,
        [assetType]: {
          status: 'error',
          error: err.message
        }
      }));
    } finally {
      setTestingAsset(null);
    }
  };

  // Если не production - показываем сообщение
  if (!isProduction) {
    return (
      <div className="ib-monitoring">
        <div className="ib-monitoring-header">
          <h1>🔒 IB Gateway Monitoring</h1>
          <p>Эта страница доступна только на production сервере</p>
        </div>
        <div className="ib-monitoring-not-available">
          <div className="icon">🚫</div>
          <h2>Недоступно</h2>
          <p>
            Мониторинг IB Gateway работает только на production окружении<br/>
            где подключен реальный IB Client Portal Gateway.
          </p>
          <p className="env-info">
            Текущее окружение: <strong>{process.env.REACT_APP_ENV || 'unknown'}</strong>
          </p>
          <button onClick={() => navigate('/')}>← Вернуться на главную</button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="ib-monitoring">
        <div className="ib-monitoring-header">
          <h1>IB Gateway Monitoring</h1>
        </div>
        <div className="loading">⏳ Загрузка...</div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="ib-monitoring">
        <div className="ib-monitoring-header">
          <h1>IB Gateway Monitoring</h1>
        </div>
        <div className="error">
          <div className="icon">❌</div>
          <h2>Ошибка подключения</h2>
          <p>{error}</p>
          <button onClick={fetchStatus}>🔄 Повторить</button>
        </div>
      </div>
    );
  }

  const isConnected = status?.status === 'connected';
  const isIBActive = status?.is_ib_active;

  return (
    <div className="ib-monitoring">
      {/* Header */}
      <div className="ib-monitoring-header">
        <h1>🔌 IB Gateway Monitoring</h1>
        <div className="header-info">
          <span>Обновлено: {status?.timestamp ? new Date(status.timestamp).toLocaleTimeString('ru-RU') : '-'}</span>
          <button onClick={fetchStatus} className="refresh-btn">
            🔄 Обновить
          </button>
        </div>
      </div>

      {/* Main Status */}
      <div className="status-section">
        <div className={`status-card ${isConnected ? 'connected' : 'disconnected'}`}>
          <div className="status-indicator">
            {isConnected ? '🟢' : '🔴'}
          </div>
          <div className="status-info">
            <h2>{isConnected ? 'Подключено' : 'Отключено'}</h2>
            <p>Источник данных: <strong>{status?.data_source}</strong></p>
            <p>IB Gateway: {isIBActive ? '✅ Активен' : '❌ Неактивен'}</p>
            {status?.last_successful_request && (
              <p className="last-request">
                Последний успешный запрос: {new Date(status.last_successful_request).toLocaleString('ru-RU')}
              </p>
            )}
          </div>
        </div>

        {/* Gateway Info */}
        {status?.gateway_info && (
          <div className="gateway-info-card">
            <h3>Информация о Gateway</h3>
            <div className="info-grid">
              <div className="info-item">
                <span className="label">URL:</span>
                <span className="value">{status.gateway_info.url || 'N/A'}</span>
              </div>
              <div className="info-item">
                <span className="label">Версия:</span>
                <span className="value">{status.gateway_info.version || 'N/A'}</span>
              </div>
              <div className="info-item">
                <span className="label">Paper Trading:</span>
                <span className="value">{status.gateway_info.paper_trading ? 'Да' : 'Нет'}</span>
              </div>
              <div className="info-item">
                <span className="label">Аутентификация:</span>
                <span className="value">
                  {status.auth_status?.authenticated ? '✅ Авторизован' : '❌ Не авторизован'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Requests Statistics */}
      <div className="stats-section">
        <h2>📊 Статистика запросов (последний час)</h2>
        <div className="stats-grid">
          {status?.requests_last_hour && Object.entries(status.requests_last_hour).map(([type, count]) => (
            <div key={type} className="stat-card">
              <div className="stat-icon">{getAssetIcon(type)}</div>
              <div className="stat-info">
                <h3>{getAssetName(type)}</h3>
                <p className="stat-value">{count}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Test Buttons */}
      <div className="test-section">
        <h2>🧪 Тестирование подключения</h2>
        <div className="test-grid">
          {['stocks', 'options', 'futures', 'indices', 'forex'].map(assetType => (
            <div key={assetType} className="test-card">
              <div className="test-header">
                <span className="test-icon">{getAssetIcon(assetType)}</span>
                <h3>{getAssetName(assetType)}</h3>
              </div>
              <button
                onClick={() => testAsset(assetType)}
                disabled={testingAsset === assetType}
                className="test-btn"
              >
                {testingAsset === assetType ? '⏳ Тестирую...' : '▶️ Проверить'}
              </button>
              {testResults[assetType] && (
                <div className={`test-result ${testResults[assetType].status}`}>
                  {testResults[assetType].status === 'success' ? (
                    <>
                      <span className="result-icon">✅</span>
                      <span>Успешно</span>
                    </>
                  ) : (
                    <>
                      <span className="result-icon">❌</span>
                      <span>{testResults[assetType].error || 'Ошибка'}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Errors Log */}
      {status?.errors && status.errors.length > 0 && (
        <div className="errors-section">
          <h2>⚠️ Последние ошибки</h2>
          <div className="errors-list">
            {status.errors.map((err, index) => (
              <div key={index} className="error-item">
                <div className="error-time">
                  {new Date(err.timestamp).toLocaleString('ru-RU')}
                </div>
                <div className="error-type">{err.asset_type}</div>
                <div className="error-message">{err.error}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History Chart */}
      {history && history.hourly_breakdown && Object.keys(history.hourly_breakdown).length > 0 && (
        <div className="history-section">
          <h2>📈 История запросов (24 часа)</h2>
          <div className="history-chart">
            {Object.entries(history.hourly_breakdown).map(([hour, stats]) => (
              <div key={hour} className="history-bar">
                <div className="bar-container">
                  <div
                    className="bar"
                    style={{ height: `${Math.min((stats.total / 50) * 100, 100)}%` }}
                    title={`${hour}: ${stats.total} запросов`}
                  >
                    <span className="bar-label">{stats.total}</span>
                  </div>
                </div>
                <div className="bar-time">{hour.split(' ')[1]}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper functions
function getAssetIcon(type) {
  const icons = {
    stocks: '📈',
    options: '📊',
    futures: '📉',
    indices: '🔢',
    forex: '💱',
    total: '🌐'
  };
  return icons[type] || '📄';
}

function getAssetName(type) {
  const names = {
    stocks: 'US Stocks',
    options: 'Options',
    futures: 'Futures',
    indices: 'Indices',
    forex: 'Forex',
    total: 'Всего'
  };
  return names[type] || type;
}
