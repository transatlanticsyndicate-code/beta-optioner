import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Принудительно устанавливаем светлую тему
document.documentElement.classList.remove('dark');
document.documentElement.classList.add('light');

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
