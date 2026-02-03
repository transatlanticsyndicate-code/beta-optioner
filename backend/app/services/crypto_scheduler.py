"""
Планировщик задач для мониторинга криптовалют
ЗАЧЕМ: Циклический сбор данных по расписанию
Затрагивает: APScheduler, модели БД, email уведомления
"""

import logging
import os
from datetime import datetime, timedelta
from typing import Optional
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.date import DateTrigger
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.crypto_rating import CryptoScheduledTask, CryptoSnapshot
from app.services.crypto_analysis_service import crypto_analysis_service
from app.services.email_service import email_service

logger = logging.getLogger(__name__)


class CryptoScheduler:
    """
    Планировщик для циклического мониторинга криптовалют
    """
    
    def __init__(self):
        self.scheduler = BackgroundScheduler()
        self.scheduler.start()
        logger.info("CryptoScheduler initialized")
    
    def create_monitoring_task(
        self,
        db: Session,
        day_of_week: str,
        time: str,
        interval_value: int,
        interval_unit: str
    ) -> CryptoScheduledTask:
        """
        Создать новую задачу мониторинга
        
        Args:
            db: Сессия БД
            day_of_week: День недели (monday, tuesday, etc.)
            time: Время (HH:MM)
            interval_value: Значение интервала
            interval_unit: Единица интервала (hours, days)
            
        Returns:
            CryptoScheduledTask: Созданная задача
        """
        try:
            logger.info(f"Creating monitoring task: {day_of_week} {time}, interval: {interval_value} {interval_unit}")
            
            # Создаем запись в БД
            task = CryptoScheduledTask(
                day_of_week=day_of_week,
                time=time,
                interval_value=interval_value,
                interval_unit=interval_unit,
                is_active=True,
                created_at=datetime.utcnow()
            )
            
            db.add(task)
            db.commit()
            db.refresh(task)
            
            # Планируем первый запуск
            self._schedule_first_snapshot(task, db)
            
            # Сохраняем изменения (scheduler_job_id и next_run_at)
            db.commit()
            db.refresh(task)
            
            logger.info(f"Monitoring task created with ID: {task.id}")
            return task
            
        except Exception as e:
            logger.error(f"Error creating monitoring task: {str(e)}")
            db.rollback()
            raise
    
    def _schedule_first_snapshot(self, task: CryptoScheduledTask, db: Session):
        """
        Запланировать первый снимок по расписанию
        """
        try:
            # Парсим время
            hour, minute = map(int, task.time.split(':'))
            
            # Создаем cron trigger для первого снимка
            # Например: каждый понедельник в 10:00
            day_map = {
                'monday': 'mon',
                'tuesday': 'tue',
                'wednesday': 'wed',
                'thursday': 'thu',
                'friday': 'fri',
                'saturday': 'sat',
                'sunday': 'sun'
            }
            
            cron_day = day_map.get(task.day_of_week.lower(), 'mon')
            
            trigger = CronTrigger(
                day_of_week=cron_day,
                hour=hour,
                minute=minute
            )
            
            # Добавляем задачу в планировщик
            job = self.scheduler.add_job(
                func=self._execute_first_snapshot,
                trigger=trigger,
                args=[task.id],
                id=f"first_snapshot_{task.id}",
                replace_existing=True
            )
            
            # Сохраняем job_id (НЕ делаем commit, это сделает вызывающий код)
            task.scheduler_job_id = job.id
            task.next_run_at = job.next_run_time
            
            logger.info(f"First snapshot scheduled for task {task.id}: {job.next_run_time}")
            
        except Exception as e:
            logger.error(f"Error scheduling first snapshot: {str(e)}")
            raise
    
    def _execute_first_snapshot(self, task_id: int):
        """
        Выполнить первый снимок
        """
        db = SessionLocal()
        try:
            logger.info(f"Executing first snapshot for task {task_id}")
            
            # Создаем первый снимок
            snapshot = crypto_analysis_service.create_snapshot(db, task_id=task_id)
            
            # Обновляем задачу
            task = db.query(CryptoScheduledTask).filter(
                CryptoScheduledTask.id == task_id
            ).first()
            
            if task:
                task.last_run_at = datetime.utcnow()
                db.commit()
                
                # Планируем второй снимок через интервал
                self._schedule_second_snapshot(task, snapshot.id)
            
        except Exception as e:
            logger.error(f"Error executing first snapshot: {str(e)}")
        finally:
            db.close()
    
    def _schedule_second_snapshot(self, task: CryptoScheduledTask, first_snapshot_id: int):
        """
        Запланировать второй снимок через интервал
        """
        try:
            # Вычисляем время второго снимка
            if task.interval_unit == 'hours':
                run_date = datetime.utcnow() + timedelta(hours=task.interval_value)
            else:  # days
                run_date = datetime.utcnow() + timedelta(days=task.interval_value)
            
            # Создаем trigger для конкретной даты
            trigger = DateTrigger(run_date=run_date)
            
            # Добавляем задачу
            job = self.scheduler.add_job(
                func=self._execute_second_snapshot,
                trigger=trigger,
                args=[task.id, first_snapshot_id],
                id=f"second_snapshot_{task.id}_{first_snapshot_id}",
                replace_existing=True
            )
            
            logger.info(f"Second snapshot scheduled for task {task.id}: {job.next_run_time}")
            
        except Exception as e:
            logger.error(f"Error scheduling second snapshot: {str(e)}")
            raise
    
    def _execute_second_snapshot(self, task_id: int, first_snapshot_id: int):
        """
        Выполнить второй снимок и создать анализ
        """
        db = SessionLocal()
        try:
            logger.info(f"Executing second snapshot for task {task_id}")
            
            # Создаем второй снимок
            second_snapshot = crypto_analysis_service.create_snapshot(db, task_id=task_id)
            
            # Создаем анализ
            analysis = crypto_analysis_service.create_analysis(
                db,
                first_snapshot_id=first_snapshot_id,
                second_snapshot_id=second_snapshot.id,
                task_id=task_id
            )
            
            # Отправляем email уведомление
            base_url = os.getenv("BASE_URL", "http://localhost:3000")
            analysis_url = f"{base_url}/tools/crypto-rating?analysis={analysis.id}"
            
            email_service.send_analysis_notification(
                analysis_id=analysis.id,
                dropped_count=len(analysis.dropped_cryptos),
                added_count=len(analysis.added_cryptos),
                dropped_cryptos=analysis.dropped_cryptos,
                added_cryptos=analysis.added_cryptos,
                analysis_url=analysis_url
            )
            
            # Обновляем задачу
            task = db.query(CryptoScheduledTask).filter(
                CryptoScheduledTask.id == task_id
            ).first()
            
            if task and task.is_active:
                task.last_run_at = datetime.utcnow()
                db.commit()
                
                # Планируем следующий цикл (первый снимок)
                # Задача уже запланирована через cron trigger
                logger.info(f"Analysis completed for task {task_id}, waiting for next cycle")
            
        except Exception as e:
            logger.error(f"Error executing second snapshot: {str(e)}")
        finally:
            db.close()
    
    def restore_tasks_from_db(self):
        """
        Восстановить активные задачи из БД при запуске сервера
        """
        db = SessionLocal()
        try:
            logger.info("Restoring scheduled tasks from database...")
            
            active_tasks = db.query(CryptoScheduledTask).filter(
                CryptoScheduledTask.is_active == True
            ).all()
            
            for task in active_tasks:
                try:
                    self._schedule_first_snapshot(task, db)
                    logger.info(f"Restored task {task.id}")
                except Exception as e:
                    logger.error(f"Error restoring task {task.id}: {str(e)}")
            
            logger.info(f"Restored {len(active_tasks)} tasks")
            
        except Exception as e:
            logger.error(f"Error restoring tasks: {str(e)}")
        finally:
            db.close()
    
    def stop_task(self, db: Session, task_id: int):
        """
        Остановить задачу
        """
        try:
            task = db.query(CryptoScheduledTask).filter(
                CryptoScheduledTask.id == task_id
            ).first()
            
            if task:
                task.is_active = False
                db.commit()
                
                # Удаляем из планировщика
                if task.scheduler_job_id:
                    try:
                        self.scheduler.remove_job(task.scheduler_job_id)
                    except:
                        pass
                
                logger.info(f"Task {task_id} stopped")
            
        except Exception as e:
            logger.error(f"Error stopping task: {str(e)}")
            raise
    
    def shutdown(self):
        """
        Остановить планировщик
        """
        self.scheduler.shutdown()
        logger.info("CryptoScheduler shut down")


# Singleton instance
crypto_scheduler = CryptoScheduler()
