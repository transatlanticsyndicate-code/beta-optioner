import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';

/**
 * StrategyScale - Шкала стратегии
 * ЗАЧЕМ: Визуализация шкалы страйков для построения стратегии с флажком Target Price
 * Упрощенная версия StrikeScale: только шкала с флажком таргета, без столбцов OI/Volume
 * Затрагивает: визуализация стратегии, целевая цена
 */

function StrategyScale({ 
  currentPrice = 0, 
  ticker = 'SPX', 
  targetPrice: externalTargetPrice,
  onTargetPriceChange,
  options = [],      // Опционы (call/put с action Buy/Sell)
  positions = [],    // Позиции базового актива (long/short)
}) {
  
  // Ref для контейнера шкалы (для drag-scroll)
  const containerRef = useRef(null);
  
  // State для drag-scroll
  const [isDraggingScroll, setIsDraggingScroll] = useState(false);
  const [scrollStartX, setScrollStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  
  // State для Target Price (по умолчанию = текущая цена)
  const [internalTargetPrice, setInternalTargetPrice] = useState(currentPrice);
  
  // State для перетаскивания флажка Target Price
  const [isDraggingTarget, setIsDraggingTarget] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [previewPrice, setPreviewPrice] = useState(null);
  
  // State для перетаскивания концов линий позиций
  const [draggingLineEnd, setDraggingLineEnd] = useState(null); // { lineId, end: 'start' | 'end' }
  
  // Позиции концов линий - загружаем из localStorage при инициализации
  const [lineEndPositions, setLineEndPositions] = useState(() => {
    try {
      const saved = localStorage.getItem('strategyScaleLineEndPositions');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  
  // Сохраняем позиции концов линий в localStorage при изменении
  useEffect(() => {
    if (Object.keys(lineEndPositions).length > 0) {
      localStorage.setItem('strategyScaleLineEndPositions', JSON.stringify(lineEndPositions));
    }
  }, [lineEndPositions]);
  
  // Используем внешний targetPrice если передан, иначе внутренний
  const targetPrice = externalTargetPrice !== undefined ? externalTargetPrice : internalTargetPrice;
  
  // Обновляем внутренний targetPrice при изменении currentPrice (только если не задан внешний)
  useEffect(() => {
    if (externalTargetPrice === undefined && currentPrice > 0 && internalTargetPrice === 0) {
      setInternalTargetPrice(currentPrice);
    }
  }, [currentPrice, externalTargetPrice, internalTargetPrice]);
  
  // ========================================
  // ДИНАМИЧЕСКИЙ ДИАПАЗОН СТРАЙКОВ
  // ========================================
  
  // Рассчитываем диапазон ВОКРУГ ТЕКУЩЕЙ ЦЕНЫ для отображения шкалы
  // ВАЖНО: Точно такой же расчет как в StrikeScale
  const strikeRange = useMemo(() => {
    // Если нет цены - не показываем шкалу
    if (currentPrice <= 0) {
      return null;
    }
    
    // Определяем шаг страйка в зависимости от цены
    const strikeStep = currentPrice > 1000 ? 5 : 1; // SPX=5, SPY=1
    
    // ФИКСИРОВАННЫЙ широкий диапазон вокруг текущей цены
    const totalStrikes = 400; // Широкий диапазон для отображения всех данных рынка
    const halfStrikes = Math.floor(totalStrikes / 2);
    const centerStrike = Math.round(currentPrice / strikeStep) * strikeStep;
    const minStrike = centerStrike - (halfStrikes * strikeStep);
    const maxStrike = centerStrike + (halfStrikes * strikeStep);
    
    return { min: minStrike, max: maxStrike, count: totalStrikes, step: strikeStep };
  }, [currentPrice]);
  
  // Автоцентрирование шкалы по Target Price (только при первой загрузке)
  const [hasCentered, setHasCentered] = useState(false);
  
  useEffect(() => {
    if (!containerRef.current || !strikeRange || targetPrice <= 0 || hasCentered) return;
    
    // Небольшая задержка для рендера
    const timer = setTimeout(() => {
      if (!containerRef.current) return;
      
      const container = containerRef.current;
      const containerWidth = container.offsetWidth;
      
      // Вычисляем позицию Target Price на шкале
      const index = (targetPrice - strikeRange.min) / strikeRange.step;
      const targetPosition = index * 6 + 1.5;
      
      // Центрируем так, чтобы Target Price был в центре видимой области
      const scrollPosition = targetPosition - (containerWidth / 2);
      container.scrollLeft = Math.max(0, scrollPosition);
      
      setHasCentered(true);
    }, 100);
    
    return () => clearTimeout(timer);
  }, [targetPrice, strikeRange, hasCentered]);
  
  // ========================================
  // ОБРАБОТЧИКИ ПЕРЕТАСКИВАНИЯ TARGET PRICE
  // ========================================
  
  const handleTargetMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingTarget(true);
    setDragStartX(e.clientX);
    setDragOffset(0);
    setPreviewPrice(targetPrice);
  };
  
  const handleMouseMove = useCallback((e) => {
    if (!isDraggingTarget || !strikeRange) return;
    
    const currentX = e.clientX;
    const offset = currentX - dragStartX;
    setDragOffset(offset);
    
    // Вычисляем новую цену на основе смещения
    const priceChange = (offset / 6) * strikeRange.step;
    const newPrice = targetPrice + priceChange;
    
    // Округляем до шага страйка
    const roundedPrice = Math.round(newPrice / strikeRange.step) * strikeRange.step;
    setPreviewPrice(roundedPrice);
    
  }, [isDraggingTarget, dragStartX, strikeRange, targetPrice]);
  
  const handleMouseUp = useCallback(() => {
    if (!isDraggingTarget || !strikeRange) return;
    
    // Применяем новую цену
    if (previewPrice !== null && previewPrice !== targetPrice) {
      if (onTargetPriceChange) {
        onTargetPriceChange(previewPrice);
      } else {
        setInternalTargetPrice(previewPrice);
      }
    }
    
    setIsDraggingTarget(false);
    setDragOffset(0);
    setPreviewPrice(null);
  }, [isDraggingTarget, previewPrice, targetPrice, onTargetPriceChange, strikeRange]);
  
  // Глобальные обработчики mouse move/up для перетаскивания Target Price
  useEffect(() => {
    if (!isDraggingTarget) return;
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingTarget, handleMouseMove, handleMouseUp]);
  
  // ========================================
  // ОБРАБОТЧИКИ ПЕРЕТАСКИВАНИЯ КОНЦОВ ЛИНИЙ
  // ========================================
  
  const handleLineEndMouseDown = useCallback((e, lineId, end, currentPrice) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingLineEnd({ lineId, end, startX: e.clientX, originalPrice: currentPrice });
  }, []);
  
  const handleLineEndMouseMove = useCallback((e) => {
    if (!draggingLineEnd || !strikeRange) return;
    
    const { lineId, end, startX, originalPrice } = draggingLineEnd;
    const deltaX = e.clientX - startX;
    const priceChange = (deltaX / 6) * strikeRange.step;
    const newPrice = originalPrice + priceChange;
    
    // Округляем до шага страйка
    const roundedPrice = Math.round(newPrice / strikeRange.step) * strikeRange.step;
    
    setLineEndPositions(prev => ({
      ...prev,
      [lineId]: {
        ...prev[lineId],
        [end]: roundedPrice
      }
    }));
  }, [draggingLineEnd, strikeRange]);
  
  const handleLineEndMouseUp = useCallback(() => {
    // Здесь можно сохранить новые значения если нужно
    // Пока просто сбрасываем состояние перетаскивания
    setDraggingLineEnd(null);
    // Не сбрасываем preview - оставляем новые позиции
  }, []);
  
  // Глобальные обработчики для перетаскивания концов линий
  useEffect(() => {
    if (!draggingLineEnd) return;
    
    window.addEventListener('mousemove', handleLineEndMouseMove);
    window.addEventListener('mouseup', handleLineEndMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleLineEndMouseMove);
      window.removeEventListener('mouseup', handleLineEndMouseUp);
    };
  }, [draggingLineEnd, handleLineEndMouseMove, handleLineEndMouseUp]);

  // ========================================
  // ПОДГОТОВКА ЛИНИЙ ПОЗИЦИЙ
  // ========================================
  
  // Цвета для типов позиций
  const COLORS = {
    call: '#22c55e',    // Зеленый для call
    put: '#ef4444',     // Красный для put
    stock: '#000000',   // Черный для базового актива
  };
  
  // Формируем линии из опционов и позиций базового актива
  const positionLines = useMemo(() => {
    if (!strikeRange || currentPrice <= 0) return { above: [], below: [] };
    
    const lines = [];
    
    // Добавляем опционы
    options.forEach((opt, idx) => {
      if (!opt.visible) return;
      
      const isBuy = (opt.action || 'Buy').toLowerCase() === 'buy';
      const type = (opt.type || 'call').toLowerCase();
      const color = type === 'call' ? COLORS.call : COLORS.put;
      
      // Линия от -50% до +50% от текущей цены
      const startPrice = currentPrice * 0.5;
      const endPrice = currentPrice * 1.5;
      
      lines.push({
        id: `option-${opt.id}`,
        startPrice,
        endPrice,
        color,
        isAbove: isBuy, // Buy = над шкалой, Sell = под шкалой
        label: `${type.toUpperCase()} ${opt.strike || ''}`,
        quantity: opt.quantity || 1,
      });
    });
    
    // Добавляем позиции базового актива
    positions.forEach((pos, idx) => {
      if (!pos.visible) return;
      
      const isLong = (pos.type || 'long').toLowerCase() === 'long';
      
      // Линия от -50% до +50% от текущей цены
      const startPrice = currentPrice * 0.5;
      const endPrice = currentPrice * 1.5;
      
      lines.push({
        id: `position-${pos.id}`,
        startPrice,
        endPrice,
        color: COLORS.stock,
        isAbove: isLong, // Long = над шкалой, Short = под шкалой
        label: `${pos.ticker || ticker} ${pos.quantity || 0}`,
        quantity: pos.quantity || 0,
      });
    });
    
    // Разделяем на верхние и нижние
    const above = lines.filter(l => l.isAbove);
    const below = lines.filter(l => !l.isAbove);
    
    return { above, below };
  }, [options, positions, currentPrice, strikeRange, ticker]);
  
  // Динамический padding в зависимости от количества линий
  // Базовый padding 40px для флажка + 14px на каждую линию + 10px отступ от шкалы
  const topPadding = Math.max(50, 40 + positionLines.above.length * 14 + 10);
  const bottomPadding = Math.max(20, 10 + positionLines.below.length * 14 + 10);

  // Если нет диапазона (нет цены) - не показываем шкалу
  if (!strikeRange) {
    return null;
  }

  return (
    <div className="relative" style={{ maxWidth: '1140px' }}>
      <div 
        ref={containerRef} 
        className="relative overflow-x-auto select-none"
        style={{ 
          paddingTop: `${topPadding}px`, 
          paddingBottom: `${bottomPadding}px`,
          cursor: isDraggingScroll ? 'grabbing' : 'grab' 
        }}
        onMouseDown={(e) => {
          if (e.button === 0 && !e.target.closest('.pointer-events-auto')) {
            setIsDraggingScroll(true);
            setScrollStartX(e.pageX - containerRef.current.offsetLeft);
            setScrollLeft(containerRef.current.scrollLeft);
          }
        }}
        onMouseMove={(e) => {
          if (!isDraggingScroll) return;
          e.preventDefault();
          const x = e.pageX - containerRef.current.offsetLeft;
          const walk = (x - scrollStartX) * 2;
          containerRef.current.scrollLeft = scrollLeft - walk;
        }}
        onMouseUp={() => setIsDraggingScroll(false)}
        onMouseLeave={() => setIsDraggingScroll(false)}
      >
        {/* Линии позиций НАД шкалой (Buy опционы, Long базовый актив) */}
        {positionLines.above.length > 0 && (
          <div className="absolute top-0 left-0 w-full pointer-events-none z-40" style={{ minWidth: `${strikeRange.count * 6}px` }}>
            {positionLines.above.map((line, idx) => {
              // Используем preview если есть, иначе оригинальные значения
              const preview = lineEndPositions[line.id] || {};
              const actualStartPrice = preview.start !== undefined ? preview.start : line.startPrice;
              const actualEndPrice = preview.end !== undefined ? preview.end : line.endPrice;
              
              // Вычисляем позиции на шкале
              const startIndex = (actualStartPrice - strikeRange.min) / strikeRange.step;
              const endIndex = (actualEndPrice - strikeRange.min) / strikeRange.step;
              const startLeft = startIndex * 6 + 1.5;
              const endLeft = endIndex * 6 + 1.5;
              const lineWidth = endLeft - startLeft;
              
              // Вертикальное смещение для каждой линии
              const topOffset = topPadding - 10 - (positionLines.above.length - idx) * 14;
              
              const isDraggingThis = draggingLineEnd?.lineId === line.id;
              
              return (
                <div key={line.id} className="absolute" style={{ top: `${topOffset}px`, left: `${startLeft}px` }}>
                  {/* Линия */}
                  <div 
                    className="absolute h-[3px] rounded-full"
                    style={{ 
                      width: `${lineWidth}px`, 
                      backgroundColor: line.color,
                      top: '50%',
                      transform: 'translateY(-50%)',
                    }}
                  />
                  {/* Кружок слева (начало) - перетаскиваемый */}
                  <div 
                    className={`absolute w-3 h-3 rounded-full border-2 pointer-events-auto ${isDraggingThis && draggingLineEnd.end === 'start' ? 'cursor-grabbing' : 'cursor-grab'}`}
                    style={{ 
                      backgroundColor: isDraggingThis && draggingLineEnd.end === 'start' ? line.color : 'white',
                      borderColor: line.color,
                      left: '-6px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      zIndex: 60,
                    }}
                    onMouseDown={(e) => handleLineEndMouseDown(e, line.id, 'start', actualStartPrice)}
                  />
                  {/* Кружок справа (конец) - перетаскиваемый */}
                  <div 
                    className={`absolute w-3 h-3 rounded-full border-2 pointer-events-auto ${isDraggingThis && draggingLineEnd.end === 'end' ? 'cursor-grabbing' : 'cursor-grab'}`}
                    style={{ 
                      backgroundColor: isDraggingThis && draggingLineEnd.end === 'end' ? line.color : 'white',
                      borderColor: line.color,
                      left: `${lineWidth - 6}px`,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      zIndex: 60,
                    }}
                    onMouseDown={(e) => handleLineEndMouseDown(e, line.id, 'end', actualEndPrice)}
                  />
                </div>
              );
            })}
          </div>
        )}
        
        {/* Линии позиций ПОД шкалой (Sell опционы, Short базовый актив) */}
        {positionLines.below.length > 0 && (
          <div className="absolute bottom-0 left-0 w-full pointer-events-none z-40" style={{ minWidth: `${strikeRange.count * 6}px` }}>
            {positionLines.below.map((line, idx) => {
              // Используем preview если есть, иначе оригинальные значения
              const preview = lineEndPositions[line.id] || {};
              const actualStartPrice = preview.start !== undefined ? preview.start : line.startPrice;
              const actualEndPrice = preview.end !== undefined ? preview.end : line.endPrice;
              
              // Вычисляем позиции на шкале
              const startIndex = (actualStartPrice - strikeRange.min) / strikeRange.step;
              const endIndex = (actualEndPrice - strikeRange.min) / strikeRange.step;
              const startLeft = startIndex * 6 + 1.5;
              const endLeft = endIndex * 6 + 1.5;
              const lineWidth = endLeft - startLeft;
              
              // Вертикальное смещение для каждой линии
              const bottomOffset = bottomPadding - 10 - (positionLines.below.length - idx) * 14;
              
              const isDraggingThis = draggingLineEnd?.lineId === line.id;
              
              return (
                <div key={line.id} className="absolute" style={{ bottom: `${bottomOffset}px`, left: `${startLeft}px` }}>
                  {/* Линия */}
                  <div 
                    className="absolute h-[3px] rounded-full"
                    style={{ 
                      width: `${lineWidth}px`, 
                      backgroundColor: line.color,
                      top: '50%',
                      transform: 'translateY(-50%)',
                    }}
                  />
                  {/* Кружок слева (начало) - перетаскиваемый */}
                  <div 
                    className={`absolute w-3 h-3 rounded-full border-2 pointer-events-auto ${isDraggingThis && draggingLineEnd.end === 'start' ? 'cursor-grabbing' : 'cursor-grab'}`}
                    style={{ 
                      backgroundColor: isDraggingThis && draggingLineEnd.end === 'start' ? line.color : 'white',
                      borderColor: line.color,
                      left: '-6px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      zIndex: 60,
                    }}
                    onMouseDown={(e) => handleLineEndMouseDown(e, line.id, 'start', actualStartPrice)}
                  />
                  {/* Кружок справа (конец) - перетаскиваемый */}
                  <div 
                    className={`absolute w-3 h-3 rounded-full border-2 pointer-events-auto ${isDraggingThis && draggingLineEnd.end === 'end' ? 'cursor-grabbing' : 'cursor-grab'}`}
                    style={{ 
                      backgroundColor: isDraggingThis && draggingLineEnd.end === 'end' ? line.color : 'white',
                      borderColor: line.color,
                      left: `${lineWidth - 6}px`,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      zIndex: 60,
                    }}
                    onMouseDown={(e) => handleLineEndMouseDown(e, line.id, 'end', actualEndPrice)}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Флажок Target Price (перетаскиваемый) */}
        {targetPrice > 0 && strikeRange && (
          <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-50">
            {(() => {
              // Используем previewPrice при перетаскивании, иначе targetPrice
              const displayPrice = isDraggingTarget && previewPrice !== null ? previewPrice : targetPrice;
              const index = (displayPrice - strikeRange.min) / strikeRange.step;
              const leftPosition = index * 6 + 1.5;
              const topPosition = 4; // Позиция сверху (над линиями)
              
              return (
                <div
                  className={`absolute pointer-events-auto select-none ${isDraggingTarget ? 'cursor-grabbing' : 'cursor-grab'}`}
                  style={{
                    left: `${leftPosition}px`,
                    top: `${topPosition}px`,
                    transform: "translateX(-50%)",
                    opacity: isDraggingTarget ? 0.8 : 1,
                    zIndex: isDraggingTarget ? 100 : 'auto',
                  }}
                  onMouseDown={handleTargetMouseDown}
                >
                  <div
                    className="relative rounded-md px-2 py-1 flex items-center gap-1 shadow-md"
                    style={{ backgroundColor: 'rgb(59, 130, 246)' }} // Синий цвет для Target
                  >
                    <span className="text-white font-bold text-sm whitespace-nowrap">
                      {displayPrice.toFixed(2)}
                    </span>

                    {/* Треугольник вниз */}
                    <div
                      className="absolute left-1/2 -translate-x-1/2"
                      style={{
                        bottom: "-6px",
                        width: 0,
                        height: 0,
                        borderLeft: "6px solid transparent",
                        borderRight: "6px solid transparent",
                        borderTop: "6px solid rgb(59, 130, 246)",
                      }}
                    />
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Шкала страйков - точно такая же структура как в StrikeScale */}
        <div className="flex flex-col gap-0">
          {/* Верхняя шкала (риски) - структура как в StrikeScale */}
          <div className="inline-flex gap-[3px] py-2 pb-0" style={{ minWidth: `${strikeRange.count * 6}px` }}>
            {Array.from({ length: strikeRange.count }, (_, i) => strikeRange.min + i * strikeRange.step).map((price, index) => {
              const isTenth = price % 10 === 0;
              const isFifth = price % (strikeRange.step === 1 ? 5 : 5) === 0;
              const isBlack = isFifth;
              const height = isTenth ? "h-[10px]" : "h-[5px]";
              const color = isBlack ? "bg-black" : "bg-gray-400";

              return (
                <div key={price} className="flex flex-col items-center w-[3px] h-[13px] justify-end">
                  <div className="h-[10px] flex items-start">
                    <div className={`w-px ${height} ${color}`} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Метки цен */}
          <div className="relative inline-flex gap-[3px] h-[20px]" style={{ minWidth: `${strikeRange.count * 6}px` }}>
            {Array.from({ length: strikeRange.count }, (_, i) => strikeRange.min + i * strikeRange.step).map((price, index) => {
              const isTenth = price % 10 === 0;
              const leftPosition = index * 6 + 1.5;

              return (
                <div key={`label-${price}`} className="w-[3px] h-full">
                  {isTenth && (
                    <span
                      className="absolute text-xs font-medium text-gray-700 whitespace-nowrap"
                      style={{
                        left: `${leftPosition}px`,
                        top: "50%",
                        transform: "translate(-50%, -50%)",
                      }}
                    >
                      {price}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}

export default StrategyScale;
