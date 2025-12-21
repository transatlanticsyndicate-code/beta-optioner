import os
import asyncio
import logging
from typing import Optional
import aiohttp
from datetime import datetime

logger = logging.getLogger(__name__)


class TelegramBotManager:
    """Управление Telegram ботом для админа"""
    
    def __init__(self, bot_token: str, admin_id: int):
        self.bot_token = bot_token
        self.admin_id = admin_id
        self.api_url = f"https://api.telegram.org/bot{bot_token}"
    
    async def send_message(self, chat_id: int, text: str, reply_markup=None) -> bool:
        """Отправляет сообщение в Telegram"""
        try:
            async with aiohttp.ClientSession() as session:
                payload = {
                    "chat_id": chat_id,
                    "text": text,
                    "parse_mode": "HTML"
                }
                if reply_markup:
                    payload["reply_markup"] = reply_markup
                
                print(f"📤 Отправляю сообщение: chat_id={chat_id}, text_len={len(text)}, has_markup={bool(reply_markup)}")
                
                async with session.post(
                    f"{self.api_url}/sendMessage",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    data = await resp.json()
                    print(f"📤 Telegram API ответ: status={resp.status}, ok={data.get('ok')}")
                    if not data.get('ok'):
                        print(f"❌ Ошибка от Telegram: {data.get('description', 'Unknown error')}")
                        print(f"📋 Полный ответ: {data}")
                    return data.get('ok', False)
        except Exception as e:
            print(f"❌ Ошибка отправки сообщения: {e}")
            import traceback
            traceback.print_exc()
            logger.error(f"Ошибка отправки сообщения: {e}")
            return False
    
    async def notify_new_user(self, user_id: int, username: str, first_name: str, last_name: str = None) -> bool:
        """
        Отправляет уведомление админу о новом пользователе
        """
        
        full_name = f"{first_name} {last_name}".strip() if last_name else first_name
        
        # Формируем сообщение
        text = f"""
🔔 <b>Новый пользователь запросил доступ</b>

👤 <b>Имя:</b> {full_name}
📱 <b>Username:</b> @{username if username else 'не указан'}
🆔 <b>Telegram ID:</b> <code>{user_id}</code>

<b>Действие:</b> Одобрить или отклонить?
"""
        
        # Кнопки для быстрого действия
        reply_markup = {
            "inline_keyboard": [
                [
                    {
                        "text": "✅ Одобрить",
                        "callback_data": f"approve_user_{user_id}"
                    },
                    {
                        "text": "❌ Отклонить",
                        "callback_data": f"reject_user_{user_id}"
                    }
                ]
            ]
        }
        
        return await self.send_message(
            self.admin_id,
            text,
            reply_markup=reply_markup
        )
    
    async def send_auth_link(self, user_id: int, token: str, site_url: str = "http://localhost:3000") -> bool:
        """
        Отправляет ссылку для авторизации пользователю
        """
        
        auth_url = f"{site_url}?token={token}"
        
        text = f"""
✅ <b>Доступ одобрен!</b>

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
        
        return await self.send_message(
            user_id,
            text,
            reply_markup=reply_markup
        )
    
    async def notify_user_approved(self, user_id: int, first_name: str) -> bool:
        """
        Отправляет уведомление пользователю об одобрении
        """
        
        text = f"""
✅ <b>Доступ одобрен!</b>

Привет, {first_name}! 👋

Твой доступ к сервису <b>Optioner</b> одобрен администратором.

Теперь ты можешь использовать все инструменты:
• Калькулятор опционов
• Анализ стратегий
• И многое другое!

🚀 <a href="https://optioner.online">Перейти на сайт</a>
"""
        
        return await self.send_message(user_id, text)
    
    async def notify_user_rejected(self, user_id: int, first_name: str) -> bool:
        """
        Отправляет уведомление пользователю об отклонении
        """
        
        text = f"""
❌ <b>Доступ отклонен</b>

Привет, {first_name}! 👋

К сожалению, твой запрос на доступ был отклонен администратором.

Если у тебя есть вопросы, свяжись с поддержкой.
"""
        
        return await self.send_message(user_id, text)
    
    async def notify_admin_action(self, action: str, username: str, admin_name: str = "Администратор") -> bool:
        """
        Отправляет уведомление админу о выполненном действии
        """
        
        action_text = "одобрен" if action == "approved" else "отклонен"
        
        text = f"""
✅ <b>Действие выполнено</b>

Пользователь @{username} {action_text}.

Время: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC
"""
        
        return await self.send_message(self.admin_id, text)


class TelegramBotService:
    """Сервис для работы с Telegram ботом"""
    
    def __init__(self, bot_token: str, admin_id: int):
        self.bot_manager = TelegramBotManager(bot_token, admin_id)
    
    async def on_new_user_registered(self, user_id: int, username: str, first_name: str, last_name: str = None):
        """Вызывается когда новый пользователь зарегистрировался"""
        await self.bot_manager.notify_new_user(user_id, username, first_name, last_name)
    
    async def on_user_approved(self, user_id: int, first_name: str, token: str = None, site_url: str = "http://localhost:3000"):
        """Вызывается когда пользователь одобрен"""
        if token:
            # Отправляем ссылку для авторизации вместо просто уведомления
            await self.bot_manager.send_auth_link(user_id, token, site_url)
        else:
            # Fallback на старый способ если нет токена
            await self.bot_manager.notify_user_approved(user_id, first_name)
    
    async def on_user_rejected(self, user_id: int, first_name: str):
        """Вызывается когда пользователь отклонен"""
        await self.bot_manager.notify_user_rejected(user_id, first_name)
