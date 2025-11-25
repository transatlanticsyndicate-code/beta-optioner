import React, { useState, useEffect } from 'react';
import { Camera, ChevronDown, ChevronUp, Calendar, TrendingDown, TrendingUp, Trash2 } from 'lucide-react';

function CryptoRating() {
  const [snapshots, setSnapshots] = useState([]);
  const [analyses, setAnalyses] = useState([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isAnalysesExpanded, setIsAnalysesExpanded] = useState(true);
  const [isSnapshotsExpanded, setIsSnapshotsExpanded] = useState(true);
  
  // Установка заголовка страницы
  useEffect(() => {
    document.title = 'Рейтинг криптовалют | SYNDICATE Platform';
    return () => {
      document.title = 'SYNDICATE Platform';
    };
  }, []);

  useEffect(() => {
    fetchData();
  }, []);
  
  const fetchData = async () => {
    try {
      const snapshotsRes = await fetch(`/api/crypto-rating/snapshots`);
      if (snapshotsRes.ok) setSnapshots(await snapshotsRes.json());
      
      const analysesRes = await fetch(`/api/crypto-rating/analyses`);
      if (analysesRes.ok) setAnalyses(await analysesRes.json());
    } catch (err) {
      console.error('Error:', err);
    }
  };
  
  const handleCreateSnapshot = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/crypto-rating/create-snapshot`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed');
      const data = await response.json();
      setSuccess(data.analysis_created ? 'Снимок и анализ созданы!' : 'Первый снимок создан!');
      await fetchData();
    } catch (err) {
      setError('Ошибка: ' + err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleAnalysisClick = async (analysisId) => {
    if (selectedAnalysis?.id === analysisId) {
      setSelectedAnalysis(null);
      return;
    }
    try {
      const response = await fetch(`/api/crypto-rating/analyses/${analysisId}`);
      if (response.ok) setSelectedAnalysis(await response.json());
    } catch (err) {
      console.error('Error:', err);
    }
  };
  
  const handleDeleteSnapshot = async (snapshotId, e) => {
    e.stopPropagation();
    if (!window.confirm('Удалить?')) return;
    try {
      const response = await fetch(`/api/crypto-rating/snapshots/${snapshotId}`, { method: 'DELETE' });
      if (response.ok) {
        setSuccess('Удалено');
        await fetchData();
      }
    } catch (err) {
      setError('Ошибка');
    }
  };
  
  const handleDeleteAnalysis = async (analysisId, e) => {
    e.stopPropagation();
    if (!window.confirm('Удалить?')) return;
    try {
      const response = await fetch(`/api/crypto-rating/analyses/${analysisId}`, { method: 'DELETE' });
      if (response.ok) {
        setSuccess('Удалено');
        if (selectedAnalysis?.id === analysisId) setSelectedAnalysis(null);
        await fetchData();
      }
    } catch (err) {
      setError('Ошибка');
    }
  };
  
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground mb-2">Рейтинг криптовалют</h1>
        <p className="text-muted-foreground">Анализ Топ 400 криптовалют</p>
      </div>

      {error && <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500">{error}</div>}
      {success && <div className="mb-4 p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-green-500">{success}</div>}

      <div className="bg-card rounded-lg border border-border p-6 mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-2">Создать снимок</h2>
        <p className="text-sm text-muted-foreground mb-4">Нажмите кнопку для создания снимка топ-400</p>
        <button onClick={handleCreateSnapshot} disabled={loading} className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50">
          <Camera className="h-4 w-4" />
          {loading ? 'Создание...' : 'Создать снимок'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <button onClick={() => setIsAnalysesExpanded(!isAnalysesExpanded)} className="w-full p-6 flex items-center justify-between hover:bg-muted/30">
            <h2 className="text-lg font-semibold">Анализы ({analyses.length})</h2>
            {isAnalysesExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
          {isAnalysesExpanded && (
            <div className="border-t border-border p-4 max-h-[600px] overflow-y-auto">
              {analyses.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Нет анализов</p>
              ) : (
                analyses.map((analysis) => (
                  <div key={analysis.id} className="border rounded-lg mb-3">
                    <div className="flex items-center">
                      <button onClick={() => handleAnalysisClick(analysis.id)} className="flex-1 p-4 flex items-center justify-between hover:bg-accent text-left">
                        <div className="flex items-center gap-4">
                          <Calendar className="h-4 w-4" />
                          <span className="text-sm">{formatDate(analysis.created_at)}</span>
                          <div className="flex gap-4">
                            <span className="text-red-500">{analysis.dropped_count} выпали</span>
                            <span className="text-green-500">{analysis.added_count} вошли</span>
                          </div>
                        </div>
                        {selectedAnalysis?.id === analysis.id ? <ChevronUp /> : <ChevronDown />}
                      </button>
                      <button onClick={(e) => handleDeleteAnalysis(analysis.id, e)} className="p-4 text-muted-foreground hover:text-red-500" title="Удалить">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {selectedAnalysis?.id === analysis.id && (
                      <div className="p-4 bg-muted/30 border-t">
                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <h3 className="font-semibold mb-2">Выпали ({selectedAnalysis.dropped_cryptos.length})</h3>
                            {selectedAnalysis.dropped_cryptos.map((c, i) => (
                              <div key={i} className="text-sm p-2 bg-background rounded mb-1">{c.symbol} - {c.name}</div>
                            ))}
                          </div>
                          <div>
                            <h3 className="font-semibold mb-2">Вошли ({selectedAnalysis.added_cryptos.length})</h3>
                            {selectedAnalysis.added_cryptos.map((c, i) => (
                              <div key={i} className="text-sm p-2 bg-background rounded mb-1">{c.symbol} - {c.name}</div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <button onClick={() => setIsSnapshotsExpanded(!isSnapshotsExpanded)} className="w-full p-6 flex items-center justify-between hover:bg-muted/30">
            <h2 className="text-lg font-semibold">Снимки ({snapshots.length})</h2>
            {isSnapshotsExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
          {isSnapshotsExpanded && (
            <div className="border-t border-border max-h-[600px] overflow-y-auto">
              {snapshots.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Нет снимков</p>
              ) : (
                <table className="w-full">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase">Дата и время</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase">Количество</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {snapshots.map((snapshot) => (
                      <tr key={snapshot.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            <span className="text-sm">{formatDate(snapshot.created_at)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3"><span className="text-sm">{snapshot.crypto_count} криптовалют</span></td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={(e) => handleDeleteSnapshot(snapshot.id, e)} className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded" title="Удалить">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CryptoRating;