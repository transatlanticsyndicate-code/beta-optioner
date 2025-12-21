import React, { useState, useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';

function ThemeToggle() {
  const [theme, setTheme] = useState('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Получаем сохраненную тему или используем системную
    const savedTheme = localStorage.getItem('theme');
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const initialTheme = savedTheme || systemTheme;
    
    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, []);

  const applyTheme = (newTheme) => {
    const root = document.documentElement;
    console.log('Applying theme:', newTheme);
    if (newTheme === 'dark') {
      root.classList.add('dark');
      console.log('Dark class added, classList:', root.classList.toString());
    } else {
      root.classList.remove('dark');
      console.log('Dark class removed, classList:', root.classList.toString());
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    console.log('Toggle theme from', theme, 'to', newTheme);
    setTheme(newTheme);
    applyTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  if (!mounted) {
    return null;
  }

  return (
    <button
      onClick={toggleTheme}
      className="relative p-2 hover:bg-accent rounded-full transition-colors"
      title={theme === 'dark' ? 'Переключить на светлую тему' : 'Переключить на темную тему'}
    >
      <Sun className="h-5 w-5 text-muted-foreground transition-all dark:hidden" />
      <Moon className="h-5 w-5 text-muted-foreground transition-all hidden dark:block" />
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}

export default ThemeToggle;
