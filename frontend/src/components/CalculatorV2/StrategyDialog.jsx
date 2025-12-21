import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';

const strategies = [
  {
    id: "long-call",
    name: "Длинный колл",
    description: "Покупка опциона колл. Прибыль при росте цены актива выше страйка.",
    probability: "Средняя",
    maxProfit: "Неограничена",
    maxLoss: "Премия",
  },
  {
    id: "bull-call-spread",
    name: "Спред, бычий колл",
    description: "Покупка колла с низким страйком и продажа колла с высоким страйком.",
    probability: "Высокая",
    maxProfit: "Ограничена",
    maxLoss: "Ограничен",
  },
  {
    id: "iron-condor",
    name: "Железный кондор",
    description: "Комбинация бычьего пут-спреда и медвежьего колл-спреда.",
    probability: "Очень высокая",
    maxProfit: "Ограничена",
    maxLoss: "Ограничен",
  },
];

function StrategyDialog({ 
  strategiesDialogOpen, 
  setStrategiesDialogOpen,
  selectedStrategy,
  setSelectedStrategy,
  selectStrategy
}) {
  return (
    <Dialog open={strategiesDialogOpen} onOpenChange={setStrategiesDialogOpen}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Подходящие стратегии</DialogTitle>
          <DialogDescription>Выберите стратегию на основе вашего прогноза и уровня риска</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <RadioGroup value={selectedStrategy} onValueChange={setSelectedStrategy}>
            <div className="space-y-3">
              {strategies.map((strategy) => (
                <label
                  key={strategy.id}
                  htmlFor={strategy.id}
                  className="flex w-full cursor-pointer rounded-md border p-4 transition-all hover:bg-accent has-[:checked]:border-cyan-500 has-[:checked]:bg-cyan-50 dark:has-[:checked]:bg-cyan-950"
                >
                  <div className="flex w-full items-start gap-3">
                    <RadioGroupItem value={strategy.id} id={strategy.id} className="mt-1" />
                    <div className="flex-1">
                      <div className="font-semibold text-base mb-1">{strategy.name}</div>
                      <div className="text-sm text-muted-foreground mb-2">{strategy.description}</div>
                      <div className="flex gap-4 text-xs">
                        <div>
                          <span className="text-muted-foreground">Вероятность: </span>
                          <span className="font-medium">{strategy.probability}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">MAX прибыль: </span>
                          <span className="font-medium text-green-600">{strategy.maxProfit}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">MAX убыток: </span>
                          <span className="font-medium text-red-600">{strategy.maxLoss}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </RadioGroup>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setStrategiesDialogOpen(false)}>
            Отмена
          </Button>
          <Button
            onClick={() => {
              if (selectedStrategy) {
                selectStrategy(selectedStrategy);
                setStrategiesDialogOpen(false);
              }
            }}
            disabled={!selectedStrategy}
            className="bg-cyan-500 hover:bg-cyan-600 text-white"
          >
            Применить стратегию
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default StrategyDialog;
