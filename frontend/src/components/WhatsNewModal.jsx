/**
 * Компонент модального окна "Что нового?"
 * ЗАЧЕМ: Показывает пользователю нововведения при загрузке страницы калькулятора
 * Затрагивает: UX, информирование пользователей о новых функциях
 */

import React, { useState, useEffect } from 'react';
import { X, Sparkles, Check, Crown } from 'lucide-react';

// Текущая версия приложения
const CURRENT_VERSION = '30';

// Список нововведений для текущей версии
// ЗАЧЕМ: Централизованное хранение информации о новых функциях
const WHATS_NEW_ITEMS = [
  {
    icon: '📊',
    title: 'Финансовый Учет: Еженедельная статистика',
    description: 'Разработан новый функционал для Финансового Учета с полноценной страницей Еженедельная статистика. Добавлены интерактивные виджеты финансовых показателей, автоматический расчет депозита и множество других улучшений для удобного отслеживания ваших результатов. Все данные обновляются в реальном времени и доступны в одном месте.',
    link: 'https://crypto.optioner.online/#weekly',
    linkText: 'Открыть статистику'
  },
  {
    icon: '🎚️',
    title: 'Исправление ползунка "Дней до экспирации"',
    description: 'Устранено некорректное поведение ползунка для выбора количества дней до экспирации опциона. Теперь ползунок работает плавно и точно, обеспечивая корректный расчет всех метрик в зависимости от выбранного периода.'
  },
  {
    icon: '🌍',
    title: 'Исправление IV по часовым поясам',
    description: 'Решена проблема с расхождением Implied Volatility (IV) в разных часовых поясах и зависимостью от локального кэша. Теперь значения IV рассчитываются корректно независимо от вашего местоположения и кэша браузера.'
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
        <div className="relative bg-gradient-to-r from-cyan-400 via-teal-500 to-teal-600 rounded-t-2xl p-6 text-white shadow-lg">
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-1 rounded-full hover:bg-white/20 transition-colors"
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
              <Crown className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-2xl font-bold drop-shadow-md">Что нового?</h2>
              <p className="text-white/90 text-sm font-medium">Версия {CURRENT_VERSION}</p>
            </div>
          </div>
        </div>

        {/* Список нововведений */}
        <div className="p-6 max-h-[400px] overflow-y-auto">
          <div className="space-y-4">
            {WHATS_NEW_ITEMS.map((item, index) => (
              <div 
                key={index}
                className="flex flex-col gap-3 p-5 bg-gradient-to-br from-cyan-50 to-teal-50 rounded-xl border border-cyan-200 hover:shadow-md transition-all"
              >
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    {item.iconUrl ? (
                      <img 
                        src={item.iconUrl} 
                        alt={item.title}
                        className="w-12 h-12 object-contain"
                      />
                    ) : (
                      <div className="text-3xl">{item.icon}</div>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900 text-lg">{item.title}</h3>
                    <p className="text-sm text-gray-700 mt-2 leading-relaxed">{item.description}</p>
                  </div>
                </div>
                {item.link && (
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 border-t border-cyan-300"></div>
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded-lg font-medium hover:from-cyan-600 hover:to-teal-700 transition-all shadow-sm hover:shadow-md"
                    >
                      <span>{item.linkText}</span>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                    <div className="flex-1 border-t border-cyan-300"></div>
                  </div>
                )}
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
