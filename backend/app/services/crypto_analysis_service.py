"""
Сервис для анализа и сравнения снимков криптовалют
ЗАЧЕМ: Сравнение двух снимков топ-400 и генерация отчетов
Затрагивает: модели БД, email уведомления
"""

import logging
from typing import List, Dict, Tuple
from sqlalchemy.orm import Session
from datetime import datetime

from app.models.crypto_rating import CryptoSnapshot, CryptoAnalysis
from app.services.coinmarketcap_service import coinmarketcap_service

logger = logging.getLogger(__name__)


class CryptoAnalysisService:
    """
    Сервис для анализа криптовалют
    """
    
    def create_snapshot(self, db: Session, task_id: int = None) -> CryptoSnapshot:
        """
        Создать новый снимок топ-400 криптовалют
        
        Args:
            db: Сессия БД
            task_id: ID задачи (опционально)
            
        Returns:
            CryptoSnapshot: Созданный снимок
        """
        try:
            logger.info("Creating new crypto snapshot...")
            
            # Получаем данные с CoinMarketCap
            crypto_list = coinmarketcap_service.fetch_top_400_cryptos()
            
            # Создаем снимок в БД
            snapshot = CryptoSnapshot(
                crypto_list=crypto_list,
                task_id=task_id,
                created_at=datetime.utcnow()
            )
            
            db.add(snapshot)
            db.commit()
            db.refresh(snapshot)
            
            logger.info(f"Snapshot created with ID: {snapshot.id}")
            return snapshot
            
        except Exception as e:
            logger.error(f"Error creating snapshot: {str(e)}")
            db.rollback()
            raise
    
    def compare_snapshots(
        self, 
        first_snapshot: CryptoSnapshot, 
        second_snapshot: CryptoSnapshot
    ) -> Tuple[List[Dict], List[Dict]]:
        """
        Сравнить два снимка и найти различия
        
        Args:
            first_snapshot: Первый снимок
            second_snapshot: Второй снимок
            
        Returns:
            Tuple[List[Dict], List[Dict]]: (выпавшие из топа, вошедшие в топ)
        """
        # Создаем множества символов для быстрого поиска
        first_symbols = {crypto['symbol'] for crypto in first_snapshot.crypto_list}
        second_symbols = {crypto['symbol'] for crypto in second_snapshot.crypto_list}
        
        # Находим выпавшие (были в первом, нет во втором)
        dropped_symbols = first_symbols - second_symbols
        dropped_cryptos = [
            crypto for crypto in first_snapshot.crypto_list 
            if crypto['symbol'] in dropped_symbols
        ]
        
        # Находим вошедшие (не было в первом, есть во втором)
        added_symbols = second_symbols - first_symbols
        added_cryptos = [
            crypto for crypto in second_snapshot.crypto_list 
            if crypto['symbol'] in added_symbols
        ]
        
        logger.info(f"Comparison: {len(dropped_cryptos)} dropped, {len(added_cryptos)} added")
        
        return dropped_cryptos, added_cryptos
    
    def create_analysis(
        self, 
        db: Session, 
        first_snapshot_id: int, 
        second_snapshot_id: int,
        task_id: int = None
    ) -> CryptoAnalysis:
        """
        Создать анализ на основе двух снимков
        
        Args:
            db: Сессия БД
            first_snapshot_id: ID первого снимка
            second_snapshot_id: ID второго снимка
            task_id: ID задачи (опционально)
            
        Returns:
            CryptoAnalysis: Созданный анализ
        """
        try:
            logger.info(f"Creating analysis for snapshots {first_snapshot_id} and {second_snapshot_id}")
            
            # Получаем снимки
            first_snapshot = db.query(CryptoSnapshot).filter(
                CryptoSnapshot.id == first_snapshot_id
            ).first()
            
            second_snapshot = db.query(CryptoSnapshot).filter(
                CryptoSnapshot.id == second_snapshot_id
            ).first()
            
            if not first_snapshot or not second_snapshot:
                raise ValueError("Snapshot not found")
            
            # Сравниваем снимки
            dropped_cryptos, added_cryptos = self.compare_snapshots(
                first_snapshot, 
                second_snapshot
            )
            
            # Создаем анализ
            analysis = CryptoAnalysis(
                first_snapshot_id=first_snapshot_id,
                second_snapshot_id=second_snapshot_id,
                dropped_cryptos=dropped_cryptos,
                added_cryptos=added_cryptos,
                task_id=task_id,
                created_at=datetime.utcnow()
            )
            
            db.add(analysis)
            db.commit()
            db.refresh(analysis)
            
            logger.info(f"Analysis created with ID: {analysis.id}")
            return analysis
            
        except Exception as e:
            logger.error(f"Error creating analysis: {str(e)}")
            db.rollback()
            raise
    
    def get_all_analyses(self, db: Session) -> List[CryptoAnalysis]:
        """
        Получить все анализы
        
        Args:
            db: Сессия БД
            
        Returns:
            List[CryptoAnalysis]: Список анализов
        """
        return db.query(CryptoAnalysis).order_by(CryptoAnalysis.created_at.desc()).all()
    
    def get_analysis_by_id(self, db: Session, analysis_id: int) -> CryptoAnalysis:
        """
        Получить анализ по ID
        
        Args:
            db: Сессия БД
            analysis_id: ID анализа
            
        Returns:
            CryptoAnalysis: Анализ или None
        """
        return db.query(CryptoAnalysis).filter(CryptoAnalysis.id == analysis_id).first()


# Singleton instance
crypto_analysis_service = CryptoAnalysisService()
