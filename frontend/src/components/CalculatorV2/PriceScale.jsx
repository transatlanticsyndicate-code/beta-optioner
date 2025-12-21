import React from 'react';

function PriceScale({
  priceScaleRef,
  isPriceScaleDragging,
  handlePriceScaleMouseDown,
  handlePriceScaleMouseMove,
  handlePriceScaleMouseUp,
  handlePriceScaleMouseLeave,
  greenBarHeights,
  redBarHeights
}) {
  return (
    <div>
      <div
        ref={priceScaleRef}
        onMouseDown={handlePriceScaleMouseDown}
        onMouseMove={handlePriceScaleMouseMove}
        onMouseUp={handlePriceScaleMouseUp}
        onMouseLeave={handlePriceScaleMouseLeave}
        className={`w-full overflow-x-auto hide-scrollbar ${isPriceScaleDragging ? "cursor-grabbing" : "cursor-grab"}`}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <div className="flex flex-col">
          {/* Верхняя шкала (зелёные полосы) */}
          <div className="inline-flex gap-[3px] py-2">
            {Array.from({ length: 211 }, (_, i) => i + 100).map((price, index) => {
              const isTenth = price % 10 === 0;
              const isFifth = price % 5 === 0;
              const height = isTenth ? "h-[10px]" : "h-[5px]";
              const color = isFifth ? "bg-black dark:bg-white" : "bg-gray-400";
              const greenBarHeight = greenBarHeights[index];

              return (
                <div key={price} className="flex flex-col items-center h-[43px] justify-end">
                  <div className="w-[3px] bg-[#B2FFAE] mb-[3px]" style={{ height: `${greenBarHeight}px` }} />
                  <div className="h-[10px] flex items-start">
                    <div className={`w-px ${height} ${color}`} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Нижняя шкала (красные полосы) */}
          <div className="inline-flex gap-[3px] py-2">
            {Array.from({ length: 211 }, (_, i) => i + 100).map((price, index) => {
              const isTenth = price % 10 === 0;
              const isFifth = price % 5 === 0;
              const height = isTenth ? "h-[10px]" : "h-[5px]";
              const color = isFifth ? "bg-black dark:bg-white" : "bg-gray-400";
              const redBarHeight = redBarHeights[index];

              return (
                <div key={`red-${price}`} className="flex flex-col items-center h-[43px] justify-start">
                  <div className="h-[10px] flex items-end">
                    <div className={`w-px ${height} ${color}`} />
                  </div>
                  <div className="w-[3px] bg-[#FFBCBC] mt-[3px]" style={{ height: `${redBarHeight}px` }} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PriceScale;
