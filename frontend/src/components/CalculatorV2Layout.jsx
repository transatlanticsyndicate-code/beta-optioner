import React from 'react';
import { getActiveBlocks, getCurrentPreset, getPresetDescriptions } from '../config/calculatorV2Blocks';

// Импорты компонентов (будут созданы позже)
import CalculatorSettings from './calculator/CalculatorSettings';
import TickerSelectorBasic from './calculator/TickerSelectorBasic';
import TickerSelectorAdvanced from './calculator/TickerSelectorAdvanced';
import OptionsBlock from './calculator/OptionsBlock';
import ExpirationCalendar from './calculator/ExpirationCalendar';
import StrikeScale from './calculator/StrikeScale';
import OptionsMetrics from './calculator/OptionsMetrics';
import TradingViewWidget from './calculator/TradingViewWidget';
import PLChart from './calculator/PLChart';
import OptionsChain from './calculator/OptionsChain';
import StrategyBuilder from './calculator/StrategyBuilder';
import Recommendations from './calculator/Recommendations';

const CalculatorV2Layout = ({ selectedTicker, hasPositions }) => {
  const currentPreset = getCurrentPreset();
  const presetInfo = getPresetDescriptions()[currentPreset];
  
  // Получаем активные блоки для каждой секции
  const headerBlocks = getActiveBlocks('header');
  const mainBlocks = getActiveBlocks('main');

  // Маппинг компонентов
  const componentMap = {
    'calculator-settings': CalculatorSettings,
    'ticker-selector-basic': TickerSelectorBasic,
    'ticker-selector-advanced': TickerSelectorAdvanced,
    'options-block': OptionsBlock,
    'expiration-dates': ExpirationCalendar,
    'strike-scale': StrikeScale,
    'metrics-block': OptionsMetrics,
    'tradingview-widget': TradingViewWidget,
    'pl-chart': PLChart,
    'options-chain': OptionsChain,
    'strategy-builder': StrategyBuilder,
    'recommendations': Recommendations
  };

  // Функция для проверки, должен ли блок отображаться
  const shouldShowBlock = (block) => {
    // Проверяем условия отображения
    if (block.requiresTicker && !selectedTicker) {
      return false;
    }
    if (block.requiresPositions && !hasPositions) {
      return false;
    }
    return true;
  };

  // Рендер блока
  const renderBlock = (block) => {
    const Component = componentMap[block.id];
    if (!Component) {
      console.warn(`Component not found for block: ${block.id}`);
      return null;
    }

    return (
      <div 
        key={block.id}
        className={`${block.width || 'w-full'} mb-6`}
        data-block-id={block.id}
      >
        <Component 
          selectedTicker={selectedTicker}
          hasPositions={hasPositions}
          blockConfig={block}
        />
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Информация о текущей версии */}
      <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
              {presetInfo.name} версия
            </h3>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              {presetInfo.description}
            </p>
          </div>
          <div className="text-xs text-blue-600 dark:text-blue-400">
            {mainBlocks.length} блоков активно
          </div>
        </div>
      </div>

      {/* Header блоки */}
      {headerBlocks.length > 0 && (
        <div className="mb-6">
          {headerBlocks
            .filter(shouldShowBlock)
            .map(renderBlock)
          }
        </div>
      )}

      {/* Основные блоки */}
      <div className="space-y-6">
        {mainBlocks
          .filter(shouldShowBlock)
          .map(renderBlock)
        }
      </div>

      {/* Debug информация (только в development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-8 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs">
          <details>
            <summary className="cursor-pointer font-medium">
              Debug: Конфигурация блоков
            </summary>
            <div className="mt-2 space-y-2">
              <div><strong>Активный пресет:</strong> {currentPreset}</div>
              <div><strong>Header блоки:</strong> {headerBlocks.map(b => b.id).join(', ')}</div>
              <div><strong>Main блоки:</strong> {mainBlocks.map(b => b.id).join(', ')}</div>
              <div><strong>Скрытые блоки:</strong> {
                mainBlocks.filter(b => !shouldShowBlock(b)).map(b => b.id).join(', ') || 'нет'
              }</div>
            </div>
          </details>
        </div>
      )}
    </div>
  );
};

export default CalculatorV2Layout;
