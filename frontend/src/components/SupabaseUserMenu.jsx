/**
 * Компонент меню пользователя с интеграцией Supabase SSO
 * ЗАЧЕМ: Отображает профиль пользователя и управляет аутентификацией через Supabase
 * Затрагивает: UI навигации, управление сессией, SSO на поддоменах
 */

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import './UserMenu.css';

const SupabaseUserMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Получение текущей сессии при монтировании
    // ЗАЧЕМ: Отображает корректное состояние сразу при загрузке страницы
    checkUser();

    // Подписка на изменения состояния аутентификации
    // ЗАЧЕМ: Автоматически обновляет UI при входе/выходе пользователя
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Закрытие меню при клике вне его
    // ЗАЧЕМ: Улучшает UX, автоматически скрывая меню
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  /**
   * Проверка текущего пользователя
   * ЗАЧЕМ: Получает данные пользователя из Supabase при загрузке компонента
   */
  const checkUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    } catch (error) {
      console.error('Error checking user:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Обработчик выхода из системы
   * ЗАЧЕМ: Завершает сессию пользователя на всех поддоменах через SSO
   */
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setIsOpen(false);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  /**
   * Обработчик входа в систему
   * ЗАЧЕМ: Перенаправляет на страницу авторизации
   */
  const handleLogin = () => {
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="user-menu-container">
        <div className="user-menu-button" style={{ opacity: 0.5 }}>
          <div className="user-avatar-fallback">...</div>
        </div>
      </div>
    );
  }

  // Если пользователь не авторизован, показываем кнопку входа
  if (!user) {
    return (
      <div className="user-menu-container">
        <button
          className="auth-login-btn"
          onClick={handleLogin}
          title="Войти"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
            <polyline points="10 17 15 12 10 7"/>
            <line x1="15" y1="12" x2="3" y2="12"/>
          </svg>
          <span>Войти</span>
        </button>
      </div>
    );
  }

  // Извлечение данных пользователя
  const email = user.email || 'Пользователь';
  const firstName = user.user_metadata?.first_name || user.user_metadata?.name || email.split('@')[0];
  const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture;

  return (
    <div className="user-menu-container" ref={menuRef}>
      <button
        className="user-menu-button"
        onClick={() => setIsOpen(!isOpen)}
        title={firstName}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={firstName}
            className="user-avatar"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextElementSibling.style.display = 'flex';
            }}
          />
        ) : null}
        <div
          className="user-avatar-fallback"
          style={{ display: avatarUrl ? 'none' : 'flex' }}
        >
          {firstName.charAt(0).toUpperCase()}
        </div>
      </button>

      {isOpen && (
        <div className="user-menu-dropdown">
          <div className="user-menu-header">
            <div className="user-menu-avatar">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={firstName}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextElementSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              <div
                className="user-menu-avatar-fallback"
                style={{ display: avatarUrl ? 'none' : 'flex' }}
              >
                {firstName.charAt(0).toUpperCase()}
              </div>
            </div>
            <div className="user-menu-info">
              <div className="user-menu-name">{firstName}</div>
              <div className="user-menu-username">{email}</div>
            </div>
          </div>

          <div className="user-menu-divider"></div>

          <button 
            className="user-menu-item" 
            onClick={() => {
              alert('Профиль (скоро)');
            }}
            title="Профиль"
          >
            <span>Профиль</span>
          </button>

          <div className="user-menu-divider"></div>

          <button
            className="user-menu-item logout"
            onClick={handleLogout}
          >
            <span>Выход</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default SupabaseUserMenu;
