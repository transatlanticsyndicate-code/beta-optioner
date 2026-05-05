import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import LockIcon from './LockIcon';
import { Briefcase } from 'lucide-react';
import { supabase } from '../../services/supabase';

/**
 * Получает минимальную дату входа из опционов
 * ЗАЧЕМ: Использовать дату входа как дату сохранения конфигурации вместо текущей даты
 * Если несколько опционов с разными датами входа, берем наименьшую (самую раннюю)
 * @param options - массив опционов
 * @returns ISO строка даты (YYYY-MM-DD) или текущая дата если нет опционов
 */
const getMinEntryDate = (options) => {
  if (!options || options.length === 0) {
    return new Date().toISOString();
  }

  // Фильтруем опционы с установленной датой входа
  const optionsWithEntryDate = options.filter(opt => opt.entryDate);
  
  if (optionsWithEntryDate.length === 0) {
    // Если нет опционов с датой входа, используем текущую дату
    return new Date().toISOString();
  }

  // Находим минимальную дату входа
  const minEntryDate = optionsWithEntryDate.reduce((min, opt) => {
    return opt.entryDate < min ? opt.entryDate : min;
  }, optionsWithEntryDate[0].entryDate);

  // Преобразуем ISO дату (YYYY-MM-DD) в полный ISO формат с временем
  // Добавляем время 00:00:00 UTC
  return `${minEntryDate}T00:00:00.000Z`;
};

/**
 * Получает дату экспирации из опционов для отображения
 * ЗАЧЕМ: Показывать правильную дату экспирации в свойствах конфигурации
 * @param options - массив опционов
 * @returns строка даты в формате DD.MM.YY или '—' если нет опционов
 */
const getExpirationDateFromOptions = (options) => {
  if (!options || options.length === 0) {
    return '—';
  }

  // Берем дату из первого опциона (все опционы обычно имеют одну дату экспирации)
  const firstOptionWithDate = options.find(opt => opt.date);
  
  if (!firstOptionWithDate || !firstOptionWithDate.date) {
    return '—';
  }

  // Форматируем дату из ISO (YYYY-MM-DD) в DD.MM.YY
  const [year, month, day] = firstOptionWithDate.date.split('-');
  return `${day}.${month}.${year.slice(-2)}`;
};

/**
 * Генерирует автоматическое название для конфигурации
 * ЗАЧЕМ: Удобное название с информацией о позициях
 * Формат: [FIXED] AAPL 100L @280 | 1 BuyCALL 09.01.26 290
 * @param currentState - текущее состояние калькулятора
 * @param isLocked - добавлять ли маркер фиксации в начало
 */
const generateConfigName = (currentState, isLocked = false) => {
  const parts = [];
  
  // Маркер фиксации удален - название начинается с текста
  
  // Базовый актив: TICKER QTY+TYPE @PRICE
  // Например: AAPL 100L @280
  if (currentState.positions && currentState.positions.length > 0) {
    const positionParts = currentState.positions.map(pos => {
      const qty = pos.quantity || 0;
      const type = pos.type === 'LONG' ? 'L' : 'S';
      const price = pos.price ? `@${Math.round(pos.price)}` : '';
      return `${qty}${type}${price}`;
    });
    parts.push(`${currentState.selectedTicker || ''} ${positionParts.join(' ')}`);
  } else if (currentState.selectedTicker) {
    parts.push(currentState.selectedTicker);
  }
  
  // Опционы: количество, тип, дата, страйк
  // Например: 1 BuyCALL 09.01.26 290
  if (currentState.options && currentState.options.length > 0) {
    const optionParts = currentState.options.map(opt => {
      const qty = Math.abs(opt.quantity || 1);
      const action = opt.action || 'Buy';
      const type = opt.type || 'CALL';
      // Форматируем дату из ISO (YYYY-MM-DD) в DD.MM.YY
      let dateStr = '';
      if (opt.date) {
        const [year, month, day] = opt.date.split('-');
        dateStr = `${day}.${month}.${year.slice(-2)}`;
      }
      const strike = opt.strike ? Math.round(opt.strike) : '';
      return `${qty} ${action}${type} ${dateStr} ${strike}`.trim();
    });
    if (optionParts.length > 0) {
      parts.push(`| ${optionParts.join(', ')}`);
    }
  }
  
  return parts.join(' ');
};

/**
 * Диалог сохранения конфигурации калькулятора
 * ЗАЧЕМ: Позволяет сохранить текущее состояние калькулятора для быстрого доступа.
 *
 * Поддерживает выбор статуса позиции:
 *  - 'pending' (В ожидании) — предварительная схема, ещё не вошли в позицию.
 *    При открытии калькулятор автоматически подтянет свежие котировки от расширения.
 *  - 'standard' (Зафиксирована) — реально открытая позиция с замороженными
 *    датами входа. Эквивалент старой кнопки «Зафиксировать».
 *
 * @param isLocked - совместимость со старым localStorage-режимом: если true и статус
 *                   не передан, то по умолчанию ставится 'standard'.
 * @param showStatusSelector - показывать ли выбор статуса (по умолчанию true).
 *                              false — для устаревших localStorage-диалогов.
 * @param dealInfo - информация о сделке (если существует)
 * @param dealSettings - настройки таба Сделка (целевая цена, шаги, план выхода)
 */
function SaveConfigurationDialog({
  isOpen,
  onClose,
  onSave,
  currentState,
  isLocked = false,
  showStatusSelector = true,
  dealInfo = null,
  dealSettings = null,
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [author, setAuthor] = useState('');
  // Статус позиции: 'pending' (В ожидании) | 'standard' (Зафиксирована).
  // По умолчанию 'standard' — это привычное «обычное сохранение, как раньше».
  // Pending пользователь должен выбрать явно — для предварительных схем сделок.
  const [status, setStatus] = useState('standard');

  const isStandard = status === 'standard';

  // Автозаполнение названия и автора при открытии диалога
  useEffect(() => {
    if (isOpen && currentState) {
      // Сбрасываем статус при каждом открытии диалога. Дефолт — 'standard'
      // (привычное «обычное сохранение»). Pending выбирается явно пользователем.
      setStatus('standard');

      let autoName = '';
      if (isLocked && dealInfo?.ticker) {
        autoName = `Сделка - ${dealInfo.ticker}`;
      } else {
        autoName = generateConfigName(currentState, isLocked);
      }
      setName(autoName);

      if (supabase) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) {
            const user = session.user;
            const firstName = user.user_metadata?.first_name || user.user_metadata?.name || user.email.split('@')[0];
            setAuthor(firstName);
          }
        }).catch(error => {
          console.error('Ошибка при получении данных пользователя:', error);
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Эффективный признак фиксации: status='standard' ИЛИ старый prop isLocked
  // (когда селектор статуса не показывается).
  const effectiveLocked = isStandard || (!showStatusSelector && isLocked);

  const handleSave = () => {
    if (!name.trim()) {
      alert('Пожалуйста, введите название конфигурации');
      return;
    }

    // Формируем объект конфигурации
    const configuration = {
      id: Date.now().toString(),
      name: name.trim(),
      description: description.trim(),
      author: author.trim() || 'Неизвестный автор',
      ticker: currentState.selectedTicker || '',
      createdAt: new Date().toISOString(),
      entryDate: getMinEntryDate(currentState.options),
      // isLocked: связан со статусом — standard всегда означает заморозку дат
      isLocked: effectiveLocked,
      // Новый статус позиции. Если селектор не показан (старый legacy-режим),
      // считаем сохранение зафиксированным — это согласуется с правилом
      // «обычное сохранение по умолчанию = standard».
      status: showStatusSelector ? status : 'standard',
      state: {
        selectedTicker: currentState.selectedTicker,
        currentPrice: currentState.currentPrice,
        priceChange: currentState.priceChange,
        options: effectiveLocked
          ? (currentState.options || []).map(opt => {
              let initialDaysToExpiration = 30;
              if (opt.date) {
                let entryUTC;
                if (opt.entryDate) {
                  const [ey, em, ed] = opt.entryDate.split('-').map(Number);
                  entryUTC = Date.UTC(ey, em - 1, ed);
                } else {
                  const now = new Date();
                  entryUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
                }
                const [year, month, day] = opt.date.split('-').map(Number);
                const expDateUTC = Date.UTC(year, month - 1, day);
                initialDaysToExpiration = Math.ceil((expDateUTC - entryUTC) / (1000 * 60 * 60 * 24));
              }
              return { ...opt, isLockedPosition: true, initialDaysToExpiration };
            })
          : currentState.options,
        positions: effectiveLocked
          ? (currentState.positions || []).map(pos => ({ ...pos, isLockedPosition: true }))
          : currentState.positions,
        selectedExpirationDate: currentState.selectedExpirationDate,
        daysPassed: currentState.daysPassed,
        showOptionLines: currentState.showOptionLines,
        showProbabilityZones: currentState.showProbabilityZones,
        chartDisplayMode: currentState.chartDisplayMode,
        calculatorMode: currentState.calculatorMode,
      },
      dealSettings: dealSettings || null,
      dealInfo: dealInfo || null,
    };

    onSave(configuration);

    setName('');
    setDescription('');
    setAuthor('');
    setStatus('standard');
    onClose();
  };

  const handleCancel = () => {
    setName('');
    setDescription('');
    setAuthor('');
    setStatus('standard');
    onClose();
  };

  // Заголовок и подпись диалога зависят от выбранного статуса
  const dialogTitle = showStatusSelector
    ? 'Сохранить конфигурацию калькулятора'
    : (isLocked ? 'Зафиксировать позиции' : 'Сохранить конфигурацию калькулятора');

  const dialogDescription = showStatusSelector
    ? (isStandard
        ? 'Позиция будет помечена как зафиксированная — даты входа замораживаются.'
        : 'Позиция будет сохранена как «В ожидании» — котировки обновятся при открытии.')
    : (isLocked
        ? 'Позиции будут зафиксированы. При загрузке данные НЕ будут обновляться с рынка.'
        : 'Сохраните текущее состояние калькулятора для быстрого доступа в будущем');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] z-[9999]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {effectiveLocked && <LockIcon size={20} />}
            {dialogTitle}
          </DialogTitle>
          <DialogDescription>
            {dialogDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Выбор статуса позиции */}
          {/* ЗАЧЕМ: Различать предварительные схемы (pending) и реально открытые позиции (standard) */}
          {showStatusSelector && (
            <div className="space-y-2">
              <Label>
                Статус позиции <span className="text-destructive">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStatus('pending')}
                  className={`flex flex-col items-start gap-1 rounded-lg border-2 p-3 text-left transition ${
                    status === 'pending'
                      ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
                      : 'border-gray-200 hover:border-yellow-300'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 border border-yellow-400 dark:bg-yellow-900/30 dark:text-yellow-300">
                    В ожидании
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Котировки обновятся при открытии через TradingView
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatus('standard')}
                  className={`flex flex-col items-start gap-1 rounded-lg border-2 p-3 text-left transition ${
                    status === 'standard'
                      ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20'
                      : 'border-gray-200 hover:border-cyan-300'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-100 text-cyan-800 border border-cyan-400 dark:bg-cyan-900/30 dark:text-cyan-300">
                    <LockIcon size={12} /> Зафиксирована
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Реально открытая сделка, даты входа заморожены
                  </span>
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="config-name">
              Название <span className="text-destructive">*</span>
            </Label>
            <Input
              id="config-name"
              placeholder="Например: Bull Call Spread на SPY"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="config-description">Описание (опционально)</Label>
            <Textarea
              id="config-description"
              placeholder="Краткое описание стратегии или заметки..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="config-author">Автор</Label>
            <Input
              id="config-author"
              placeholder="Ваше имя"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </div>

          {currentState.selectedTicker && (
            <div className={`rounded-lg p-3 text-sm ${effectiveLocked ? 'bg-cyan-50 border border-cyan-200' : 'bg-yellow-50 border border-yellow-200'}`}>
              <div className="font-medium mb-1 flex items-center gap-1">
                {effectiveLocked && <LockIcon size={14} />}
                {effectiveLocked ? 'Будет зафиксировано:' : 'Будет сохранено как «В ожидании»:'}
              </div>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Тикер: {currentState.selectedTicker}</li>
                <li>• Опционов: {currentState.options?.length || 0}</li>
                <li>• Позиций базового актива: {currentState.positions?.length || 0}</li>
                <li>• Дата экспирации: {getExpirationDateFromOptions(currentState.options)}</li>
                {effectiveLocked ? (
                  <li className="text-cyan-700 font-medium">• Данные НЕ будут обновляться при загрузке</li>
                ) : (
                  <li className="text-yellow-700 font-medium">• При открытии BID/ASK/VOL/IV/Актив обновятся через расширение TradingView</li>
                )}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Отмена
          </Button>
          <Button
            onClick={handleSave}
            className={effectiveLocked
              ? 'bg-cyan-500 hover:bg-cyan-600 flex items-center gap-1 text-white'
              : 'bg-yellow-500 hover:bg-yellow-600 flex items-center gap-1 text-white'}
          >
            {effectiveLocked && <LockIcon size={16} className="[&_path]:fill-white" />}
            {effectiveLocked ? 'Сохранить как зафиксированную' : 'Сохранить в ожидании'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SaveConfigurationDialog;
