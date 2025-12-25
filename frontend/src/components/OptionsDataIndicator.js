/**
 * Индикатор статуса данных опционов (Real-time / Delayed)
 * ЗАЧЕМ: Показывает пользователю статус подключения к real-time данным опционов
 * Затрагивает: TopNav, отображение статуса Massive API
 */

import React, { useState, useEffect } from 'react';
import './LiveDataIndicator.css';

const OptionsDataIndicator = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkRealtimeStatus();
    // Проверка каждую минуту для актуализации статуса
    const interval = setInterval(checkRealtimeStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  // Запрос статуса real-time доступа к опционам
  const checkRealtimeStatus = async () => {
    try {
      const response = await fetch('/api/polygon/realtime-status-options');
      const data = await response.json();
      
      if (data.status === 'success') {
        setStatus(data);
      }
      setLoading(false);
    } catch (error) {
      console.error('Ошибка проверки статуса опционов:', error);
      setLoading(false);
    }
  };

  // Состояние загрузки
  if (loading) {
    return (
      <div className="live-indicator loading">
        <div className="indicator-logo-wrapper">
          <img src="/images/massive.svg" alt="Massive" className="indicator-logo" />
        </div>
        <span className="indicator-text">Проверка...</span>
      </div>
    );
  }

  // Если нет данных, не показываем индикатор
  if (!status) {
    return null;
  }

  // Определение CSS класса на основе статуса
  const getIndicatorClass = () => {
    // Рынок закрыт
    if (status.market_status && !status.market_status.is_open) {
      return 'offline';
    }
    
    // Real-time данные (Options Advanced $199/мес)
    if (status.has_realtime) {
      return 'live';
    } 
    // Delayed данные (Developer тариф)
    else if (status.tier === 'developer') {
      return 'delayed';
    } 
    // Offline
    else {
      return 'offline';
    }
  };

  // Текст индикатора
  const getIndicatorText = () => {
    // Статусы закрытого рынка
    if (status.market_status && !status.market_status.is_open) {
      const reason = status.market_status.reason;
      if (reason === 'weekend') {
        return 'Опционы: Weekend';
      } else if (reason === 'pre_market') {
        return 'Опционы: Pre-market';
      } else if (reason === 'after_hours') {
        return 'Опционы: Closed';
      }
      return 'Опционы: Market Closed';
    }
    
    // Real-time (Options Advanced)
    if (status.has_realtime) {
      return 'Опционы: LIVE';
    } 
    // Delayed (15 минут задержка)
    else if (status.delay_minutes > 0) {
      return `Опционы: ${status.delay_minutes} min`;
    } 
    // Offline
    else {
      return 'Опционы: Offline';
    }
  };

  // Текст тултипа при наведении
  const getTooltipText = () => {
    if (status.market_status && !status.market_status.is_open) {
      return 'Рынок закрыт';
    }
    
    if (status.has_realtime) {
      return 'Real-time данные по опционам (Options Advanced $199/мес)';
    } else if (status.delay_minutes > 0) {
      return `Задержка данных: ${status.delay_minutes} минут`;
    } else {
      return 'Данные недоступны';
    }
  };

  return (
    <div 
      className={`live-indicator ${getIndicatorClass()}`}
      title={getTooltipText()}
    >
      <div className="indicator-logo-wrapper">
        <img 
          src="/images/massive.svg" 
          alt="Massive" 
          className="indicator-logo"
        />
      </div>
      <span className="indicator-text">{getIndicatorText()}</span>
    </div>
  );
};

export default OptionsDataIndicator;
