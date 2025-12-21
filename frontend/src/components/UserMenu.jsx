import React, { useState, useRef, useEffect } from 'react';
import './UserMenu.css';

const UserMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [userData, setUserData] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    // Получаем данные пользователя из localStorage
    const userDataStr = localStorage.getItem('user_data');
    if (userDataStr) {
      try {
        setUserData(JSON.parse(userDataStr));
      } catch (e) {
        console.error('Ошибка парсинга user_data:', e);
      }
    }

    // Закрываем меню при клике вне его
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    // Удаляем токен и данные
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_data');
    
    // Перезагружаем страницу
    window.location.reload();
  };

  if (!userData) {
    return null;
  }

  const avatarUrl = userData.photo_url;
  const firstName = userData.first_name || 'Пользователь';
  const username = userData.username || `user_${userData.id}`;

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
              <div className="user-menu-username">@{username}</div>
            </div>
          </div>

          <div className="user-menu-divider"></div>

          <button 
            className="user-menu-item" 
            onClick={() => {
              // Заглушка для профиля (позже)
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

export default UserMenu;
