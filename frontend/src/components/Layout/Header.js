import React from 'react';
import { Link } from 'react-router-dom';
import './Header.css';

function Header() {
  return (
    <header className="header">
      <div className="container">
        <div className="header-content">
          <Link to="/" className="logo">
            <span className="logo-icon">🎯</span>
            <span className="logo-text">Standart v6</span>
          </Link>
          
          <nav className="nav">
            <Link to="/" className="nav-link">Главная</Link>
            <Link to="/tools/options-analyzer" className="nav-link">Options Analyzer</Link>
            <Link to="/tools/options-calculator" className="nav-link">Options Calculator</Link>
          </nav>
        </div>
      </div>
    </header>
  );
}

export default Header;
