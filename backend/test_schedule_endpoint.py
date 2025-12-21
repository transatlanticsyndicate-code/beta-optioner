"""
Тестовый запрос к эндпоинту создания задачи
"""
import requests
import json

url = "http://localhost:8000/api/crypto-rating/schedule"
data = {
    "day_of_week": "monday",
    "time": "14:00",
    "interval_value": 1,
    "interval_unit": "hours"
}

print("📡 Отправка запроса...")
print(f"URL: {url}")
print(f"Data: {json.dumps(data, indent=2)}")

try:
    response = requests.post(url, json=data, timeout=10)
    print(f"\n📥 Ответ получен: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.ok:
        print("\n✅ Успешно!")
    else:
        print("\n❌ Ошибка!")
        
except requests.exceptions.Timeout:
    print("\n❌ Timeout! Запрос завис.")
except requests.exceptions.ConnectionError:
    print("\n❌ Connection Error! Backend недоступен.")
except Exception as e:
    print(f"\n❌ Ошибка: {e}")
