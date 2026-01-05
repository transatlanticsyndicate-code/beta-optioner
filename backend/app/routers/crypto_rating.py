"""
API роутер для функционала рейтинга криптовалют
ЗАЧЕМ: Предоставление API для управления мониторингом криптовалют
Затрагивает: Frontend, планировщик задач, БД
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from datetime import datetime
import logging

from app.database import get_db
# from app.services.crypto_scheduler import crypto_scheduler  # Больше не используется
from app.services.crypto_analysis_service import crypto_analysis_service
from app.services.coinmarketcap_service import coinmarketcap_service
from app.services.email_service import email_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/crypto-rating", tags=["crypto-rating"])


# Pydantic модели для запросов/ответов
class CreateTaskRequest(BaseModel):
    """Запрос на создание задачи мониторинга"""
    day_of_week: str
    time: str
    interval_value: int
    interval_unit: str


class CryptoItem(BaseModel):
    """Криптовалюта"""
    symbol: str
    name: str


class AnalysisSummary(BaseModel):
    """Краткая информация об анализе"""
    id: int
    created_at: datetime
    dropped_count: int
    added_count: int
    first_snapshot_date: datetime
    second_snapshot_date: datetime


class AnalysisDetail(BaseModel):
    """Детальная информация об анализе"""
    id: int
    created_at: datetime
    dropped_cryptos: List[CryptoItem]
    added_cryptos: List[CryptoItem]
    first_snapshot_date: datetime
    second_snapshot_date: datetime


class TaskInfo(BaseModel):
    """Информация о задаче"""
    id: int
    day_of_week: str
    time: str
    interval_value: int
    interval_unit: str
    is_active: bool
    created_at: datetime
    last_run_at: datetime = None
    next_run_at: datetime = None


class SnapshotDetail(BaseModel):
    """Детальная информация о снимке"""
    id: int
    created_at: datetime
    crypto_count: int
    crypto_list: List[CryptoItem]


@router.post("/create-snapshot")
async def create_snapshot(db: Session = Depends(get_db)):
    """
    Создать снимок топ-400 криптовалют
    
    Логика:
    1. Создается новый снимок
    2. Если есть предыдущий снимок - автоматически создается анализ
    3. Если создан анализ - отправляется email
    """
    try:
        # Создаем снимок
        snapshot = crypto_analysis_service.create_snapshot(db)
        
        # Проверяем, есть ли предыдущий снимок
        from app.models.crypto_rating import CryptoSnapshot
        previous_snapshot = db.query(CryptoSnapshot).filter(
            CryptoSnapshot.id < snapshot.id
        ).order_by(CryptoSnapshot.created_at.desc()).first()
        
        analysis = None
        if previous_snapshot:
            # Создаем анализ
            analysis = crypto_analysis_service.create_analysis(
                db=db,
                first_snapshot_id=previous_snapshot.id,
                second_snapshot_id=snapshot.id
            )
            
            # Отправляем email
            try:
                email_service.send_analysis_notification(
                    analysis_id=analysis.id,
                    dropped_count=len(analysis.dropped_cryptos),
                    added_count=len(analysis.added_cryptos),
                    dropped_cryptos=analysis.dropped_cryptos[:10],
                    added_cryptos=analysis.added_cryptos[:10],
                    analysis_url=f"http://localhost:3000/tools/crypto-rating"
                )
            except Exception as e:
                logger.error(f"Failed to send email: {str(e)}")
        
        return {
            "success": True,
            "snapshot_id": snapshot.id,
            "created_at": snapshot.created_at,
            "crypto_count": len(snapshot.crypto_list),
            "analysis_created": analysis is not None,
            "analysis_id": analysis.id if analysis else None
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/snapshots/{snapshot_id}", response_model=SnapshotDetail)
async def get_snapshot_detail(
    snapshot_id: int,
    db: Session = Depends(get_db)
):
    """
    Получить детальную информацию о снимке (список 400 валют)
    """
    try:
        from app.models.crypto_rating import CryptoSnapshot
        
        snapshot = db.query(CryptoSnapshot).filter(
            CryptoSnapshot.id == snapshot_id
        ).first()
        
        if not snapshot:
            raise HTTPException(status_code=404, detail="Snapshot not found")
        
        return SnapshotDetail(
            id=snapshot.id,
            created_at=snapshot.created_at,
            crypto_count=len(snapshot.crypto_list),
            crypto_list=[CryptoItem(**crypto) for crypto in snapshot.crypto_list]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/snapshots")
async def get_all_snapshots(db: Session = Depends(get_db)):
    """
    Получить список всех снимков
    """
    try:
        from app.models.crypto_rating import CryptoSnapshot
        
        snapshots = db.query(CryptoSnapshot).order_by(
            CryptoSnapshot.created_at.desc()
        ).all()
        
        return [{
            "id": s.id,
            "created_at": s.created_at,
            "crypto_count": len(s.crypto_list)
        } for s in snapshots]
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analyses", response_model=List[AnalysisSummary])
async def get_all_analyses(db: Session = Depends(get_db)):
    """
    Получить список всех анализов
    """
    try:
        analyses = crypto_analysis_service.get_all_analyses(db)
        
        result = []
        for analysis in analyses:
            result.append(AnalysisSummary(
                id=analysis.id,
                created_at=analysis.created_at,
                dropped_count=len(analysis.dropped_cryptos),
                added_count=len(analysis.added_cryptos),
                first_snapshot_date=analysis.first_snapshot.created_at,
                second_snapshot_date=analysis.second_snapshot.created_at
            ))
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/active-task", response_model=TaskInfo)
async def get_active_task(db: Session = Depends(get_db)):
    """
    Получить информацию об активной задаче мониторинга
    """
    try:
        from app.models.crypto_rating import CryptoScheduledTask
        
        # Ищем активную задачу
        task = db.query(CryptoScheduledTask).filter(
            CryptoScheduledTask.is_active == True
        ).order_by(CryptoScheduledTask.created_at.desc()).first()
        
        if not task:
            raise HTTPException(status_code=404, detail="No active task found")
        
        return TaskInfo(
            id=task.id,
            day_of_week=task.day_of_week,
            time=task.time,
            interval_value=task.interval_value,
            interval_unit=task.interval_unit,
            is_active=task.is_active,
            created_at=task.created_at,
            last_run_at=task.last_run_at,
            next_run_at=task.next_run_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analyses/{analysis_id}", response_model=AnalysisDetail)
async def get_analysis_detail(
    analysis_id: int,
    db: Session = Depends(get_db)
):
    """
    Получить детальную информацию об анализе
    """
    try:
        analysis = crypto_analysis_service.get_analysis_by_id(db, analysis_id)
        
        if not analysis:
            raise HTTPException(status_code=404, detail="Analysis not found")
        
        return AnalysisDetail(
            id=analysis.id,
            created_at=analysis.created_at,
            dropped_cryptos=[CryptoItem(**crypto) for crypto in analysis.dropped_cryptos],
            added_cryptos=[CryptoItem(**crypto) for crypto in analysis.added_cryptos],
            first_snapshot_date=analysis.first_snapshot.created_at,
            second_snapshot_date=analysis.second_snapshot.created_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fetch-now")
async def fetch_snapshot_now(db: Session = Depends(get_db)):
    """
    Создать снимок вручную (для тестирования)
    """
    try:
        snapshot = crypto_analysis_service.create_snapshot(db)
        
        return {
            "success": True,
            "snapshot_id": snapshot.id,
            "created_at": snapshot.created_at,
            "crypto_count": len(snapshot.crypto_list)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/test-connection")
async def test_coinmarketcap_connection():
    """
    Проверить подключение к CoinMarketCap API
    """
    try:
        success = coinmarketcap_service.test_connection()
        
        return {
            "success": success,
            "message": "Connection successful" if success else "Connection failed"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/snapshots/{snapshot_id}")
async def delete_snapshot(
    snapshot_id: int,
    db: Session = Depends(get_db)
):
    """
    Удалить снимок
    """
    try:
        from app.models.crypto_rating import CryptoSnapshot, CryptoAnalysis
        
        snapshot = db.query(CryptoSnapshot).filter(
            CryptoSnapshot.id == snapshot_id
        ).first()
        
        if not snapshot:
            raise HTTPException(status_code=404, detail="Snapshot not found")
        
        # Проверяем, используется ли снимок в анализах
        analyses_count = db.query(CryptoAnalysis).filter(
            (CryptoAnalysis.first_snapshot_id == snapshot_id) |
            (CryptoAnalysis.second_snapshot_id == snapshot_id)
        ).count()
        
        if analyses_count > 0:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot delete snapshot: used in {analyses_count} analysis(es). Delete analyses first."
            )
        
        db.delete(snapshot)
        db.commit()
        
        return {
            "success": True,
            "message": f"Snapshot {snapshot_id} deleted"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/analyses/{analysis_id}")
async def delete_analysis(
    analysis_id: int,
    db: Session = Depends(get_db)
):
    """
    Удалить анализ
    """
    try:
        from app.models.crypto_rating import CryptoAnalysis
        
        analysis = db.query(CryptoAnalysis).filter(
            CryptoAnalysis.id == analysis_id
        ).first()
        
        if not analysis:
            raise HTTPException(status_code=404, detail="Analysis not found")
        
        db.delete(analysis)
        db.commit()
        
        logger.info(f"Analysis {analysis_id} deleted successfully")
        
        return {
            "success": True,
            "message": f"Analysis {analysis_id} deleted"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting analysis {analysis_id}: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
