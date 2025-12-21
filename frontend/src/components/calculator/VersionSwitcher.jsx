import React, { useState } from 'react';
import { getCurrentPreset, getPresetDescriptions } from '../../config/calculatorV2Blocks';

const VersionSwitcher = ({ onVersionChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const currentPreset = getCurrentPreset();
  const presets = getPresetDescriptions();

  const handleVersionSelect = (version) => {
    setIsOpen(false);
    if (onVersionChange) {
      onVersionChange(version);
    }
    // В реальном приложении здесь будет обновление конфига
    console.log(`Switching to version: ${version}`);
  };

  const getVersionIcon = (version) => {
    switch (version) {
      case 'basic': return '🟢';
      case 'advanced': return '🟡';
      case 'professional': return '🔴';
      default: return '⚪';
    }
  };

  const getVersionColor = (version) => {
    switch (version) {
      case 'basic': return 'text-green-600 dark:text-green-400';
      case 'advanced': return 'text-yellow-600 dark:text-yellow-400';
      case 'professional': return 'text-red-600 dark:text-red-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <div className="relative">
      {/* Кнопка переключения */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        <span className="text-lg">{getVersionIcon(currentPreset)}</span>
        <span className={`font-medium ${getVersionColor(currentPreset)}`}>
          {presets[currentPreset].name}
        </span>
        <svg 
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Выпадающее меню */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-50">
          <div className="p-2">
            {Object.entries(presets).map(([version, info]) => (
              <button
                key={version}
                onClick={() => handleVersionSelect(version)}
                className={`w-full text-left p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                  version === currentPreset ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' : ''
                }`}
              >
                <div className="flex items-start space-x-3">
                  <span className="text-xl mt-0.5">{getVersionIcon(version)}</span>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className={`font-medium ${getVersionColor(version)}`}>
                        {info.name}
                      </span>
                      {version === currentPreset && (
                        <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded">
                          Активная
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {info.description}
                    </p>
                    <div className="mt-2">
                      <div className="text-xs text-gray-500 dark:text-gray-500 font-medium mb-1">
                        Возможности:
                      </div>
                      <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
                        {info.features.map((feature, index) => (
                          <li key={index} className="flex items-center space-x-1">
                            <span className="text-green-500">✓</span>
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
          
          {/* Информация о переключении */}
          <div className="border-t border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-b-lg">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              💡 Для переключения версии измените <code>ACTIVE_PRESET</code> в файле конфигурации
            </p>
          </div>
        </div>
      )}

      {/* Overlay для закрытия меню */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};

export default VersionSwitcher;
