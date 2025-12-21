import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Loader2 } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';

/**
 * PositionFormCompact - компактная горизонтальная форма добавления позиции
 */
function PositionFormCompact({ ticker, currentPrice, onAddPosition, defaultCommission }) {
  const [formData, setFormData] = useState({
    strike: '',
    type: 'call',
    expiration: '',
    direction: 'buy',
    size: 1,
    price: '',
    commission: defaultCommission || 0.65
  });

  const [expirations, setExpirations] = useState([]);
  const [allOptionsData, setAllOptionsData] = useState({}); // Кэш опционов по датам
  const [loadingExpirations, setLoadingExpirations] = useState(false);
  const [loadingStrikes, setLoadingStrikes] = useState(false);

  // Загрузка только дат экспирации при выборе тикера
  useEffect(() => {
    if (ticker) {
      fetchExpirations();
    }
  }, [ticker]);

  // Загрузка опционов для конкретной даты при её выборе
  useEffect(() => {
    if (ticker && formData.expiration && formData.type) {
      const key = `${formData.expiration}_${formData.type}`;
      // Если данных еще нет в кэше - загружаем
      if (!allOptionsData[key]) {
        fetchOptionsForDate(formData.expiration, formData.type);
      }
    }
  }, [formData.expiration, formData.type, ticker]);

  // Получить страйки для выбранной даты и типа из кэша
  const getStrikesForSelection = () => {
    if (!formData.expiration || !formData.type) return [];
    
    const key = `${formData.expiration}_${formData.type}`;
    const strikes = allOptionsData[key];
    
    // Если данных еще нет - генерируем примерные страйки
    if (!strikes || strikes.length === 0) {
      if (currentPrice && currentPrice.price) {
        const baseStrike = Math.round(currentPrice.price / 5) * 5;
        return Array.from({ length: 20 }, (_, i) => {
          const strike = baseStrike - 50 + (i * 5);
          return { strike, price: 0 };
        }).filter(s => s.strike > 0);
      }
      return [];
    }
    
    return strikes;
  };

  // Быстрая загрузка только дат экспирации + prefetch первой даты
  const fetchExpirations = async () => {
    setLoadingExpirations(true);
    console.log(`🔄 Загружаем даты экспирации для ${ticker}...`);
    
    try {
      const response = await axios.get(`/api/options/expirations?ticker=${ticker}`);
      
      if (response.data.status === 'success') {
        const dates = response.data.expirations || [];
        setExpirations(dates);
        console.log(`✅ Получено ${dates.length} дат экспирации`);
        
        // 🚀 PREFETCH: Автоматически загружаем первую дату для обоих типов
        if (dates.length > 0) {
          const firstDate = dates[0];
          console.log(`⚡ Prefetch: загружаем первую дату ${firstDate}...`);
          
          // Загружаем параллельно Call и Put для первой даты
          Promise.all([
            prefetchOptionsForDate(firstDate, 'call'),
            prefetchOptionsForDate(firstDate, 'put')
          ]).then(() => {
            console.log(`✅ Prefetch завершен для ${firstDate}`);
            
            // 🔄 BACKGROUND LOADING: Загружаем следующие 2-3 даты в фоне
            if (dates.length > 1) {
              const backgroundDates = dates.slice(1, 4); // Следующие 3 даты
              console.log(`🔄 Background loading: ${backgroundDates.length} дат...`);
              
              backgroundDates.forEach((date, index) => {
                // Загружаем с задержкой чтобы не перегрузить сервер
                setTimeout(() => {
                  Promise.all([
                    prefetchOptionsForDate(date, 'call'),
                    prefetchOptionsForDate(date, 'put')
                  ]).then(() => {
                    console.log(`✅ Background: загружена дата ${date}`);
                  });
                }, (index + 1) * 2000); // Задержка 2 сек между датами
              });
            }
          });
        }
      } else {
        console.error('❌ Failed to fetch expirations');
        setExpirations([]);
      }
    } catch (error) {
      console.error('❌ Error fetching expirations:', error.message);
      setExpirations([]);
    } finally {
      setLoadingExpirations(false);
    }
  };

  // Prefetch функция (тихая загрузка без индикаторов)
  const prefetchOptionsForDate = async (date, type) => {
    const key = `${date}_${type}`;
    
    // Если уже есть в кэше - пропускаем
    if (allOptionsData[key]) {
      return Promise.resolve();
    }
    
    try {
      const response = await axios.get(
        `/api/options/chain?ticker=${ticker}&expiration_date=${date}`,
        { timeout: 10000 }
      );
      
      if (response.data.status === 'success') {
        const options = response.data.options || [];
        const filtered = options.filter(opt => opt.type === type);
        
        setAllOptionsData(prev => ({
          ...prev,
          [key]: filtered
        }));
      }
    } catch (error) {
      console.error(`❌ Prefetch error for ${date} ${type}:`, error.message);
    }
  };

  // Загрузка опционов для конкретной даты (с индикатором загрузки)
  const fetchOptionsForDate = async (date, type) => {
    const key = `${date}_${type}`;
    
    // Если уже есть в кэше - не загружаем
    if (allOptionsData[key]) {
      return;
    }
    
    // Если уже загружаем - не дублируем запрос
    if (loadingStrikes) return;
    
    setLoadingStrikes(true);
    console.log(`🔄 Загружаем ${type} опционы для ${date}...`);
    
    try {
      const response = await axios.get(
        `/api/options/chain?ticker=${ticker}&expiration_date=${date}`,
        { timeout: 10000 }
      );
      
      if (response.data.status === 'success') {
        const options = response.data.options || [];
        
        // Фильтруем по типу
        const filtered = options.filter(opt => opt.type === type);
        
        // Обновляем кэш
        setAllOptionsData(prev => ({
          ...prev,
          [key]: filtered
        }));
        
        console.log(`✅ ${date} ${type}: ${filtered.length} опционов`);
      }
    } catch (error) {
      console.error(`❌ Error fetching options for ${date}:`, error.message);
    } finally {
      setLoadingStrikes(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleStrikeChange = (e) => {
    const strike = e.target.value;
    setFormData(prev => ({ ...prev, strike }));
    
    if (!strike || !currentPrice) return;
    
    const strikeNum = parseFloat(strike);
    const currentPriceNum = currentPrice.price;
    const diff = Math.abs(strikeNum - currentPriceNum);
    const percentDiff = diff / currentPriceNum;
    
    // Warning для deep OTM опционов (>15% от текущей цены)
    if (percentDiff > 0.15) {
      if ((formData.type === 'call' && strikeNum > currentPriceNum) ||
          (formData.type === 'put' && strikeNum < currentPriceNum)) {
        console.warn(`Deep OTM option: ${formData.type} at $${strikeNum} (current: $${currentPriceNum})`);
      }
    }
    
    // Найти опцион в кэше
    const strikes = getStrikesForSelection();
    const option = strikes.find(s => (s.strike || s) === strikeNum);
    
    if (option && option.price && option.price > 0) {
      setFormData(prev => ({
        ...prev,
        price: option.price.toFixed(2),
        iv: option.iv || null
      }));
    } else {
      // Fallback: генерируем примерную цену на основе intrinsic value + time value
      let intrinsicValue = 0;
      let timeValue = 5; // Базовая временная стоимость
      
      if (formData.type === 'call') {
        intrinsicValue = Math.max(0, currentPriceNum - strikeNum);
      } else {
        intrinsicValue = Math.max(0, strikeNum - currentPriceNum);
      }
      
      // Временная стоимость уменьшается для deep OTM
      if (percentDiff > 0.05) {
        timeValue = Math.max(0.5, 5 - percentDiff * 20);
      }
      
      const estimatedPrice = intrinsicValue + timeValue;
      
      setFormData(prev => ({
        ...prev,
        price: Math.max(0.50, estimatedPrice).toFixed(2)
      }));
    }
  };

  const handleSubmit = () => {
    if (!ticker || !formData.strike || !formData.expiration || !formData.price) {
      return;
    }

    const position = {
      id: `${Date.now()}-${Math.random()}`,
      ticker: ticker,
      strike: parseFloat(formData.strike),
      type: formData.type,
      expiration: formData.expiration,
      direction: formData.direction,
      size: parseInt(formData.size),
      price: parseFloat(formData.price),
      commission: parseFloat(formData.commission),
      visible: true,
      iv: formData.iv || null
    };

    onAddPosition(position);

    // Сброс некоторых полей
    setFormData(prev => ({
      ...prev,
      strike: '',
      price: '',
      size: 1
    }));
  };

  if (!ticker) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-muted-foreground text-center">Сначала выберите тикер</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {/* Loading indicators */}
      {loadingExpirations && (
        <div className="px-4 py-2 bg-primary/10 border-b">
          <div className="flex items-center gap-2 text-primary text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Загружаем даты экспирации...</span>
          </div>
        </div>
      )}
      {loadingStrikes && !loadingExpirations && (
        <div className="px-4 py-2 bg-primary/10 border-b">
          <div className="flex items-center gap-2 text-primary text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Загружаем страйки...</span>
          </div>
        </div>
      )}
      
      <CardContent className="p-4 space-y-3">
        {/* Form Row - горизонтальная */}
        <div className="flex items-end gap-2 flex-wrap">
          {/* B/S - ПЕРВОЕ МЕСТО */}
          <div className="w-16">
            <label className="block text-xs text-muted-foreground mb-1.5">B/S</label>
            <Button
              type="button"
              onClick={() => setFormData(prev => ({ 
                ...prev, 
                direction: prev.direction === 'buy' ? 'sell' : 'buy' 
              }))}
              variant={formData.direction === 'buy' ? 'default' : 'destructive'}
              className={`w-full h-9 text-xs font-bold ${
                formData.direction === 'sell' ? 'bg-red-500 text-white hover:bg-red-600' : ''
              }`}
            >
              {formData.direction === 'buy' ? 'B' : 'S'}
            </Button>
          </div>

          {/* Type */}
          <div className="w-24">
            <label className="block text-xs text-muted-foreground mb-1.5">Type</label>
            <Select
              value={formData.type}
              onValueChange={(value) => {
                const e = { target: { name: 'type', value } };
                handleChange(e);
              }}
            >
              <SelectTrigger className="h-9 font-semibold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="call">Call</SelectItem>
                <SelectItem value="put">Put</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Expiration */}
          <div className="flex-1 min-w-[120px]">
            <label className="block text-xs text-muted-foreground mb-1.5">Expiration</label>
            <Select
              value={formData.expiration}
              onValueChange={(value) => {
                const e = { target: { name: 'expiration', value } };
                handleChange(e);
              }}
              disabled={loadingExpirations || expirations.length === 0}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder={loadingExpirations ? 'Loading...' : expirations.length === 0 ? 'No dates' : 'Select'} />
              </SelectTrigger>
              <SelectContent>
                {expirations.map(date => (
                  <SelectItem key={date} value={date}>
                    {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Strike */}
          <div className="flex-1 min-w-[100px]">
            <label className="block text-xs text-muted-foreground mb-1.5">
              Strike {loadingStrikes && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}
            </label>
            <Select
              value={formData.strike}
              onValueChange={(value) => {
                const e = { target: { name: 'strike', value } };
                handleStrikeChange(e);
              }}
              disabled={!formData.expiration || loadingStrikes}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder={loadingStrikes ? 'Loading...' : !formData.expiration ? 'Select date first' : 'Select'} />
              </SelectTrigger>
              <SelectContent>
                {getStrikesForSelection().map((strike, index) => (
                  <SelectItem key={index} value={String(strike.strike || strike)}>
                    {strike.strike || strike}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Size */}
          <div className="w-20">
            <label className="block text-xs text-muted-foreground mb-1.5">Size</label>
            <Input
              type="number"
              name="size"
              value={formData.size}
              onChange={handleChange}
              min="1"
              className="h-9 text-center"
            />
          </div>

          {/* Price */}
          <div className="flex-1 min-w-[100px]">
            <label className="block text-xs text-muted-foreground mb-1.5">Price</label>
            <Input
              type="number"
              name="price"
              value={formData.price}
              onChange={handleChange}
              step="0.01"
              placeholder="0.00"
              className="h-9"
            />
          </div>

          {/* Add Button */}
          <div className="w-24">
            <Button
              onClick={handleSubmit}
              disabled={!formData.strike || !formData.price || !formData.expiration}
              className="w-full h-9 text-xs font-bold"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default PositionFormCompact;
