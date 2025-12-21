/**
 * Компонент модального окна "Что нового?"
 * ЗАЧЕМ: Показывает пользователю нововведения при загрузке страницы калькулятора
 * Затрагивает: UX, информирование пользователей о новых функциях
 */

import React, { useState, useEffect } from 'react';
import { X, Sparkles, Check } from 'lucide-react';

// Текущая версия приложения
const CURRENT_VERSION = '24';

// Список нововведений для текущей версии
// ЗАЧЕМ: Централизованное хранение информации о новых функциях
const WHATS_NEW_ITEMS = [
  {
    title: 'Учёт дивидендов в расчётах (BSM)',
    description: 'Добавлена модель Black-Scholes-Merton с учётом дивидендной доходности. Включите переключатель "Учитывать дивиденды" в настройках для более точного расчёта P&L акций с дивидендами (AAPL, MSFT, SPY и др.).',
    icon: '💰'
  },
  {
    title: 'Сброс цены на текущую рыночную',
    description: 'Кнопка сброса цены в блоке "Симуляция изменения рынка" теперь сбрасывает на актуальную рыночную цену, а не на цену при сохранении позиции.',
    icon: '🔄'
  },
  {
    title: 'Умный ползунок для зафиксированных позиций',
    description: 'Теперь при открытии сохранённой позиции с замочком ползунок дат начинается с даты сохранения, а текущее значение показывает сегодняшний день. Вы можете отслеживать, как менялась позиция с момента её фиксации!',
    icon: '📅'
  },
  {
    title: 'Корректный расчёт P&L во времени',
    description: 'Прибыль и убыток теперь правильно пересчитываются при перемещении ползунка для зафиксированных позиций — от даты сохранения до экспирации.',
    icon: '📊'
  }
];

// Ключ для localStorage
const STORAGE_KEY = 'whatsNewDismissed';

/**
 * Проверяет, нужно ли показывать модальное окно
 * ЗАЧЕМ: Не показывать окно, если пользователь отметил "больше не показывать"
 */
const shouldShowModal = () => {
  try {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (!dismissed) return true;
    
    const data = JSON.parse(dismissed);
    // Показываем окно, если версия изменилась
    return data.version !== CURRENT_VERSION;
  } catch {
    return true;
  }
};

/**
 * Сохраняет выбор пользователя в localStorage
 * ЗАЧЕМ: Запоминаем, что пользователь не хочет видеть это окно для данной версии
 */
const dismissModal = (dontShowAgain) => {
  if (dontShowAgain) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: CURRENT_VERSION,
      dismissedAt: new Date().toISOString()
    }));
  }
};

/**
 * Компонент модального окна "Что нового?"
 * @param {Object} props
 * @param {Function} props.onClose - Callback при закрытии окна
 */
const WhatsNewModal = ({ onClose }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Анимация появления
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Обработчик закрытия
  const handleClose = () => {
    dismissModal(dontShowAgain);
    setIsVisible(false);
    setTimeout(onClose, 200); // Ждём завершения анимации
  };

  return (
    // Затемнённый фон
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      onClick={handleClose}
    >
      {/* Модальное окно */}
      <div 
        className={`bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 transform transition-all duration-200 ${
          isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Заголовок */}
        <div className="relative bg-gradient-to-r from-orange-500 to-amber-400 rounded-t-2xl p-6 text-white">
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-1 rounded-full hover:bg-white/20 transition-colors"
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl">
              <Sparkles size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Что нового?</h2>
              <p className="text-white/80 text-sm">Версия {CURRENT_VERSION}</p>
            </div>
          </div>
        </div>

        {/* Список нововведений */}
        <div className="p-6 max-h-[400px] overflow-y-auto">
          <div className="space-y-4">
            {WHATS_NEW_ITEMS.map((item, index) => (
              <div 
                key={index}
                className="flex gap-4 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <div className="text-2xl flex-shrink-0">{item.icon}</div>
                <div>
                  <h3 className="font-semibold text-gray-900">{item.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Футер с чекбоксом и кнопкой */}
        <div className="border-t border-gray-200 p-4 flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div 
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                dontShowAgain 
                  ? 'bg-primary border-primary' 
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onClick={() => setDontShowAgain(!dontShowAgain)}
            >
              {dontShowAgain && <Check size={14} className="text-white" />}
            </div>
            <span className="text-sm text-gray-600">Больше не показывать</span>
          </label>
          
          <button
            onClick={handleClose}
            className="px-6 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
};

// Экспортируем компонент и функцию проверки
export { WhatsNewModal, shouldShowModal, CURRENT_VERSION };
export default WhatsNewModal;
