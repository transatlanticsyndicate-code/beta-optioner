import React, { useState } from 'react';
import axios from 'axios';
import { Search, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';

/**
 * TickerSelector - компонент для выбора тикера и отображения текущей цены
 */
function TickerSelector({ ticker, setTicker, currentPrice, setCurrentPrice }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [inputValue, setInputValue] = useState(ticker || '');

  // Получение цены акции
  const fetchStockPrice = async (tickerSymbol) => {
    if (!tickerSymbol || tickerSymbol.length < 1) {
      setError('Введите тикер');
      return;
    }

    if (tickerSymbol.length > 10) {
      setError('Тикер слишком длинный');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await axios.post(`/analyze/step1?ticker=${tickerSymbol.toUpperCase()}`, {
        timeout: 10000 // 10 секунд таймаут
      });
      
      if (response.data.status === 'success') {
        const stockData = response.data.stock_data;
        
        // Валидация данных
        if (!stockData || !stockData.price || stockData.price <= 0) {
          setError('Получены некорректные данные. Попробуйте другой тикер.');
          setCurrentPrice(null);
          return;
        }
        
        setCurrentPrice(stockData);
        setTicker(tickerSymbol.toUpperCase());
        setError(null);
      } else {
        setError(response.data.error || 'Не удалось получить данные. Проверьте тикер.');
        setCurrentPrice(null);
      }
    } catch (err) {
      console.error('Error fetching stock price:', err);
      
      if (err.code === 'ECONNABORTED') {
        setError('Превышено время ожидания. Попробуйте еще раз.');
      } else if (err.response) {
        setError(`Ошибка сервера: ${err.response.status}`);
      } else if (err.request) {
        setError('Нет ответа от сервера. Проверьте подключение.');
      } else {
        setError('Ошибка при получении данных. Проверьте тикер.');
      }
      
      setCurrentPrice(null);
    } finally {
      setLoading(false);
    }
  };

  // Обработка ввода
  const handleInputChange = (e) => {
    const value = e.target.value.toUpperCase();
    setInputValue(value);
  };

  // Обработка отправки формы
  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim()) {
      fetchStockPrice(inputValue.trim());
    }
  };

  // Форматирование изменения цены
  const formatChange = (change, changePercent) => {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)} (${sign}${changePercent.toFixed(2)}%)`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5 text-primary" />
          Ticker
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Форма ввода тикера */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              placeholder="Введите тикер (SPY, AAPL...)"
              className="uppercase font-medium"
              maxLength={10}
            />
          </div>
          <Button
            type="submit"
            disabled={loading || !inputValue.trim()}
            className="px-6"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Загрузка
              </>
            ) : (
              'Найти'
            )}
          </Button>
        </form>

        {/* Ошибка */}
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/50 rounded-lg">
            <p className="text-destructive text-sm">{error}</p>
          </div>
        )}

        {/* Индикатор загрузки */}
        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          </div>
        )}

        {/* Информация о тикере */}
        {currentPrice && !loading && (
          <div className="space-y-4">
            <div className="flex items-baseline justify-between">
              <span className="text-4xl font-bold text-foreground">
                ${currentPrice.price.toFixed(2)}
              </span>
              <div className={`flex items-center gap-1 text-sm font-semibold ${
                currentPrice.change >= 0 ? 'text-green-500' : 'text-red-500'
              }`}>
                {currentPrice.change >= 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                <span>{formatChange(currentPrice.change, currentPrice.change_percent)}</span>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between p-2 bg-muted rounded-md">
                <span className="text-muted-foreground">Open:</span>
                <span className="font-medium">${currentPrice.open.toFixed(2)}</span>
              </div>
              <div className="flex justify-between p-2 bg-muted rounded-md">
                <span className="text-muted-foreground">High:</span>
                <span className="font-medium">${currentPrice.high.toFixed(2)}</span>
              </div>
              <div className="flex justify-between p-2 bg-muted rounded-md">
                <span className="text-muted-foreground">Low:</span>
                <span className="font-medium">${currentPrice.low.toFixed(2)}</span>
              </div>
              <div className="flex justify-between p-2 bg-muted rounded-md">
                <span className="text-muted-foreground">Volume:</span>
                <span className="font-medium">{(currentPrice.volume / 1000000).toFixed(2)}M</span>
              </div>
            </div>

            <div className="pt-3 border-t">
              <p className="text-xs text-muted-foreground">
                Обновлено: {new Date(currentPrice.timestamp).toLocaleString('ru-RU')}
              </p>
            </div>
          </div>
        )}

        {/* Подсказка */}
        {!currentPrice && !loading && !error && (
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Введите тикер акции для начала работы</p>
            <p className="text-xs">Примеры: SPY, AAPL, TSLA, NVDA</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default TickerSelector;
