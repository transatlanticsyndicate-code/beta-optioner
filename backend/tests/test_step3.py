"""
Тест step3 с автосохранением
"""
import requests
import json

BASE_URL = "http://localhost:8000"

print("🧪 Тестирование Step 3 с автосохранением")
print("=" * 60)

# Step 1
print("\n📍 Step 1: Получение данных...")
r1 = requests.post(f"{BASE_URL}/analyze/step1?ticker=AAPL")
print(f"Status: {r1.status_code}")
data1 = r1.json()
print(f"Result: {data1.get('status')}")

# Step 2  
print("\n📍 Step 2: Расчет метрик...")
r2 = requests.post(f"{BASE_URL}/analyze/step2?ticker=AAPL")
print(f"Status: {r2.status_code}")
data2 = r2.json()
print(f"Result: {data2.get('status')}")

# Step 3
print("\n📍 Step 3: AI анализ + автосохранение...")
r3 = requests.post(f"{BASE_URL}/analyze/step3?ticker=AAPL&ai_provider=gemini")
print(f"Status: {r3.status_code}")
data3 = r3.json()

print(f"\nResult: {data3.get('status')}")
print(f"Ticker: {data3.get('ticker')}")
print(f"AI Provider: {data3.get('ai_provider')}")

if 'analysis_id' in data3:
    print(f"\n✅ Analysis ID: {data3['analysis_id']}")
    print(f"🔗 Share URL: {data3['share_url']}")
else:
    print("\n⚠️ Нет analysis_id в ответе - автосохранение не сработало")
    
print("\n" + "=" * 60)
print("Проверь консоль backend на наличие логов:")
print("  💾 Attempting to save analysis to database...")
print("  ✅ Analysis saved to DB: ...")
