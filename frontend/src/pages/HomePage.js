import React from 'react';
import { Link } from 'react-router-dom';
import './HomePage.css';

function HomePage() {
  const tools = [
    {
      id: 1,
      title: 'Options Flow AI Analyzer',
      description: 'Мгновенный AI-анализ опционного рынка',
      icon: '📊',
      path: '/tools/options-analyzer',
      status: 'active'
    },
    {
      id: 2,
      title: 'Инструмент #2',
      description: 'Скоро будет доступен',
      icon: '🔧',
      path: '#',
      status: 'coming-soon'
    },
    {
      id: 3,
      title: 'Инструмент #3',
      description: 'Скоро будет доступен',
      icon: '📈',
      path: '#',
      status: 'coming-soon'
    },
    {
      id: 4,
      title: 'Инструмент #4',
      description: 'Скоро будет доступен',
      icon: '💹',
      path: '#',
      status: 'coming-soon'
    }
  ];

  return (
    <div className="home-page">
      <div className="hero">
        <h1 className="text-6xl font-light mb-3 text-slate-900">
          SYNDICATE
        </h1>
        <p className="text-xl font-light text-secondary">
          Профессиональные финансовые инструменты
        </p>
      </div>

      <div className="tools-grid">
        {tools.map(tool => (
          <div key={tool.id} className={`tool-card ${tool.status}`}>
            <div className="tool-icon">{tool.icon}</div>
            <h3 className="tool-title">{tool.title}</h3>
            <p className="tool-description">{tool.description}</p>
            
            {tool.status === 'active' ? (
              <Link to={tool.path} className="btn btn-primary">
                Открыть
              </Link>
            ) : (
              <div className="text-sm uppercase tracking-wider text-muted">
                Скоро
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="info-section">
        <div className="info-box">
          <h2 className="text-sm uppercase tracking-wider text-muted mb-4">О платформе</h2>
          <p className="text-lg font-light text-secondary">
            SYNDICATE Platform — это набор профессиональных инструментов для анализа 
            финансовых рынков. Мы используем искусственный интеллект и современные 
            технологии для предоставления точных и быстрых аналитических данных.
          </p>
        </div>
      </div>
    </div>
  );
}

export default HomePage;
