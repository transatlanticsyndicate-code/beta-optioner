/**
 * PositionForm - форма для добавления опционной позиции
 * ЗАЧЕМ: Создание новых опционных позиций в калькуляторе
 * Затрагивает: калькулятор опционов, управление позициями
 */

import React, { useState, useEffect } from 'react';
import { fetchExpirations, fetchStrikes } from './api/optionsApi';
import { validatePositionForm } from './validation/formValidation';
import { createPositionFromForm, resetFormFields, autofillPriceFromStrike } from './utils/formHelpers';
import { TypeSelector, DirectionSelector } from './components';

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
      loadExpirations();
    }
  }, [ticker]);

  // Загрузка страйков при выборе даты экспирации
  useEffect(() => {
    if (ticker && formData.expiration) {
      loadStrikes();
    }
  }, [ticker, formData.expiration, formData.type]);

  // Загрузка дат экспирации
  const loadExpirations = async () => {
    setLoadingExpirations(true);
    try {
      const data = await fetchExpirations(ticker);
      setExpirations(data);
    } catch (error) {
      console.error('Error fetching expirations:', error);
    } finally {
      setLoadingExpirations(false);
    }
  };

  // Загрузка страйков
  const loadStrikes = async () => {
    setLoadingStrikes(true);
    try {
      const data = await fetchStrikes(ticker, formData.expiration, formData.type);
      setStrikes(data);
    } catch (error) {
      console.error('Error fetching strikes:', error);
    } finally {
      setLoadingStrikes(false);
    }
  };

  // Обработка изменения полей
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    // Очистка ошибки для этого поля
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  // Обработка отправки формы
  const handleSubmit = (e) => {
    e.preventDefault();

    const validation = validatePositionForm(formData, ticker, currentPrice);
    setErrors(validation.errors);
    setWarnings(validation.warnings);

    if (!validation.isValid) {
      return;
    }

    const position = createPositionFromForm(formData, ticker);
    onAddPosition(position);

    // Сброс формы
    setFormData(resetFormFields(formData));
    setErrors({});
    setWarnings({});
  };

  // Автозаполнение цены при выборе страйка
  const handleStrikeChange = (e) => {
    const strike = e.target.value;
    setFormData(prev => ({ ...prev, strike }));

    const autofill = autofillPriceFromStrike(strike, strikes);
    if (autofill) {
      setFormData(prev => ({ ...prev, ...autofill }));
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
        <TypeSelector 
          value={formData.type} 
          onChange={(type) => setFormData(prev => ({ ...prev, type }))} 
        />

        {/* Expiration */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Expiration</label>
          <select
            name="expiration"
            value={formData.expiration}
            onChange={handleChange}
            disabled={!ticker || loadingExpirations}
            className={`w-full px-4 py-2 bg-gray-700 border rounded-lg text-white focus:outline-none focus:border-blue-500 ${
              errors.expiration ? 'border-red-500' : 'border-gray-600'
            }`}
          >
            <option value="">{loadingExpirations ? 'Загрузка...' : 'Выберите дату'}</option>
            {expirations.map(date => (
              <option key={date} value={date}>
                {new Date(date).toLocaleDateString('ru-RU', {
                  year: 'numeric', month: 'short', day: 'numeric'
                })}
              </option>
            ))}
          </select>
          {errors.expiration && <p className="mt-1 text-xs text-red-400">{errors.expiration}</p>}
        </div>

        {/* Strike */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Strike</label>
          <select
            name="strike"
            value={formData.strike}
            onChange={handleStrikeChange}
            disabled={!formData.expiration || loadingStrikes}
            className={`w-full px-4 py-2 bg-gray-700 border rounded-lg text-white focus:outline-none focus:border-blue-500 ${
              errors.strike ? 'border-red-500' : warnings.strike ? 'border-yellow-500' : 'border-gray-600'
            }`}
          >
            <option value="">{loadingStrikes ? 'Загрузка...' : 'Выберите страйк'}</option>
            {strikes.map(option => (
              <option key={option.strike} value={option.strike}>
                ${option.strike} {option.iv ? `(IV: ${(option.iv * 100).toFixed(1)}%)` : ''}
              </option>
            ))}
          </select>
          {errors.strike && <p className="mt-1 text-xs text-red-400">{errors.strike}</p>}
          {warnings.strike && !errors.strike && <p className="mt-1 text-xs text-yellow-400">{warnings.strike}</p>}
        </div>

        <DirectionSelector 
          value={formData.direction} 
          onChange={(direction) => setFormData(prev => ({ ...prev, direction }))} 
        />

        {/* Size */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Size (contracts)</label>
          <input
            type="number" name="size" value={formData.size} onChange={handleChange}
            min="1" step="1"
            className={`w-full px-4 py-2 bg-gray-700 border rounded-lg text-white focus:outline-none focus:border-blue-500 ${
              errors.size ? 'border-red-500' : 'border-gray-600'
            }`}
          />
          {errors.size && <p className="mt-1 text-xs text-red-400">{errors.size}</p>}
        </div>

        {/* Price */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Price (premium per contract)</label>
          <div className="relative">
            <span className="absolute left-4 top-2 text-gray-400">$</span>
            <input
              type="number" name="price" value={formData.price} onChange={handleChange}
              min="0.01" step="0.01" placeholder="0.00"
              className={`w-full pl-8 pr-4 py-2 bg-gray-700 border rounded-lg text-white focus:outline-none focus:border-blue-500 ${
                errors.price ? 'border-red-500' : warnings.price ? 'border-yellow-500' : 'border-gray-600'
              }`}
            />
          </div>
          {errors.price && <p className="mt-1 text-xs text-red-400">{errors.price}</p>}
          {warnings.price && !errors.price && <p className="mt-1 text-xs text-yellow-400">{warnings.price}</p>}
        </div>

        {/* Commission */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Commission (per contract)</label>
          <div className="relative">
            <span className="absolute left-4 top-2 text-gray-400">$</span>
            <input
              type="number" name="commission" value={formData.commission} onChange={handleChange}
              min="0" step="0.01"
              className="w-full pl-8 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <p className="mt-1 text-xs text-gray-400">Стандартная комиссия: $0.50-$1.00</p>
        </div>

        <button
          type="submit" disabled={!ticker}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl"
        >
          + Add Position
        </button>
      </form>
    </div>
  );
}

export default PositionForm;
