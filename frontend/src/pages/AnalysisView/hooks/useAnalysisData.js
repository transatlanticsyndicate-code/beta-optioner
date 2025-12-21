/**
 * Хук для загрузки и управления данными анализа
 * ЗАЧЕМ: Централизованное управление state и загрузкой данных анализа
 * Затрагивает: загрузка анализа, состояние loading/error
 */

import { useState, useEffect } from 'react';

export function useAnalysisData(id) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  return { analysis, loading, error };
}
