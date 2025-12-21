import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/card';

const LastPrice = ({ ticker }) => {
  const [price, setPrice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    setPrice(null);
    fetch(`/api/yahoo-proxy?symbol=${ticker}&interval=1d&range_days=1`)
      .then(res => res.json())
      .then(data => {
        try {
          const result = data.chart?.result?.[0];
          const close = result?.indicators?.quote?.[0]?.close;
          if (close && close.length > 0) {
            setPrice(close[close.length - 1]);
          } else {
            setError('Нет данных');
          }
        } catch (e) {
          setError('Ошибка данных');
        }
      })
      .catch(e => setError('Ошибка запроса'))
      .finally(() => setLoading(false));
  }, [ticker]);

  return (
    <Card className="w-full">
      <CardContent className="p-6">
        <div className="text-lg font-semibold mb-2">Текущая цена {ticker}</div>
        {loading && <div className="text-gray-500">Загрузка...</div>}
        {error && <div className="text-red-500">{error}</div>}
        {price !== null && !loading && !error && (
          <div className="text-3xl font-bold text-green-700">${price}</div>
        )}
      </CardContent>
    </Card>
  );
};

export default LastPrice;
