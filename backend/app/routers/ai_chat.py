"""
AI Chat Router - FastAPI эндпоинты для AI чата с Gemini
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Optional
import google.generativeai as genai
import os
from datetime import datetime

router = APIRouter(prefix="/api/ai", tags=["AI Chat"])

# Настройка Gemini API для AI Chat
AI_CHAT_API_KEY = os.getenv('AI_CHAT_GEMINI_API_KEY') or os.getenv('GEMINI_API_KEY')
AI_CHAT_MODEL = os.getenv('AI_CHAT_GEMINI_MODEL', 'gemini-1.5-flash')
AI_CHAT_TEMPERATURE = float(os.getenv('AI_CHAT_TEMPERATURE', '0.7'))
AI_CHAT_TOP_P = float(os.getenv('AI_CHAT_TOP_P', '0.95'))
AI_CHAT_TOP_K = int(os.getenv('AI_CHAT_TOP_K', '64'))
AI_CHAT_MAX_TOKENS = int(os.getenv('AI_CHAT_MAX_TOKENS', '8000'))

if AI_CHAT_API_KEY:
    try:
        genai.configure(api_key=AI_CHAT_API_KEY)
        model = genai.GenerativeModel(
            AI_CHAT_MODEL,
            generation_config={
                'temperature': AI_CHAT_TEMPERATURE,
                'top_p': AI_CHAT_TOP_P,
                'top_k': AI_CHAT_TOP_K,
                'max_output_tokens': AI_CHAT_MAX_TOKENS,
            }
        )
        print(f"✅ AI Chat configured with model: {AI_CHAT_MODEL}")
    except Exception as e:
        print(f"❌ Error configuring AI Chat: {str(e)}")
        model = None
else:
    print("⚠️ AI_CHAT_GEMINI_API_KEY not found in environment")
    model = None

# Системный промпт
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

# Pydantic модели
class Position(BaseModel):
    id: str
    ticker: str
    type: str  # call/put
    direction: str  # buy/sell
    strike: float
    expiration: str
    size: int
    price: float
    commission: float
    visible: bool = True
    iv: Optional[float] = None

class CurrentPrice(BaseModel):
    symbol: str
    price: float
    change: Optional[float] = None
    change_percent: Optional[float] = None

class Greeks(BaseModel):
    delta: float
    gamma: float
    theta: float
    vega: float

class Metrics(BaseModel):
    maxProfit: Optional[float] = None
    maxLoss: Optional[float] = None
    pop: Optional[float] = None
    breakevenPoints: Optional[List[float]] = None

class ChatRequest(BaseModel):
    message: str
    positions: List[Position] = []
    currentPrice: Optional[CurrentPrice] = None
    greeks: Optional[Greeks] = None
    metrics: Optional[Metrics] = None

class SuggestionsRequest(BaseModel):
    positions: List[Position] = []
    currentPrice: Optional[CurrentPrice] = None
    greeks: Optional[Greeks] = None
    metrics: Optional[Metrics] = None


def build_context(positions: List[Position], current_price: Optional[CurrentPrice], 
                  greeks: Optional[Greeks], metrics: Optional[Metrics]) -> str:
    """Формирует контекст для AI"""
    context_parts = []
    
    # Информация о тикере
    if current_price:
        context_parts.append(f"Тикер: {current_price.symbol}")
        context_parts.append(f"Текущая цена: ${current_price.price:.2f}")
        if current_price.change is not None:
            context_parts.append(f"Изменение: ${current_price.change:.2f} ({current_price.change_percent:.2f}%)")
    
    # Позиции
    if positions and len(positions) > 0:
        context_parts.append(f"\nПозиции ({len(positions)} шт.):")
        for i, pos in enumerate(positions, 1):
            direction = "Buy" if pos.direction == 'buy' else "Sell"
            opt_type = "Call" if pos.type == 'call' else "Put"
            iv_str = f" IV:{pos.iv:.1f}%" if pos.iv else ""
            
            context_parts.append(
                f"{i}. {direction} {opt_type} ${pos.strike} x{pos.size} @ ${pos.price:.2f}{iv_str} (exp: {pos.expiration})"
            )
    else:
        context_parts.append("\nПозиций пока нет")
    
    # Greeks
    if greeks:
        context_parts.append(f"\nPortfolio Greeks:")
        context_parts.append(f"Delta: {greeks.delta:.2f} (направленность)")
        context_parts.append(f"Gamma: {greeks.gamma:.4f} (ускорение)")
        context_parts.append(f"Theta: {greeks.theta:.2f} (временной распад)")
        context_parts.append(f"Vega: {greeks.vega:.2f} (чувствительность к волатильности)")
    
    # Метрики
    if metrics:
        context_parts.append(f"\nМетрики:")
        if metrics.maxProfit is not None:
            context_parts.append(f"Max Profit: ${metrics.maxProfit:.2f}")
        if metrics.maxLoss is not None:
            context_parts.append(f"Max Loss: ${metrics.maxLoss:.2f}")
        if metrics.pop is not None:
            context_parts.append(f"Probability of Profit: {metrics.pop:.1f}%")
        if metrics.breakevenPoints:
            breakevens = ', '.join([f"${bp:.2f}" for bp in metrics.breakevenPoints])
            context_parts.append(f"Breakeven Points: {breakevens}")
    
    return '\n'.join(context_parts)


@router.post("/chat")
async def chat(request: ChatRequest):
    """
    Отправка сообщения в AI чат с контекстом позиций
    """
    try:
        if not model:
            raise HTTPException(
                status_code=500,
                detail="Gemini API не настроен. Добавьте GEMINI_API_KEY в .env"
            )

        if not request.message.strip():
            raise HTTPException(
                status_code=400,
                detail="Сообщение не может быть пустым"
            )

        # Формируем контекст
        context = build_context(
            request.positions,
            request.currentPrice,
            request.greeks,
            request.metrics
        )
        
        # Полный промпт
        full_prompt = f"""{SYSTEM_PROMPT}

ТЕКУЩИЙ КОНТЕКСТ:
{context}

ВОПРОС ПОЛЬЗОВАТЕЛЯ:
{request.message}

ОТВЕТ:"""

        # Отправляем запрос в Gemini
        response = model.generate_content(full_prompt)
        
        return {
            'status': 'success',
            'message': response.text,
            'timestamp': datetime.now().isoformat()
        }

    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Error in AI chat: {str(e)}")
        print(f"Full traceback:\n{error_details}")
        raise HTTPException(
            status_code=500,
            detail=f'Ошибка при обработке запроса: {str(e)}'
        )


@router.post("/suggestions")
async def get_suggestions(request: SuggestionsRequest):
    """
    Получить автоматические рекомендации на основе позиций
    """
    try:
        if not model:
            raise HTTPException(
                status_code=500,
                detail="Gemini API не настроен"
            )

        context = build_context(
            request.positions,
            request.currentPrice,
            request.greeks,
            request.metrics
        )
        
        prompt = f"""{SYSTEM_PROMPT}

ТЕКУЩИЙ КОНТЕКСТ:
{context}

Проанализируй текущий портфель и дай 3-5 кратких рекомендаций:
1. Оценка рисков
2. Что можно улучшить
3. На что обратить внимание

Формат: короткие пункты с эмодзи."""

        response = model.generate_content(prompt)
        
        return {
            'status': 'success',
            'suggestions': response.text,
            'timestamp': datetime.now().isoformat()
        }

    except Exception as e:
        print(f"Error getting suggestions: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f'Ошибка: {str(e)}'
        )
