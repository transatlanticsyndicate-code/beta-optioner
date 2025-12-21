import React, { useEffect, useState } from 'react';

const AuthModal = ({ children }) => {
  // Проверяем переменную окружения для отключения авторизации (для test сервера)
  const authDisabled = process.env.REACT_APP_AUTH_DISABLED === 'true';
  
  const [isAuthenticated, setIsAuthenticated] = useState(authDisabled);
  const [isLoading, setIsLoading] = useState(!authDisabled);
  const [status, setStatus] = useState(null); // 'pending', 'approved', 'rejected', 'error'
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    // Если авторизация отключена - пропускаем проверку
    if (authDisabled) {
      setIsAuthenticated(true);
      setIsLoading(false);
      return;
    }
    // Проверяем JWT токен в localStorage
    const token = localStorage.getItem('auth_token');
    if (token) {
      setIsAuthenticated(true);
      setIsLoading(false);
      return;
    }
    
    // Проверяем URL параметры (токен может прийти от Telegram)
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    
    if (urlToken) {
      localStorage.setItem('auth_token', urlToken);
      
      // Декодируем JWT токен чтобы получить user_data
      try {
        const payload = JSON.parse(atob(urlToken.split('.')[1]));
        const userData = {
          id: payload.sub || payload.telegram_id,
          first_name: payload.first_name || 'User',
          username: payload.username,
          photo_url: payload.photo_url || null
        };
        localStorage.setItem('user_data', JSON.stringify(userData));
      } catch (e) {
        console.error('Ошибка декодирования токена:', e);
      }
      
      setIsAuthenticated(true);
      // Очищаем URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    setIsLoading(false);
  }, []);

  useEffect(() => {
    // Простая авторизация через бота для всех окружений
    // Пользователь получает инструкцию написать боту
  }, []);

  const handleTelegramAuth = async (user) => {
    try {
      setIsLoading(true);
      setErrorMessage('');

      // Отправляем данные на backend
      const response = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
      });

      const data = await response.json();

      if (data.token) {
        // Сохраняем JWT токен
        localStorage.setItem('auth_token', data.token);
        
        // Сохраняем данные пользователя (включая фото)
        const userData = {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          username: user.username,
          photo_url: user.photo_url
        };
        localStorage.setItem('user_data', JSON.stringify(userData));
        
        setIsAuthenticated(true);
      } else if (data.status === 'pending') {
        setStatus('pending');
        setErrorMessage('Ожидание одобрения администратора...');
      } else if (data.status === 'rejected') {
        setStatus('rejected');
        setErrorMessage('Доступ запрещен администратором');
      } else {
        setStatus('error');
        setErrorMessage(data.message || 'Ошибка авторизации');
      }
    } catch (error) {
      setStatus('error');
      setErrorMessage('Ошибка подключения к серверу');
      console.error('Auth error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-border border-t-primary"></div>
          <p className="text-sm text-muted-foreground">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        {/* Overlay - белый фон вместо серого */}
        <div className="fixed inset-0 z-40 bg-white"></div>
        
        {/* Modal поверх overlay */}
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="w-full max-w-md bg-white rounded-lg shadow-lg">
          {/* Main content */}
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
            {status === 'pending' && (
              <div className="flex flex-col items-center gap-4">
                <div className="text-5xl">⏳</div>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">Ожидание одобрения</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{errorMessage}</p>
                </div>
              </div>
            )}

            {status === 'rejected' && (
              <div className="flex flex-col items-center gap-4">
                <div className="text-5xl">❌</div>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">Доступ запрещен</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{errorMessage}</p>
                </div>
              </div>
            )}

            {status === 'error' && (
              <div className="flex flex-col items-center gap-4">
                <div className="text-5xl">⚠️</div>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">Ошибка</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{errorMessage}</p>
                </div>
              </div>
            )}

            {!status && (
              <>
                <div className="flex flex-col items-center gap-2">
                  <div className="text-5xl">🔒</div>
                  <h2 className="text-lg font-semibold tracking-tight">Авторизация требуется</h2>
                  <p className="text-sm text-muted-foreground">
                    Для доступа к сервису требуется авторизация через Telegram
                  </p>
                </div>

                <div className="w-full flex flex-col gap-3 pt-4">
                  <div className="text-center text-sm text-muted-foreground pb-2">
                    Нажмите кнопку ниже чтобы авторизоваться через Telegram бота
                  </div>
                  
                  {/* Кнопка открывает бота с /start командой */}
                  <button
                    onClick={() => {
                      // Открываем Telegram бота с /start командой
                      const botUsername = 'optioner_admin_bot';
                      // Deep link с параметром start=1 отправляет /start команду
                      window.location.href = `https://t.me/${botUsername}?start=1`;
                    }}
                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 rounded-md w-full"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-send">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="9" cy="7" r="4"></circle>
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                    Авторизоваться через Telegram
                  </button>
                </div>

                <p className="text-xs text-muted-foreground pt-2">
                  Ваши данные защищены и используются только для авторизации
                </p>
              </>
            )}
          </div>
        </div>
        </div>
      </>
    );
  }

  // Пользователь авторизован - показываем контент
  return (
    <>
      {children}
    </>
  );
};

export default AuthModal;
