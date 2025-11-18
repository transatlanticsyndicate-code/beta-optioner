from fastapi import APIRouter, Request, HTTPException, BackgroundTasks, Depends
from typing import Dict, Any, Optional
from pydantic import BaseModel
from sqlalchemy.orm import Session
import aiohttp
import asyncio
import os
from dotenv import load_dotenv
import random
import string
from app.services.telegram_bot import TelegramBotManager
from app.services.telegram_auth import JWTManager
from app.database import get_db
from app.models.user import User
from datetime import datetime

router = APIRouter(prefix="/api/telegram", tags=["telegram"])

# Загружаем переменные окружения
load_dotenv(override=True)

# Инициализируем бота
bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
admin_id = int(os.getenv("TELEGRAM_ADMIN_ID", 0))
jwt_secret = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
site_url = os.getenv("SITE_URL", "http://localhost:3000")

bot_manager = TelegramBotManager(bot_token, admin_id)
jwt_manager = JWTManager(jwt_secret)

# Polling state
polling_task = None
last_update_id = 0

# Функция для создания БД сессии (для callback обработчиков)
def get_db_session():
    """Создаёт новую БД сессию с гарантией загрузки .env"""
    # Повторно загружаем .env на всякий случай
    load_dotenv(override=True)
    from app.database import SessionLocal as SL
    return SL()


class TelegramUpdate(BaseModel):
    """Telegram webhook update"""
    update_id: int
    message: Optional[Dict[str, Any]] = None
    callback_query: Optional[Dict[str, Any]] = None


@router.post("/webhook")
async def telegram_webhook(update: TelegramUpdate):
    """
    Webhook для получения обновлений от Telegram
    """
    
    try:
        # Обработка обычных сообщений
        if update.message:
            message_text = update.message.get('text', '')
            user_id = update.message['from']['id']
            first_name = update.message['from'].get('first_name', 'User')
            username = update.message['from'].get('username', f'user_{user_id}')
            
            # Команда /start
            if message_text.startswith('/start'):
                # Парсим параметр домена из /start команды
                # /start test или /start prod
                start_param = message_text.split()
                domain_param = start_param[1] if len(start_param) > 1 else 'prod'
                
                # Определяем site_url на основе параметра домена
                current_site_url = 'https://test.optioner.online' if domain_param == 'test' else 'https://optioner.online'
                
                # Получаем фото профиля пользователя через Telegram API
                photo_url = None
                try:
                    async with aiohttp.ClientSession() as session:
                        photos_url = f"https://api.telegram.org/bot{bot_token}/getUserProfilePhotos"
                        async with session.get(photos_url, params={"user_id": user_id, "limit": 1}) as resp:
                            if resp.status == 200:
                                photos_data = await resp.json()
                                if photos_data.get('ok') and photos_data.get('result', {}).get('photos'):
                                    # Получаем file_id самого большого фото
                                    photo = photos_data['result']['photos'][0][-1]  # Последнее = самое большое
                                    file_id = photo['file_id']
                                    
                                    # Получаем file_path
                                    file_url = f"https://api.telegram.org/bot{bot_token}/getFile"
                                    async with session.get(file_url, params={"file_id": file_id}) as file_resp:
                                        if file_resp.status == 200:
                                            file_data = await file_resp.json()
                                            if file_data.get('ok'):
                                                file_path = file_data['result']['file_path']
                                                photo_url = f"https://api.telegram.org/file/bot{bot_token}/{file_path}"
                except Exception as e:
                    print(f"⚠️ Не удалось получить фото профиля: {e}")
                
                # Создаем или обновляем пользователя в БД
                from app.database import SessionLocal
                from app.models.user import User
                db = SessionLocal()
                try:
                    # Ищем пользователя
                    db_user = db.query(User).filter(User.telegram_id == user_id).first()
                    
                    is_new_user = False
                    if not db_user:
                        # Создаем нового пользователя
                        db_user = User(
                            telegram_id=user_id,
                            telegram_username=username,
                            first_name=first_name,
                            photo_url=photo_url,
                            status='pending',
                            role='user',
                            domain=domain_param  # Сохраняем домен с которого пришёл пользователь
                        )
                        db.add(db_user)
                        db.commit()
                        db.refresh(db_user)
                        is_new_user = True
                        print(f"✅ Новый пользователь создан в БД: {first_name} (ID: {db_user.id})")
                    else:
                        # Обновляем данные существующего пользователя
                        db_user.first_name = first_name
                        db_user.photo_url = photo_url
                        db_user.telegram_username = username
                        db.commit()
                        print(f"✅ Данные пользователя обновлены: {first_name} (статус: {db_user.status})")
                    
                    # Проверяем статус пользователя
                    if db_user.status == 'rejected':
                        # Пользователь отклонен
                        text = f"""
❌ <b>Доступ запрещен</b>

К сожалению, ваш запрос на доступ был отклонен администратором.
"""
                        await bot_manager.send_message(user_id, text)
                        return
                    
                    elif db_user.status == 'pending':
                        # Пользователь ожидает модерацию
                        text = f"""
⏳ <b>Ожидание модерации</b>

Привет, {first_name}! 👋

Ваш запрос отправлен администратору. Пожалуйста, подождите одобрения.
Мы уведомим вас, когда доступ будет предоставлен.
"""
                        await bot_manager.send_message(user_id, text)
                        
                        # Отправляем запрос админу на модерацию (только для новых пользователей)
                        if is_new_user:
                            print(f"📧 Отправляю запрос на модерацию админу (ID: {admin_id})")
                            admin_text = f"""
🔔 <b>Новый запрос на доступ</b>

Пользователь: {first_name}
Username: @{username}
Telegram ID: {user_id}

Одобрить или отклонить?
"""
                            admin_markup = {
                                "inline_keyboard": [
                                    [
                                        {
                                            "text": "✅ Одобрить",
                                            "callback_data": f"approve_{db_user.id}"
                                        },
                                        {
                                            "text": "❌ Отклонить",
                                            "callback_data": f"reject_{db_user.id}"
                                        }
                                    ]
                                ]
                            }
                            await bot_manager.send_message(admin_id, admin_text, reply_markup=admin_markup)
                            print(f"✅ Запрос на модерацию отправлен админу")
                        else:
                            print(f"⏭️ Пользователь уже существует (is_new_user=False), пропускаем уведомление админу")
                        return
                    
                    elif db_user.status == 'approved':
                        # Пользователь одобрен - генерируем токен
                        token = jwt_manager.create_token(
                            user_id=db_user.id,
                            telegram_id=user_id,
                            username=username,
                            role=db_user.role,
                            first_name=first_name,
                            photo_url=photo_url
                        )
                        
                        # Отправляем ссылку для авторизации (используем current_site_url на основе параметра домена)
                        auth_url = f"{current_site_url}?token={token}"
                        
                        # Сохраняем домен пользователя если это новый пользователь
                        if db_user.domain is None:
                            db_user.domain = domain_param
                            db.commit()
                        
                        text = f"""
✅ <b>Авторизация</b>

Привет, {first_name}! 👋

Нажми кнопку ниже чтобы авторизоваться на сайте:
"""
                        
                        reply_markup = {
                            "inline_keyboard": [
                                [
                                    {
                                        "text": "🔐 Авторизоваться",
                                        "url": auth_url
                                    }
                                ]
                            ]
                        }
                        
                        await bot_manager.send_message(user_id, text, reply_markup=reply_markup)
                    
                finally:
                    db.close()
            
            else:
                # Другие сообщения
                text = f"Привет! Я бот для авторизации. Используй команду /start"
                await bot_manager.send_message(user_id, text)
        
        # Обработка callback_query (нажатия на кнопки)
        elif update.callback_query:
            callback_data = update.callback_query.get('data', '')
            callback_user_id = update.callback_query['from']['id']
            chat_id = update.callback_query['message']['chat']['id']
            
            print(f"🔘 Callback получен в webhook: {callback_data} от {callback_user_id}")
            
            # Парсим callback_data: "approve_123" или "reject_123"
            if callback_data.startswith('approve_'):
                target_user_id = int(callback_data.split('_')[1])
                print(f"✅ Одобрение пользователя {target_user_id}")
                
                # Работаем напрямую с БД
                db = get_db_session()
                try:
                    # Находим пользователя
                    db_user = db.query(User).filter(User.id == target_user_id).first()
                    if db_user:
                        # Обновляем статус
                        db_user.status = 'approved'
                        db_user.approved_at = datetime.utcnow()
                        db_user.approved_by_user_id = callback_user_id
                        db.commit()
                        
                        print(f"✅ Пользователь {db_user.first_name} (ID: {target_user_id}) одобрен!")
                        
                        # Генерируем токен для пользователя
                        token = jwt_manager.create_token(
                            user_id=db_user.id,
                            telegram_id=db_user.telegram_id,
                            username=db_user.telegram_username or f"user_{db_user.telegram_id}",
                            role=db_user.role,
                            first_name=db_user.first_name,
                            photo_url=db_user.photo_url
                        )
                        
                        # Используем сохранённый домен пользователя для генерации ссылки авторизации
                        user_domain = db_user.domain or 'prod'
                        user_site_url = 'https://test.optioner.online' if user_domain == 'test' else 'https://optioner.online'
                        auth_url = f"{user_site_url}?token={token}"
                        
                        # Уведомляем админа
                        await bot_manager.send_message(
                            chat_id,
                            f"✅ Пользователь {db_user.first_name} одобрен!\n\nЕму отправлена ссылка для входа."
                        )
                        
                        # Отправляем ссылку пользователю
                        text = f"""✅ <b>Доступ одобрен!</b>

Привет, {db_user.first_name}! 👋

Ваш запрос был одобрен администратором.
Нажмите кнопку ниже чтобы авторизоваться на сайте:
"""
                        
                        reply_markup = {
                            "inline_keyboard": [
                                [
                                    {
                                        "text": "🔐 Авторизоваться",
                                        "url": auth_url
                                    }
                                ]
                            ]
                        }
                        
                        await bot_manager.send_message(db_user.telegram_id, text, reply_markup=reply_markup)
                    else:
                        await bot_manager.send_message(
                            chat_id,
                            f"❌ Пользователь с ID {target_user_id} не найден"
                        )
                except Exception as e:
                    print(f"❌ Ошибка при одобрении: {e}")
                    import traceback
                    traceback.print_exc()
                    await bot_manager.send_message(
                        chat_id,
                        f"❌ Ошибка: {e}"
                    )
                finally:
                    db.close()
                
            elif callback_data.startswith('reject_'):
                target_user_id = int(callback_data.split('_')[1])
                print(f"❌ Отклонение пользователя {target_user_id}")
                
                # Работаем напрямую с БД
                db = get_db_session()
                try:
                    # Находим пользователя
                    db_user = db.query(User).filter(User.id == target_user_id).first()
                    if db_user:
                        # Обновляем статус
                        db_user.status = 'rejected'
                        db.commit()
                        
                        print(f"❌ Пользователь {db_user.first_name} (ID: {target_user_id}) отклонен!")
                        
                        # Уведомляем админа
                        await bot_manager.send_message(
                            chat_id,
                            f"❌ Пользователь {db_user.first_name} отклонён!"
                        )
                        
                        # Уведомляем пользователя
                        await bot_manager.send_message(
                            db_user.telegram_id,
                            f"❌ <b>Доступ запрещен</b>\n\nК сожалению, ваш запрос на доступ был отклонен администратором."
                        )
                    else:
                        await bot_manager.send_message(
                            chat_id,
                            f"❌ Пользователь с ID {target_user_id} не найден"
                        )
                except Exception as e:
                    print(f"❌ Ошибка при отклонении: {e}")
                    import traceback
                    traceback.print_exc()
                    await bot_manager.send_message(
                        chat_id,
                        f"❌ Ошибка: {e}"
                    )
                finally:
                    db.close()
        
        return {"ok": True}
    
    except Exception as e:
        print(f"Ошибка обработки webhook: {e}")
        return {"ok": False, "error": str(e)}


async def process_telegram_update(update: Dict[str, Any]):
    """Обработка обновления от Telegram"""
    try:
        # Обработка обычных сообщений
        if 'message' in update:
            message = update['message']
            message_text = message.get('text', '')
            user_id = message['from']['id']
            first_name = message['from'].get('first_name', 'User')
            username = message['from'].get('username', f'user_{user_id}')
            
            print(f"💬 Сообщение от {first_name} ({user_id}): {message_text}")
            
            # Команда /start
            if message_text.startswith('/start'):
                print(f"🔐 /start команда получена от {first_name} ({user_id})")
                
                try:
                    # Получаем фото профиля пользователя через Telegram API
                    photo_url = None
                    try:
                        async with aiohttp.ClientSession() as session:
                            photos_url = f"https://api.telegram.org/bot{bot_token}/getUserProfilePhotos"
                            async with session.get(photos_url, params={"user_id": user_id, "limit": 1}) as resp:
                                if resp.status == 200:
                                    photos_data = await resp.json()
                                    if photos_data.get('ok') and photos_data.get('result', {}).get('photos'):
                                        # Получаем file_id самого большого фото
                                        photo = photos_data['result']['photos'][0][-1]
                                        file_id = photo['file_id']
                                        
                                        # Получаем file_path
                                        file_url = f"https://api.telegram.org/bot{bot_token}/getFile"
                                        async with session.get(file_url, params={"file_id": file_id}) as file_resp:
                                            if file_resp.status == 200:
                                                file_data = await file_resp.json()
                                                if file_data.get('ok'):
                                                    file_path = file_data['result']['file_path']
                                                    photo_url = f"https://api.telegram.org/file/bot{bot_token}/{file_path}"
                                                    print(f"📸 Фото профиля получено: {photo_url[:50]}...")
                    except Exception as e:
                        print(f"⚠️ Не удалось получить фото профиля: {e}")
                    
                    # Создаем или обновляем пользователя в БД
                    from app.database import SessionLocal
                    from app.models.user import User
                    db = SessionLocal()
                    try:
                        # Ищем пользователя
                        db_user = db.query(User).filter(User.telegram_id == user_id).first()
                        
                        is_new_user = False
                        if not db_user:
                            # Создаем нового пользователя
                            db_user = User(
                                telegram_id=user_id,
                                telegram_username=username,
                                first_name=first_name,
                                photo_url=photo_url,
                                status='pending',
                                role='user'
                            )
                            db.add(db_user)
                            db.commit()
                            db.refresh(db_user)
                            is_new_user = True
                            print(f"✅ Новый пользователь создан в БД: {first_name} (ID: {db_user.id})")
                        else:
                            # Обновляем данные существующего пользователя
                            db_user.first_name = first_name
                            db_user.photo_url = photo_url
                            db_user.telegram_username = username
                            db.commit()
                            print(f"✅ Данные пользователя обновлены: {first_name} (статус: {db_user.status})")
                        
                        # Проверяем статус пользователя
                        if db_user.status == 'rejected':
                            # Пользователь отклонен
                            text = f"""
❌ <b>Доступ запрещен</b>

К сожалению, ваш запрос на доступ был отклонен администратором.
"""
                            await bot_manager.send_message(user_id, text)
                            return
                        
                        elif db_user.status == 'pending':
                            # Пользователь ожидает модерацию
                            text = f"""
⏳ <b>Ожидание модерации</b>

Привет, {first_name}! 👋

Ваш запрос отправлен администратору. Пожалуйста, подождите одобрения.
Мы уведомим вас, когда доступ будет предоставлен.
"""
                            await bot_manager.send_message(user_id, text)
                            
                            # Отправляем запрос админу на модерацию (только для новых пользователей)
                            if is_new_user:
                                print(f"📧 Отправляю запрос на модерацию админу (ID: {admin_id})")
                                admin_text = f"""
🔔 <b>Новый запрос на доступ</b>

Пользователь: {first_name}
Username: @{username}
Telegram ID: {user_id}

Одобрить или отклонить?
"""
                                admin_markup = {
                                    "inline_keyboard": [
                                        [
                                            {
                                                "text": "✅ Одобрить",
                                                "callback_data": f"approve_{db_user.id}"
                                            },
                                            {
                                                "text": "❌ Отклонить",
                                                "callback_data": f"reject_{db_user.id}"
                                            }
                                        ]
                                    ]
                                }
                                await bot_manager.send_message(admin_id, admin_text, reply_markup=admin_markup)
                                print(f"✅ Запрос на модерацию отправлен админу")
                            else:
                                print(f"⏭️ Пользователь уже существует (is_new_user=False), пропускаем уведомление админу")
                            return
                        
                        elif db_user.status == 'approved':
                            # Пользователь одобрен - генерируем токен
                            print(f"🔑 Генерирую токен...")
                            token = jwt_manager.create_token(
                                user_id=db_user.id,
                                telegram_id=user_id,
                                username=username,
                                first_name=first_name,
                                photo_url=photo_url,
                                role=db_user.role
                            )
                            print(f"✅ Токен создан: {token[:30]}...")
                            
                            # Отправляем ссылку для авторизации
                            auth_url = f"{site_url}?token={token}"
                            print(f"🔗 URL авторизации: {auth_url[:60]}...")
                            
                            # Отправляем ссылку в тексте
                            # Telegram автоматически делает URL кликабельными
                            text = f"""✅ <b>Авторизация</b>

Привет, {first_name}! 👋

Скопируй и открой ссылку в браузере:

{auth_url}"""
                            
                            print(f"📤 Отправляю сообщение боту...")
                            await bot_manager.send_message(user_id, text)
                            print(f"✅ Сообщение отправлено!")
                        
                    finally:
                        db.close()
                    
                except Exception as e:
                    print(f"❌ Ошибка при обработке /start: {e}")
                    import traceback
                    traceback.print_exc()
            else:
                # Другие сообщения
                text = f"Привет! Я бот для авторизации. Используй команду /start"
                await bot_manager.send_message(user_id, text)
        
        # Обработка callback_query (нажатия на кнопки)
        elif 'callback_query' in update:
            callback = update['callback_query']
            callback_data = callback.get('data', '')
            caller_id = callback['from']['id']
            message_id = callback['message']['message_id']
            chat_id = callback['message']['chat']['id']
            
            print(f"🔘 Callback получен: {callback_data} от {caller_id}")
            
            # Парсим callback_data: "approve_123" или "reject_123"
            if callback_data.startswith('approve_'):
                target_user_id = int(callback_data.split('_')[1])
                print(f"✅ Одобрение пользователя {target_user_id}")
                
                # Работаем напрямую с БД
                db = get_db_session()
                try:
                    # Находим пользователя
                    db_user = db.query(User).filter(User.id == target_user_id).first()
                    if db_user:
                        # Обновляем статус
                        db_user.status = 'approved'
                        db_user.approved_at = datetime.utcnow()
                        db_user.approved_by_user_id = caller_id
                        db.commit()
                        
                        print(f"✅ Пользователь {db_user.first_name} (ID: {target_user_id}) одобрен!")
                        
                        # Генерируем токен для пользователя
                        token = jwt_manager.create_token(
                            user_id=db_user.id,
                            telegram_id=db_user.telegram_id,
                            username=db_user.telegram_username or f"user_{db_user.telegram_id}",
                            role=db_user.role,
                            first_name=db_user.first_name,
                            photo_url=db_user.photo_url
                        )
                        
                        # Используем сохранённый домен пользователя для генерации ссылки авторизации
                        user_domain = db_user.domain or 'prod'
                        user_site_url = 'https://test.optioner.online' if user_domain == 'test' else 'https://optioner.online'
                        auth_url = f"{user_site_url}?token={token}"
                        
                        # Уведомляем админа
                        await bot_manager.send_message(
                            chat_id,
                            f"✅ Пользователь {db_user.first_name} одобрен!\n\nЕму отправлена ссылка для входа."
                        )
                        
                        # Отправляем ссылку пользователю
                        text = f"""✅ <b>Доступ одобрен!</b>

Привет, {db_user.first_name}! 👋

Ваш запрос был одобрен администратором.
Нажмите кнопку ниже чтобы авторизоваться на сайте:
"""
                        
                        reply_markup = {
                            "inline_keyboard": [
                                [
                                    {
                                        "text": "🔐 Авторизоваться",
                                        "url": auth_url
                                    }
                                ]
                            ]
                        }
                        
                        await bot_manager.send_message(db_user.telegram_id, text, reply_markup=reply_markup)
                    else:
                        await bot_manager.send_message(
                            chat_id,
                            f"❌ Пользователь с ID {target_user_id} не найден"
                        )
                except Exception as e:
                    print(f"❌ Ошибка при одобрении: {e}")
                    import traceback
                    traceback.print_exc()
                    await bot_manager.send_message(
                        chat_id,
                        f"❌ Ошибка: {e}"
                    )
                finally:
                    db.close()
                
            elif callback_data.startswith('reject_'):
                target_user_id = int(callback_data.split('_')[1])
                print(f"❌ Отклонение пользователя {target_user_id}")
                
                # Работаем напрямую с БД
                db = get_db_session()
                try:
                    # Находим пользователя
                    db_user = db.query(User).filter(User.id == target_user_id).first()
                    if db_user:
                        # Обновляем статус
                        db_user.status = 'rejected'
                        db.commit()
                        
                        print(f"❌ Пользователь {db_user.first_name} (ID: {target_user_id}) отклонен!")
                        
                        # Уведомляем админа
                        await bot_manager.send_message(
                            chat_id,
                            f"❌ Пользователь {db_user.first_name} отклонён!"
                        )
                        
                        # Уведомляем пользователя
                        await bot_manager.send_message(
                            db_user.telegram_id,
                            f"❌ <b>Доступ запрещен</b>\n\nК сожалению, ваш запрос на доступ был отклонен администратором."
                        )
                    else:
                        await bot_manager.send_message(
                            chat_id,
                            f"❌ Пользователь с ID {target_user_id} не найден"
                        )
                except Exception as e:
                    print(f"❌ Ошибка при отклонении: {e}")
                    import traceback
                    traceback.print_exc()
                    await bot_manager.send_message(
                        chat_id,
                        f"❌ Ошибка: {e}"
                    )
                finally:
                    db.close()
    
    except Exception as e:
        print(f"Ошибка обработки обновления: {e}")


async def telegram_polling():
    """Polling для получения обновлений от Telegram"""
    global last_update_id
    
    if not bot_token:
        print("❌ TELEGRAM_BOT_TOKEN не установлен")
        return
    
    print(f"🤖 Запуск Telegram polling с токеном: {bot_token[:20]}...")
    
    while True:
        try:
            async with aiohttp.ClientSession() as session:
                url = f"https://api.telegram.org/bot{bot_token}/getUpdates"
                params = {
                    "offset": last_update_id + 1,
                    "timeout": 30
                }
                
                print(f"🔄 Polling запрос: offset={last_update_id + 1}")
                
                async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=35)) as resp:
                    print(f"📡 Ответ от Telegram: status={resp.status}")
                    
                    if resp.status == 200:
                        data = await resp.json()
                        print(f"📊 Ответ JSON: ok={data.get('ok')}, result_count={len(data.get('result', []))}")
                        
                        if data.get('ok'):
                            updates = data.get('result', [])
                            if updates:
                                print(f"📨 Получено {len(updates)} обновлений")
                            
                            for update in updates:
                                last_update_id = update['update_id']
                                print(f"⚙️ Обработка обновления {update['update_id']} (offset будет {last_update_id + 1})")
                                await process_telegram_update(update)
                        else:
                            print(f"❌ Ошибка от Telegram: {data.get('description', 'Unknown')}")
                    elif resp.status == 409:
                        error_data = await resp.json()
                        print(f"❌ Conflict 409: {error_data.get('description', 'Unknown conflict')}")
                        await asyncio.sleep(10)  # Ждём перед повтором
                    else:
                        error_data = await resp.json()
                        print(f"❌ Ошибка HTTP {resp.status}: {error_data.get('description', 'Unknown error')}")
                        await asyncio.sleep(5)
        
        except asyncio.TimeoutError:
            print(f"⏱️ Timeout при polling (нормально)")
        except Exception as e:
            print(f"❌ Ошибка polling: {e}")
            import traceback
            traceback.print_exc()
            await asyncio.sleep(5)


# Функции для запуска polling (будут вызваны из main.py)
async def start_polling():
    """Запуск polling"""
    global polling_task
    
    if bot_token and admin_id:
        polling_task = asyncio.create_task(telegram_polling())
        print("✅ Telegram polling запущен")


async def stop_polling():
    """Остановка polling"""
    global polling_task
    
    if polling_task:
        polling_task.cancel()
        print("✅ Telegram polling остановлен")
