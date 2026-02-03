/**
 * Страница авторизации через Supabase SSO
 * ЗАЧЕМ: Предоставляет интерфейс для входа пользователей через email/password
 * Затрагивает: аутентификация, SSO на поддоменах, управление сессией
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    // Проверка текущей сессии
    // ЗАЧЕМ: Если пользователь уже авторизован, перенаправляем на главную
    checkUser();
  }, []);

  /**
   * Проверка текущего пользователя
   * ЗАЧЕМ: Предотвращает доступ к странице логина для авторизованных пользователей
   */
  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      navigate('/');
    }
  };

  /**
   * Обработчик входа
   * ЗАЧЕМ: Авторизует пользователя через Supabase и создает SSO сессию
   */
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Успешный вход - перенаправляем на главную
      navigate('/');
    } catch (error) {
      setError(error.message || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        {/* Логотип/Заголовок */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Optioner
          </h1>
          <p className="text-muted-foreground">
            Войдите в свой аккаунт
          </p>
        </div>

        {/* Форма входа */}
        <div className="bg-card border border-border rounded-lg shadow-sm p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email */}
            <div>
              <label 
                htmlFor="email" 
                className="block text-sm font-medium text-foreground mb-2"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="your@email.com"
                disabled={loading}
              />
            </div>

            {/* Password */}
            <div>
              <label 
                htmlFor="password" 
                className="block text-sm font-medium text-foreground mb-2"
              >
                Пароль
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="••••••••"
                disabled={loading}
              />
            </div>

            {/* Ошибка */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            {/* Кнопка входа */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground py-2 px-4 rounded-md font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
};

export default Login;
