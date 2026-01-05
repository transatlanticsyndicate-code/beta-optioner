import React, { useState, useEffect, useRef } from 'react';
import { Camera, ChevronDown, ChevronUp, Calendar, TrendingDown, TrendingUp, Trash2, FileDown, Eye, Copy, X, Check } from 'lucide-react';
import html2pdf from 'html2pdf.js';

import AnalysisPrintView from '../components/CryptoRating/AnalysisPrintView';

function CryptoRating() {
  const [snapshots, setSnapshots] = useState([]);
  const [analyses, setAnalyses] = useState([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
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

  const handleSnapshotView = async (snapshotId) => {
    if (selectedSnapshot?.id === snapshotId) {
      setSelectedSnapshot(null);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/crypto-rating/snapshots/${snapshotId}`);
      if (response.ok) {
        setSelectedSnapshot(await response.json());
      }
    } catch (err) {
      console.error('Error fetching snapshot:', err);
      setError('Ошибка загрузки данных снимка');
    } finally {
      setLoading(false);
    }
  };

  const [copied, setCopied] = useState(false);
  const handleCopyList = () => {
    if (!selectedSnapshot) return;
    const listText = selectedSnapshot.crypto_list
      .map((c, i) => `${i + 1}. ${c.symbol} - ${c.name}`)
      .join('\n');
    navigator.clipboard.writeText(listText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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

  // Ref для печатной версии
  const printRef = useRef(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Экспорт анализа в PDF
  // ЗАЧЕМ: Создание красивого PDF-отчёта для сохранения и печати
  const handleExportPdf = async (analysis, e) => {
    e.stopPropagation();
    setExportingPdf(true);

    try {
      // Загружаем полные данные анализа если нужно
      let fullAnalysis = analysis;
      if (!analysis.dropped_cryptos || !analysis.added_cryptos) {
        const response = await fetch(`/api/crypto-rating/analyses/${analysis.id}`);
        if (response.ok) {
          fullAnalysis = await response.json();
        }
      }

      // Создаём временный контейнер для рендера
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.top = '0';
      document.body.appendChild(container);

      // Рендерим React компонент в контейнер
      const { createRoot } = await import('react-dom/client');
      const root = createRoot(container);

      await new Promise((resolve) => {
        root.render(
          <AnalysisPrintView analysis={fullAnalysis} ref={() => setTimeout(resolve, 100)} />
        );
      });

      // Генерируем PDF
      const element = container.firstChild;
      const dateStr = new Date(fullAnalysis.created_at).toISOString().split('T')[0];
      const filename = `crypto-analysis-${dateStr}.pdf`;

      const opt = {
        margin: 10,
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      await html2pdf().set(opt).from(element).save();

      // Очищаем
      root.unmount();
      document.body.removeChild(container);

      setSuccess('PDF успешно сохранён!');
    } catch (err) {
      console.error('PDF export error:', err);
      setError('Ошибка экспорта PDF: ' + err.message);
    } finally {
      setExportingPdf(false);
    }
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
                      <button 
                        onClick={(e) => handleExportPdf(analysis, e)} 
                        disabled={exportingPdf}
                        className="p-4 text-muted-foreground hover:text-cyan-500 disabled:opacity-50" 
                        title="Экспорт в PDF"
                      >
                        <FileDown className="h-4 w-4" />
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
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => handleSnapshotView(snapshot.id)} 
                              className="p-2 text-muted-foreground hover:text-cyan-500 hover:bg-cyan-500/10 rounded" 
                              title="Просмотреть список"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button onClick={(e) => handleDeleteSnapshot(snapshot.id, e)} className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded" title="Удалить">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
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

      {/* Модальное окно просмотра снимка */}
      {selectedSnapshot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">Снимок Топ-400</h3>
                <p className="text-xs text-muted-foreground">{formatDate(selectedSnapshot.created_at)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleCopyList}
                  className="flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-muted/80 rounded-md text-sm transition-colors"
                >
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Скопировано' : 'Копировать список'}
                </button>
                <button 
                  onClick={() => setSelectedSnapshot(null)}
                  className="p-1.5 hover:bg-muted rounded-md transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {selectedSnapshot.crypto_list.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 bg-muted/30 rounded-lg text-sm">
                    <span className="text-muted-foreground font-mono w-8">{i + 1}.</span>
                    <span className="font-bold w-12">{c.symbol}</span>
                    <span className="text-muted-foreground truncate">{c.name}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 border-t border-border bg-muted/20 text-center text-xs text-muted-foreground">
              Всего {selectedSnapshot.crypto_count} криптовалют
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CryptoRating;