import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import {
  getCryptoBasisRate,
  setCryptoBasisRate,
  resetCryptoBasisRate,
  DEFAULT_CRYPTO_BASIS_RATE,
} from '../../utils/cryptoRateSettings';

// Ставка хранится в долях (0.06 = 6% годовых), а вводится пользователем в процентах —
// так понятнее для не-программиста и совпадает с тем, как брокеры показывают базис.
const toPercentString = (decimalRate) => {
  const pct = decimalRate * 100;
  // Убираем лишние нули после запятой (6.00 -> 6, 6.50 -> 6.5)
  return Number.isInteger(pct) ? String(pct) : String(Number(pct.toFixed(4)));
};

function SettingsMarketData() {
  const [percentInput, setPercentInput] = useState(() => toPercentString(getCryptoBasisRate()));
  const [savedStatus, setSavedStatus] = useState('idle'); // idle|saved

  const handleChange = (e) => {
    setPercentInput(e.target.value);
    if (savedStatus !== 'idle') setSavedStatus('idle');
  };

  const handleSave = () => {
    const decimalRate = Number(percentInput) / 100;
    const saved = setCryptoBasisRate(decimalRate);
    setPercentInput(toPercentString(saved));
    setSavedStatus('saved');
  };

  const handleReset = () => {
    const saved = resetCryptoBasisRate();
    setPercentInput(toPercentString(saved));
    setSavedStatus('saved');
  };

  const isDefault = Number(percentInput) === DEFAULT_CRYPTO_BASIS_RATE * 100;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Рыночные данные</h2>
        <p className="text-muted-foreground mt-1">Настройки источников и параметров рыночных данных</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ставка для крипто-режима (форвардный базис)</CardTitle>
          <CardDescription>
            Что это: для акций калькулятор берёт безрисковую ставку из ФРС (FRED)
            автоматически. Для крипто-опционов такой единой ставки нет — вместо неё
            используется «форвардный базис»: разница между ценой фьючерса/бессрочного
            контракта и ценой спот на бирже. Если фьючерс дороже спота (контанго) —
            базис положительный, если дешевле (бэквордация) — отрицательный.
            <br /><br />
            Когда менять: только если вы торгуете крипто-опционами и знаете текущий
            годовой базис по своему инструменту (можно посмотреть на бирже как разницу
            цен спот/фьючерс). Если не уверены — оставьте 0.
            <br /><br />
            Что значит 0: расчёт как раньше, без поправки на базис (так было в
            калькуляторе всегда, пока это поле не появилось).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-sm">
          <div className="space-y-1.5">
            <Label htmlFor="crypto-basis-rate">Годовой базис (%)</Label>
            <div className="relative">
              <Input
                id="crypto-basis-rate"
                type="number"
                step="0.1"
                value={percentInput}
                onChange={handleChange}
                className="h-9 pr-8"
                placeholder="0"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Например, 6 означает контанго 6% годовых, -4 — бэквордация 4% годовых.
              Значения за пределами ±100% не принимаются и сбрасываются в 0.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} size="sm">Сохранить</Button>
            {!isDefault && (
              <Button onClick={handleReset} variant="outline" size="sm">
                Сбросить в 0
              </Button>
            )}
            {savedStatus === 'saved' && (
              <span className="text-sm text-green-600">Сохранено</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default SettingsMarketData;
