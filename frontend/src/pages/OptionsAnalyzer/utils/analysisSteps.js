/**
 * Утилита для выполнения шагов анализа опционов
 * ЗАЧЕМ: Последовательное выполнение API вызовов (данные → метрики → AI)
 * Затрагивает: API интеграция, управление состоянием шагов
 */

import { analyzeStep1, analyzeStep2, analyzeStep3 } from '../../../services/api';

export const executeAnalysis = async (ticker, aiModel, callbacks) => {
  const {
    setCurrentStep,
    setStockData,
    setMetrics,
    setAiAnalysis,
    setAiProvider,
    setShareUrl,
    setAnalysisId
  } = callbacks;

  try {
    // Шаг 1: Получение данных
    console.log('📊 Step 1: Получение данных');
    setCurrentStep(1);
    const step1Data = await analyzeStep1(ticker);
    
    if (step1Data.status === 'error') {
      throw new Error(step1Data.error);
    }
    
    setStockData(step1Data.stock_data);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Шаг 2: Расчет метрик
    console.log('📊 Step 2: Расчет метрик');
    setCurrentStep(2);
    const step2Data = await analyzeStep2(ticker);
    
    if (step2Data.status === 'error') {
      throw new Error(step2Data.error);
    }
    
    setMetrics(step2Data.metrics);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Шаг 3: AI анализ
    console.log('🤖 Step 3: AI анализ');
    setCurrentStep(3);
    const step3Data = await analyzeStep3(ticker, aiModel);
    
    if (step3Data.status === 'error') {
      throw new Error(step3Data.error);
    }
    
    setAiAnalysis(step3Data.ai_analysis);
    setAiProvider(step3Data.ai_provider);
    
    if (step3Data.share_url) setShareUrl(step3Data.share_url);
    if (step3Data.analysis_id) setAnalysisId(step3Data.analysis_id);
    
    setCurrentStep(0);
    return { success: true };
  } catch (err) {
    console.error('❌ Ошибка:', err);
    setCurrentStep(0);
    return { success: false, error: err.message };
  }
};
