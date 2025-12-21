import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';

const AnalysisView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  // Установка заголовка страницы
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

  useEffect(() => {
    fetchAnalysis();
  }, [id]);

  const fetchAnalysis = async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:8000/api/analysis/${id}`);
      const data = await response.json();
      
      if (data.status === 'success') {
        setAnalysis(data.data);
      } else {
        setError(data.error || 'Анализ не найден');
      }
    } catch (err) {
      setError('Ошибка загрузки анализа');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const startNewAnalysis = () => {
    navigate(`/tools/options-analyzer?ticker=${analysis.ticker}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Загрузка анализа...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 max-w-md">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-600 mb-4">Ошибка</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <Button onClick={() => navigate('/tools/options-analyzer')}>
              Вернуться к анализатору
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">
          Анализ опционов: {analysis.ticker}
        </h1>
        
        <div className="text-sm text-gray-500 mb-4">
          Дата создания: {new Date(analysis.created_at).toLocaleString('ru-RU')}
          {' • '}
          AI модель: {analysis.ai_provider}
          {analysis.execution_time_ms && (
            <> • Время выполнения: {(analysis.execution_time_ms / 1000).toFixed(1)}с</>
          )}
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Цена */}
        <div className="p-4 bg-white rounded-lg border border-gray-200">
          <div className="text-xs text-gray-500 uppercase mb-2 font-medium">Цена</div>
          <div className="text-3xl font-bold mb-1">
            ${analysis.stock_data.price?.toFixed(2)}
          </div>
          <div className={`text-sm font-semibold ${
            analysis.stock_data.change >= 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            {analysis.stock_data.change >= 0 ? '+' : ''}
            {analysis.stock_data.change_percent?.toFixed(2)}%
          </div>
        </div>

        {/* Max Pain */}
        {analysis.metrics.max_pain && (
          <div className="p-4 bg-white rounded-lg border border-gray-200">
            <div className="text-xs text-gray-500 uppercase mb-2 font-medium">Max Pain</div>
            <div className="text-3xl font-bold mb-1">
              ${analysis.metrics.max_pain.toFixed(2)}
            </div>
            <div className="text-xs text-gray-400">
              {analysis.metrics.max_pain_contracts || 0} контрактов
            </div>
          </div>
        )}

        {/* P/C Ratio */}
        {analysis.metrics.put_call_ratio && (
          <div className="p-4 bg-white rounded-lg border border-gray-200">
            <div className="text-xs text-gray-500 uppercase mb-2 font-medium">P/C Ratio</div>
            <div className="text-3xl font-bold mb-1">
              {typeof analysis.metrics.put_call_ratio === 'object' 
                ? analysis.metrics.put_call_ratio.volume_ratio?.toFixed(2) 
                : analysis.metrics.put_call_ratio.toFixed(2)}
            </div>
            <div className="text-xs text-gray-400">
              {typeof analysis.metrics.put_call_ratio === 'object' 
                ? (analysis.metrics.put_call_ratio.volume_ratio > 1 ? 'Медвежий' : 'Бычий')
                : (analysis.metrics.put_call_ratio > 1 ? 'Медвежий' : 'Бычий')}
            </div>
          </div>
        )}

        {/* Gamma Exp */}
        {analysis.metrics.gamma_exposure && (
          <div className="p-4 bg-white rounded-lg border border-gray-200">
            <div className="text-xs text-gray-500 uppercase mb-2 font-medium">Gamma Exp.</div>
            <div className="text-3xl font-bold mb-1">
              {typeof analysis.metrics.gamma_exposure === 'object'
                ? ((analysis.metrics.gamma_exposure.net_gamma || 0) / 1000).toFixed(1) + 'K'
                : (analysis.metrics.gamma_exposure / 1000).toFixed(1) + 'K'}
            </div>
            <div className="text-xs text-gray-400">
              {typeof analysis.metrics.gamma_exposure === 'object' && analysis.metrics.gamma_exposure.net_gamma
                ? (analysis.metrics.gamma_exposure.net_gamma > 0 ? 'Стабилизация' : 'Волатильность')
                : 'Стабилизация'}
            </div>
          </div>
        )}
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* До экспирации */}
        {analysis.metrics.days_to_expiry !== undefined && (
          <div className="p-4 bg-white rounded-lg border border-gray-200">
            <div className="text-xs text-gray-500 uppercase mb-2 font-medium">До экспирации</div>
            <div className="text-3xl font-bold mb-1">
              {analysis.metrics.days_to_expiry} дн.
            </div>
            <div className="text-xs text-gray-400">Критическая зона</div>
          </div>
        )}

        {/* Объем торгов */}
        <div className="p-4 bg-white rounded-lg border border-gray-200">
          <div className="text-xs text-gray-500 uppercase mb-2 font-medium">Объем торгов</div>
          <div className="text-3xl font-bold mb-1">
            {(analysis.stock_data.volume / 1000000).toFixed(1)}M
          </div>
          <div className="text-xs text-gray-400">Контрактов за день</div>
        </div>

        {/* High / Low */}
        <div className="p-4 bg-white rounded-lg border border-gray-200">
          <div className="text-xs text-gray-500 uppercase mb-2 font-medium">High / Low</div>
          <div className="text-2xl font-bold mb-1">
            ${analysis.stock_data.high?.toFixed(2)}
          </div>
          <div className="text-sm text-gray-600">
            ${analysis.stock_data.low?.toFixed(2)}
          </div>
        </div>
      </div>

      {/* AI Analysis */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">🧠 AI Анализ</h2>
        <div className="prose prose-lg max-w-none" style={{
          fontSize: '1rem',
          lineHeight: '1.75',
          color: '#1f2937'
        }}>
          <style>{`
            .prose h1, .prose h2, .prose h3, .prose h4 {
              font-weight: 700;
              margin-top: 1.5rem;
              margin-bottom: 0.75rem;
              color: #111827;
            }
            .prose h1 { font-size: 1.5rem; }
            .prose h2 { font-size: 1.25rem; }
            .prose h3 { font-size: 1.125rem; }
            .prose h4 { font-size: 1rem; }
            .prose p {
              margin-bottom: 1rem;
            }
            .prose ul, .prose ol {
              margin-left: 1.5rem;
              margin-bottom: 1rem;
            }
            .prose li {
              margin-bottom: 0.5rem;
            }
            .prose strong {
              font-weight: 600;
              color: #111827;
            }
            .prose code {
              background: #f3f4f6;
              padding: 0.2rem 0.4rem;
              border-radius: 0.25rem;
              font-size: 0.875rem;
            }
            .prose pre {
              background: #f8fafc;
              color: #1f2937;
              border: 1px solid #e2e8f0;
              padding: 1rem;
              border-radius: 0.5rem;
              overflow-x: auto;
              margin-bottom: 1rem;
              font-size: 0.9rem;
            }
            .prose pre code {
              background: transparent;
              padding: 0;
              color: inherit;
            }
            .prose details {
              margin: 1rem 0;
              padding: 1rem;
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 0.5rem;
            }
            .prose summary {
              cursor: pointer;
              font-weight: 600;
              color: #111827;
              user-select: none;
            }
            .prose summary:hover {
              color: #667eea;
            }
            .prose details[open] summary {
              margin-bottom: 0.75rem;
            }
            .prose hr {
              display: none;
            }
          `}</style>
          <ReactMarkdown rehypePlugins={[rehypeRaw]}>{analysis.ai_analysis}</ReactMarkdown>
        </div>
      </Card>

      {/* Footer */}
      <div className="mt-8 text-center">
        <Button
          variant="outline"
          onClick={() => navigate('/tools/options-analyzer')}
        >
          ← Вернуться к анализатору
        </Button>
      </div>
    </div>
  );
};

export default AnalysisView;
