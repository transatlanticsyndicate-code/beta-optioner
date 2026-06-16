import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Bell, Coins } from 'lucide-react';
import ThemeToggle from '../ThemeToggle';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import OptionsDataIndicator from '../OptionsDataIndicator';

// Тикер крипто-актива для кнопки быстрого старта «+КРИПТО».
// ЗАЧЕМ: на платформе крипта живёт как USDT-пара (ETHUSDT) — именно её
// детектирует калькулятор как крипто-режим и открывает Binance Options.
const CRYPTO_QUICKSTART_TICKER = 'ETHUSDT';

/**
 * Проверка, что Универсальный калькулятор сейчас пустой/сброшенный.
 * ЗАЧЕМ: кнопка «+КРИПТО» — это быстрый старт, она нужна только на чистом
 * калькуляторе. Состояние калькулятора живёт в localStorage и URL (так же,
 * как им пользуется расширение), поэтому определяем пустоту по ним.
 */
function isUniversalCalculatorEmpty(location) {
  if (location.pathname !== '/tools/universal-calculator') return false;
  try {
    const params = new URLSearchParams(location.search);
    // Открытие из расширения (?contract=) или загрузка сделки (?config=) — не пусто
    if (params.has('contract') || params.has('config')) return false;
    // Восстановленная из БД конфигурация — не пусто
    if (localStorage.getItem('universalCalc_loadedConfigId')) return false;
    const raw = localStorage.getItem('calculatorState');
    if (raw) {
      const cs = JSON.parse(raw);
      if (cs.selectedTicker || cs.options?.length || cs.positions?.length) return false;
    }
  } catch (e) {
    // При любой ошибке чтения считаем калькулятор пустым — кнопка не навредит
    return true;
  }
  return true;
}

/**
 * Быстрый старт крипто-калькулятора одним кликом.
 * ЗАЧЕМ: повторяем тот же путь, которым в калькулятор попадают данные от
 * расширения Binance — пишем состояние в localStorage и открываем страницу
 * с ?contract=BTCUSDT&price=, после чего штатная инициализация сама включает
 * крипто-режим, ставит тикер, цену и базовый актив. Цену тянем с Binance,
 * чтобы калькулятор сразу отражал рынок; при недоступности биржи цена = 0,
 * но калькулятор всё равно откроется в крипто-режиме.
 */
async function startCryptoCalculator() {
  let price = 0;
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${CRYPTO_QUICKSTART_TICKER}`
    );
    if (res.ok) {
      const data = await res.json();
      price = parseFloat(data.price) || 0;
    }
  } catch (e) {
    // Binance недоступна (гео-блок/сеть) — открываем с нулевой ценой
    console.warn('⚠️ [+КРИПТО] Не удалось получить цену BTC с Binance:', e);
  }

  const position = {
    id: Date.now().toString(),
    type: 'LONG',
    quantity: 1,
    ticker: CRYPTO_QUICKSTART_TICKER,
    price,
    visible: true,
  };
  const state = {
    selectedTicker: CRYPTO_QUICKSTART_TICKER,
    underlyingPrice: price,
    currentPrice: price,
    underlyingPriceConfidence: 'high',
    options: [],
    positions: [position],
  };

  try {
    localStorage.setItem('calculatorState', JSON.stringify(state));
  } catch (e) {
    console.error('❌ [+КРИПТО] Не удалось записать состояние:', e);
  }

  // Полная перезагрузка с ?contract= — так же, как открывает расширение:
  // штатный init-эффект подхватит тикер/цену/позицию и включит крипто-режим.
  window.location.href =
    `/tools/universal-calculator?contract=${CRYPTO_QUICKSTART_TICKER}&price=${price}`;
}

function TopNav() {
  const location = useLocation();
  const [isStartingCrypto, setIsStartingCrypto] = useState(false);
  const showCryptoButton = isUniversalCalculatorEmpty(location);

  const handleAddCrypto = async () => {
    if (isStartingCrypto) return;
    setIsStartingCrypto(true);
    try {
      await startCryptoCalculator();
    } catch (e) {
      console.error('❌ [+КРИПТО] Ошибка запуска крипто-калькулятора:', e);
      setIsStartingCrypto(false);
    }
  };

  // Определяем заголовок страницы на основе пути
  const getPageTitle = (pathname) => {
    switch (pathname) {
      case '/':
        return 'Главная';
      case '/tools/new-deal':
        return 'Сделка';
      case '/tools/deals-archive':
        return 'Архив сделок';
      case '/tools/options-calculator':
        return 'Калькулятор опционов на АКЦИИ';
      case '/tools/universal-calculator':
        return 'Универсальный Калькулятор Опционов';
      case '/tools/saved-configurations':
        return 'Сохраненные конфигурации';
      case '/tools/universal-saved-configurations':
        return 'Сохранения из Универсального калькулятора (Local)';
      case '/tools/db-saved-configurations':
        return 'Сохранения из БД (доступны всем)';
      case '/tools/gradual-strategy-calculator':
        return 'Градуальный калькулятор';
      case '/tools/options-analyzer':
        return 'Анализ опционов';
      case '/reports-archive':
        return 'Архив отчетов';
      case '/tools/crypto-rating':
        return 'Рейтинг криптовалют';
      case '/tools/test-chart':
        return 'Тестовый график';
      case '/settings':
        return 'Настройки';
      case '/help':
        return 'Помощь';
      default:
        return 'Опционные Стратегии';
    }
  };

  const pageTitle = getPageTitle(location.pathname);
  return (
    <nav className="px-3 sm:px-6 flex items-center justify-between border-b border-border h-full bg-muted/30">
      <div className="flex items-center gap-3 min-w-0">
        <div className="font-medium text-base hidden sm:flex items-center space-x-3 truncate max-w-[600px]">
          <span className="text-foreground">{pageTitle}</span>
          {location.pathname === '/tools/options-calculator' && (
            <span className="text-sm text-cyan-500 font-medium">v37</span>
          )}
          {location.pathname === '/tools/universal-calculator' && (
            <span className="text-sm text-cyan-500 font-medium">v43</span>
          )}
        </div>

        {/* Быстрый старт крипто-калькулятора.
            ЗАЧЕМ: появляется только на пустом/сброшенном Универсальном калькуляторе,
            одним кликом включает крипто-режим с тикером BTCUSDT и базовым активом.
            Вынесена из контейнера заголовка, чтобы её не обрезал truncate/max-width. */}
        {showCryptoButton && (
          <Button
            size="sm"
            onClick={handleAddCrypto}
            disabled={isStartingCrypto}
            className="h-8 shrink-0 hidden sm:inline-flex bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-medium transition-all duration-150 hover:scale-105 active:scale-95"
            title="Открыть калькулятор в крипто-режиме (ETHUSDT)"
          >
            <Coins className="h-4 w-4 mr-1" />
            {isStartingCrypto ? 'Загрузка…' : '+КРИПТО'}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-4 ml-auto sm:ml-0">
        {/* Индикаторы статуса данных Massive API - УБРАНО */}
        {/* <OptionsDataIndicator /> */}

        {/* Notifications - УБРАНО */}
        {/* <button
          type="button"
          className="relative p-1.5 sm:p-2 hover:bg-accent rounded-full transition-colors"
          title="Уведомления"
        >
          <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
          <span className="absolute top-0 right-0 h-2 w-2 bg-primary rounded-full"></span>
        </button> */}

        {/* Theme Toggle */}
        {/* <ThemeToggle /> */}

        {/* User Menu отключён: аутентификация снята, портал открыт для всех */}
      </div>
    </nav>
  );
}

export default TopNav;
