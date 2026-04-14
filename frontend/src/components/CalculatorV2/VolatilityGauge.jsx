import React from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Button } from '../ui/button';

/**
 * Блок волатильности в стиле barchart.com — спидометр + таблица метрик
 * ЗАЧЕМ: Полный обзор волатильности актива в вертикальном формате
 */

// SVG спидометр с цветными зонами и стрелкой
function GaugeMeter({ value }) {
  // value: 0-100 (IV Rank)
  const clampedValue = Math.max(0, Math.min(100, value || 0));

  const cx = 150, cy = 130, r = 100;
  // Дуга 270°: от 135° (нижний левый) до 45° (нижний правый) по часовой стрелке
  // В SVG: 0° = вправо (3 o'clock), углы растут по часовой стрелке
  // 0% = 135° (SVG), 100% = 405° (= 45°) (SVG)
  const startDeg = 135; // 0% — нижний левый
  const totalSweep = 270; // полный размах дуги

  // Процент → угол SVG (в градусах, по часовой от 3 o'clock)
  const pctToSvgDeg = (pct) => startDeg + (pct / 100) * totalSweep;

  // Угол SVG → точка на окружности
  const svgPoint = (deg) => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  // Цветовые зоны
  const zones = [
    { from: 0, to: 20, color: '#dc2626' },
    { from: 20, to: 40, color: '#f97316' },
    { from: 40, to: 60, color: '#eab308' },
    { from: 60, to: 80, color: '#84cc16' },
    { from: 80, to: 100, color: '#22c55e' },
  ];

  // Стрелка: угол и конец
  const needleDeg = pctToSvgDeg(clampedValue);
  const needleLen = r - 18;
  const needleRad = (needleDeg * Math.PI) / 180;
  const nx = cx + needleLen * Math.cos(needleRad);
  const ny = cy + needleLen * Math.sin(needleRad);

  return (
    <svg viewBox="0 0 300 175" className="w-full max-w-[260px] mx-auto">
      {/* Цветные дуги */}
      {zones.map((zone, i) => {
        const d1 = pctToSvgDeg(zone.from);
        const d2 = pctToSvgDeg(zone.to);
        const p1 = svgPoint(d1);
        const p2 = svgPoint(d2);
        const sweep = (d2 - d1) > 180 ? 1 : 0;
        return (
          <path
            key={i}
            d={`M ${p1.x} ${p1.y} A ${r} ${r} 0 ${sweep} 1 ${p2.x} ${p2.y}`}
            fill="none"
            stroke={zone.color}
            strokeWidth="18"
            strokeLinecap="butt"
          />
        );
      })}

      {/* Стрелка */}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#1f2937" strokeWidth="3" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="6" fill="#1f2937" />

      {/* Текст IV Rank — под центром */}
      <text x={cx} y={cy + 22} textAnchor="middle" fill="#6b7280" fontSize="11" fontWeight="500">
        IV Rank:
      </text>
      <text x={cx} y={cy + 40} textAnchor="middle" fill="#111827" fontSize="18" fontWeight="700">
        {value != null ? `${value.toFixed(1)}%` : '—'}
      </text>
    </svg>
  );
}

// Цветная шкала IV Percentile
function PercentileBar({ value }) {
  const clampedValue = Math.max(0, Math.min(100, value || 0));

  return (
    <div className="w-full">
      <div className="relative h-5 rounded-full overflow-hidden" style={{
        background: 'linear-gradient(to right, #dc2626, #f97316, #eab308, #84cc16, #22c55e)'
      }}>
        {/* Серая заливка справа от значения */}
        <div
          className="absolute top-0 right-0 h-full bg-gray-200"
          style={{ width: `${100 - clampedValue}%` }}
        />
        {/* Шкала процентов */}
        <div className="absolute inset-0 flex items-center justify-between px-2">
          {[0, 20, 40, 60, 80, 100].map(tick => (
            <span key={tick} className="text-[9px] font-medium text-white drop-shadow-sm">{tick}%</span>
          ))}
        </div>
      </div>
      <div className="text-center mt-1">
        <span className="text-xs text-gray-500">IV Percentile: </span>
        <span className="text-xs font-bold text-gray-800">{value != null ? `${value.toFixed(1)}%` : '—'}</span>
      </div>
    </div>
  );
}

// Строка таблицы метрик
function MetricRow({ items }) {
  return (
    <div className={`grid gap-2 py-2 border-t border-gray-100`} style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map((item, i) => (
        <div key={i}>
          <div className="text-[10px] text-gray-500 font-medium">{item.label}</div>
          <div className="text-sm font-semibold text-gray-800">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function VolatilityGauge({ data = null, loading = false, onRefresh, lastUpdated = null }) {
  const fmt = (v) => v != null ? `${v.toFixed(2)}%` : '—';
  const fmtChange = (v) => {
    if (v == null) return '';
    const sign = v >= 0 ? '+' : '';
    return `(${sign}${v.toFixed(2)}%)`;
  };

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Заголовок + кнопка обновить */}
      <div className="flex items-center justify-between" style={{ marginBottom: '0.5rem' }}>
        <div className="flex items-center gap-2">
          <img
            src="https://www.barchart.com/cmdty/img/cmdtyexchange/barchart-logo.png"
            alt="Barchart"
            style={{ height: '1.8rem' }}
            className="opacity-60"
          />
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {new Date(lastUpdated).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })}{' '}
              {new Date(lastUpdated).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {onRefresh && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    className="h-7 w-7 p-0 bg-cyan-400 hover:bg-cyan-500 text-white transition-all duration-200 hover:scale-105 active:scale-95"
                    onClick={onRefresh}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p className="text-sm">Обновить данные волатильности</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Спидометр */}
      <GaugeMeter value={data?.ivRank} />

      {/* Шкала IV Percentile */}
      <div className="mt-1 mb-3">
        <PercentileBar value={data?.ivPercentile} />
      </div>

      {/* Таблица метрик */}
      <div className="flex-1">
        <MetricRow items={[
          { label: 'Implied Volatility', value: <>{fmt(data?.impliedVolatility)} <span className={`text-[10px] ${(data?.ivChange || 0) < 0 ? 'text-red-500' : 'text-green-500'}`}>{fmtChange(data?.ivChange)}</span></> },
          { label: 'Historical Volatility', value: fmt(data?.historicVolatility) },
          { label: 'IV/HV', value: data?.ivHvRatio != null ? data.ivHvRatio.toFixed(2) : '—' },
        ]} />

        <MetricRow items={[
          { label: '5D IV Avg', value: fmt(data?.ivAvg5D) },
          { label: '1M IV Avg', value: fmt(data?.ivAvg1M) },
          { label: '3M IV Avg', value: fmt(data?.ivAvg3M) },
        ]} />

        <MetricRow items={[
          { label: 'IV 3-Month Low', value: <>{fmt(data?.ivLow3m)} <span className="text-[9px] text-gray-400">{data?.ivLow3mDate ? `on ${data.ivLow3mDate}` : ''}</span></> },
          { label: 'IV 3-Month High', value: <>{fmt(data?.ivHigh3m)} <span className="text-[9px] text-gray-400">{data?.ivHigh3mDate ? `on ${data.ivHigh3mDate}` : ''}</span></> },
        ]} />

        <MetricRow items={[
          { label: 'IV 52-Week Low', value: <>{fmt(data?.ivLow52w)} <span className="text-[9px] text-gray-400">{data?.ivLow52wDate ? `on ${data.ivLow52wDate}` : ''}</span></> },
          { label: 'IV 52-Week High', value: <>{fmt(data?.ivHigh52w)} <span className="text-[9px] text-gray-400">{data?.ivHigh52wDate ? `on ${data.ivHigh52wDate}` : ''}</span></> },
        ]} />
      </div>
    </div>
  );
}

export default VolatilityGauge;
