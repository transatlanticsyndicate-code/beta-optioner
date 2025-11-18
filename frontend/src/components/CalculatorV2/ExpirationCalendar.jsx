import React from 'react';

function ExpirationCalendar({ 
  groupedDates, 
  selectedExpirationDate, 
  setSelectedExpirationDate,
  scrollContainerRef,
  isDragging,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleMouseLeave,
  usedDates = [],
  dateColorMap = {}
}) {
  return (
    <div className="relative">

      {/* Шкала дат */}
      <div
        ref={scrollContainerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        className={`w-full overflow-x-auto hide-scrollbar ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <div className="inline-flex gap-[5px] py-2">
          {Object.entries(groupedDates).map(([monthKey, dates], index) => (
            <div key={monthKey} className="flex items-center gap-[5px]">
              <div className="flex flex-col items-center flex-shrink-0">
                <div className="text-sm text-muted-foreground mb-3 font-medium whitespace-nowrap">{monthKey}</div>
                <div className="flex gap-[5px]">
                  {dates.map((date) => {
                    const isUsed = usedDates.includes(date.date);
                    const dateColor = dateColorMap[date.date];
                    
                    return (
                      <button
                        key={date.date}
                        onClick={() => setSelectedExpirationDate(date.date)}
                        className={`relative w-[30px] h-[30px] rounded-lg flex items-center justify-center text-sm font-medium transition-all hover:scale-105 flex-shrink-0 cursor-pointer ${
                          selectedExpirationDate === date.date
                            ? "bg-[#00BCD4] text-white"
                            : "bg-[#E9E9E9] dark:bg-gray-700 text-foreground hover:bg-[#B6FBFF]"
                        }`}
                      >
                        {date.displayDate}
                        {isUsed && dateColor && (
                          <div
                            className="absolute -top-1 -right-1 w-2 h-2 rounded-full border border-white"
                            style={{ backgroundColor: dateColor }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              {index < Object.entries(groupedDates).length - 1 && <div className="w-px h-16 bg-gray-300 flex-shrink-0" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ExpirationCalendar;
