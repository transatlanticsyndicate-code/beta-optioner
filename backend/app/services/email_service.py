"""
Сервис для отправки email уведомлений
ЗАЧЕМ: Уведомление о завершении анализа криптовалют
Затрагивает: SMTP сервер, модели анализа
"""

import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Dict, List
from datetime import datetime

logger = logging.getLogger(__name__)

# Email конфигурация (нужно будет настроить SMTP)
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
SENDER_EMAIL = "transatlanticsyndicate@gmail.com"
SENDER_PASSWORD = "REMOVED_PASSWORD"  # Нужно будет добавить пароль приложения Gmail
RECIPIENT_EMAIL = "transatlanticsyndicate@gmail.com"


class EmailService:
    """
    Сервис для отправки email уведомлений
    """
    
    def __init__(self):
        self.smtp_server = SMTP_SERVER
        self.smtp_port = SMTP_PORT
        self.sender_email = SENDER_EMAIL
        self.sender_password = SENDER_PASSWORD
        self.recipient_email = RECIPIENT_EMAIL
    
    def send_analysis_notification(
        self, 
        analysis_id: int,
        dropped_count: int,
        added_count: int,
        dropped_cryptos: List[Dict],
        added_cryptos: List[Dict],
        analysis_url: str
    ) -> bool:
        """
        Отправить уведомление о завершении анализа
        
        Args:
            analysis_id: ID анализа
            dropped_count: Количество выпавших криптовалют
            added_count: Количество вошедших криптовалют
            dropped_cryptos: Список выпавших криптовалют
            added_cryptos: Список вошедших криптовалют
            analysis_url: Ссылка на анализ
            
        Returns:
            bool: True если отправка успешна
        """
        try:
            logger.info(f"Sending email notification for analysis {analysis_id}")
            
            # Создаем HTML письмо
            html_content = self._generate_html_email(
                analysis_id,
                dropped_count,
                added_count,
                dropped_cryptos,
                added_cryptos,
                analysis_url
            )
            
            # Создаем сообщение
            message = MIMEMultipart("alternative")
            message["Subject"] = f"🔔 Новый анализ криптовалют #{analysis_id}"
            message["From"] = self.sender_email
            message["To"] = self.recipient_email
            
            # Добавляем HTML контент
            html_part = MIMEText(html_content, "html")
            message.attach(html_part)
            
            # Отправляем email
            if self.sender_password:
                with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                    server.starttls()
                    server.login(self.sender_email, self.sender_password)
                    server.send_message(message)
                
                logger.info(f"Email notification sent successfully for analysis {analysis_id}")
                return True
            else:
                logger.warning("Email password not configured, skipping email send")
                # В режиме разработки просто логируем
                logger.info(f"Would send email:\n{html_content}")
                return False
                
        except Exception as e:
            logger.error(f"Error sending email notification: {str(e)}")
            return False
    
    def _generate_html_email(
        self,
        analysis_id: int,
        dropped_count: int,
        added_count: int,
        dropped_cryptos: List[Dict],
        added_cryptos: List[Dict],
        analysis_url: str
    ) -> str:
        """
        Генерировать HTML контент для email
        """
        # Формируем списки криптовалют (первые 10)
        dropped_list = "<br>".join([
            f"• {crypto['symbol']} ({crypto['name']})" 
            for crypto in dropped_cryptos[:10]
        ])
        if dropped_count > 10:
            dropped_list += f"<br>... и еще {dropped_count - 10}"
        
        added_list = "<br>".join([
            f"• {crypto['symbol']} ({crypto['name']})" 
            for crypto in added_cryptos[:10]
        ])
        if added_count > 10:
            added_list += f"<br>... и еще {added_count - 10}"
        
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }}
                .header {{
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 30px;
                    border-radius: 10px 10px 0 0;
                    text-align: center;
                }}
                .content {{
                    background: #f8f9fa;
                    padding: 30px;
                    border-radius: 0 0 10px 10px;
                }}
                .stats {{
                    display: flex;
                    justify-content: space-around;
                    margin: 20px 0;
                }}
                .stat-box {{
                    background: white;
                    padding: 20px;
                    border-radius: 8px;
                    text-align: center;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    flex: 1;
                    margin: 0 10px;
                }}
                .stat-number {{
                    font-size: 32px;
                    font-weight: bold;
                    color: #667eea;
                }}
                .stat-label {{
                    color: #666;
                    font-size: 14px;
                    margin-top: 5px;
                }}
                .section {{
                    background: white;
                    padding: 20px;
                    margin: 20px 0;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }}
                .section-title {{
                    font-size: 18px;
                    font-weight: bold;
                    margin-bottom: 15px;
                    color: #333;
                }}
                .crypto-list {{
                    color: #555;
                    line-height: 1.8;
                }}
                .button {{
                    display: inline-block;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 15px 40px;
                    text-decoration: none;
                    border-radius: 25px;
                    font-weight: bold;
                    margin: 20px 0;
                    text-align: center;
                }}
                .footer {{
                    text-align: center;
                    color: #999;
                    font-size: 12px;
                    margin-top: 30px;
                }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🚀 Анализ криптовалют завершен</h1>
                <p>Анализ #{analysis_id} • {datetime.utcnow().strftime('%d.%m.%Y %H:%M UTC')}</p>
            </div>
            
            <div class="content">
                <div class="stats">
                    <div class="stat-box">
                        <div class="stat-number">{dropped_count}</div>
                        <div class="stat-label">Выпали из топа</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-number">{added_count}</div>
                        <div class="stat-label">Вошли в топ</div>
                    </div>
                </div>
                
                {f'''
                <div class="section">
                    <div class="section-title">📉 Выпали из топ-400:</div>
                    <div class="crypto-list">{dropped_list if dropped_list else "Нет изменений"}</div>
                </div>
                ''' if dropped_count > 0 else ''}
                
                {f'''
                <div class="section">
                    <div class="section-title">📈 Вошли в топ-400:</div>
                    <div class="crypto-list">{added_list if added_list else "Нет изменений"}</div>
                </div>
                ''' if added_count > 0 else ''}
                
                <div style="text-align: center;">
                    <a href="{analysis_url}" class="button">
                        Посмотреть полный анализ →
                    </a>
                </div>
                
                <div class="footer">
                    <p>Это автоматическое уведомление от системы мониторинга криптовалют</p>
                    <p>Transatlantic Syndicate © 2025</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        return html


# Singleton instance
email_service = EmailService()
