import React from 'react';
import { Bell } from 'lucide-react';
import ThemeToggle from '../ThemeToggle';
import { Badge } from '../ui/badge';
import UserMenu from '../UserMenu';

function TopNav() {
  return (
    <nav className="px-3 sm:px-6 flex items-center justify-between border-b border-border h-full bg-muted/30">
      <div className="font-medium text-base hidden sm:flex items-center space-x-1 truncate max-w-[600px]">
        <span className="text-foreground">Опционные Стратегии /</span>
        <a 
          href="/docs/OPTIONS_CALCULATOR_BASIC_DESCRIPTION.md?view=raw" 
          target="_blank" 
          rel="noopener noreferrer"
          className="font-bold text-cyan-500 hover:text-cyan-400 hover:underline transition-colors cursor-pointer"
          title="Открыть документацию"
        >
          v8
        </a>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 ml-auto sm:ml-0">
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
