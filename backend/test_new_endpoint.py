"""
Тест нового эндпоинта создания снимка
"""
import requests

url = "http://localhost:8000/api/crypto-rating/create-snapshot"

print("📡 Отправка запроса на создание снимка...")
print(f"URL: {url}")

try:
    response = requests.post(url, timeout=30)
    print(f"\n📥 Ответ получен: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.ok:
        print("\n✅ Успешно!")
    else:
        print("\n❌ Ошибка!")
        
except requests.exceptions.Timeout:
    print("\n❌ Timeout! Запрос завис (>30 сек).")
except requests.exceptions.ConnectionError:
    print("\n❌ Connection Error! Backend недоступен.")
except Exception as e:
    print(f"\n❌ Ошибка: {e}")
