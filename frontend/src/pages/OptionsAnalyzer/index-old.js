import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { analyzeStep1, analyzeStep2, analyzeStep3 } from '../../services/api';
import ProgressBar from './ProgressBar';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import './OptionsAnalyzer.css';

function OptionsAnalyzer() {
  // Установка заголовка страницы
  useEffect(() => {
    document.title = 'Анализатор опционов | SYNDICATE Platform';
    return () => {
      document.title = 'SYNDICATE Platform';
    };
  }, []);

  const [ticker, setTicker] = useState('');
  const [aiModel, setAiModel] = useState(() => localStorage.getItem('aiModel') || 'gemini');
  const [currentStep, setCurrentStep] = useState(0); // 0=idle, 1=data, 2=metrics, 3=ai
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
    console.log('▶️ Начало анализа:', { ticker, aiModel });
    
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

    try {
      // Шаг 1: Получить данные
      console.log('📊 Step 1: Получение данных');
      setCurrentStep(1);
      const step1StartTime = Date.now();
      const step1Data = await analyzeStep1(ticker);
      const step1Duration = ((Date.now() - step1StartTime) / 1000).toFixed(1);
      console.log(`✅ Step 1 завершен за ${step1Duration}с:`, step1Data);
      
      if (step1Data.status === 'error') {
        throw new Error(step1Data.error);
      }
      
      setStockData(step1Data.stock_data);
      await new Promise(resolve => setTimeout(resolve, 500)); // Пауза для показа

      // Шаг 2: Рассчитать метрики
      console.log('📊 Step 2: Расчет метрик');
      setCurrentStep(2);
      const step2StartTime = Date.now();
      const step2Data = await analyzeStep2(ticker);
      const step2Duration = ((Date.now() - step2StartTime) / 1000).toFixed(1);
      console.log(`✅ Step 2 завершен за ${step2Duration}с:`, step2Data);
      
      if (step2Data.status === 'error') {
        throw new Error(step2Data.error);
      }
      
      setMetrics(step2Data.metrics);
      await new Promise(resolve => setTimeout(resolve, 500)); // Пауза для показа

      // Шаг 3: AI анализ
      console.log('🤖 Step 3: AI анализ с', aiModel);
      setCurrentStep(3);
      const step3StartTime = Date.now();
      const step3Data = await analyzeStep3(ticker, aiModel);
      const step3Duration = ((Date.now() - step3StartTime) / 1000).toFixed(1);
      console.log(`✅ Step 3 завершен за ${step3Duration}с:`, step3Data);
      
      if (step3Data.status === 'error') {
        throw new Error(step3Data.error);
      }
      
      setAiAnalysis(step3Data.ai_analysis);
      setAiProvider(step3Data.ai_provider);
      
      // Сохранить share_url и analysis_id если они есть
      if (step3Data.share_url) {
        setShareUrl(step3Data.share_url);
      }
      if (step3Data.analysis_id) {
        setAnalysisId(step3Data.analysis_id);
      }
      
      setCurrentStep(0); // Завершено

    } catch (err) {
      console.error('❌ Ошибка:', err);
      setError(err.message);
      setCurrentStep(0);
    }
  };

  const isLoading = currentStep > 0;

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

  return (
    <div className="options-analyzer">
      <div className="breadcrumbs">
        <Link to="/" className="breadcrumb-link">Главная</Link>
        <span className="breadcrumb-separator">/</span>
        <span className="breadcrumb-current">Options AI</span>
      </div>

      <div className="page-header">
      </div>

      <div className="analyzer-form">
        <div className="form-group">
          <label htmlFor="ticker" className="form-label">
            Тикер
          </label>
          <div className="input-group">
            <input
              id="ticker"
              type="text"
              name="ticker"
              className="ticker-input"
              placeholder="SPY"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onKeyPress={(e) => e.key === 'Enter' && handleAnalyze()}
              disabled={isLoading}
              autoComplete="on"
              list="ticker-history"
            />
            <datalist id="ticker-history">
              <option value="SPY" />
              <option value="AAPL" />
              <option value="TSLA" />
              <option value="NVDA" />
              <option value="MSFT" />
            </datalist>
            <select
              className="compact-select"
              value={aiModel}
              onChange={(e) => handleAiModelChange(e.target.value)}
              disabled={isLoading}
              title="AI модель"
            >
              <option value="gemini">Gemini</option>
              <option value="claude">Claude</option>
            </select>
            <button
              className="btn btn-primary"
              onClick={handleAnalyze}
              disabled={isLoading}
            >
              {isLoading ? 'Анализ...' : 'Анализ'}
            </button>
          </div>
        </div>

        {error && (
          <div className="alert alert-error">
            {error}
          </div>
        )}
      </div>

      {/* 1. Спойлер с источниками и описанием параметров */}
      {(isLoading || stockData) && (
        <details className="data-source-spoiler">
          <summary className="spoiler-header-small">
            <span className="spoiler-title-small">📊 Источник данных и параметры анализа</span>
            <span className="spoiler-icon-small">▼</span>
          </summary>
          <div className="spoiler-content-small">
            <div className="data-source-info">
              <h4>🔌 Источник данных</h4>
              <p>
                <strong>Hybrid (Yahoo + Polygon)</strong> - объединяет данные из Yahoo Finance (OI, Volume) и Polygon.io (Greeks, точная IV) для максимальной точности
              </p>
              
              <h4>🤖 AI модель</h4>
              <p>
                <strong>Google Gemini 2.5 Flash-Lite</strong> - 
                современная языковая модель для быстрого и глубокого анализа опционного рынка.
              </p>
              
              <h4>📈 Параметры анализа</h4>
              <div className="params-grid">
                <div className="param-item">
                  <strong>Max Pain:</strong> Цена, при которой опционы теряют максимум стоимости к экспирации. Работает как «магнит» для цены. <em>Расчет: перебираем все страйки и находим цену с максимальными убытками для покупателей опционов.</em>
                </div>
                <div className="param-item">
                  <strong>P/C Ratio:</strong> Соотношение Put к Call опционам. Показывает рыночный сентимент (&lt;0.7 = бычий, &gt;1.3 = медвежий). <em>Расчет: делим суммарный объем PUT на суммарный объем CALL.</em>
                </div>
                <div className="param-item">
                  <strong>Gamma Exposure:</strong> Влияние маркет-мейкеров на цену. Положительная = стабилизация, отрицательная = волатильность. <em>Расчет: суммируем (Gamma × OI × 100) для всех контрактов.</em>
                </div>
                <div className="param-item">
                  <strong>Total OI:</strong> Общий Open Interest - количество открытых опционных контрактов. Показывает ликвидность.
                </div>
                <div className="param-item">
                  <strong>Дней до экспирации:</strong> Время до истечения опционов. &lt;3 дней = критическая зона с усиленным влиянием Max Pain.
                </div>
                <div className="param-item">
                  <strong>Объем торгов:</strong> Суммарный объем торгов опционами за день. Показывает активность трейдеров.
                </div>
                <div className="param-item">
                  <strong>Delta Distribution:</strong> Направленная экспозиция рынка. Положительная = бычий наклон, отрицательная = медвежий. <em>Расчет: суммируем (Delta × OI × 100) отдельно для CALL и PUT.</em>
                </div>
                <div className="param-item">
                  <strong>IV Rank:</strong> Процентиль текущей волатильности за последние 52 недели. 0% = минимум года, 100% = максимум года. Показывает дорогие/дешевые опционы. <em>Расчет: получаем исторические цены акции за год из Polygon, рассчитываем 20-дневную волатильность, сравниваем текущую IV с диапазоном.</em>
                </div>
                <div className="param-item">
                  <strong>Уровни поддержки:</strong> Цены с высоким PUT OI ниже текущей цены. Работают как «отскок» при падении.
                </div>
                <div className="param-item">
                  <strong>Уровни сопротивления:</strong> Цены с высоким CALL OI выше текущей цены. Тормозят рост при приближении.
                </div>
              </div>
            </div>
          </div>
        </details>
      )}

      {/* 2. Прогресс загрузки */}
      {isLoading && (
        <ProgressBar currentStep={currentStep} aiModel={aiModel} />
      )}
      
      {/* Старый прогресс (скрыт) */}
      {false && isLoading && (
        <div className="progress-container">
          {/* Шаг 1: Данные */}
          <div className={`progress-step ${currentStep >= 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`}>
            <div className="step-header">
              <div className="step-icon">
                {currentStep > 1 ? '✓' : currentStep === 1 ? <div className="spinner-small"></div> : '○'}
              </div>
              <span className="step-title">Получение данных с Polygon.io</span>
            </div>
            {currentStep > 1 && stockData && (
              <div className="step-result">
                ✓ Получено: цена ${stockData.price.toFixed(2)}
              </div>
            )}
          </div>

          {/* Шаг 2: Метрики */}
          <div className={`progress-step ${currentStep >= 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}`}>
            <div className="step-header">
              <div className="step-icon">
                {currentStep > 2 ? '✓' : currentStep === 2 ? <div className="spinner-small"></div> : '○'}
              </div>
              <span className="step-title">Расчет метрик</span>
            </div>
            {currentStep > 2 && metrics && (
              <div className="step-result">
                ✓ Max Pain: ${metrics.max_pain.toFixed(2)}, P/C: {metrics.put_call_ratio.volume_ratio.toFixed(2)}
              </div>
            )}
          </div>

          {/* Шаг 3: AI */}
          <div className={`progress-step ${currentStep >= 3 ? 'active' : ''}`}>
            <div className="step-header">
              <div className="step-icon">
                {currentStep === 3 ? <div className="spinner-small"></div> : '○'}
              </div>
              <span className="step-title">Анализ Gemini AI</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. Быстрые метрики - показываем сразу после получения */}
      {stockData && metrics && (
        <div className="metrics-cards">
          <div className="metric-card">
            <div className="metric-label">Цена</div>
            <div className="metric-value">${stockData.price.toFixed(2)}</div>
            <div className={`metric-change ${stockData.change >= 0 ? 'positive' : 'negative'}`}>
              {stockData.change >= 0 ? '+' : ''}{stockData.change_percent.toFixed(2)}%
            </div>
          </div>
          
          <div className="metric-card">
            <div className="metric-label">Max Pain</div>
            <div className="metric-value">${metrics.max_pain.toFixed(2)}</div>
            <div className="metric-hint">{metrics.total_contracts} контрактов</div>
          </div>
          
          <div className="metric-card">
            <div className="metric-label">P/C Ratio</div>
            <div className="metric-value">{metrics.put_call_ratio.volume_ratio.toFixed(2)}</div>
            <div className="metric-hint">
              {metrics.put_call_ratio.volume_ratio < 0.7 ? 'Бычий' : 
               metrics.put_call_ratio.volume_ratio > 1.3 ? 'Медвежий' : 'Нейтральный'}
            </div>
          </div>
          
          <div className="metric-card">
            <div className="metric-label">Gamma Exp.</div>
            <div className="metric-value">
              {Math.abs(metrics.gamma_exposure.total_gamma) > 1000000 
                ? (metrics.gamma_exposure.total_gamma / 1000000).toFixed(1) + 'M'
                : Math.abs(metrics.gamma_exposure.total_gamma) > 1000
                ? (metrics.gamma_exposure.total_gamma / 1000).toFixed(1) + 'K'
                : metrics.gamma_exposure.total_gamma.toFixed(0)}
            </div>
            <div className="metric-hint">
              {metrics.gamma_exposure.total_gamma > 0 ? 'Стабилизация' : 'Волатильность'}
            </div>
          </div>
          
          <div className="metric-card">
            <div className="metric-label">До Экспирации</div>
            <div className="metric-value">{metrics.days_to_expiry || 0} дн.</div>
            <div className="metric-hint">
              {metrics.days_to_expiry < 3 ? 'Критическая зона' : 
               metrics.days_to_expiry < 7 ? 'Повышенное влияние' : 'Стандартный'}
            </div>
          </div>
          
          <div className="metric-card">
            <div className="metric-label">Total OI</div>
            <div className="metric-value">
              {(metrics.put_call_ratio.total_call_oi + metrics.put_call_ratio.total_put_oi) > 1000000
                ? ((metrics.put_call_ratio.total_call_oi + metrics.put_call_ratio.total_put_oi) / 1000000).toFixed(1) + 'M'
                : ((metrics.put_call_ratio.total_call_oi + metrics.put_call_ratio.total_put_oi) / 1000).toFixed(0) + 'K'}
            </div>
            <div className="metric-hint">
              {(metrics.put_call_ratio.total_call_oi + metrics.put_call_ratio.total_put_oi) > 100000 ? 'Высокая' :
               (metrics.put_call_ratio.total_call_oi + metrics.put_call_ratio.total_put_oi) > 50000 ? 'Средняя' : 'Низкая'} ликвидность
            </div>
          </div>
          
          <div className="metric-card">
            <div className="metric-label">Объем Торгов</div>
            <div className="metric-value">
              {(metrics.put_call_ratio.total_call_volume + metrics.put_call_ratio.total_put_volume) > 1000000
                ? ((metrics.put_call_ratio.total_call_volume + metrics.put_call_ratio.total_put_volume) / 1000000).toFixed(1) + 'M'
                : ((metrics.put_call_ratio.total_call_volume + metrics.put_call_ratio.total_put_volume) / 1000).toFixed(0) + 'K'}
            </div>
            <div className="metric-hint">Контрактов за день</div>
          </div>
          
          <div className="metric-card">
            <div className="metric-label">Net Delta</div>
            <div className="metric-value">
              {metrics.delta_distribution && Math.abs(metrics.delta_distribution.net_delta) > 1000000
                ? (metrics.delta_distribution.net_delta / 1000000).toFixed(1) + 'M'
                : metrics.delta_distribution && Math.abs(metrics.delta_distribution.net_delta) > 1000
                ? (metrics.delta_distribution.net_delta / 1000).toFixed(1) + 'K'
                : (metrics.delta_distribution?.net_delta || 0).toFixed(0)}
            </div>
            <div className="metric-hint">
              {metrics.delta_distribution?.net_delta > 0 ? 'Бычий наклон' : 'Медвежий наклон'}
            </div>
          </div>
          
          <div className="metric-card">
            <div className="metric-label">Поддержка</div>
            <div className="metric-value">
              {metrics.key_levels?.support_levels?.[0]?.strike 
                ? `$${metrics.key_levels.support_levels[0].strike.toFixed(2)}`
                : 'N/A'}
            </div>
            <div className="metric-hint">
              {metrics.key_levels?.support_levels?.[0]?.oi
                ? `OI: ${(metrics.key_levels.support_levels[0].oi / 1000).toFixed(0)}K`
                : 'Нет данных'}
            </div>
          </div>
          
          <div className="metric-card">
            <div className="metric-label">Сопротивление</div>
            <div className="metric-value">
              {metrics.key_levels?.resistance_levels?.[0]?.strike
                ? `$${metrics.key_levels.resistance_levels[0].strike.toFixed(2)}`
                : 'N/A'}
            </div>
            <div className="metric-hint">
              {metrics.key_levels?.resistance_levels?.[0]?.oi
                ? `OI: ${(metrics.key_levels.resistance_levels[0].oi / 1000).toFixed(0)}K`
                : 'Нет данных'}
            </div>
          </div>
          
          <div className="metric-card">
            <div className="metric-label">IV Rank</div>
            <div className="metric-value">
              {metrics.iv_rank?.iv_rank 
                ? `${metrics.iv_rank.iv_rank}%`
                : 'N/A'}
            </div>
            <div className="metric-hint">
              {metrics.iv_rank?.iv_rank
                ? `${metrics.iv_rank.iv_rank < 25 ? 'Низкая' : metrics.iv_rank.iv_rank > 75 ? 'Высокая' : 'Средняя'} волатильность`
                : 'Расчет...'}
            </div>
          </div>
        </div>
      )}

      {/* 4. AI отчет - показываем только текст анализа */}
      {!isLoading && aiAnalysis && (
        <div className="result-container">
          <div className="result-header">
            <h2 className="result-title">📊 Анализ от {aiProvider === 'gemini' ? 'Gemini AI' : 'Claude AI'}</h2>
          </div>

          {/* Убрали повторный спойлер с источниками */}
          {false && <details className="data-source-spoiler">
            <summary className="spoiler-header-small">
              <span className="spoiler-title-small">📊 Источник данных и алгоритм расчета параметров</span>
              <span className="spoiler-icon-small">▼</span>
            </summary>
            <div className="spoiler-content-small">
              <div className="data-source-info">
                <h4>Источник данных</h4>
                <p>
                  <strong>Yahoo Finance API</strong> - бесплатный источник опционных данных в реальном времени.
                  Данные включают Open Interest, Volume, Implied Volatility для всех страйков и дат экспирации.
                </p>
                
                <h4>Модель искусственного интеллекта</h4>
                <p>
                  <strong>Google Gemini 2.5 Flash-Lite</strong> - 
                  современная языковая модель для быстрого анализа финансовых данных. 
                  Генерирует детальный технический обзор на основе опционных метрик.
                </p>
                  
                  <h4>Алгоритм расчета параметров</h4>
                  
                  <div className="calc-item">
                    <strong>Max Pain (Точка максимальной боли):</strong>
                    <p>Страйк, при котором держатели опционов понесут наибольшие убытки при экспирации. 
                    Рассчитывается как сумма потерь по всем Call и Put опционам для каждого страйка, 
                    выбирается страйк с максимальной суммой потерь.</p>
                  </div>
                  
                  <div className="calc-item">
                    <strong>Put/Call Ratio (P/C Ratio):</strong>
                    <p>Отношение объема торгов Put опционов к Call опционам. 
                    Значение &gt; 1.0 указывает на медвежий сентимент (больше Put), 
                    &lt; 1.0 - на бычий (больше Call).</p>
                  </div>
                  
                  <div className="calc-item">
                    <strong>Gamma Exposure (GEX):</strong>
                    <p>Суммарная Gamma позиция маркет-мейкеров. Рассчитывается как сумма 
                    (Open Interest × Gamma × Strike Price) для всех опционов. 
                    Положительная GEX стабилизирует цену, отрицательная - увеличивает волатильность.</p>
                  </div>
                  
                <p className="disclaimer-small">
                  <strong>Примечание:</strong> Все расчеты выполняются на основе текущих рыночных данных 
                  и могут меняться в течение торгового дня.
                </p>
              </div>
            </div>
          </details>}

          {/* Метрики - убрали, они уже выведены выше */}
          {false && (
          <section className="metrics-section">
            <h3 className="section-title">Данные</h3>
            
            <div className="metrics-grid">
              <div className="metric-card border-success">
                <div className="metric-label">Цена</div>
                <div className="metric-value">${stockData.price.toFixed(2)}</div>
                <div className={`metric-change ${stockData.change >= 0 ? 'positive' : 'negative'}`}>
                  {stockData.change >= 0 ? '+' : ''}{stockData.change_percent.toFixed(2)}%
                </div>
              </div>

              <div className="metric-card border-warning">
                <div className="metric-label">Max Pain</div>
                <div className="metric-value">${metrics.max_pain.toFixed(2)}</div>
              </div>

              <div className="metric-card border-warning">
                <div className="metric-label">P/C Ratio</div>
                <div className="metric-value">
                  {metrics.put_call_ratio.volume_ratio.toFixed(2)}
                </div>
              </div>

              <div className="metric-card border-danger">
                <div className="metric-label">Gamma Exp.</div>
                <div className="metric-value">
                  {(metrics.gamma_exposure.net_gamma / 1000000).toFixed(1)}M
                </div>
              </div>
            </div>
          </section>
          )}

          {/* AI Анализ */}
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
              .analysis-text details {
                margin: 1rem 0;
                padding: 1rem;
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 0.5rem;
              }
              .analysis-text summary {
                cursor: pointer;
                font-weight: 600;
                color: #111827;
                user-select: none;
              }
              .analysis-text summary:hover {
                color: #667eea;
              }
              .analysis-text details[open] summary {
                margin-bottom: 0.75rem;
              }
              .analysis-text hr {
                display: none;
              }
            `}</style>
            <div className="analysis-text">
              <ReactMarkdown rehypePlugins={[rehypeRaw]}>{aiAnalysis}</ReactMarkdown>
            </div>
          </section>

          {/* Блок "Поделиться" */}
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
                  onClick={copyShareLink}
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
                  onClick={startNewAnalysis}
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
      )}
    </div>
  );
}

export default OptionsAnalyzer;
