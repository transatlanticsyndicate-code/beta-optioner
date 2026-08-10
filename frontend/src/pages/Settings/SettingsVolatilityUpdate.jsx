import React, { useRef, useState } from 'react';
import { Upload, FileText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { applyVolatilityUpdate } from '../../utils/volatilityUpdateApi';
import { clearFactOverrides } from '../../utils/userOptionOverrides';
import VolatilityUpdateReport from './VolatilityUpdateReport';

const FILE_INPUT_ID = 'volatility-update-file-input';

function SettingsVolatilityUpdate() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle'); // idle|uploading|done|error
  const [errorMessage, setErrorMessage] = useState('');
  const [report, setReport] = useState(null);
  const inputRef = useRef(null);

  const handleFileChange = (event) => {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    setStatus('idle');
    setErrorMessage('');
    setReport(null);
  };

  const handleApply = async () => {
    if (!file) return;
    setStatus('uploading');
    setErrorMessage('');
    setReport(null);

    try {
      const result = await applyVolatilityUpdate(file);
      // Локальные правки этого браузера накладываются поверх данных из базы при
      // открытии сделки — по обновлённым ногам их надо снять, иначе пользователь
      // увидит старые значения и решит, что импорт не сработал.
      clearFactOverrides(result.updatedOptionKeys || []);
      setReport(result);
      setStatus('done');
    } catch (error) {
      setErrorMessage(error.message || 'Не удалось выполнить актуализацию.');
      setStatus('error');
    } finally {
      // Разрешаем выбрать тот же файл повторно (браузер не шлёт change при
      // одинаковом имени, пока значение поля не сброшено).
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Актуализация Волатильности</h2>
        <p className="text-muted-foreground mt-1">
          Обновление фактических значений в сохранённых сделках по выгрузке из торгового терминала
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Загрузка выгрузки позиций</CardTitle>
          <CardDescription>
            Приложите CSV-выгрузку текущих позиций из терминала. Система найдёт
            соответствующие ноги в активных сделках Калькулятора и запишет: колонку
            «P/L Open» — в поле Fact P&L, колонку «Impl Vol» — в поле Fact IV.
            <br /><br />
            Нога обновляется только если количество контрактов в сделке совпадает с
            количеством в файле: в выгрузке указана суммарная позиция по счёту, и при
            расхождении значение относилось бы к другому размеру позиции. Все такие
            случаи перечислены в отчёте.
            <br /><br />
            Дата, которой помечаются значения, берётся из имени файла (например,
            2026-08-09-watchlist.csv). Черновики сделок не затрагиваются.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Выбрать файл
            </Button>
            <input
              id={FILE_INPUT_ID}
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />

            {file && (
              <span className="flex items-center text-sm text-muted-foreground">
                <FileText className="h-4 w-4 mr-1.5" />
                {file.name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button size="sm" onClick={handleApply} disabled={!file || status === 'uploading'}>
              {status === 'uploading' ? 'Актуализация…' : 'Актуализировать'}
            </Button>
            {status === 'done' && <span className="text-sm text-green-600">Готово</span>}
          </div>

          {status === 'error' && (
            <p className="text-sm text-red-600">{errorMessage}</p>
          )}
        </CardContent>
      </Card>

      <VolatilityUpdateReport report={report} />
    </div>
  );
}

export default SettingsVolatilityUpdate;
