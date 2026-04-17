/**
 * Компонент защиты маршрутов
 * ЗАЧЕМ: Аутентификация отключена — портал открыт для всех, компонент оставлен как сквозной
 * для обратной совместимости с импортами в App.js
 */

import React from 'react';

const ProtectedRoute = ({ children }) => {
  return children;
};

export default ProtectedRoute;
