import React from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Slider } from '../ui/slider';

function RiskCalculator({ 
  selectedTrend, 
  setSelectedTrend,
  targetLevel,
  setTargetLevel,
  riskLimit,
  setRiskLimit,
  riskRewardSlider,
  setRiskRewardSlider,
  setStrategiesDialogOpen,
  showStrategyButton = true
}) {
  const trends = [
    { id: 'down-left', name: 'Медвежий вниз-влево', selectedImg: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Group%2020-zCFEEAvnWLWJDYdBurwc8ETRwJ4iau.png', unselectedImg: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Group%2021-cUgIV99i0laBNsmQu7x5bz35OKK42A.png' },
    { id: 'down-wave', name: 'Медвежий волнистый', selectedImg: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Group%2019-jou5DDktgS5YRwTC2MfgEOEJHQQZv8.png', unselectedImg: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Group%2022-GXmjYoFAxrstBSdakPFwwMbCY1iwlN.png' },
    { id: 'neutral', name: 'Нейтральный', selectedImg: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Group%2018-elWOOoukXYUCq2gw8ej48HYTzimuqi.png', unselectedImg: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Group%2024-LsCwpMEasFQRP6ToLf1eSgmwE855CX.png' },
    { id: 'range', name: 'Диапазон', selectedImg: '/images/range-selected.png', unselectedImg: '/images/range-unselected.png' },
    { id: 'up-wave', name: 'Бычий волнистый', selectedImg: '/images/up-wave-selected.png', unselectedImg: '/images/up-wave-unselected.png' },
    { id: 'up-right', name: 'Бычий вверх-вправо', selectedImg: '/images/up-right-selected.png', unselectedImg: '/images/up-right-unselected.png' },
  ];

  return (
    <div className="p-4 flex flex-col">
      <div className="flex gap-2 mb-3">
        {trends.map((trend) => (
          <button
            key={trend.id}
            onClick={() => setSelectedTrend(selectedTrend === trend.id ? null : trend.id)}
            className="flex-1 aspect-square rounded-lg transition-all hover:scale-[1.06] overflow-hidden border-0"
          >
            <img
              src={selectedTrend === trend.id ? trend.selectedImg : trend.unselectedImg}
              alt={trend.name}
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>

      <div className="flex gap-4 mb-3 items-end">
        <div className="flex-1">
          <div className="text-xs text-muted-foreground mb-1">
            Целевой уровень <span className="text-green-600">+7.9%</span>
          </div>
          <Input
            value={`$${targetLevel}`}
            onChange={(e) => setTargetLevel(e.target.value.replace("$", ""))}
            className="text-2xl font-bold h-12 text-center"
          />
        </div>
        <div className="flex-1">
          <div className="text-xs text-muted-foreground mb-1">Ограничить риск</div>
          <Input
            value={`$${riskLimit}`}
            onChange={(e) => setRiskLimit(e.target.value.replace("$", ""))}
            className="text-2xl font-bold h-12 text-center text-muted-foreground"
          />
        </div>
      </div>

      <div className="mb-3">
        <Slider
          value={[riskRewardSlider]}
          onValueChange={(value) => setRiskRewardSlider(value[0])}
          min={0}
          max={100}
          step={1}
          className="[&_[role=slider]]:bg-cyan-500 [&_[role=slider]]:border-cyan-500"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>← выше вероятность</span>
          <span>ниже вероятность →</span>
        </div>
      </div>

      {showStrategyButton && (
        <Button
          className="w-full bg-cyan-500 hover:bg-cyan-600 text-white h-10 font-medium mt-1.5"
          onClick={() => setStrategiesDialogOpen(true)}
        >
          Показать подходящие стратегии
        </Button>
      )}
    </div>
  );
}

export default RiskCalculator;
