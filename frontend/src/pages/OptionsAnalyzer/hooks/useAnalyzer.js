/**
 * Хук для управления состоянием анализатора опционов
 * ЗАЧЕМ: Централизация логики состояния и обработчиков
 * Затрагивает: управление состоянием, API вызовы, обработка ошибок
 */

import { useState } from 'react';
import { executeAnalysis } from '../utils/analysisSteps';

export const useAnalyzer = () => {
  const [ticker, setTicker] = useState('');
  const [aiModel, setAiModel] = useState(() => localStorage.getItem('aiModel') || 'gemini');
  const [currentStep, setCurrentStep] = useState(0);
  const [stockData, setStockData] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiProvider, setAiProvider] = useState('');
  const [shareUrl, setShareUrl] = useState(null);
  const [analysisId, setAnalysisId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const handleAiModelChange = (model) => {
    setAiModel(model);
    localStorage.setItem('aiModel', model);
  };

  const handleAnalyze = async () => {
    if (!ticker.trim()) {
      setError('Введите тикер');
      return;
    }

    setError(null);
    setStockData(null);
    setMetrics(null);
    setAiAnalysis(null);
    setShareUrl(null);
    setAnalysisId(null);
    setCopied(false);

    const result = await executeAnalysis(ticker, aiModel, {
      setCurrentStep,
      setStockData,
      setMetrics,
      setAiAnalysis,
      setAiProvider,
      setShareUrl,
      setAnalysisId
    });

    if (!result.success) {
      setError(result.error);
    }
  };

  const copyShareLink = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const startNewAnalysis = () => {
    setTicker('');
    setStockData(null);
    setMetrics(null);
    setAiAnalysis(null);
    setShareUrl(null);
    setAnalysisId(null);
    setCopied(false);
    setError(null);
  };

  return {
    ticker,
    setTicker,
    aiModel,
    handleAiModelChange,
    currentStep,
    stockData,
    metrics,
    aiAnalysis,
    aiProvider,
    shareUrl,
    analysisId,
    copied,
    error,
    isLoading: currentStep > 0,
    handleAnalyze,
    copyShareLink,
    startNewAnalysis
  };
};
