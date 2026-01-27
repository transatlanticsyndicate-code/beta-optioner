import React from 'react';
import { useLocation } from 'react-router-dom';
import { Bell } from 'lucide-react';
import ThemeToggle from '../ThemeToggle';
import { Badge } from '../ui/badge';
import UserMenu from '../UserMenu';
import OptionsDataIndicator from '../OptionsDataIndicator';

function TopNav() {
  const location = useLocation();

  // Определяем заголовок страницы на основе пути
  const getPageTitle = (pathname) => {
    switch (pathname) {
      case '/':
        return 'Главная';
      case '/tools/new-deal':
        return 'Сделка';
      case '/tools/deals-archive':
        return 'Архив сделок';
      case '/tools/options-calculator':
        return 'Калькулятор опционов на АКЦИИ';
      case '/tools/universal-calculator':
        return 'Универсальный Калькулятор Опционов';
      case '/tools/saved-configurations':
        return 'Сохраненные конфигурации';
      case '/tools/universal-saved-configurations':
        return 'Сохранения из Универсального калькулятора';
      case '/tools/gradual-strategy-calculator':
        return 'Градуальный калькулятор';
      case '/tools/options-analyzer':
        return 'Анализ опционов';
      case '/reports-archive':
        return 'Архив отчетов';
      case '/tools/crypto-rating':
        return 'Рейтинг криптовалют';
      case '/tools/test-chart':
        return 'Тестовый график';
      case '/settings':
        return 'Настройки';
      case '/help':
        return 'Помощь';
      default:
        return 'Опционные Стратегии';
    }
  };

  const pageTitle = getPageTitle(location.pathname);
  return (
    <nav className="px-3 sm:px-6 flex items-center justify-between border-b border-border h-full bg-muted/30">
      <div className="font-medium text-base hidden sm:flex items-center space-x-3 truncate max-w-[600px]">
        <span className="text-foreground">{pageTitle}</span>
        {location.pathname === '/tools/options-calculator' && (
          <span className="text-sm text-cyan-500 font-medium">v33</span>
        )}
        {location.pathname === '/tools/universal-calculator' && (
          <span className="text-sm text-cyan-500 font-medium">v U7</span>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-4 ml-auto sm:ml-0">
        {/* Индикаторы статуса данных Massive API */}
        {/* УБРАНО: Индикатор Massive не показывается на странице универсального калькулятора и его сохранений */}
        {location.pathname !== '/tools/universal-calculator' &&
          location.pathname !== '/tools/universal-saved-configurations' &&
          <OptionsDataIndicator />}

        {/* Notifications */}
        <button
          type="button"
          className="relative p-1.5 sm:p-2 hover:bg-accent rounded-full transition-colors"
          title="Уведомления"
        >
          <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
          {/* Badge для количества уведомлений */}
          <span className="absolute top-0 right-0 h-2 w-2 bg-primary rounded-full"></span>
        </button>

        {/* Theme Toggle */}
        {/* <ThemeToggle /> */}

        {/* User Menu */}
        <UserMenu />
      </div>
    </nav>
  );
}

export default TopNav;
