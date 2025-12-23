/**
 * Индикатор статуса данных акций (Prev Day Close / Real-time)
 * ЗАЧЕМ: Показывает пользователю статус подключения к данным акций
 * Затрагивает: TopNav, отображение статуса Massive API
 * 
 * Бесплатный тариф: только цена закрытия предыдущего торгового дня
 * Stocks Advanced ($199/мес): Real-time данные
 */

import React, { useState, useEffect } from 'react';
import './LiveDataIndicator.css';
import massiveLogo from '../massive.png';

const StocksDataIndicator = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkRealtimeStatus();
    // Проверка каждую минуту для актуализации статуса
    const interval = setInterval(checkRealtimeStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  // Запрос статуса real-time доступа к акциям
  const checkRealtimeStatus = async () => {
    try {
      const response = await fetch('/api/polygon/realtime-status');
      const data = await response.json();
      
      if (data.status === 'success') {
        setStatus(data);
      }
      setLoading(false);
    } catch (error) {
      console.error('Ошибка проверки статуса акций:', error);
      setLoading(false);
    }
  };

  // Состояние загрузки
  if (loading) {
    return (
      <div className="live-indicator loading">
        <div className="indicator-logo-wrapper">
          <img src={massiveLogo} alt="Massive" className="indicator-logo" />
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
    
    // Real-time данные (Stocks Advanced $199/мес)
    if (status.has_realtime) {
      return 'live';
    } 
    // Delayed/Prev Day Close данные (Developer тариф - бесплатно)
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
        return 'Акции: Weekend';
      } else if (reason === 'pre_market') {
        return 'Акции: Pre-market';
      } else if (reason === 'after_hours') {
        return 'Акции: Closed';
      }
      return 'Акции: Market Closed';
    }
    
    // Real-time (Stocks Advanced)
    if (status.has_realtime) {
      return 'Акции: LIVE';
    } 
    // Prev Day Close (бесплатный тариф)
    else if (status.tier === 'developer' || status.data_type === 'prev_day_close') {
      return 'Акции: Prev Day';
    } 
    // Offline
    else {
      return 'Акции: Offline';
    }
  };

  // Текст тултипа при наведении
  const getTooltipText = () => {
    if (status.market_status && !status.market_status.is_open) {
      return 'Рынок закрыт';
    }
    
    if (status.has_realtime) {
      return 'Real-time данные по акциям (Stocks Advanced $199/мес)';
    } else if (status.tier === 'developer' || status.data_type === 'prev_day_close') {
      return 'Бесплатный тариф: цена закрытия предыдущего торгового дня';
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
          src={massiveLogo} 
          alt="Massive" 
          className="indicator-logo"
        />
      </div>
      <span className="indicator-text">{getIndicatorText()}</span>
    </div>
  );
};

export default StocksDataIndicator;
