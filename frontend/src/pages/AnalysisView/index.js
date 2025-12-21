/**
 * Страница просмотра AI анализа опционов
 * ЗАЧЕМ: Отображение результатов анализа с метриками и AI рекомендациями
 * Затрагивает: просмотр сохраненных анализов, метрики, AI анализ
 */

import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { useAnalysisData } from './hooks/useAnalysisData';
import { formatDate, formatExecutionTime } from './utils/formatters';
import {
  MetricsCards,
  AnalysisContent,
  LoadingState,
  ErrorState
} from './components';

const AnalysisView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { analysis, loading, error } = useAnalysisData(id);

  // Установка заголовка страницы
  // ЗАЧЕМ: Динамический заголовок с тикером для удобства пользователя
  useEffect(() => {
    if (analysis) {
      document.title = `Анализ ${analysis.ticker} | SYNDICATE Platform`;
    } else {
      document.title = 'Просмотр анализа | SYNDICATE Platform';
    }
    return () => {
      document.title = 'SYNDICATE Platform';
    };
  }, [analysis]);

  // Обработчики навигации
  // ЗАЧЕМ: Удобные функции для возврата к анализатору
  const handleBackToAnalyzer = () => {
    navigate('/tools/options-analyzer');
  };

  const handleNewAnalysis = () => {
    navigate(`/tools/options-analyzer?ticker=${analysis.ticker}`);
  };

  // Состояние загрузки
  if (loading) {
    return <LoadingState />;
  }

  // Состояние ошибки
  if (error) {
    return <ErrorState error={error} onBack={handleBackToAnalyzer} />;
  }

  // Проверка наличия данных
  if (!analysis) return null;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">
          Анализ опционов: {analysis.ticker}
        </h1>
        
        <div className="text-sm text-gray-500 mb-4">
          Дата создания: {formatDate(analysis.created_at)}
          {' • '}
          AI модель: {analysis.ai_provider}
          {analysis.execution_time_ms && (
            <> • Время выполнения: {formatExecutionTime(analysis.execution_time_ms)}с</>
          )}
        </div>
      </div>

      {/* Metrics Cards */}
      <MetricsCards analysis={analysis} />

      {/* AI Analysis */}
      <AnalysisContent analysis={analysis} />

      {/* Footer */}
      <div className="mt-8 text-center">
        <Button
          variant="outline"
          onClick={handleBackToAnalyzer}
        >
          ← Вернуться к анализатору
        </Button>
      </div>
    </div>
  );
};

export default AnalysisView;
