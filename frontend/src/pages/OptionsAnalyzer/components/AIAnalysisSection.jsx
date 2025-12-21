/**
 * Секция AI анализа с результатами
 * ЗАЧЕМ: Отображение AI анализа и кнопок действий
 * Затрагивает: визуализация результатов, навигация
 */

import React from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';

export function AIAnalysisSection({ 
  aiAnalysis, 
  aiProvider, 
  shareUrl, 
  analysisId, 
  copied, 
  onCopyLink, 
  onNewAnalysis 
}) {
  if (!aiAnalysis) return null;

  return (
    <div className="result-container">
      <div className="result-header">
        <h2 className="result-title">
          📊 Анализ от {aiProvider === 'gemini' ? 'Gemini AI' : 'Claude AI'}
        </h2>
      </div>

      <section className="analysis-section">
        <style>{`
          .analysis-text {
            font-size: 1rem;
            line-height: 1.75;
            color: #1f2937;
          }
          .analysis-text h1, 
          .analysis-text h2, 
          .analysis-text h3, 
          .analysis-text h4 {
            font-weight: 700;
            margin-top: 1.5rem;
            margin-bottom: 0.75rem;
            color: #111827;
          }
          .analysis-text h1 { font-size: 1.5rem; }
          .analysis-text h2 { font-size: 1.25rem; }
          .analysis-text h3 { font-size: 1.125rem; }
          .analysis-text h4 { font-size: 1rem; }
          .analysis-text p {
            margin-bottom: 1rem;
          }
          .analysis-text ul, 
          .analysis-text ol {
            margin-left: 1.5rem;
            margin-bottom: 1rem;
          }
          .analysis-text li {
            margin-bottom: 0.5rem;
          }
          .analysis-text strong {
            font-weight: 600;
            color: #111827;
          }
          .analysis-text code {
            background: #f3f4f6;
            padding: 0.2rem 0.4rem;
            border-radius: 0.25rem;
            font-size: 0.875rem;
          }
          .analysis-text pre {
            background: #f8fafc;
            color: #1f2937;
            border: 1px solid #e2e8f0;
            padding: 1rem;
            border-radius: 0.5rem;
            overflow-x: auto;
            margin-bottom: 1rem;
            font-size: 0.9rem;
          }
          .analysis-text pre code {
            background: transparent;
            padding: 0;
            color: inherit;
          }
          .analysis-text hr {
            display: none;
          }
        `}</style>
        <div className="analysis-text">
          <ReactMarkdown rehypePlugins={[rehypeRaw]}>{aiAnalysis}</ReactMarkdown>
        </div>
      </section>

      {shareUrl && (
        <section className="share-section" style={{
          marginTop: '2rem',
          padding: '1.5rem',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '12px',
          color: 'white',
          textAlign: 'center'
        }}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>
            ✅ Анализ завершен!
          </h3>
          
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.9rem', opacity: 0.9, marginBottom: '0.5rem' }}>
              🔗 Постоянная ссылка:
            </p>
            <div style={{
              background: 'rgba(255,255,255,0.2)',
              padding: '0.75rem',
              borderRadius: '8px',
              fontSize: '0.9rem',
              wordBreak: 'break-all'
            }}>
              {shareUrl}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={onCopyLink}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'white',
                color: '#667eea',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '1rem'
              }}
            >
              {copied ? (
                <>
                  <span>✓</span>
                  <span>Скопировано</span>
                </>
              ) : (
                <>
                  <span>📋</span>
                  <span>Скопировать</span>
                </>
              )}
            </button>
            
            <button
              onClick={onNewAnalysis}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'rgba(255,255,255,0.2)',
                color: 'white',
                border: '2px solid white',
                borderRadius: '8px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '1rem'
              }}
            >
              <span>🔄</span>
              <span>Новый анализ</span>
            </button>

            {analysisId && (
              <Link
                to={`/analysis/${analysisId}`}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'rgba(255,255,255,0.2)',
                  color: 'white',
                  border: '2px solid white',
                  borderRadius: '8px',
                  fontWeight: '600',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '1rem'
                }}
              >
                <span>👁️</span>
                <span>Открыть анализ</span>
              </Link>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
