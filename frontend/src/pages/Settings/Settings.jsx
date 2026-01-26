import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, TrendingUp, BarChart3, Palette, Layers } from 'lucide-react';
import SettingsGeneral from './SettingsGeneral';
import SettingsMarketData from './SettingsMarketData';
import SettingsFutures from './SettingsFutures';
import SettingsComponents from './SettingsComponents';
import SettingsStockGroups from './SettingsStockGroups';

const SECTIONS = [
  { id: 'general', label: 'Общие', Icon: SettingsIcon },
  { id: 'market-data', label: 'Рыночные данные', Icon: BarChart3 },
  { id: 'stock-groups', label: 'Группы акций', Icon: Layers },
  { id: 'futures', label: 'Фьючерсы', Icon: TrendingUp },
  { id: 'components', label: 'Компоненты', Icon: Palette },
];

const SECTION_COMPONENTS = {
  general: SettingsGeneral,
  'market-data': SettingsMarketData,
  'stock-groups': SettingsStockGroups,
  futures: SettingsFutures,
  components: SettingsComponents,
};

function Settings() {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Получаем текущий раздел из URL параметра или используем первый по умолчанию
  const params = new URLSearchParams(location.search);
  const currentSection = params.get('section') || 'general';

  // Установка заголовка страницы
  useEffect(() => {
    const sectionLabel = SECTIONS.find(s => s.id === currentSection)?.label || 'Общие';
    document.title = `Настройки - ${sectionLabel}`;
  }, [currentSection]);

  const handleSectionChange = (sectionId) => {
    navigate(`/settings?section=${sectionId}`);
  };

  const CurrentComponent = SECTION_COMPONENTS[currentSection] || SettingsGeneral;

  return (
    <div className="flex h-full gap-6">
      {/* Боковая навигация */}
      <aside className="w-64 border-r border-border pr-6">
        <div className="sticky top-0">
          <h1 className="text-2xl font-bold mb-6">Настройки</h1>
          
          <nav className="space-y-1">
            {SECTIONS.map((section) => {
              const { Icon } = section;
              const isActive = currentSection === section.id;
              
              return (
                <button
                  key={section.id}
                  onClick={() => handleSectionChange(section.id)}
                  className={`w-full flex items-center px-3 py-2 text-sm rounded-md transition-colors ${
                    isActive
                      ? 'font-medium bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`}
                >
                  <Icon className="h-4 w-4 mr-3 flex-shrink-0" />
                  <span>{section.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Основной контент */}
      <main className="flex-1 overflow-y-auto pb-8">
        <CurrentComponent />
      </main>
    </div>
  );
}

export default Settings;
