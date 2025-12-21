/**
 * SavedConfigurations - страница сохраненных конфигураций калькулятора
 * ЗАЧЕМ: Управление сохраненными стратегиями опционов
 * Затрагивает: калькулятор опционов, экспорт/импорт
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { exportConfigurations, readImportFile, validateImportData, importConfigurations } from '../../utils/configExportImport';
import { loadConfigurations, saveConfigurations, deleteConfiguration } from './utils/storage';
import { filterConfigurations } from './utils/filters';
import { FiltersPanel, ConfigurationsTable } from './components';

function SavedConfigurations() {
  const navigate = useNavigate();
  const [configurations, setConfigurations] = useState([]);
  const [filterDate, setFilterDate] = useState('');
  const [filterTicker, setFilterTicker] = useState('');
  const [filterAuthor, setFilterAuthor] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importError, setImportError] = useState(null);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => {
    document.title = 'Сохраненные конфигурации | SYNDICATE Platform';
    return () => { document.title = 'SYNDICATE Platform'; };
  }, []);

  useEffect(() => {
    setConfigurations(loadConfigurations());
  }, []);

  const handleDelete = (id) => {
    if (window.confirm('Вы уверены, что хотите удалить эту конфигурацию?')) {
      const updated = deleteConfiguration(configurations, id);
      setConfigurations(updated);
      saveConfigurations(updated);
    }
  };

  const handleEdit = (configId) => {
    navigate(`/tools/options-calculator?config=${configId}&edit=true`);
  };

  const filteredConfigurations = useMemo(() => {
    return filterConfigurations(configurations, { filterDate, filterTicker, filterAuthor });
  }, [configurations, filterDate, filterTicker, filterAuthor]);

  const clearFilters = () => {
    setFilterDate('');
    setFilterTicker('');
    setFilterAuthor('');
  };

  const handleExport = () => {
    const result = exportConfigurations('User');
    if (result.success) {
      alert(`Экспорт успешен! \nКонфигураций: ${result.stats.configurationsCount}\nПозиций: ${result.stats.positionsCount}`);
    } else {
      alert(`Ошибка экспорта: ${result.error}`);
    }
  };

  const handleImportClick = () => {
    setShowImportModal(true);
    setImportPreview(null);
    setImportError(null);
    setImportResult(null);
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setImportError(null);
      const data = await readImportFile(file);
      const validation = validateImportData(data);

      if (!validation.valid) {
        setImportError(validation.errors.join(', '));
        setImportPreview(null);
        return;
      }

      setImportPreview({ data, stats: validation.stats });
    } catch (error) {
      setImportError(error.message);
      setImportPreview(null);
    }
  };

  const handleImport = (mode) => {
    if (!importPreview) return;
    const result = importConfigurations(importPreview.data, mode);
    if (result.success) {
      setImportResult(result);
      setConfigurations(loadConfigurations());
    } else {
      setImportError(result.error);
    }
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportPreview(null);
    setImportError(null);
    setImportResult(null);
  };

  return (
    <div className="w-full max-w-full py-6 px-4">
      <FiltersPanel
        filterDate={filterDate}
        setFilterDate={setFilterDate}
        filterTicker={filterTicker}
        setFilterTicker={setFilterTicker}
        filterAuthor={filterAuthor}
        setFilterAuthor={setFilterAuthor}
        onClearFilters={clearFilters}
        onExport={handleExport}
        onImport={handleImportClick}
      />
      <ConfigurationsTable
        configurations={filteredConfigurations}
        onDelete={handleDelete}
        onEdit={handleEdit}
      />
    </div>
  );
}

export default SavedConfigurations;
