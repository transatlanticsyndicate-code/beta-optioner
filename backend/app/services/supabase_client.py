"""
Supabase Client для работы с историей анализов
"""
import os
from supabase import create_client, Client
from typing import Optional, Dict, List
from datetime import datetime


class SupabaseClient:
    """Клиент для работы с Supabase (история анализов)"""
    
    def __init__(self):
        # URL и ключи из .env
        supabase_url = os.getenv("SUPABASE_URL", "http://localhost:8001")
        supabase_key = os.getenv("SUPABASE_ANON_KEY")
        
        if not supabase_key:
            raise ValueError("SUPABASE_ANON_KEY не найден в .env")
        
        self.client: Client = create_client(supabase_url, supabase_key)
    
    def save_analysis(
        self,
        ticker: str,
        stock_data: Dict,
        metrics: Dict,
        ai_model: str,
        ai_analysis: str,
        ai_provider: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        execution_time_ms: Optional[int] = None
    ) -> Dict:
        """
        Сохранить анализ в БД
        
        Returns:
            Dict с id и url сохраненного анализа
        """
        data = {
            "ticker": ticker.upper(),
            "stock_data": stock_data,
            "metrics": metrics,
            "ai_model": ai_model,
            "ai_analysis": ai_analysis,
            "ai_provider": ai_provider,
            "ip_address": ip_address,
            "user_agent": user_agent,
            "execution_time_ms": execution_time_ms
        }
        
        response = self.client.table("analysis_history").insert(data).execute()
        
        if response.data and len(response.data) > 0:
            analysis_id = response.data[0]["id"]
            base_url = os.getenv("BASE_URL", "https://optioner.online")
            return {
                "id": analysis_id,
                "url": f"{base_url}/analysis/{analysis_id}"
            }
        else:
            raise Exception("Не удалось сохранить анализ")
    
    def get_analysis(self, analysis_id: str) -> Optional[Dict]:
        """
        Получить анализ по ID
        
        Returns:
            Dict с данными анализа или None
        """
        response = self.client.table("analysis_history").select("*").eq("id", analysis_id).execute()
        
        if response.data and len(response.data) > 0:
            return response.data[0]
        return None
    
    def get_history(
        self,
        limit: int = 20,
        offset: int = 0,
        ticker: Optional[str] = None
    ) -> List[Dict]:
        """
        Получить историю анализов
        
        Args:
            limit: количество записей
            offset: смещение для пагинации
            ticker: фильтр по тикеру (опционально)
        
        Returns:
            List[Dict] с анализами
        """
        query = self.client.table("analysis_history").select("*")
        
        if ticker:
            query = query.eq("ticker", ticker.upper())
        
        query = query.order("created_at", desc=True).range(offset, offset + limit - 1)
        
        response = query.execute()
        return response.data if response.data else []
    
    def get_stats(self) -> Dict:
        """
        Получить статистику по анализам
        
        Returns:
            Dict со статистикой
        """
        # Общее количество
        total_response = self.client.table("analysis_history").select("id", count="exact").execute()
        total_count = total_response.count if hasattr(total_response, 'count') else 0
        
        # Топ тикеров (через SQL функцию или агрегацию)
        # Пока возвращаем базовую статистику
        return {
            "total_analyses": total_count,
            "message": "Для детальной статистики нужно создать SQL функцию"
        }
