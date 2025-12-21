/**
 * PositionFormCompact - компактная горизонтальная форма добавления позиции
 * ЗАЧЕМ: Быстрое добавление опционов с prefetch и кэшированием
 * Затрагивает: калькулятор опционов, UX
 */

import React, { useState, useEffect } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { Card, CardContent } from '../../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { fetchExpirations, fetchOptionsForDate, prefetchOptionsForDate } from './api/optionsApi';
import { estimateOptionPrice, generateFallbackStrikes } from './utils/priceEstimation';

function PositionFormCompact({ ticker, currentPrice, onAddPosition, defaultCommission }) {
  const [formData, setFormData] = useState({
    strike: '', type: 'call', expiration: '', direction: 'buy',
    size: 1, price: '', commission: defaultCommission || 0.65
  });

  const [expirations, setExpirations] = useState([]);
  const [allOptionsData, setAllOptionsData] = useState({});
  const [loadingExpirations, setLoadingExpirations] = useState(false);
  const [loadingStrikes, setLoadingStrikes] = useState(false);

  useEffect(() => {
    if (ticker) loadExpirations();
  }, [ticker]);

  useEffect(() => {
    if (ticker && formData.expiration && formData.type) {
      const key = `${formData.expiration}_${formData.type}`;
      if (!allOptionsData[key]) {
        loadOptionsForDate(formData.expiration, formData.type);
      }
    }
  }, [formData.expiration, formData.type, ticker]);

  const getStrikesForSelection = () => {
    if (!formData.expiration || !formData.type) return [];
    const key = `${formData.expiration}_${formData.type}`;
    const strikes = allOptionsData[key];
    if (!strikes || strikes.length === 0) {
      return generateFallbackStrikes(currentPrice);
    }
    return strikes;
  };

  const loadExpirations = async () => {
    setLoadingExpirations(true);
    try {
      const dates = await fetchExpirations(ticker);
      setExpirations(dates);
      
      if (dates.length > 0) {
        const firstDate = dates[0];
        Promise.all([
          prefetchOptionsForDate(ticker, firstDate, 'call', allOptionsData),
          prefetchOptionsForDate(ticker, firstDate, 'put', allOptionsData)
        ]).then((results) => {
          results.forEach(result => {
            if (result) {
              setAllOptionsData(prev => ({ ...prev, [result.key]: result.data }));
            }
          });
          
          if (dates.length > 1) {
            const backgroundDates = dates.slice(1, 4);
            backgroundDates.forEach((date, index) => {
              setTimeout(() => {
                Promise.all([
                  prefetchOptionsForDate(ticker, date, 'call', allOptionsData),
                  prefetchOptionsForDate(ticker, date, 'put', allOptionsData)
                ]).then((bgResults) => {
                  bgResults.forEach(result => {
                    if (result) {
                      setAllOptionsData(prev => ({ ...prev, [result.key]: result.data }));
                    }
                  });
                });
              }, (index + 1) * 2000);
            });
          }
        });
      }
    } catch (error) {
      console.error('Error fetching expirations:', error);
    } finally {
      setLoadingExpirations(false);
    }
  };

  const loadOptionsForDate = async (date, type) => {
    const key = `${date}_${type}`;
    if (allOptionsData[key] || loadingStrikes) return;
    
    setLoadingStrikes(true);
    try {
      const filtered = await fetchOptionsForDate(ticker, date, type);
      setAllOptionsData(prev => ({ ...prev, [key]: filtered }));
    } catch (error) {
      console.error('Error fetching options:', error);
    } finally {
      setLoadingStrikes(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleStrikeChange = (e) => {
    const strike = e.target.value;
    setFormData(prev => ({ ...prev, strike }));
    
    if (!strike || !currentPrice) return;
    
    const strikeNum = parseFloat(strike);
    const strikes = getStrikesForSelection();
    const option = strikes.find(s => (s.strike || s) === strikeNum);
    
    if (option && option.price && option.price > 0) {
      setFormData(prev => ({ ...prev, price: option.price.toFixed(2), iv: option.iv || null }));
    } else {
      const estimatedPrice = estimateOptionPrice(strikeNum, currentPrice.price, formData.type);
      setFormData(prev => ({ ...prev, price: estimatedPrice.toFixed(2) }));
    }
  };

  const handleSubmit = () => {
    if (!ticker || !formData.strike || !formData.expiration || !formData.price) return;

    const position = {
      id: `${Date.now()}-${Math.random()}`,
      ticker, strike: parseFloat(formData.strike), type: formData.type,
      expiration: formData.expiration, direction: formData.direction,
      size: parseInt(formData.size), price: parseFloat(formData.price),
      commission: parseFloat(formData.commission), visible: true, iv: formData.iv || null
    };

    onAddPosition(position);
    setFormData(prev => ({ ...prev, strike: '', price: '', size: 1 }));
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

  const strikes = getStrikesForSelection();
  const canSubmit = ticker && formData.strike && formData.expiration && formData.price;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-end gap-2">
          <div className="w-24">
            <label className="text-xs text-muted-foreground mb-1 block">Type</label>
            <Select value={formData.type} onValueChange={(value) => setFormData(prev => ({ ...prev, type: value }))}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="call">Call</SelectItem>
                <SelectItem value="put">Put</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">Expiration</label>
            <Select value={formData.expiration} onValueChange={(value) => setFormData(prev => ({ ...prev, expiration: value }))} disabled={loadingExpirations}>
              <SelectTrigger className="h-9"><SelectValue placeholder={loadingExpirations ? "Loading..." : "Select"} /></SelectTrigger>
              <SelectContent>
                {expirations.map(date => (
                  <SelectItem key={date} value={date}>{new Date(date).toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' })}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-28">
            <label className="text-xs text-muted-foreground mb-1 block">Strike</label>
            <Select value={formData.strike} onValueChange={(value) => handleStrikeChange({ target: { value } })} disabled={!formData.expiration || loadingStrikes}>
              <SelectTrigger className="h-9"><SelectValue placeholder={loadingStrikes ? "..." : "Select"} /></SelectTrigger>
              <SelectContent>
                {strikes.map((s, i) => {
                  const strike = s.strike || s;
                  return <SelectItem key={i} value={strike.toString()}>${strike}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="w-24">
            <label className="text-xs text-muted-foreground mb-1 block">Direction</label>
            <Select value={formData.direction} onValueChange={(value) => setFormData(prev => ({ ...prev, direction: value }))}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="buy">Buy</SelectItem>
                <SelectItem value="sell">Sell</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-20">
            <label className="text-xs text-muted-foreground mb-1 block">Size</label>
            <Input type="number" name="size" value={formData.size} onChange={handleChange} min="1" className="h-9" />
          </div>
          <div className="w-24">
            <label className="text-xs text-muted-foreground mb-1 block">Price</label>
            <Input type="number" name="price" value={formData.price} onChange={handleChange} min="0.01" step="0.01" className="h-9" />
          </div>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="h-9">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default PositionFormCompact;
