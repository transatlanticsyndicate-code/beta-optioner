/**
 * Компонент защиты маршрутов с проверкой аутентификации
 * ЗАЧЕМ: Обеспечивает доступ к приложению только для авторизованных пользователей
 * Затрагивает: маршруты, аутентификация, редирект на страницу логина
 */

import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../services/supabase';

const ProtectedRoute = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Если Supabase не инициализирован, разрешаем доступ (для разработки)
    if (!supabase) {
      setIsAuthenticated(true);
      setLoading(false);
      return;
    }

    // Проверка текущей сессии
    // ЗАЧЕМ: Определяет, авторизован ли пользователь при загрузке страницы
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setIsAuthenticated(!!session?.user);
      } catch (error) {
        console.error('Ошибка при проверке аутентификации:', error);
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    // Подписка на изменения состояния аутентификации
    // ЗАЧЕМ: Автоматически обновляет состояние при входе/выходе пользователя
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session?.user);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Показываем загрузку во время проверки
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
          <p className="text-gray-500">Проверка аутентификации...</p>
        </div>
      </div>
    );
  }

  // Если не авторизован, редирект на логин
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Если авторизован, показываем содержимое
  return children;
};

export default ProtectedRoute;
