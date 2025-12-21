import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getDaysUntilExpirationUTC } from '../../utils/dateUtils';

/**
 * PositionForm - форма для добавления опционной позиции
 */
function PositionForm({ ticker, currentPrice, onAddPosition, defaultCommission }) {
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
  const [strikes, setStrikes] = useState([]);
  const [loadingExpirations, setLoadingExpirations] = useState(false);
  const [loadingStrikes, setLoadingStrikes] = useState(false);
  const [errors, setErrors] = useState({});
  const [warnings, setWarnings] = useState({});

  // Загрузка дат экспирации при выборе тикера
  useEffect(() => {
    if (ticker) {
      fetchExpirations();
    }
  }, [ticker]);

  // Загрузка страйков при выборе даты экспирации
  useEffect(() => {
    if (ticker && formData.expiration) {
      fetchStrikes();
    }
  }, [ticker, formData.expiration, formData.type]);

  // Получение дат экспирации
  const fetchExpirations = async () => {
    setLoadingExpirations(true);
    try {
      const response = await axios.get(`/api/options/expirations?ticker=${ticker}`);
      if (response.data.status === 'success') {
        setExpirations(response.data.expirations || []);
      }
    } catch (error) {
      console.error('Error fetching expirations:', error);
    } finally {
      setLoadingExpirations(false);
    }
  };

  // Получение страйков
  const fetchStrikes = async () => {
    setLoadingStrikes(true);
    try {
      const response = await axios.get(
        `/api/options/chain?ticker=${ticker}&expiration_date=${formData.expiration}`
      );
      if (response.data.status === 'success') {
        const options = response.data.options || [];
        // Фильтруем по типу опциона
        const filtered = options.filter(opt => opt.type === formData.type);
        setStrikes(filtered);
      }
    } catch (error) {
      console.error('Error fetching strikes:', error);
    } finally {
      setLoadingStrikes(false);
    }
  };

  // Обработка изменения полей
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Очистка ошибки для этого поля
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  // Валидация формы
  const validateForm = () => {
    const newErrors = {};
    const newWarnings = {};

    if (!ticker) {
      newErrors.ticker = 'Выберите тикер';
    }

    if (!formData.strike) {
      newErrors.strike = 'Выберите страйк';
    }

    if (!formData.expiration) {
      newErrors.expiration = 'Выберите дату экспирации';
    } else {
      // Проверка что дата не в прошлом
      // ВАЖНО: Используем UTC для консистентности между часовыми поясами
      const daysUntil = getDaysUntilExpirationUTC(formData.expiration);
      
      if (daysUntil < 0) {
        newErrors.expiration = 'Дата экспирации не может быть в прошлом';
      }
    }

    if (!formData.price || parseFloat(formData.price) <= 0) {
      newErrors.price = 'Цена должна быть больше 0';
    } else if (currentPrice && parseFloat(formData.price) > currentPrice.price) {
      newWarnings.price = 'Цена опциона больше цены акции - проверьте данные';
    }

    if (!formData.size || parseInt(formData.size) <= 0) {
      newErrors.size = 'Количество должно быть больше 0';
    }

    // Warning для deep OTM опционов
    if (currentPrice && formData.strike) {
      const strike = parseFloat(formData.strike);
      const current = currentPrice.price;
      const diff = Math.abs(strike - current) / current;

      if (diff > 0.15) { // Более 15% от текущей цены
        if (formData.type === 'call' && strike > current) {
          newWarnings.strike = 'Опцион глубоко OTM (Out of The Money)';
        } else if (formData.type === 'put' && strike < current) {
          newWarnings.strike = 'Опцион глубоко OTM (Out of The Money)';
        }
      }
    }

    setErrors(newErrors);
    setWarnings(newWarnings);

    return Object.keys(newErrors).length === 0;
  };

  // Обработка отправки формы
  const handleSubmit = (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    // Создание позиции
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
      iv: null // Будет заполнено из API если доступно
    };

    onAddPosition(position);

    // Сброс формы (кроме некоторых полей)
    setFormData(prev => ({
      ...prev,
      strike: '',
      price: '',
      size: 1
    }));
    setErrors({});
    setWarnings({});
  };

  // Автозаполнение цены при выборе страйка
  const handleStrikeChange = (e) => {
    const strike = e.target.value;
    setFormData(prev => ({ ...prev, strike }));

    // Найти опцион с этим страйком и автозаполнить цену
    const option = strikes.find(s => s.strike === parseFloat(strike));
    if (option && option.price) {
      setFormData(prev => ({
        ...prev,
        price: option.price.toFixed(2),
        iv: option.iv || null
      }));
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">New Position</h2>

      {!ticker && (
        <div className="p-4 bg-yellow-900/30 border border-yellow-700 rounded-lg mb-4">
          <p className="text-yellow-400 text-sm">
            Сначала выберите тикер
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Type - Call/Put */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Type
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, type: 'call' }))}
              className={`py-3 px-4 rounded-lg font-semibold transition-all border-2 ${
                formData.type === 'call'
                  ? 'bg-blue-600 border-blue-500 text-white shadow-lg'
                  : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-600 hover:border-gray-500'
              }`}
            >
              Call
            </button>
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, type: 'put' }))}
              className={`py-3 px-4 rounded-lg font-semibold transition-all border-2 ${
                formData.type === 'put'
                  ? 'bg-orange-600 border-orange-500 text-white shadow-lg'
                  : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-600 hover:border-gray-500'
              }`}
            >
              Put
            </button>
          </div>
        </div>

        {/* Expiration */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Expiration
          </label>
          <select
            name="expiration"
            value={formData.expiration}
            onChange={handleChange}
            disabled={!ticker || loadingExpirations}
            className={`w-full px-4 py-2 bg-gray-700 border rounded-lg text-white focus:outline-none focus:border-blue-500 ${
              errors.expiration ? 'border-red-500' : 'border-gray-600'
            }`}
          >
            <option value="">
              {loadingExpirations ? 'Загрузка...' : 'Выберите дату'}
            </option>
            {expirations.map(date => (
              <option key={date} value={date}>
                {new Date(date).toLocaleDateString('ru-RU', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })}
              </option>
            ))}
          </select>
          {errors.expiration && (
            <p className="mt-1 text-xs text-red-400">{errors.expiration}</p>
          )}
        </div>

        {/* Strike */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Strike
          </label>
          <select
            name="strike"
            value={formData.strike}
            onChange={handleStrikeChange}
            disabled={!formData.expiration || loadingStrikes}
            className={`w-full px-4 py-2 bg-gray-700 border rounded-lg text-white focus:outline-none focus:border-blue-500 ${
              errors.strike ? 'border-red-500' : warnings.strike ? 'border-yellow-500' : 'border-gray-600'
            }`}
          >
            <option value="">
              {loadingStrikes ? 'Загрузка...' : 'Выберите страйк'}
            </option>
            {strikes.map(option => (
              <option key={option.strike} value={option.strike}>
                ${option.strike} {option.iv ? `(IV: ${(option.iv * 100).toFixed(1)}%)` : ''}
              </option>
            ))}
          </select>
          {errors.strike && (
            <p className="mt-1 text-xs text-red-400">{errors.strike}</p>
          )}
          {warnings.strike && !errors.strike && (
            <p className="mt-1 text-xs text-yellow-400">{warnings.strike}</p>
          )}
        </div>

        {/* Direction - Buy/Sell */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Direction
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, direction: 'buy' }))}
              className={`py-3 px-4 rounded-lg font-semibold transition-all border-2 ${
                formData.direction === 'buy'
                  ? 'bg-green-600 border-green-500 text-white shadow-lg'
                  : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-600 hover:border-gray-500'
              }`}
            >
              Buy
            </button>
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, direction: 'sell' }))}
              className={`py-3 px-4 rounded-lg font-semibold transition-all border-2 ${
                formData.direction === 'sell'
                  ? 'bg-red-600 border-red-500 text-white shadow-lg'
                  : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-600 hover:border-gray-500'
              }`}
            >
              Sell
            </button>
          </div>
        </div>

        {/* Size */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Size (contracts)
          </label>
          <input
            type="number"
            name="size"
            value={formData.size}
            onChange={handleChange}
            min="1"
            step="1"
            className={`w-full px-4 py-2 bg-gray-700 border rounded-lg text-white focus:outline-none focus:border-blue-500 ${
              errors.size ? 'border-red-500' : 'border-gray-600'
            }`}
          />
          {errors.size && (
            <p className="mt-1 text-xs text-red-400">{errors.size}</p>
          )}
        </div>

        {/* Price */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Price (premium per contract)
          </label>
          <div className="relative">
            <span className="absolute left-4 top-2 text-gray-400">$</span>
            <input
              type="number"
              name="price"
              value={formData.price}
              onChange={handleChange}
              min="0.01"
              step="0.01"
              placeholder="0.00"
              className={`w-full pl-8 pr-4 py-2 bg-gray-700 border rounded-lg text-white focus:outline-none focus:border-blue-500 ${
                errors.price ? 'border-red-500' : warnings.price ? 'border-yellow-500' : 'border-gray-600'
              }`}
            />
          </div>
          {errors.price && (
            <p className="mt-1 text-xs text-red-400">{errors.price}</p>
          )}
          {warnings.price && !errors.price && (
            <p className="mt-1 text-xs text-yellow-400">{warnings.price}</p>
          )}
        </div>

        {/* Commission */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Commission (per contract)
          </label>
          <div className="relative">
            <span className="absolute left-4 top-2 text-gray-400">$</span>
            <input
              type="number"
              name="commission"
              value={formData.commission}
              onChange={handleChange}
              min="0"
              step="0.01"
              className="w-full pl-8 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Стандартная комиссия: $0.50-$1.00
          </p>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!ticker}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl"
        >
          + Add Position
        </button>
      </form>
    </div>
  );
}

export default PositionForm;
