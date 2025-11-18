import React, { useState } from 'react';
import { Settings } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';

/**
 * CommissionSettings - настройки комиссий и параметров калькулятора
 */
function CommissionSettings({ settings, onUpdateSettings }) {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState(settings);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : parseFloat(value) || value
    }));
  };

  const handleSave = () => {
    onUpdateSettings(formData);
    localStorage.setItem('optionsCalculatorSettings', JSON.stringify(formData));
    setIsOpen(false);
  };

  const handleReset = () => {
    const defaultSettings = {
      defaultCommission: 0.65,
      priceRange: 0.20,
      chartPoints: 200,
      autoSave: true
    };
    setFormData(defaultSettings);
    onUpdateSettings(defaultSettings);
    localStorage.setItem('optionsCalculatorSettings', JSON.stringify(defaultSettings));
  };

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        variant="outline"
        size="sm"
        className="gap-2"
      >
        <Settings className="w-4 h-4" />
        Settings
      </Button>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Calculator Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Default Commission */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Default Commission (per contract)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
              <Input
                type="number"
                name="defaultCommission"
                value={formData.defaultCommission}
                onChange={handleChange}
                min="0"
                step="0.01"
                className="pl-8"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Стандартная комиссия для новых позиций
            </p>
          </div>

          {/* Price Range */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-sm font-medium">
                Price Range for Chart
              </label>
              <span className="text-sm text-muted-foreground">±{(formData.priceRange * 100).toFixed(0)}%</span>
            </div>
            <Slider
              value={[formData.priceRange * 100]}
              onValueChange={(value) => handleChange({
                target: {
                  name: 'priceRange',
                  value: value[0] / 100
                }
              })}
              min={5}
              max={50}
              step={5}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Диапазон цен на графике относительно текущей цены
            </p>
          </div>

          {/* Chart Points */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-sm font-medium">
                Chart Points (resolution)
              </label>
              <span className="text-sm text-muted-foreground">{formData.chartPoints}</span>
            </div>
            <Slider
              value={[formData.chartPoints]}
              onValueChange={(value) => handleChange({
                target: {
                  name: 'chartPoints',
                  value: value[0]
                }
              })}
              min={50}
              max={500}
              step={50}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Количество точек на графике (больше = точнее, но медленнее)
            </p>
          </div>

          {/* Auto Save */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div className="space-y-0.5">
              <div className="text-sm font-medium">Auto Save</div>
              <div className="text-xs text-muted-foreground">
                Автоматически сохранять позиции в браузере
              </div>
            </div>
            <Switch
              checked={formData.autoSave}
              onCheckedChange={(checked) => handleChange({
                target: {
                  name: 'autoSave',
                  type: 'checkbox',
                  checked
                }
              })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleReset}
            variant="outline"
          >
            Reset to Default
          </Button>
          <Button
            onClick={handleSave}
          >
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CommissionSettings;
