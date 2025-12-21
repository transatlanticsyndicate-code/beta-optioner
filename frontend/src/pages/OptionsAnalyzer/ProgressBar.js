import React from 'react';
import './ProgressBar.css';

function ProgressBar({ currentStep, dataSource = 'yahoo', aiModel = 'gemini' }) {
  const getStepInfo = (step) => {
    const dataSourceName = dataSource === 'polygon' ? 'Polygon.io' : 'Yahoo Finance';
    const aiModelName = aiModel === 'claude' ? 'Claude AI' : 'Gemini AI';
    
    switch(step) {
      case 1:
        return { text: `Получение данных с ${dataSourceName}...`, progress: 33, time: '~10-30 сек' };
      case 2:
        return { text: 'Расчет метрик (Max Pain, P/C Ratio, GEX)...', progress: 66, time: '~5-10 сек' };
      case 3:
        return { text: `Анализ с ${aiModelName}...`, progress: 90, time: '~30-60 сек' };
      default:
        return { text: 'Готово', progress: 100, time: '' };
    }
  };

  const stepInfo = getStepInfo(currentStep);

  return (
    <div className="progress-bar-container">
      <div className="progress-bar-header">
        <div className="progress-bar-title">
          {stepInfo.text}
          {stepInfo.time && <span className="progress-bar-time"> {stepInfo.time}</span>}
        </div>
        <div className="progress-bar-percentage">{stepInfo.progress}%</div>
      </div>
      
      <div className="progress-bar-track">
        <div 
          className="progress-bar-fill" 
          style={{ width: `${stepInfo.progress}%` }}
        ></div>
      </div>
    </div>
  );
}

export default ProgressBar;
