/**
 * Автоопределение типа инструмента
 * ЗАЧЕМ: Определение типа по тикеру
 */

export const detectInstrumentType = (ticker) => {
  const upperTicker = ticker.toUpperCase();
  
  if (ticker.startsWith('/')) return 'futures';
  
  const cryptoSymbols = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT', 'AVAX', 'MATIC', 'LINK'];
  if (cryptoSymbols.includes(upperTicker) || upperTicker.endsWith('USD') || upperTicker.endsWith('USDT')) {
    return 'crypto';
  }
  
  const indexSymbols = ['SPX', 'NDX', 'DJI', 'VIX', 'RUT'];
  if (indexSymbols.includes(upperTicker)) return 'index';
  
  return 'stock';
};
