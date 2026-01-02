import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '../ui/button';
import {
  LayoutDashboard,
  Calculator,
  Brain,
  Archive,
  FileBarChart,
  Settings,
  HelpCircle,
  Menu,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Save,
  TrendingUp,
  Activity,
  Plus,
  TrendingDown,
  Coins,
  ExternalLink,
} from 'lucide-react';

function Sidebar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDevSectionCollapsed, setIsDevSectionCollapsed] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });
  const location = useLocation();

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', isSidebarCollapsed);
  }, [isSidebarCollapsed]);

  function handleNavigation() {
    setIsMobileMenuOpen(false);
  }

  function NavItem({ to, icon: Icon, children, title }) {
    const isActive = location.pathname === to;

    const handleClick = (e) => {
      handleNavigation();
    };

    return (
      <Link
        to={to}
        onClick={handleClick}
        title={title}
        className={`flex items-center px-3 py-2 text-sm rounded-md transition-colors ${
          isActive
            ? 'font-medium bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
        }`}
      >
        <Icon className="h-4 w-4 mr-3 flex-shrink-0" />
        <span className={isSidebarCollapsed ? 'lg:hidden' : ''}>{children}</span>
      </Link>
    );
  }

  function ExternalNavItem({ href, icon: Icon, children, title }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={title}
        className="flex items-center px-3 py-2 text-sm rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-accent/50"
      >
        <Icon className="h-4 w-4 mr-3 flex-shrink-0" />
        <span className={isSidebarCollapsed ? 'lg:hidden' : 'flex items-center gap-1'}>
          {children}
          <ExternalLink className="h-3 w-3" />
        </span>
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        className="lg:hidden fixed top-4 left-4 z-[70] p-2 rounded-lg bg-card shadow-md"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      >
        <Menu className="h-5 w-5 text-muted-foreground" />
      </button>
      <nav
        className={`
          fixed inset-y-0 left-0 z-[70] bg-card transform transition-all duration-200 ease-in-out
          lg:translate-x-0 lg:static border-r border-border
          ${isSidebarCollapsed ? 'lg:w-16 w-16' : 'lg:w-64 w-64'}
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Кнопка складывания */}
        <button
          type="button"
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="hidden lg:flex absolute -right-3 top-20 z-[80] w-6 h-6 items-center justify-center rounded-full bg-card border border-border shadow-md hover:bg-accent transition-colors"
        >
          {isSidebarCollapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        <div className="h-full flex flex-col">
          <Link
            to="/"
            className="h-16 px-6 flex items-center border-b border-border"
          >
            <div className="flex items-center gap-3">
              <img 
                src="/images/logoOp.png" 
                alt="OPTIONER" 
                width="32" 
                height="32" 
                className="flex-shrink-0"
              />
              <span className={`text-lg hover:cursor-pointer text-foreground font-bold ${isSidebarCollapsed ? 'lg:hidden' : ''}`}>OPTIONER</span>
              <span className={`text-sm text-cyan-500 font-medium ${isSidebarCollapsed ? 'lg:hidden' : ''}`}>v28</span>
            </div>
          </Link>

          <div className="flex-1 overflow-y-auto py-4 px-4 bg-muted/30">
            <div className="space-y-6">
              <div>
                <div className="space-y-1">
                  <NavItem to="/" icon={LayoutDashboard}>
                    Главная
                  </NavItem>
                </div>
              </div>

              <div>
                <div className={`px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-cyan-500 ${isSidebarCollapsed ? 'lg:hidden' : ''}`}>
                  СДЕЛКИ
                </div>
                <div className="space-y-1">
                  <NavItem to="/tools/new-deal" icon={Plus}>
                    Сделка
                  </NavItem>
                  <NavItem to="/tools/deals-archive" icon={Archive}>
                    Архив сделок
                  </NavItem>
                </div>
              </div>

              <div>
                <div className={`px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-cyan-500 ${isSidebarCollapsed ? 'lg:hidden' : ''}`}>
                  КАЛЬКУЛЯТОРЫ
                </div>
                <div className="space-y-1">
                  <NavItem to="/tools/options-calculator" icon={Calculator}>
                    Калькулятор опционов
                  </NavItem>
                  <NavItem to="/tools/saved-configurations" icon={Save}>
                    Сохраненные конфигурации
                  </NavItem>
                  <NavItem to="/tools/gradual-strategy-calculator" icon={TrendingUp} title="Калькулятор градуальных стратегий">
                    Градуальный калькулятор
                  </NavItem>
                  <ExternalNavItem href="https://crypto.optioner.online" icon={Coins} title="Крипто Менеджер - управление криптовалютными активами">
                    Крипто Менеджер
                  </ExternalNavItem>
                </div>
              </div>

              <div>
                <div className={`px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-cyan-500 ${isSidebarCollapsed ? 'lg:hidden' : ''}`}>
                  АНАЛИТИКА
                </div>
                <div className="space-y-1">
                  <NavItem to="/tools/options-analyzer" icon={FileBarChart}>
                    Новый отчет
                  </NavItem>
                  <NavItem to="/reports-archive" icon={Archive}>
                    Архив отчетов
                  </NavItem>
                  <NavItem to="/tools/crypto-rating" icon={TrendingDown}>
                    Рейтинг криптовалют
                  </NavItem>
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setIsDevSectionCollapsed(!isDevSectionCollapsed)}
                  className={`w-full flex items-center justify-between px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-cyan-500 hover:text-cyan-600 transition-colors ${isSidebarCollapsed ? 'lg:hidden' : ''}`}
                >
                  <span>В РАЗРАБОТКЕ</span>
                  {isDevSectionCollapsed ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronUp className="h-4 w-4" />
                  )}
                </button>
                <div
                  className={`space-y-1 overflow-hidden transition-all duration-200 ${
                    isDevSectionCollapsed ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'
                  }`}
                >
                  <NavItem to="/tools/test-chart" icon={Activity}>
                    Тестовый График
                  </NavItem>
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    Скоро появятся новые инструменты...
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 py-4 border-t border-border">
            <div className="space-y-1">
              <NavItem to="/settings" icon={Settings}>
                Настройки
              </NavItem>
              <NavItem to="/help" icon={HelpCircle} title="Крайний коммит: 8d5d182 / Ветка: CalcOptionsMassive-paid-11.11.25 / Дата-время: 17.11.2025 09:10">
                Помощь
              </NavItem>
            </div>
          </div>
        </div>
      </nav>

      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-[65] lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </>
  );
}

export default Sidebar;
