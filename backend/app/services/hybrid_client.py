"""
Hybrid Data Client
Объединяет данные из Yahoo Finance и Polygon.io для получения лучшего результата
"""

from typing import Dict, List
from datetime import datetime, timedelta
from app.services.yahoo_client import YahooClient
from app.services.polygon_client import PolygonClient

class HybridClient:
    """
    Гибридный клиент с логикой фолбэка и работой по нескольким датам.
    """
    def __init__(self):
        self.yahoo = YahooClient()
        try:
            self.polygon = PolygonClient()
            self.has_polygon = True
        except Exception as e:
            print(f"⚠️ Polygon client is not available: {e}")
            self.has_polygon = False

    def get_stock_price(self, ticker: str) -> Dict:
        try:
            return self.yahoo.get_stock_price(ticker)
        except Exception as e:
            print(f"⚠️ Yahoo price failed ({e}), trying Polygon...")
            if self.has_polygon:
                return self.polygon.get_stock_price(ticker)
            raise Exception("All stock price providers failed.")

    def get_options_chain(self, ticker: str, expiration_dates: List[str]) -> List[Dict]:
        all_options = []
        for date in expiration_dates:
            try:
                # Основная стратегия: Yahoo (OI/Volume) + Polygon (Greeks)
                yahoo_options = self.yahoo.get_options_chain(ticker, date)
                if not yahoo_options:
                    continue

                if self.has_polygon:
                    try:
                        polygon_options = self.polygon.get_options_chain(ticker, date)
                        if polygon_options:
                            merged = self._merge_options_data(yahoo_options, polygon_options)
                            all_options.extend(merged)
                        else:
                            all_options.extend(yahoo_options) # Polygon не вернул, используем только Yahoo
                    except Exception as poly_e:
                        print(f"⚠️ Polygon enrichment failed for {date} ({poly_e}), using Yahoo data.")
                        all_options.extend(yahoo_options)
                else:
                    all_options.extend(yahoo_options) # Polygon недоступен

            except Exception as yahoo_e:
                print(f"⚠️ Yahoo failed for {date} ({yahoo_e}), falling back to Polygon...")
                if self.has_polygon:
                    try:
                        polygon_options = self.polygon.get_options_chain(ticker, date)
                        if polygon_options:
                            all_options.extend(polygon_options)
                    except Exception as poly_full_e:
                        print(f"❌ Polygon fallback also failed for {date} ({poly_full_e})")
                else:
                    print("❌ No providers available to fetch options data.")
        return all_options

    def get_relevant_expiration_dates(self, ticker: str) -> List[str]:
        try:
            all_dates = self.yahoo.get_expiration_dates(ticker)
            # ВРЕМЕННО: берем только 1 ближайшую дату для ускорения
            if all_dates:
                return [all_dates[0]]
            return []
        except Exception as e:
            print(f"❌ Could not get expiration dates: {e}")
            return []

    def _merge_options_data(self, yahoo_data: List[Dict], polygon_data: List[Dict]) -> List[Dict]:
        polygon_index = { (opt.get('strike'), opt.get('option_type')): opt for opt in polygon_data }
        enriched_data = []
        for yahoo_opt in yahoo_data:
            key = (yahoo_opt.get('strike'), yahoo_opt.get('option_type'))
            merged_opt = yahoo_opt.copy()
            if key in polygon_index:
                poly_opt = polygon_index[key]
                # Обогащаем греками и IV, если они есть в Polygon
                merged_opt['delta'] = poly_opt.get('delta', merged_opt.get('delta', 0))
                merged_opt['gamma'] = poly_opt.get('gamma', merged_opt.get('gamma', 0))
                merged_opt['theta'] = poly_opt.get('theta', merged_opt.get('theta', 0))
                merged_opt['vega'] = poly_opt.get('vega', merged_opt.get('vega', 0))
                if poly_opt.get('implied_volatility', 0) > 0:
                    merged_opt['implied_volatility'] = poly_opt['implied_volatility']
            enriched_data.append(merged_opt)
        return enriched_data
