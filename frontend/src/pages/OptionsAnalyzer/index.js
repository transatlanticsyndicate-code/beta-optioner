/**
 * OptionsAnalyzer - анализатор опционов с AI
 * ЗАЧЕМ: Глубокий анализ опционного рынка через AI (Gemini/Claude)
 * Затрагивает: опционная аналитика, AI интеграция, метрики рынка
 */

import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import ProgressBar from './ProgressBar';
import { AnalyzerForm, MetricsCards, DataSourceInfo, AIAnalysisSection } from './components';
import { useAnalyzer } from './hooks/useAnalyzer';
import './OptionsAnalyzer.css';

function OptionsAnalyzer() {
  useEffect(() => {
    document.title = 'Анализатор опционов | SYNDICATE Platform';
    return () => {
      document.title = 'SYNDICATE Platform';
    };
  }, []);

  const {
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
    isLoading,
    handleAnalyze,
    copyShareLink,
    startNewAnalysis
  } = useAnalyzer();

  return (
    <div className="options-analyzer">
      <div className="breadcrumbs">
        <Link to="/" className="breadcrumb-link">Главная</Link>
        <span className="breadcrumb-separator">/</span>
        <span className="breadcrumb-current">Options AI</span>
      </div>

      <div className="page-header"></div>

      <AnalyzerForm
        ticker={ticker}
        setTicker={setTicker}
        aiModel={aiModel}
        onAiModelChange={handleAiModelChange}
        onAnalyze={handleAnalyze}
        isLoading={isLoading}
        error={error}
      />

      <DataSourceInfo aiModel={aiModel} isVisible={isLoading || stockData} />

      {isLoading && <ProgressBar currentStep={currentStep} aiModel={aiModel} />}

      <MetricsCards stockData={stockData} metrics={metrics} />

      {!isLoading && (
        <AIAnalysisSection
          aiAnalysis={aiAnalysis}
          aiProvider={aiProvider}
          shareUrl={shareUrl}
          analysisId={analysisId}
          copied={copied}
          onCopyLink={copyShareLink}
          onNewAnalysis={startNewAnalysis}
        />
      )}
    </div>
  );
}

export default OptionsAnalyzer;
