import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Card } from '../ui/card';

function FinancialControl({ selectedTicker = '', storagePrefix = '' }) {
  const [financialControlEnabled, setFinancialControlEnabled] = React.useState(() => {
    const saved = localStorage.getItem(`${storagePrefix}financialControlEnabled`);
    return saved ? JSON.parse(saved) : false;
  });

  const [depositAmount, setDepositAmount] = React.useState(() => {
    const saved = localStorage.getItem(`${storagePrefix}depositAmount`);
    return saved || '';
  });

  const [instrumentCount, setInstrumentCount] = React.useState(() => {
    const saved = localStorage.getItem(`${storagePrefix}instrumentCount`);
    return saved || '';
  });

  const [maxLossPercent, setMaxLossPercent] = React.useState(() => {
    const saved = localStorage.getItem(`${storagePrefix}maxLossPercent`);
    return saved || '';
  });

  const [isParametersExpanded, setIsParametersExpanded] = React.useState(() => {
    const saved = localStorage.getItem(`${storagePrefix}isParametersExpanded`);
    return saved ? JSON.parse(saved) : true;
  });

  const [isFinancialControlCollapsed, setIsFinancialControlCollapsed] = React.useState(() => {
    const saved = localStorage.getItem(`${storagePrefix}isFinancialControlCollapsed`);
    return saved ? JSON.parse(saved) : false;
  });

  // Сохранение в localStorage при изменении
  React.useEffect(() => {
    localStorage.setItem(`${storagePrefix}financialControlEnabled`, JSON.stringify(financialControlEnabled));
    // Отправляем custom event для синхронизации
    window.dispatchEvent(new CustomEvent('financialControlChanged', {
      detail: { enabled: financialControlEnabled, prefix: storagePrefix }
    }));
  }, [financialControlEnabled, storagePrefix]);

  React.useEffect(() => {
    localStorage.setItem(`${storagePrefix}depositAmount`, depositAmount);
  }, [depositAmount, storagePrefix]);

  React.useEffect(() => {
    localStorage.setItem(`${storagePrefix}instrumentCount`, instrumentCount);
  }, [instrumentCount, storagePrefix]);

  React.useEffect(() => {
    localStorage.setItem(`${storagePrefix}maxLossPercent`, maxLossPercent);
  }, [maxLossPercent, storagePrefix]);

  React.useEffect(() => {
    localStorage.setItem(`${storagePrefix}isParametersExpanded`, JSON.stringify(isParametersExpanded));
  }, [isParametersExpanded, storagePrefix]);

  React.useEffect(() => {
    localStorage.setItem(`${storagePrefix}isFinancialControlCollapsed`, JSON.stringify(isFinancialControlCollapsed));
  }, [isFinancialControlCollapsed, storagePrefix]);

  return (
    <Card className={`border overflow-hidden ${financialControlEnabled ? 'border-cyan-500' : 'border-gray-200'}`} style={{ borderColor: financialControlEnabled ? '#06b6d4' : '#b8b8b8' }}>
      <div className={`flex items-center justify-between px-6 py-3 border-b`} style={{ borderColor: financialControlEnabled ? '#06b6d4' : '#b8b8b8' }}>
        <h3 className="text-sm font-medium">Финансовый контроль</h3>
        <button
          type="button"
          onClick={() => setIsFinancialControlCollapsed(!isFinancialControlCollapsed)}
          className="p-1 hover:bg-muted rounded transition-colors"
          title={isFinancialControlCollapsed ? 'Развернуть' : 'Свернуть'}
        >
          {isFinancialControlCollapsed ? (
            <ChevronDown size={16} />
          ) : (
            <ChevronUp size={16} />
          )}
        </button>
      </div>
      {!isFinancialControlCollapsed && (
        <div className="space-y-3 p-6">
          <div className="flex items-center justify-between">
            <Label htmlFor="financial-control" className={`text-sm font-normal cursor-pointer ${!selectedTicker ? 'opacity-50' : ''}`}>
              Активировать контроль
            </Label>
            <Switch
              id="financial-control"
              checked={financialControlEnabled}
              onCheckedChange={setFinancialControlEnabled}
              className="data-[state=checked]:bg-cyan-500"
              disabled={!selectedTicker}
            />
          </div>

          {financialControlEnabled && (
            <div className={`space-y-3 p-4 border border-dashed border-gray-300 rounded-lg bg-gray-50/50 ${!selectedTicker ? 'pointer-events-none opacity-50' : ''}`}>
              <button
                type="button"
                onClick={() => setIsParametersExpanded(!isParametersExpanded)}
                className="w-full flex items-center justify-between hover:opacity-70 transition-opacity"
              >
                <h4 className="text-sm font-semibold">Параметры</h4>
                {isParametersExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              {isParametersExpanded && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="deposit-amount" className="text-sm font-normal">
                      Сумма депозита ($)
                    </Label>
                    <input
                      id="deposit-amount"
                      type="text"
                      value={depositAmount === '' ? '' : `$${depositAmount.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`}
                      onChange={(e) => {
                        const cleanValue = e.target.value.replace(/[\$\s]/g, '');
                        setDepositAmount(cleanValue);
                      }}
                      onFocus={(e) => {
                        if (depositAmount === '') {
                          e.target.value = '';
                        } else {
                          e.target.value = depositAmount;
                        }
                      }}
                      onBlur={(e) => {
                        const numValue = e.target.value.replace(/[\$\s]/g, '');
                        setDepositAmount(numValue);
                        e.target.value = numValue === '' ? '' : `$${numValue.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
                      }}
                      placeholder="$0"
                      className="w-24 h-8 px-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-right"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="instrument-count" className="text-sm font-normal">
                      Количество инструментов (шт)
                    </Label>
                    <input
                      id="instrument-count"
                      type="number"
                      value={instrumentCount}
                      onChange={(e) => setInstrumentCount(e.target.value)}
                      placeholder="0"
                      className="w-24 h-8 px-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-right"
                    />
                  </div>

                  {/* Расчет доступно на инструмент */}
                  {depositAmount && instrumentCount && parseFloat(depositAmount) > 0 && parseInt(instrumentCount) > 0 && (
                    <div className="text-xs text-gray-600 px-2 py-1">
                      Доступно на инструмент: $ {Math.round(parseFloat(depositAmount) / parseInt(instrumentCount)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <Label htmlFor="max-loss-percent" className="text-sm font-normal">
                      Максимально допустимый % убытка
                    </Label>
                    <input
                      id="max-loss-percent"
                      type="number"
                      value={maxLossPercent}
                      onChange={(e) => setMaxLossPercent(e.target.value)}
                      placeholder="0"
                      className="w-24 h-8 px-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-right"
                    />
                  </div>

                  {/* Расчет максимально допустимого убытка */}
                  {depositAmount && instrumentCount && maxLossPercent &&
                   parseFloat(depositAmount) > 0 && parseInt(instrumentCount) > 0 && parseFloat(maxLossPercent) > 0 && (
                    <div className="text-xs text-red-600 px-2 py-1 font-medium">
                      Максимально допустимый убыток: $ {Math.round(parseFloat(depositAmount) / parseInt(instrumentCount) * parseFloat(maxLossPercent) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default FinancialControl;
