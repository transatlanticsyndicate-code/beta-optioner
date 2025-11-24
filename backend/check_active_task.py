"""
Проверка активной задачи в БД
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app.models.crypto_rating import CryptoScheduledTask

def check_active_task():
    db = SessionLocal()
    try:
        # Ищем активные задачи
        tasks = db.query(CryptoScheduledTask).filter(
            CryptoScheduledTask.is_active == True
        ).all()
        
        print(f"\n📊 Всего активных задач: {len(tasks)}\n")
        
        if tasks:
            for task in tasks:
                print(f"ID: {task.id}")
                print(f"День недели: {task.day_of_week}")
                print(f"Время: {task.time}")
                print(f"Интервал: {task.interval_value} {task.interval_unit}")
                print(f"Создана: {task.created_at}")
                print(f"Последний запуск: {task.last_run_at}")
                print(f"Следующий запуск: {task.next_run_at}")
                print(f"Активна: {task.is_active}")
                print("-" * 50)
        else:
            print("❌ Нет активных задач в БД")
            print("\n💡 Создайте задачу через интерфейс:")
            print("   1. Откройте http://localhost:3000/tools/crypto-rating")
            print("   2. Заполните форму")
            print("   3. Нажмите 'Запустить мониторинг'")
        
    finally:
        db.close()

if __name__ == "__main__":
    check_active_task()
