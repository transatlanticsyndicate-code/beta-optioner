"""
Test IB API Data Types Verification

Проверяем, что текущий источник данных (HybridClient) предоставляет все нужные типы данных
для трех функционалов: Options Analyzer, Options Calculator, Gradual Strategy
"""

import os
import sys
import json
from datetime import datetime, timedelta
from typing import Dict, List, Any

# Добавляем путь к app
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.services.data_source_factory import DataSourceFactory


class DataTypeVerifier:
    """Проверяет типы данных от текущего источника данных"""
    
    def __init__(self):
        self.client = DataSourceFactory.get_client()
        self.results = {
            "timestamp": datetime.now().isoformat(),
            "tests": [],
            "summary": {
                "total": 0,
                "passed": 0,
                "failed": 0,
                "errors": []
            }
        }
    
    def log_test(self, test_name: str, status: str, details: Dict = None):
        """Логировать результат теста"""
        test_result = {
            "name": test_name,
            "status": status,
            "timestamp": datetime.now().isoformat(),
            "details": details or {}
        }
        self.results["tests"].append(test_result)
        self.results["summary"]["total"] += 1
        
        if status == "PASSED":
            self.results["summary"]["passed"] += 1
            print(f"✅ {test_name}: PASSED")
        else:
            self.results["summary"]["failed"] += 1
            print(f"❌ {test_name}: FAILED")
            if details:
                print(f"   Details: {details}")
    
    def test_stock_price_data(self, ticker: str = "SPY") -> bool:
        """
        Test 1: Проверить, что получаем все нужные поля для цены акции
        Нужно для: Options Analyzer (Step 1), Options Calculator, Gradual Strategy
        """
        test_name = f"Stock Price Data ({ticker})"
        
        try:
            data = self.client.get_stock_price(ticker)
            
            # Обязательные поля
            required_fields = [
                'ticker', 'price', 'bid', 'ask', 'volume', 'high', 'low',
                'open', 'previous_close', 'change', 'change_percent'
            ]
            
            # Опциональные поля (для полноты)
            optional_fields = [
                'market_cap', 'pe_ratio', 'dividend_yield', '52_week_high', '52_week_low'
            ]
            
            missing_fields = []
            for field in required_fields:
                if field not in data:
                    missing_fields.append(field)
            
            if missing_fields:
                self.log_test(
                    test_name,
                    "FAILED",
                    {"missing_fields": missing_fields}
                )
                return False
            
            # Проверяем типы данных
            type_checks = {
                'price': (int, float),
                'bid': (int, float),
                'ask': (int, float),
                'volume': int,
                'change': (int, float),
                'change_percent': (int, float)
            }
            
            type_errors = []
            for field, expected_type in type_checks.items():
                if not isinstance(data[field], expected_type):
                    type_errors.append(f"{field}: expected {expected_type}, got {type(data[field])}")
            
            if type_errors:
                self.log_test(
                    test_name,
                    "FAILED",
                    {"type_errors": type_errors}
                )
                return False
            
            # Проверяем логику данных
            logic_errors = []
            if data['bid'] > data['ask']:
                logic_errors.append("bid > ask (должно быть bid < ask)")
            if data['bid'] > data['price'] or data['ask'] < data['price']:
                logic_errors.append("price не в диапазоне [bid, ask]")
            if data['volume'] < 0:
                logic_errors.append("volume < 0")
            
            if logic_errors:
                self.log_test(
                    test_name,
                    "FAILED",
                    {"logic_errors": logic_errors}
                )
                return False
            
            self.log_test(
                test_name,
                "PASSED",
                {
                    "fields": len(required_fields),
                    "sample_data": {
                        "ticker": data['ticker'],
                        "price": data['price'],
                        "bid": data['bid'],
                        "ask": data['ask'],
                        "volume": data['volume']
                    }
                }
            )
            return True
            
        except Exception as e:
            self.log_test(
                test_name,
                "FAILED",
                {"error": str(e)}
            )
            self.results["summary"]["errors"].append(str(e))
            return False
    
    def test_options_chain_data(self, ticker: str = "SPY", expiration: str = None) -> bool:
        """
        Test 2: Проверить, что получаем все нужные поля для опционной цепочки
        Нужно для: Options Analyzer (Step 1), Options Calculator
        """
        test_name = f"Options Chain Data ({ticker})"
        
        try:
            # Если дата не указана, берем ближайшую
            if not expiration:
                expirations = self.client.get_relevant_expiration_dates(ticker)
                if not expirations:
                    self.log_test(
                        test_name,
                        "FAILED",
                        {"error": "No expiration dates found"}
                    )
                    return False
                expiration = expirations[0]
            
            options = self.client.get_options_chain(ticker, [expiration])
            
            if not options or len(options) == 0:
                self.log_test(
                    test_name,
                    "FAILED",
                    {"error": "Empty options chain"}
                )
                return False
            
            # Проверяем первый опцион
            first_option = options[0]
            
            # Обязательные поля
            required_fields = [
                'strike', 'type', 'bid', 'ask', 'volume', 'open_interest',
                'iv', 'delta', 'gamma', 'theta', 'vega', 'rho'
            ]
            
            missing_fields = []
            for field in required_fields:
                if field not in first_option:
                    missing_fields.append(field)
            
            if missing_fields:
                self.log_test(
                    test_name,
                    "FAILED",
                    {"missing_fields": missing_fields}
                )
                return False
            
            # Проверяем типы данных
            type_checks = {
                'strike': (int, float),
                'type': str,
                'bid': (int, float),
                'ask': (int, float),
                'volume': int,
                'open_interest': int,
                'iv': (int, float),
                'delta': (int, float),
                'gamma': (int, float),
                'theta': (int, float),
                'vega': (int, float),
                'rho': (int, float)
            }
            
            type_errors = []
            for field, expected_type in type_checks.items():
                if not isinstance(first_option[field], expected_type):
                    type_errors.append(f"{field}: expected {expected_type}, got {type(first_option[field])}")
            
            if type_errors:
                self.log_test(
                    test_name,
                    "FAILED",
                    {"type_errors": type_errors}
                )
                return False
            
            # Проверяем логику Greeks
            logic_errors = []
            
            # Delta: -1 до +1 (PUT отрицательный, CALL положительный)
            if not (-1 <= first_option['delta'] <= 1):
                logic_errors.append(f"delta {first_option['delta']} не в диапазоне [-1, 1]")
            
            # Gamma: всегда положительный
            if first_option['gamma'] < 0:
                logic_errors.append(f"gamma {first_option['gamma']} < 0 (должна быть > 0)")
            
            # Theta: обычно отрицательный для длинных позиций
            # (но может быть положительным для коротких)
            
            # Vega: всегда положительный
            if first_option['vega'] < 0:
                logic_errors.append(f"vega {first_option['vega']} < 0 (должна быть > 0)")
            
            # Rho: положительный для CALL, отрицательный для PUT
            if first_option['type'].upper() == 'CALL' and first_option['rho'] < 0:
                logic_errors.append(f"CALL rho {first_option['rho']} < 0 (должна быть > 0)")
            elif first_option['type'].upper() == 'PUT' and first_option['rho'] > 0:
                logic_errors.append(f"PUT rho {first_option['rho']} > 0 (должна быть < 0)")
            
            if logic_errors:
                self.log_test(
                    test_name,
                    "FAILED",
                    {"logic_errors": logic_errors}
                )
                return False
            
            self.log_test(
                test_name,
                "PASSED",
                {
                    "total_options": len(options),
                    "expiration": expiration,
                    "sample_option": {
                        "strike": first_option['strike'],
                        "type": first_option['type'],
                        "bid": first_option['bid'],
                        "ask": first_option['ask'],
                        "iv": first_option['iv'],
                        "delta": first_option['delta']
                    }
                }
            )
            return True
            
        except Exception as e:
            self.log_test(
                test_name,
                "FAILED",
                {"error": str(e)}
            )
            self.results["summary"]["errors"].append(str(e))
            return False
    
    def test_expiration_dates(self, ticker: str = "SPY") -> bool:
        """
        Test 3: Проверить, что получаем даты экспирации
        Нужно для: Options Analyzer (Step 1), Options Calculator
        """
        test_name = f"Expiration Dates ({ticker})"
        
        try:
            expirations = self.client.get_relevant_expiration_dates(ticker)
            
            if not expirations or len(expirations) == 0:
                self.log_test(
                    test_name,
                    "FAILED",
                    {"error": "No expiration dates found"}
                )
                return False
            
            # Проверяем формат дат
            date_errors = []
            for exp_date in expirations[:5]:  # Проверяем первые 5
                try:
                    # Ожидаем формат YYYY-MM-DD
                    parts = exp_date.split('-')
                    if len(parts) != 3:
                        date_errors.append(f"Invalid date format: {exp_date}")
                    else:
                        year, month, day = int(parts[0]), int(parts[1]), int(parts[2])
                        if not (1 <= month <= 12 and 1 <= day <= 31):
                            date_errors.append(f"Invalid date values: {exp_date}")
                except:
                    date_errors.append(f"Cannot parse date: {exp_date}")
            
            if date_errors:
                self.log_test(
                    test_name,
                    "FAILED",
                    {"date_errors": date_errors}
                )
                return False
            
            self.log_test(
                test_name,
                "PASSED",
                {
                    "total_expirations": len(expirations),
                    "first_5": expirations[:5]
                }
            )
            return True
            
        except Exception as e:
            self.log_test(
                test_name,
                "FAILED",
                {"error": str(e)}
            )
            self.results["summary"]["errors"].append(str(e))
            return False
    
    def test_historical_data(self, ticker: str = "SPY") -> bool:
        """
        Test 4: Проверить, что получаем исторические данные
        Нужно для: Options Analyzer (Step 2 - IV Rank)
        """
        test_name = f"Historical Data ({ticker})"
        
        try:
            # HybridClient использует yahoo_client для исторических данных
            history = self.client.yahoo.get_historical_data(ticker, "2y")
            
            if not history:
                self.log_test(
                    test_name,
                    "FAILED",
                    {"error": "No historical data"}
                )
                return False
            
            # Проверяем структуру
            required_keys = ['dates', 'closes', 'highs', 'lows', 'volumes']
            missing_keys = []
            for key in required_keys:
                if key not in history:
                    missing_keys.append(key)
            
            if missing_keys:
                self.log_test(
                    test_name,
                    "FAILED",
                    {"missing_keys": missing_keys}
                )
                return False
            
            # Проверяем согласованность
            dates = history['dates']
            closes = history['closes']
            
            if len(dates) != len(closes):
                self.log_test(
                    test_name,
                    "FAILED",
                    {"error": f"Length mismatch: {len(dates)} dates vs {len(closes)} closes"}
                )
                return False
            
            if len(dates) == 0:
                self.log_test(
                    test_name,
                    "FAILED",
                    {"error": "Empty historical data"}
                )
                return False
            
            # Проверяем типы данных
            type_errors = []
            for close in closes[:5]:
                if not isinstance(close, (int, float)):
                    type_errors.append(f"Close price type: {type(close)}")
                    break
            
            if type_errors:
                self.log_test(
                    test_name,
                    "FAILED",
                    {"type_errors": type_errors}
                )
                return False
            
            self.log_test(
                test_name,
                "PASSED",
                {
                    "total_records": len(dates),
                    "date_range": f"{dates[0]} to {dates[-1]}",
                    "price_range": f"{min(closes):.2f} to {max(closes):.2f}"
                }
            )
            return True
            
        except Exception as e:
            self.log_test(
                test_name,
                "FAILED",
                {"error": str(e)}
            )
            self.results["summary"]["errors"].append(str(e))
            return False
    
    def run_all_tests(self):
        """Запустить все тесты"""
        print("\n" + "="*80)
        print("🧪 IB API DATA TYPES VERIFICATION")
        print("="*80 + "\n")
        
        # Test 1: Stock Price
        self.test_stock_price_data("SPY")
        
        # Test 2: Options Chain
        self.test_options_chain_data("SPY")
        
        # Test 3: Expiration Dates
        self.test_expiration_dates("SPY")
        
        # Test 4: Historical Data
        self.test_historical_data("SPY")
        
        # Печатаем итоги
        print("\n" + "="*80)
        print("📊 SUMMARY")
        print("="*80)
        print(f"Total Tests: {self.results['summary']['total']}")
        print(f"Passed: {self.results['summary']['passed']} ✅")
        print(f"Failed: {self.results['summary']['failed']} ❌")
        
        if self.results['summary']['errors']:
            print(f"\nErrors:")
            for error in self.results['summary']['errors']:
                print(f"  - {error}")
        
        print("="*80 + "\n")
        
        return self.results


def main():
    """Главная функция"""
    verifier = DataTypeVerifier()
    results = verifier.run_all_tests()
    
    # Сохраняем результаты в JSON
    output_file = os.path.join(
        os.path.dirname(__file__),
        "IB_DATA_TYPES_VERIFICATION.json"
    )
    
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"✅ Results saved to: {output_file}\n")
    
    # Возвращаем статус
    if results['summary']['failed'] == 0:
        print("🎉 ALL TESTS PASSED!")
        return 0
    else:
        print("❌ SOME TESTS FAILED!")
        return 1


if __name__ == "__main__":
    exit(main())
