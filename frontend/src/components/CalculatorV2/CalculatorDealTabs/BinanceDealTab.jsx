/**
 * Компонент таба "Сделка" для опционов Binance (крипто)
 * ЗАЧЕМ: Для криптовалютных опционов Binance нужен специализированный калькулятор P&L
 *        с 4 срезками по Black-Scholes, заменяющий стандартный таб Сделка
 * Затрагивает: CalculatorDealTabs — используется вместо стандартного таба при режиме CRYPTO
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent } from '../../ui/card';

// ─── Black-Scholes математика ─────────────────────────────────────────────────

/**
 * Функция ошибок (аппроксимация Абрамовица и Стегана)
 * ЗАЧЕМ: Нужна для вычисления нормального CDF
 */
function erf(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-ax * ax);
  return sign * y;
}

/**
 * CDF стандартного нормального распределения
 */
function normCDF(x) {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

/**
 * Расчёт цены опциона по модели Black-Scholes
 * @param {number} S — текущая цена актива
 * @param {number} K — страйк
 * @param {number} T — время до экспирации в годах
 * @param {number} r — безрисковая ставка (дробь)
 * @param {number} sigma — волатильность IV (дробь)
 * @param {string} type — 'call' | 'put'
 */
function blackScholes(S, K, T, r, sigma, type) {
  // При T=0 — внутренняя стоимость
  if (T <= 0) {
    return type === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);
  }
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  if (type === 'call') {
    return S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
  }
  return K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);
}

// ─── Вспомогательные функции для работы с датами ──────────────────────────────

/** Сегодняшняя дата без времени */
function today() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Конвертация Date в строку YYYY-MM-DD (локальное время, без смещения UTC) */
function toYMD(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Добавление N дней к дате */
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// ─── Конфигурация 4 срезок по умолчанию ──────────────────────────────────────

const SLICE_DEFAULTS = [
  { days: 30,  pct: 10  },
  { days: 60,  pct: 25  },
  { days: 90,  pct: 50  },
  { days: 120, pct: 100 },
];

// ─── Компонент поля ввода ─────────────────────────────────────────────────────

/**
 * FieldInput — единое поле ввода с лейблом
 */
function FieldInput({ label, id, type = 'number', value, onChange, onBlur, step, min, max, placeholder, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium"
      >
        {label}
      </label>
      {children || (
        <input
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          step={step}
          min={min}
          max={max}
          placeholder={placeholder}
          className="h-9 w-full rounded-md border border-border bg-muted/30 px-3 text-sm
                     focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500
                     transition-colors"
        />
      )}
    </div>
  );
}

// ─── Компонент карточки результата срезки ────────────────────────────────────

/**
 * MetricBadge — отдельная метрика в строке результатов
 */
function MetricBadge({ label, value, variant = 'neutral' }) {
  const colorMap = {
    neutral: 'text-foreground',
    profit: 'text-green-600 dark:text-green-400',
    loss: 'text-red-600 dark:text-red-400',
    accent: 'text-green-600 dark:text-green-400',
  };
  return (
    <div className="flex flex-col items-center min-w-[90px]">
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground mb-1">{label}</span>
      <span className={`text-sm font-bold ${colorMap[variant]}`}>{value}</span>
    </div>
  );
}

// ─── Компонент одной срезки ───────────────────────────────────────────────────

/**
 * SliceCard — карточка одной срезки (1–4)
 * ЗАЧЕМ: Отображает поля ввода и рассчитанные результаты для конкретного временного сценария
 */
function SliceCard({ index, params, onParamsChange, result, animDelay, remainingQty }) {
  const n = index + 1;

  const handleDaysChange = useCallback((e) => {
    const days = parseInt(e.target.value) || 0;
    onParamsChange(index, {
      days,
      date: toYMD(addDays(today(), days)),
    });
  }, [index, onParamsChange]);

  const handleDateChange = useCallback((e) => {
    const dateVal = e.target.value;
    if (!dateVal) return;
    const diffMs = new Date(dateVal) - today();
    const days = Math.round(diffMs / 86400000);
    onParamsChange(index, { date: dateVal, days });
  }, [index, onParamsChange]);

  const handleSpotChange = useCallback((e) => {
    onParamsChange(index, { sspot: e.target.value });
  }, [index, onParamsChange]);

  // При вводе qty вручную — сохраняем qty и пересчитываем pct обратно
  const handleQtyChange = useCallback((e) => {
    const qty = e.target.value;
    const qtyNum = parseInt(qty) || 0;
    const pct = remainingQty > 0 && qtyNum > 0
      ? String(Math.round((qtyNum / remainingQty) * 100))
      : params.pct;
    onParamsChange(index, { qty, pct });
  }, [index, onParamsChange, remainingQty, params.pct]);

  // При вводе % — вычисляем qty от остатка
  const handlePctChange = useCallback((e) => {
    const pct = e.target.value;
    const pctNum = parseFloat(pct) || 0;
    const qty = remainingQty > 0
      ? String(Math.max(1, Math.round(remainingQty * pctNum / 100)))
      : '';
    onParamsChange(index, { pct, qty });
  }, [index, onParamsChange, remainingQty]);

  return (
    <Card
      className="w-full border-l-[3px]"
      style={{
        borderLeftColor: '#06b6d4',
        animation: `slideUpFade 0.5s ease ${animDelay}s both`,
      }}
    >
      <CardContent className="pt-5 pb-5 px-6">
        <div className="flex gap-5 items-start">
          {/* Большой номер срезки */}
          <div
            className="text-[34px] leading-none font-bold select-none shrink-0 mt-1 text-muted-foreground/30"
          >
            {n}
          </div>

          {/* Основное содержимое */}
          <div className="flex-1 min-w-0">
            {/* Поля ввода: grid 3 колонки */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {/* Кол-во контрактов + % от остатка */}
              <FieldInput label="Кол-во контр." id={`binance-qty-${n}`}>
                <div className="flex gap-1.5">
                  <input
                    id={`binance-qty-${n}`}
                    type="number"
                    value={params.qty}
                    onChange={handleQtyChange}
                    step="1"
                    min="1"
                    placeholder="—"
                    className="flex-1 h-9 min-w-0 rounded-md border border-border bg-muted/30 px-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500
                               transition-colors"
                  />
                  <div className="relative w-[64px]">
                    <input
                      type="number"
                      value={params.pct ?? ''}
                      onChange={handlePctChange}
                      step="1"
                      min="1"
                      max="100"
                      placeholder="%"
                      className="h-9 w-full rounded-md border border-border bg-muted/30 pl-2 pr-5 text-xs text-center
                                 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500
                                 transition-colors"
                    />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">%</span>
                  </div>
                </div>
              </FieldInput>

              {/* Цена актива на срезку */}
              <FieldInput
                label="Цена актива на срезку"
                id={`binance-sspot-${n}`}
                value={params.sspot}
                onChange={handleSpotChange}
                step="1"
                min="0"
                placeholder=""
              />

              {/* Дата + дни */}
              <FieldInput label="Дата срезки / Дней от сегодня" id={`binance-sdate-${n}`}>
                <div className="flex gap-1.5">
                  <input
                    id={`binance-sdate-${n}`}
                    type="date"
                    value={params.date}
                    onChange={handleDateChange}
                    className="flex-1 h-9 min-w-0 rounded-md border border-border bg-muted/30 px-2 text-xs
                               focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500
                               transition-colors"
                  />
                  <input
                    type="number"
                    value={params.days}
                    onChange={handleDaysChange}
                    step="30"
                    min="0"
                    className="w-[68px] h-9 rounded-md border border-border bg-muted/30 px-2 text-xs text-center
                               focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500
                               transition-colors"
                  />
                </div>
              </FieldInput>
            </div>

            {/* Строка результатов */}
            {result && (
              <div className="flex flex-wrap gap-2 items-center px-4 py-3 bg-muted/20 rounded-lg border border-border">
                <MetricBadge
                  label="Цена опциона"
                  value={`${Math.round(result.scenPrice).toLocaleString('ru-RU')} $`}
                  variant="neutral"
                />
                <div className="w-px h-8 bg-border shrink-0" />
                <MetricBadge
                  label="P&L / контракт"
                  value={`${result.pnlPer >= 0 ? '+' : ''}${Math.round(result.pnlPer).toLocaleString('ru-RU')} $`}
                  variant={result.pnlPer >= 0 ? 'profit' : 'loss'}
                />
                <div className="w-px h-8 bg-border shrink-0" />
                <MetricBadge
                  label={`Итого P&L ×${result.qty}`}
                  value={`${result.totalPnl >= 0 ? '+' : ''}${Math.round(result.totalPnl).toLocaleString('ru-RU')} $`}
                  variant={result.totalPnl >= 0 ? 'profit' : 'loss'}
                />
                <div className="w-px h-8 bg-border shrink-0" />
                <MetricBadge
                  label="Дней прошло"
                  value={`${result.daysPassed}д`}
                  variant="neutral"
                />
                <MetricBadge
                  label="До экспирации"
                  value={`${result.daysLeft}д`}
                  variant="neutral"
                />
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Главный компонент BinanceDealTab ─────────────────────────────────────────

/**
 * BinanceDealTab — таб "Сделка" для опционов Binance
 * ЗАЧЕМ: Специализированный калькулятор P&L для крипто-опционов с 4 временными срезками
 *        Использует Black-Scholes (безрисковая ставка = 0 по умолчанию для крипто)
 * @param {string} ticker — тикер актива (например, ETHUSDT)
 * @param {number} currentPrice — текущая цена актива из калькулятора
 */
function BinanceDealTab({ ticker = 'ETHUSDT', currentPrice = 0, options = [] }) {
  // Ключ хранилища привязан к тикеру — разные инструменты не перезаписывают друг друга
  const storageKey = `binanceDealTab_${ticker}`;

  // Загружаем сохранённое состояние из localStorage (если есть)
  // ЗАЧЕМ: Данные сохраняются между перезагрузками страницы
  const loadSaved = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };

  const saved = loadSaved();

  // ── Параметры позиции ────────────────────────────────────────────────────────
  const [optType, setOptType] = useState(saved?.optType ?? 'call');
  const [spot, setSpot] = useState(saved?.spot ?? '');
  const [strike, setStrike] = useState(saved?.strike ?? '');
  const [buyDate, setBuyDate] = useState(saved?.buyDate ?? toYMD(today()));
  const [expiry, setExpiry] = useState(saved?.expiry ?? '');
  const [premium, setPremium] = useState(saved?.premium ?? '');
  const [iv, setIv] = useState(saved?.iv ?? '');
  const [rf, setRf] = useState(saved?.rf ?? '3.7');
  const [qtyGlobal, setQtyGlobal] = useState(saved?.qtyGlobal ?? '');

  // ── State срезок ─────────────────────────────────────────────────────────────
  // ЗАЧЕМ: Каждая срезка хранит свои входные данные (qty, sspot, date, days)
  const [slices, setSlices] = useState(() => {
    if (saved?.slices) return saved.slices;
    return SLICE_DEFAULTS.map((def) => ({
      qty: '',
      pct: String(def.pct),
      sspot: '',
      date: toYMD(addDays(today(), def.days)),
      days: def.days,
    }));
  });

  // Сохраняем всё состояние в localStorage при любом изменении
  // ЗАЧЕМ: Данные не теряются при перезагрузке страницы
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        optType, spot, strike, buyDate, expiry, premium, iv, rf, qtyGlobal, slices,
      }));
    } catch {}
  }, [optType, spot, strike, buyDate, expiry, premium, iv, rf, qtyGlobal, slices]);

  // Синхронизируем spot с currentPrice при каждом изменении
  // ЗАЧЕМ: При открытии новой сделки цена актива всегда актуальна
  useEffect(() => {
    if (currentPrice > 0) {
      setSpot(Number(currentPrice).toFixed(2));
    }
  }, [currentPrice]);

  // Предзаполняем sspot в срезках: каждая +20% от предыдущей, округление до сотни
  // ЗАЧЕМ: Пользователь сразу видит реалистичные сценарии без ручного ввода
  useEffect(() => {
    const basePrice = parseFloat(spot);
    if (!basePrice || basePrice <= 0) return;
    setSlices((prev) => {
      let prevPrice = basePrice;
      return prev.map((s) => {
        // Не перезаписываем если пользователь уже ввёл вручную
        const newPrice = Math.round((prevPrice * 1.2) / 100) * 100;
        prevPrice = newPrice;
        return s.sspot !== '' ? s : { ...s, sspot: String(newPrice) };
      });
    });
  }, [spot]);

  // Пересчитываем qty во всех срезках при изменении qtyGlobal
  // ЗАЧЕМ: При загрузке/новой сделке qty должен вычисляться из pct автоматически
  useEffect(() => {
    const total = parseInt(qtyGlobal) || 0;
    if (total <= 0) return;
    setSlices((prev) => {
      let usedSoFar = 0;
      return prev.map((s) => {
        const remaining = Math.max(0, total - usedSoFar);
        const pctNum = parseFloat(s.pct) || 0;
        const qty = pctNum > 0 && remaining > 0
          ? String(Math.max(1, Math.round(remaining * pctNum / 100)))
          : s.qty;
        usedSoFar += parseInt(qty) || 0;
        return { ...s, qty };
      });
    });
  }, [qtyGlobal]);

  // Извлекаем конкретные поля Buy CALL — useEffect срабатывает только при их изменении
  // ЗАЧЕМ: Зависимость от примитивов, а не от ссылки на массив — надёжная синхронизация
  const callOpt = options.find(
    (o) => o.visible !== false && o.action === 'Buy' && o.type === 'CALL'
  ) || null;
  const callStrike   = callOpt?.strike ?? null;
  const callDate     = callOpt?.date ?? null;
  // Если Ask изменён вручную — берём customAsk, иначе оригинальный ask
  const callAsk      = callOpt ? (callOpt.isAskModified ? callOpt.customAsk : callOpt.ask) ?? null : null;
  const callIv       = callOpt?.impliedVolatility || callOpt?.iv || null;
  const callQty      = callOpt?.quantity ?? null;

  useEffect(() => {
    if (!callOpt) return;
    if (callStrike)            setStrike(String(callStrike));
    if (callDate)              setExpiry(callDate);
    if (callAsk)               setPremium(Number(callAsk).toFixed(2));
    // IV хранится как число в процентах (73.01 = 73.01%) — используем как есть
    if (callIv)                setIv(String(parseFloat(Number(callIv).toFixed(1))));
    if (callQty)               setQtyGlobal(String(Math.abs(callQty)));
  }, [callStrike, callDate, callAsk, callIv, callQty]);

  // ── Обновление параметров срезки ──────────────────────────────────────────────
  const handleSliceChange = useCallback((index, updates) => {
    setSlices((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  }, []);

  // ── Расчёт результата для одной срезки ───────────────────────────────────────
  // ЗАЧЕМ: Black-Scholes расчёт P&L для каждого временного сценария
  const calcSliceResult = useCallback(
    (sliceParams, sliceIndex) => {
      const K = parseFloat(strike);
      const prem = parseFloat(premium);
      const sigma = parseFloat(iv) / 100;
      const r = parseFloat(rf) / 100;
      // Поля "Кол-во контр." и "Цена актива на срезку" обязательны для отображения результатов
      if (sliceParams.qty === '' || sliceParams.sspot === '') return null;

      const scenSpot = parseFloat(sliceParams.sspot);
      const qtyLocal = parseInt(sliceParams.qty) || 1;

      // Проверка: все обязательные поля заполнены
      if (!K || !prem || !sigma || !scenSpot || !sliceParams.date || !expiry || !buyDate) {
        return null;
      }

      const expDate = new Date(expiry);
      const scenDate = new Date(sliceParams.date);
      const buyDateObj = new Date(buyDate);

      // T в годах от даты срезки до даты экспирации
      const T_scen = Math.max((expDate - scenDate) / 1000 / 86400 / 365, 0);

      const scenPrice = blackScholes(scenSpot, K, T_scen, r, sigma, optType);
      const pnlPer = scenPrice - prem;
      const totalPnl = pnlPer * qtyLocal;
      const breakeven = optType === 'call' ? K + prem : K - prem;
      const daysPassed = Math.round((scenDate - buyDateObj) / 1000 / 86400);
      const daysLeft = Math.round((expDate - scenDate) / 1000 / 86400);

      return {
        scenPrice,
        pnlPer,
        totalPnl,
        qty: qtyLocal,
        breakeven,
        daysPassed,
        daysLeft,
      };
    },
    [optType, spot, strike, expiry, premium, iv, rf, qtyGlobal, buyDate]
  );

  // ── Рендер ────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full space-y-3">
      {/* Стиль анимации для срезок */}
      <style>{`
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── Блок 1: Параметры позиции ─────────────────────────────────────── */}
      <Card className="w-full" style={{ animation: 'slideUpFade 0.4s ease 0.05s both' }}>
        <CardContent className="pt-5 pb-5 px-6">
          {/* Заголовок блока */}
          <div className="text-[11px] uppercase tracking-[2px] text-muted-foreground mb-4">
            // Параметры позиции{ticker ? ` — ${ticker}` : ''}
          </div>

          {/* Сетка: 9 колонок (адаптивная) */}
          <div className="grid grid-cols-9 gap-3 items-end max-[900px]:grid-cols-4 max-[500px]:grid-cols-2">
            {/* Тип опциона */}
            <FieldInput label="Тип">
              <select
                value={optType}
                onChange={(e) => setOptType(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-muted/30 px-3 text-sm
                           focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500
                           transition-colors"
              >
                <option value="call">CALL</option>
                <option value="put">PUT</option>
              </select>
            </FieldInput>

            {/* Цена актива */}
            <FieldInput
              label="Цена актива"
              value={spot}
              onChange={(e) => setSpot(e.target.value)}
              step="1"
              min="0"
            />

            {/* Страйк */}
            <FieldInput
              label="Страйк"
              value={strike}
              onChange={(e) => setStrike(e.target.value)}
              step="1"
              min="0"
            />

            {/* Дата покупки */}
            <FieldInput label="Дата покупки">
              <input
                type="date"
                value={buyDate}
                onChange={(e) => setBuyDate(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-muted/30 px-3 text-xs
                           focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500
                           transition-colors"
              />
            </FieldInput>

            {/* Дата эксп. */}
            <FieldInput label="Дата эксп.">
              <input
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-muted/30 px-3 text-xs
                           focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500
                           transition-colors"
              />
            </FieldInput>

            {/* Премия */}
            <FieldInput
              label="Премия (USDT)"
              value={premium}
              onChange={(e) => setPremium(e.target.value)}
              onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setPremium(v.toFixed(2)); }}
              step="0.01"
              min="0"
            />

            {/* IV */}
            <FieldInput
              label="IV (% год.)"
              value={iv}
              onChange={(e) => setIv(e.target.value)}
              step="1"
              min="1"
              max="500"
            />

            {/* Безрисковая ставка */}
            <FieldInput
              label="Ставка (%)"
              value={rf}
              onChange={(e) => setRf(e.target.value)}
              step="0.1"
            />

            {/* Кол-во контрактов */}
            <FieldInput
              label="Кол-во контр."
              value={qtyGlobal}
              onChange={(e) => setQtyGlobal(e.target.value)}
              step="1"
              min="1"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Блоки 2–5: Срезки ─────────────────────────────────────────────────── */}
      {(() => {
        // Определяем максимальное количество срезок
        // ЗАЧЕМ: Если контрактов 2 — максимум 2 срезки, если дата срезки > expiry — не показываем
        const totalQtyNum = parseInt(qtyGlobal) || 0;
        const expiryDate = expiry ? new Date(expiry) : null;
        
        // Фильтруем срезки: не больше qtyGlobal и дата срезки <= expiry
        const validSlices = slices.filter((s, idx) => {
          // Ограничение по количеству: индекс < qtyGlobal (если qty=2, показываем срезки 0 и 1)
          if (totalQtyNum > 0 && idx >= totalQtyNum) return false;
          
          // Ограничение по дате: срезка должна быть до экспирации
          if (expiryDate && s.date) {
            const sliceDate = new Date(s.date);
            if (sliceDate > expiryDate) return false;
          }
          
          return true;
        });

        return validSlices.map((sliceParams, displayIdx) => {
          // Находим оригинальный индекс в массиве slices
          const originalIdx = slices.indexOf(sliceParams);
          
          // Вычисляем остаток контрактов: totalQty минус суммы предыдущих срезок
          const usedBefore = slices
            .slice(0, originalIdx)
            .reduce((sum, s) => sum + (parseInt(s.qty) || 0), 0);
          const remainingQty = Math.max(0, totalQtyNum - usedBefore);
          
          return (
            <SliceCard
              key={originalIdx}
              index={originalIdx}
              params={sliceParams}
              onParamsChange={handleSliceChange}
              result={calcSliceResult(sliceParams, originalIdx)}
              animDelay={0.1 + displayIdx * 0.07}
              remainingQty={remainingQty}
            />
          );
        });
      })()}

      {/* ── Итоговый блок ────────────────────────────────────────────────── */}
      {(() => {
        // Суммируем totalPnl только для срезок, где результат есть (оба поля заполнены)
        const results = slices.map((s, i) => calcSliceResult(s, i)).filter(Boolean);
        if (results.length === 0) return null;
        const grandTotal = results.reduce((sum, r) => sum + r.totalPnl, 0);
        const totalQty = results.reduce((sum, r) => sum + r.qty, 0);
        const isProfit = grandTotal >= 0;
        return (
          <Card
            className="w-full border-l-[3px]"
            style={{ borderLeftColor: isProfit ? '#22c55e' : '#ef4444', animation: 'slideUpFade 0.5s ease 0.45s both' }}
          >
            <CardContent className="pt-4 pb-4 px-6">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] uppercase tracking-[2px] text-muted-foreground">
                    Итого по {results.length} срезкам
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {totalQty} контр.
                  </span>
                </div>
                <span className={`text-xl font-bold ${
                  isProfit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {isProfit ? '+' : ''}{Math.round(grandTotal).toLocaleString('ru-RU')} $
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}

export default BinanceDealTab;
