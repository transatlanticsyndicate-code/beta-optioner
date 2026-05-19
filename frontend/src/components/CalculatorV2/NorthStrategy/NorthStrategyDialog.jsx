/**
 * Основной поп-ап стратегии СЕВЕР.
 * Управляет двумя экранами (параметры → результаты) и держит кэш результатов
 * между переключениями экранов, чтобы не перезапускать анализ при возврате.
 */

import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../ui/dialog';
import { Snowflake, Loader2 } from 'lucide-react';
import ParamsForm from './ParamsForm';
import ResultsView from './ResultsView';
import { analyzeNorthStrategy, findClosestExpiration } from '../../../utils/northStrategy/analyzer';
import { DEFAULT_WEIGHTS } from '../../../utils/northStrategy/scoring';

function NorthStrategyDialog({
  isOpen,
  initialStep = 'params',
  currentPrice,
  entryPrice,
  assetQuantity,
  availableExpirations,
  chain,
  ivSurface,
  calculatorMode,
  dividendYield,
  stockClassification,
  initialState,
  onClose,
  onApply,
  onStateChange,
}) {
  const [step, setStep] = useState(initialStep);
  const [params, setParams] = useState(initialState?.params || null);
  const [combinations, setCombinations] = useState(initialState?.combinations || []);
  const [weights, setWeights] = useState(initialState?.weights || DEFAULT_WEIGHTS);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep(initialStep);
      if (initialState?.params) setParams(initialState.params);
      if (initialState?.combinations) setCombinations(initialState.combinations);
      if (initialState?.weights) setWeights(initialState.weights);
    }
  }, [isOpen, initialStep, initialState]);

  const handleAnalyze = (formParams) => {
    setIsAnalyzing(true);
    setParams(formParams);
    // Запускаем синхронно через таймаут, чтобы UI успел показать спиннер
    setTimeout(() => {
      try {
        const expiration = findClosestExpiration(chain, formParams.expirationDate) || formParams.expirationDate;
        const result = analyzeNorthStrategy({
          entry: entryPrice,
          assetQuantity,
          currentPrice,
          topPrice: formParams.topPrice,
          bottomPrice: formParams.bottomPrice,
          midAPrice: formParams.midAPrice,
          midBPrice: formParams.midBPrice,
          expirationDate: expiration,
          calcDate: formParams.calcDate,
          strikeRangeMin: formParams.strikeRangeMin,
          strikeRangeMax: formParams.strikeRangeMax,
          qty: formParams.qty,
          chain,
          ivSurface,
          calculatorMode,
          dividendYield,
          stockClassification,
        });
        setCombinations(result);
        setStep('results');
        if (onStateChange) {
          onStateChange({ params: formParams, combinations: result, weights });
        }
      } catch (err) {
        console.error('[NorthStrategy] Ошибка анализа:', err);
        setCombinations([]);
        setStep('results');
      } finally {
        setIsAnalyzing(false);
      }
    }, 50);
  };

  const handleBack = () => setStep('params');

  const handlePick = (combination) => {
    onApply({ combination, params, combinations, weights });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Snowflake className="h-5 w-5 text-sky-500" />
            Стратегия СЕВЕР
            <span className="text-sm font-normal text-muted-foreground">
              {step === 'params' ? '· параметры' : '· результаты'}
            </span>
          </DialogTitle>
          <DialogDescription>
            Подбор защитной пары Buy Call + Buy Put к лонг-позиции по базовому активу.
          </DialogDescription>
        </DialogHeader>

        {isAnalyzing && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Подбираем комбинации…
          </div>
        )}

        {!isAnalyzing && step === 'params' && (
          <ParamsForm
            currentPrice={currentPrice}
            entryPrice={entryPrice}
            availableExpirations={availableExpirations}
            initialValues={params || undefined}
            onAnalyze={handleAnalyze}
            onCancel={onClose}
          />
        )}

        {!isAnalyzing && step === 'results' && (
          <ResultsView
            combinations={combinations}
            initialWeights={weights}
            onPick={handlePick}
            onBack={handleBack}
            onCancel={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export default NorthStrategyDialog;
