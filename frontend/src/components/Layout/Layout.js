import React from 'react';
import Header from './Header';
import './Layout.css';

function Layout({ children }) {
  return (
    <div className="layout">
      <Header />
      <main className="main-content">
        <div className="container">
          {children}
        </div>
      </main>
      <footer className="footer">
        <div className="container">
          <p className="text-center text-secondary">
            © 2025 SYNDICATE Platform. Все права защищены.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default Layout;
