import React from 'react';

/**
 * StrikeScale - Шкала страйков с визуализацией позиций
 * HTML код Андрея - НЕИЗМЕННЫЙ
 */
function StrikeScale({ options = [], currentPrice = 0, positions = [] }) {
  
  return (
    <div className="relative pt-12 pb-12 my-[-18px]" dangerouslySetInnerHTML={{__html: `
      <div class="absolute top-0 left-0 w-full h-full pointer-events-none z-50">
        <div class="absolute pointer-events-auto select-none cursor-pointer" style="left: 301.5px; top: 56px; transform: translateX(-50%);">
          <div class="relative rounded-md px-2 py-1 flex items-center gap-1 shadow-md" style="background-color: rgb(255, 107, 107);">
            <span class="text-white font-bold text-sm whitespace-nowrap">5150</span>
            <div class="absolute -right-[13px] top-1/2 -translate-y-1/2 bg-black rounded-full w-5 h-5 flex items-center justify-center shadow-md">
              <span class="text-white text-xs font-bold">2</span>
            </div>
            <div class="absolute left-1/2 -translate-x-1/2" style="bottom: -6px; width: 0px; height: 0px; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid rgb(255, 107, 107);"></div>
          </div>
        </div>
        <div class="absolute pointer-events-auto select-none cursor-pointer" style="left: 421.5px; top: 56px; transform: translateX(-50%);">
          <div class="relative rounded-md px-2 py-1 flex items-center gap-1 shadow-md" style="background-color: rgb(255, 107, 107);">
            <span class="text-white font-bold text-sm whitespace-nowrap">5170</span>
            <div class="absolute left-1/2 -translate-x-1/2" style="bottom: -6px; width: 0px; height: 0px; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid rgb(255, 107, 107);"></div>
          </div>
        </div>
        <div class="absolute pointer-events-auto select-none cursor-default" style="left: 499.5px; top: 56px; transform: translateX(-50%);">
          <div class="relative rounded-md px-2 py-1 flex items-center gap-1 shadow-md" style="background-color: rgb(75, 85, 99);">
            <span class="text-white font-bold text-sm whitespace-nowrap">SPX</span>
            <div class="absolute left-1/2 -translate-x-1/2" style="bottom: -6px; width: 0px; height: 0px; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid rgb(75, 85, 99);"></div>
          </div>
        </div>
        <div class="absolute pointer-events-auto select-none cursor-pointer" style="left: 571.5px; top: 56px; transform: translateX(-50%);">
          <div class="relative rounded-md px-2 py-1 flex items-center gap-1 shadow-md" style="background-color: rgb(76, 175, 80);">
            <span class="text-white font-bold text-sm whitespace-nowrap">5195</span>
            <div class="absolute left-1/2 -translate-x-1/2" style="bottom: -6px; width: 0px; height: 0px; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid rgb(76, 175, 80);"></div>
          </div>
        </div>
        <div class="absolute pointer-events-auto select-none cursor-pointer" style="left: 721.5px; top: 56px; transform: translateX(-50%);">
          <div class="relative rounded-md px-2 py-1 flex items-center gap-1 shadow-md" style="background-color: rgb(76, 175, 80);">
            <span class="text-white font-bold text-sm whitespace-nowrap">5220</span>
            <div class="absolute -right-[13px] top-1/2 -translate-y-1/2 bg-black rounded-full w-5 h-5 flex items-center justify-center shadow-md">
              <span class="text-white text-xs font-bold">5</span>
            </div>
            <div class="absolute left-1/2 -translate-x-1/2" style="bottom: -6px; width: 0px; height: 0px; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid rgb(76, 175, 80);"></div>
          </div>
        </div>
      </div>
      <div class="absolute top-0 left-0 w-full h-full pointer-events-none z-50">
        <div class="absolute pointer-events-auto select-none cursor-pointer" style="left: 361.5px; top: 134px; transform: translateX(-50%);">
          <div class="relative rounded-md px-2 py-1 flex items-center gap-1 shadow-md pt-1" style="background-color: rgb(76, 175, 80);">
            <span class="text-white font-bold text-sm whitespace-nowrap">5160</span>
            <div class="absolute -right-[13px] top-1/2 -translate-y-1/2 bg-black rounded-full w-5 h-5 flex items-center justify-center shadow-md">
              <span class="text-white text-xs font-bold">3</span>
            </div>
            <div class="absolute left-1/2 -translate-x-1/2" style="top: -6px; width: 0px; height: 0px; border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 6px solid rgb(76, 175, 80);"></div>
          </div>
        </div>
        <div class="absolute pointer-events-auto select-none cursor-pointer" style="left: 451.5px; top: 134px; transform: translateX(-50%);">
          <div class="relative rounded-md px-2 py-1 flex items-center gap-1 shadow-md pt-1" style="background-color: rgb(76, 175, 80);">
            <span class="text-white font-bold text-sm whitespace-nowrap">5175</span>
            <div class="absolute left-1/2 -translate-x-1/2" style="top: -6px; width: 0px; height: 0px; border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 6px solid rgb(76, 175, 80);"></div>
          </div>
        </div>
        <div class="absolute pointer-events-auto select-none cursor-pointer" style="left: 601.5px; top: 134px; transform: translateX(-50%);">
          <div class="relative rounded-md px-2 py-1 flex items-center gap-1 shadow-md pt-1" style="background-color: rgb(255, 107, 107);">
            <span class="text-white font-bold text-sm whitespace-nowrap">5200</span>
            <div class="absolute left-1/2 -translate-x-1/2" style="top: -6px; width: 0px; height: 0px; border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 6px solid rgb(255, 107, 107);"></div>
          </div>
        </div>
        <div class="absolute pointer-events-auto select-none cursor-pointer" style="left: 781.5px; top: 134px; transform: translateX(-50%);">
          <div class="relative rounded-md px-2 py-1 flex items-center gap-1 shadow-md pt-1" style="background-color: rgb(255, 107, 107);">
            <span class="text-white font-bold text-sm whitespace-nowrap">5230</span>
            <div class="absolute -right-[13px] top-1/2 -translate-y-1/2 bg-black rounded-full w-5 h-5 flex items-center justify-center shadow-md">
              <span class="text-white text-xs font-bold">4</span>
            </div>
            <div class="absolute left-1/2 -translate-x-1/2" style="top: -6px; width: 0px; height: 0px; border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 6px solid rgb(255, 107, 107);"></div>
          </div>
        </div>
      </div>
      <div class="flex flex-col gap-0">
        <div class="inline-flex gap-[3px] py-2 pb-0">
          ${Array.from({length: 200}).map((_, i) => {
            const heights = [14,5,25,19,18,13,18,28,10,15,6,1,11,9,22,28,8,24,5,26,29,1,10,17,17,27,25,8,2,24,0,28,29,4,5,9,19,11,13,23,17,11,7,9,15,29,6,13,13,25,10,9,22,4,22,2,27,29,0,11,24,26,24,22,22,24,4,12,30,25,6,23,19,3,6,30,8,17,2,9,14,17,0,6,8,10,12,2,30,13,11,23,29,7,22,12,10,30,13,4,20,23,5,17,25,8,13,18,19,1,15,3,6,8,22,8,24,1,8,9,22,29,22,9,15,15,1,1,20,25,2,6,20,20,1,27,7,7,24,13,15,0,1,21,16,17,13,16,9,1,7,23,4,17,20,1,1,19,18,14,3,12,2,1,6,17,0,10,11,20,18,17,29,19,8,6,7,30,10,0,30,10,20,4,25,1,19,4,8,9,22,23,8,20,8,9];
            const isMainTick = i % 10 === 0;
            return `<div class="flex flex-col items-center h-[43px] justify-end">
              <div class="w-[3px] bg-[#B2FFAE] mb-[3px]" style="height: ${heights[i] || 0}px;"></div>
              <div class="h-[10px] flex items-start">
                <div class="w-px ${isMainTick ? 'h-[10px] bg-black' : 'h-[5px] bg-gray-400'}"></div>
              </div>
            </div>`;
          }).join('')}
        </div>
        <div class="inline-flex gap-[3px] h-[20px] relative">
          ${Array.from({length: 200}).map((_, i) => {
            const isMainTick = i % 10 === 0;
            const price = 5100 + i;
            return `<div class="w-[3px] h-full">${isMainTick ? `<span class="absolute text-xs font-medium text-foreground whitespace-nowrap" style="left: ${1.5 + i*6}px; top: 50%; transform: translate(-50%, -50%);">${price}</span>` : ''}</div>`;
          }).join('')}
        </div>
        <div class="inline-flex gap-[3px] py-2 pt-0 pb-2">
          ${Array.from({length: 200}).map((_, i) => {
            const heights = [24,15,2,9,15,3,3,7,16,29,20,7,9,10,23,24,26,17,19,9,8,13,21,10,6,2,24,10,0,7,14,11,22,14,16,10,13,21,28,24,23,20,4,6,24,14,30,27,4,13,21,17,26,9,5,10,19,13,28,23,16,23,17,18,22,19,20,8,12,28,23,2,26,8,5,6,16,21,28,29,2,7,0,5,10,4,28,28,15,28,27,7,18,26,13,22,1,0,23,1,2,5,1,19,1,18,22,0,11,14,9,0,10,1,7,20,22,12,3,6,29,21,7,29,26,17,12,6,27,2,10,8,30,29,24,13,17,8,16,22,12,16,3,21,10,17,11,8,8,17,6,28,8,26,26,22,27,28,17,8,28,4,6,3,17,7,10,27,12,9,5,29,28,27,12,23,26,4,24,11,14,11,14,11,21,26,24,3,1,18,5,25,30,28,21,6,1,22,14,17,26,18,10,10,1,22,23,8,20,8,9];
            const isMainTick = i % 10 === 0;
            return `<div class="flex flex-col items-center h-[43px] justify-start">
              <div class="h-[10px] flex items-end">
                <div class="w-px ${isMainTick ? 'h-[10px] bg-black' : 'h-[5px] bg-gray-400'}"></div>
              </div>
              <div class="w-[3px] bg-[#FFBCBC] mt-[3px]" style="height: ${heights[i] || 0}px;"></div>
            </div>`;
          }).join('')}
        </div>
      </div>
    `}} />
  );
}

export default StrikeScale;
