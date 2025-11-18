"""
AI Chat routes - интеграция с Gemini API для анализа опционных стратегий
"""
from flask import Blueprint, request, jsonify
import google.generativeai as genai
import os
from datetime import datetime

ai_chat_bp = Blueprint('ai_chat', __name__)

# Настройка Gemini API
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-pro')
else:
    model = None

# Системный промпт для AI ассистента
SYSTEM_PROMPT = """Ты - профессиональный опционный трейдер и аналитик. 
Твоя задача - помогать пользователю анализировать опционные позиции и стратегии.

Ты должен:
- Объяснять риски и потенциальную прибыль
- Анализировать Greeks (Delta, Gamma, Theta, Vega)
- Давать рекомендации по управлению позициями
- Объяснять опционные стратегии простым языком
- Предупреждать о рисках

Отвечай кратко и по существу. Используй эмодзи для наглядности.
Если не уверен - говори об этом честно.
"""

@ai_chat_bp.route('/chat', methods=['POST'])
def chat():
    """
    Отправка сообщения в AI чат с контекстом позиций
    """
    try:
        if not model:
            return jsonify({
                'status': 'error',
                'message': 'Gemini API не настроен. Добавьте GEMINI_API_KEY в .env'
            }), 500

        data = request.json
        user_message = data.get('message', '')
        positions = data.get('positions', [])
        current_price = data.get('currentPrice', {})
        greeks = data.get('greeks', {})
        metrics = data.get('metrics', {})
        
        if not user_message:
            return jsonify({
                'status': 'error',
                'message': 'Сообщение не может быть пустым'
            }), 400

        # Формируем контекст для AI
        context = build_context(positions, current_price, greeks, metrics)
        
        # Полный промпт
        full_prompt = f"""{SYSTEM_PROMPT}

ТЕКУЩИЙ КОНТЕКСТ:
{context}

ВОПРОС ПОЛЬЗОВАТЕЛЯ:
{user_message}

ОТВЕТ:"""

        # Отправляем запрос в Gemini
        response = model.generate_content(full_prompt)
        
        return jsonify({
            'status': 'success',
            'message': response.text,
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        print(f"Error in AI chat: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Ошибка при обработке запроса: {str(e)}'
        }), 500


def build_context(positions, current_price, greeks, metrics):
    """
    Формирует контекст для AI на основе текущих позиций
    """
    context_parts = []
    
    # Информация о тикере
    if current_price:
        ticker = current_price.get('symbol', 'Unknown')
        price = current_price.get('price', 0)
        context_parts.append(f"Тикер: {ticker}")
        context_parts.append(f"Текущая цена: ${price:.2f}")
    
    # Позиции
    if positions and len(positions) > 0:
        context_parts.append(f"\nПозиции ({len(positions)} шт.):")
        for i, pos in enumerate(positions, 1):
            direction = "Buy" if pos.get('direction') == 'buy' else "Sell"
            opt_type = "Call" if pos.get('type') == 'call' else "Put"
            strike = pos.get('strike', 0)
            size = pos.get('size', 0)
            price = pos.get('price', 0)
            expiration = pos.get('expiration', '')
            
            context_parts.append(
                f"{i}. {direction} {opt_type} ${strike} x{size} @ ${price:.2f} (exp: {expiration})"
            )
    else:
        context_parts.append("\nПозиций пока нет")
    
    # Greeks
    if greeks:
        context_parts.append(f"\nPortfolio Greeks:")
        context_parts.append(f"Delta: {greeks.get('delta', 0):.2f}")
        context_parts.append(f"Gamma: {greeks.get('gamma', 0):.4f}")
        context_parts.append(f"Theta: {greeks.get('theta', 0):.2f}")
        context_parts.append(f"Vega: {greeks.get('vega', 0):.2f}")
    
    # Метрики
    if metrics:
        context_parts.append(f"\nМетрики:")
        if 'maxProfit' in metrics:
            context_parts.append(f"Max Profit: ${metrics['maxProfit']:.2f}")
        if 'maxLoss' in metrics:
            context_parts.append(f"Max Loss: ${metrics['maxLoss']:.2f}")
        if 'pop' in metrics:
            context_parts.append(f"Probability of Profit: {metrics['pop']:.1f}%")
        if 'breakevenPoints' in metrics and metrics['breakevenPoints']:
            breakevens = ', '.join([f"${bp:.2f}" for bp in metrics['breakevenPoints']])
            context_parts.append(f"Breakeven Points: {breakevens}")
    
    return '\n'.join(context_parts)


@ai_chat_bp.route('/suggestions', methods=['POST'])
def get_suggestions():
    """
    Получить автоматические рекомендации на основе позиций
    """
    try:
        if not model:
            return jsonify({
                'status': 'error',
                'message': 'Gemini API не настроен'
            }), 500

        data = request.json
        positions = data.get('positions', [])
        current_price = data.get('currentPrice', {})
        greeks = data.get('greeks', {})
        metrics = data.get('metrics', {})
        
        context = build_context(positions, current_price, greeks, metrics)
        
        prompt = f"""{SYSTEM_PROMPT}

ТЕКУЩИЙ КОНТЕКСТ:
{context}

Проанализируй текущий портфель и дай 3-5 кратких рекомендаций:
1. Оценка рисков
2. Что можно улучшить
3. На что обратить внимание

Формат: короткие пункты с эмодзи."""

        response = model.generate_content(prompt)
        
        return jsonify({
            'status': 'success',
            'suggestions': response.text,
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        print(f"Error getting suggestions: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Ошибка: {str(e)}'
        }), 500
