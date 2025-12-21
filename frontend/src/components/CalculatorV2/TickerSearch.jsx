import React, { useRef, useEffect, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { Input } from '../ui/input';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '../ui/command';

/**
 * Компонент поиска и выбора тикера акций
 * ЗАЧЕМ: Обеспечивает удобный интерфейс для ввода тикеров с автодополнением
 * Затрагивает: калькулятор опционов, форма новой сделки, отображение цен
 */

const defaultTickers = [
  { symbol: "AAPL", name: "Apple Inc." },
  { symbol: "GOOGL", name: "Alphabet Inc." },
  { symbol: "MSFT", name: "Microsoft Corporation" },
  { symbol: "TSLA", name: "Tesla, Inc." },
  { symbol: "AMZN", name: "Amazon.com, Inc." },
  { symbol: "MSTR", name: "MicroStrategy Incorporated" },
  { symbol: "AMD", name: "Advanced Micro Devices, Inc." },
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust" },
];

// Работа с историей тикеров в localStorage
// ЗАЧЕМ: Улучшает UX, сохраняя недавно использованные тикеры

const getTickerHistory = () => {
  try {
    const history = localStorage.getItem('ticker_history');
    return history ? JSON.parse(history) : [];
  } catch {
    return [];
  }
};

// Сохранить тикер в историю с названием компании
const saveTickerToHistory = async (ticker) => {
  try {
    const history = getTickerHistory();
    
    // Попытаться получить название компании из API
    let companyName = ticker;
    try {
      const response = await fetch(`/api/polygon/ticker/${ticker}`);
      if (response.ok) {
        const data = await response.json();
        companyName = data.name || ticker;
      }
    } catch (error) {
      console.log('Could not fetch company name, using ticker');
    }
    
    const newTicker = { symbol: ticker, name: companyName };
    
    // Удалить дубликаты
    const filtered = history.filter(t => t.symbol !== ticker);
    
    // Добавить в начало списка
    const updated = [newTicker, ...filtered].slice(0, 10); // Максимум 10 последних
    
    localStorage.setItem('ticker_history', JSON.stringify(updated));
  } catch (error) {
    console.error('Error saving ticker history:', error);
  }
};

// Удалить тикер из истории
const removeTickerFromHistory = (ticker) => {
  try {
    const history = getTickerHistory();
    const filtered = history.filter(t => t.symbol !== ticker);
    localStorage.setItem('ticker_history', JSON.stringify(filtered));
    return filtered;
  } catch (error) {
    console.error('Error removing ticker from history:', error);
    return [];
  }
};

function TickerSearch({ 
  selectedTicker, 
  onTickerSelect, 
  searchOpen, 
  setSearchOpen,
  searchValue,
  setSearchValue,
  currentPrice,
  priceChange 
}) {
  const wrapperRef = useRef(null);
  const [tickerSuggestions, setTickerSuggestions] = useState([]);
  const [localTicker, setLocalTicker] = useState(selectedTicker);

  // Синхронизация с внешним selectedTicker (только при первой установке)
  useEffect(() => {
    if (selectedTicker && !localTicker) {
      setLocalTicker(selectedTicker);
    }
  }, [selectedTicker]);

  // Загрузить историю и объединить с дефолтными тикерами
  useEffect(() => {
    const history = getTickerHistory();
    const combined = [...history, ...defaultTickers];
    
    // Удалить дубликаты по symbol
    const unique = Array.from(
      new Map(combined.map(item => [item.symbol, item])).values()
    );
    
    setTickerSuggestions(unique);
  }, []);

  // Закрытие при клике вне компонента
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setSearchOpen]);

  // Обработка выбора тикера с загрузкой данных
  const handleSelectTicker = (ticker) => {
    setLocalTicker(ticker);
    setSearchValue("");
    setSearchOpen(false);
    
    // Вызвать родительский обработчик СРАЗУ
    if (onTickerSelect) {
      onTickerSelect(ticker);
    }
    
    // Загрузить информацию о компании АСИНХРОННО (не блокируя UI)
    setTimeout(async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 секунды timeout
        
        const response = await fetch(`/api/polygon/ticker/${ticker}/details`, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'success' && data.name) {
            await saveTickerToHistory(ticker);
            
            // Обновить список
            const history = getTickerHistory();
            const combined = [...history, ...defaultTickers];
            const unique = Array.from(
              new Map(combined.map(item => [item.symbol, item])).values()
            );
            setTickerSuggestions(unique);
          }
        }
      } catch (error) {
        console.log('Не удалось загрузить информацию о компании:', error);
        // Сохранить тикер без названия компании
        await saveTickerToHistory(ticker);
      }
    }, 0);
  };

  // Фильтрация тикеров по поисковому запросу
  const filteredTickers = tickerSuggestions.filter((ticker) =>
    ticker.name.toLowerCase().includes(searchValue.toLowerCase()) ||
    ticker.symbol.toLowerCase().includes(searchValue.toLowerCase())
  );

  // Обработка удаления тикера из истории
  const handleRemoveTicker = (e, tickerSymbol) => {
    e.stopPropagation(); // Предотвратить выбор тикера при клике на корзину
    const updatedHistory = removeTickerFromHistory(tickerSymbol);
    // Обновить список предложений
    const combined = [...updatedHistory, ...defaultTickers];
    const unique = Array.from(
      new Map(combined.map(item => [item.symbol, item])).values()
    );
    setTickerSuggestions(unique);
  };

  // Проверить, находится ли тикер в истории
  const isInHistory = (tickerSymbol) => {
    const history = getTickerHistory();
    return history.some(t => t.symbol === tickerSymbol);
  };

  // Рендер компонента
  return (
    <div className="flex items-start gap-4">
      <div className="flex-1 min-w-0 relative" ref={wrapperRef}>
        <div className="relative">
          {!localTicker && (
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
          )}
          <Input
            placeholder="Введите тикер"
            value={localTicker || searchValue}
            onChange={(e) => {
              const value = e.target.value.toUpperCase();
              setSearchValue(value);
              if (localTicker) {
                setLocalTicker("");
                // НЕ вызываем onTickerSelect при очистке
              }
              if (!searchOpen) setSearchOpen(true);
            }}
            onFocus={() => {
              if (localTicker) {
                setLocalTicker("");
                setSearchValue("");
                // НЕ вызываем onTickerSelect при очистке
              }
              setSearchOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchValue) {
                const ticker = searchValue.toUpperCase();
                handleSelectTicker(ticker);
              }
              if (e.key === 'Escape') {
                setSearchOpen(false);
              }
            }}
            className={`w-64 ${!localTicker ? "pl-9" : ""} ${localTicker ? "font-bold" : ""}`}
            style={!localTicker ? {
              borderWidth: '2px',
              borderStyle: 'solid',
              borderColor: '#06b6d4',
              animation: 'ticker-pulse 0.8s ease-in-out infinite'
            } : {}}
          />
        </div>

        {searchOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 w-64 rounded-md border bg-popover p-0 z-50">
            <Command>
              <CommandList>
                {filteredTickers.length === 0 ? (
                  <CommandEmpty>Тикер не найден</CommandEmpty>
                ) : (
                  <CommandGroup>
                    {filteredTickers.map((ticker) => (
                      <CommandItem
                        key={ticker.symbol}
                        onSelect={() => handleSelectTicker(ticker.symbol)}
                        className="flex items-center justify-between"
                      >
                        <div className="flex flex-col flex-1">
                          <span className="font-medium">{ticker.symbol}</span>
                          {ticker.name !== ticker.symbol && (
                            <span className="text-xs text-muted-foreground">{ticker.name}</span>
                          )}
                        </div>
                        {isInHistory(ticker.symbol) && (
                          <button
                            onClick={(e) => handleRemoveTicker(e, ticker.symbol)}
                            className="ml-2 p-1 hover:bg-destructive/10 rounded transition-colors"
                            title="Удалить из истории"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                          </button>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </div>
        )}
      </div>

      {localTicker && (
        <div className="flex flex-col items-end flex-shrink-0">
          <span className="text-2xl font-bold whitespace-nowrap">${currentPrice.toFixed(2)}</span>
          <span className={`text-sm font-medium whitespace-nowrap ${priceChange.value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {priceChange.value >= 0 ? '+' : ''}{priceChange.value.toFixed(2)} {priceChange.value >= 0 ? '+' : ''}{priceChange.percent.toFixed(2)}%
          </span>
        </div>
      )}
    </div>
  );
}

export default TickerSearch;
