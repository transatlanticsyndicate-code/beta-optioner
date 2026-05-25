import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Card } from '../ui/card';
import { Input } from '../ui/input';
import { useRiskFreeRate } from '../../hooks/useRiskFreeRate';
import { isStockLikeMode } from '../../utils/calculatorModes';

/**
 * Компонент настроек калькулятора
 * ЗАЧЕМ: Управление отображением элементов графика, учёт дивидендов и информационные данные
 */
function CalculatorSettings({
  showOptionLines = true,
  setShowOptionLines,
  useDividends = false,
  setUseDividends,
  dividendYield = 0,
  dividendLoading = false,
  isAIEnabled = true,
  setIsAIEnabled,
  baseAssetLeverage = 4,
  setBaseAssetLeverage,
  calculatorMode = 'stocks' // Режим калькулятора: 'stocks' или 'futures'
}) {
  // ЗАЧЕМ: даём пользователю стереть поле и набрать новое значение, не дёргая внешний state на каждый промежуточный символ.
  // Внешний state обновляется только когда ввод даёт валидное число >= 1.
  const [leverageDraft, setLeverageDraft] = React.useState(String(baseAssetLeverage));

  React.useEffect(() => {
    setLeverageDraft(String(baseAssetLeverage));
  }, [baseAssetLeverage]);

  const handleLeverageChange = (e) => {
    const raw = e.target.value;
    setLeverageDraft(raw);
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed) && parsed >= 1) {
      setBaseAssetLeverage(parsed);
    }
  };

  const handleLeverageBlur = () => {
    const parsed = parseFloat(leverageDraft);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setBaseAssetLeverage(1);
      setLeverageDraft('1');
    }
  };
  // Получаем актуальную безрисковую ставку от FRED API
  const { ratePercent, loading: rateLoading } = useRiskFreeRate();

  const [isCalculatorSettingsCollapsed, setIsCalculatorSettingsCollapsed] = React.useState(() => {
    const saved = localStorage.getItem('isCalculatorSettingsCollapsed');
    return saved ? JSON.parse(saved) : false;
  });

  React.useEffect(() => {
    localStorage.setItem('isCalculatorSettingsCollapsed', JSON.stringify(isCalculatorSettingsCollapsed));
  }, [isCalculatorSettingsCollapsed]);

  // Форматирование дивидендной доходности в проценты
  const dividendYieldPercent = (dividendYield * 100).toFixed(2);

  return (
    <Card className="border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <h3 className="text-sm font-medium">Настройки</h3>
        <button
          onClick={() => setIsCalculatorSettingsCollapsed(!isCalculatorSettingsCollapsed)}
          className="p-1 hover:bg-muted rounded transition-colors"
          title={isCalculatorSettingsCollapsed ? 'Развернуть' : 'Свернуть'}
        >
          {isCalculatorSettingsCollapsed ? (
            <ChevronDown size={16} />
          ) : (
            <ChevronUp size={16} />
          )}
        </button>
      </div>
      {!isCalculatorSettingsCollapsed && (
        <div className="space-y-6 p-6">
          {/* Переключатель отображения линий */}
          <div className="flex items-center justify-between">
            <Label htmlFor="show-option-lines" className="text-sm font-normal cursor-pointer">
              Отображать все линии на графике
            </Label>
            <Switch
              id="show-option-lines"
              checked={showOptionLines}
              onCheckedChange={setShowOptionLines}
              className="data-[state=checked]:bg-cyan-500"
            />
          </div>

          {/* Переключатель учёта дивидендов (BSM модель) */}
          {/* ЗАЧЕМ: Отображаем для акций и ETF (их математика идентична), для фьючерсов дивиденды не актуальны */}
          {isStockLikeMode(calculatorMode) && (
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <Label htmlFor="use-dividends" className="text-sm font-normal cursor-pointer">
                  Учитывать дивиденды
                </Label>
                {useDividends && dividendYield > 0 && (
                  <span className="text-xs text-muted-foreground mt-0.5">
                    Dividend Yield: {dividendLoading ? '...' : `${dividendYieldPercent}%`}
                  </span>
                )}
                {useDividends && dividendYield === 0 && !dividendLoading && (
                  <span className="text-xs text-orange-500 mt-0.5">
                    Нет дивидендов
                  </span>
                )}
              </div>
              <Switch
                id="use-dividends"
                checked={useDividends}
                onCheckedChange={setUseDividends}
                className="data-[state=checked]:bg-cyan-500"
              />
            </div>
          )}

          {/* Плечо для базового актива */}
          {/* ЗАЧЕМ: на брокерском счёте акции маржинальные — реально блокируется notional/leverage. */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col">
              <Label htmlFor="base-asset-leverage" className="text-sm font-normal">
                Плечо для базового актива
              </Label>
              <span className="text-xs text-muted-foreground mt-0.5">
                Делится на стоимость позиций БА. Премия опционов не делится.
              </span>
            </div>
            <Input
              id="base-asset-leverage"
              type="number"
              min={1}
              step={0.5}
              value={leverageDraft}
              onChange={handleLeverageChange}
              onBlur={handleLeverageBlur}
              className="w-20 text-right"
            />
          </div>

          {/* Безрисковая ставка - информационный блок */}
          <div className="pt-2 border-t border-gray-200">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Безрисковая ставка</span>
              <span className="font-medium text-cyan-600">
                {rateLoading ? '...' : `${ratePercent.toFixed(2)}%`}
              </span>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export default CalculatorSettings;
