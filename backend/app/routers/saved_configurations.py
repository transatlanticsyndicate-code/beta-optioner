"""
API роутер для сохранённых конфигураций универсального калькулятора
ЗАЧЕМ: CRUD операции для работы с позициями в БД
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy import desc, or_
from typing import Optional, List
from pydantic import BaseModel, validator
from datetime import datetime

from app.database import get_db
from app.models.saved_configuration import SavedConfiguration
from app.utils.trading_date import get_trading_now

router = APIRouter(prefix="/api/configurations", tags=["saved_configurations"])


# Допустимые значения статуса позиции
# ЗАЧЕМ: Жёсткая валидация — иначе клиент может прислать любой текст
ALLOWED_STATUSES = {'pending', 'standard'}


# Pydantic модели для валидации запросов
class ConfigurationCreate(BaseModel):
    """Модель для создания новой конфигурации"""
    name: str
    description: Optional[str] = None
    author: str
    ticker: str
    entryDate: Optional[str] = None
    isLocked: bool = False
    status: Optional[str] = 'standard'
    state: dict
    dealSettings: Optional[dict] = None
    dealInfo: Optional[dict] = None
    userId: Optional[str] = None

    @validator('status')
    def validate_status(cls, v):
        # ЗАЧЕМ: Дефолт 'standard' — если клиент не присылает status, сохранение
        # считается зафиксированным (привычное поведение «обычного сохранения»).
        # 'pending' появляется только при явном выборе пользователя в диалоге.
        if v is None:
            return 'standard'
        if v not in ALLOWED_STATUSES:
            raise ValueError(f"status должен быть одним из: {sorted(ALLOWED_STATUSES)}")
        return v


class ConfigurationUpdate(BaseModel):
    """Модель для обновления существующей конфигурации"""
    name: Optional[str] = None
    description: Optional[str] = None
    state: Optional[dict] = None
    dealSettings: Optional[dict] = None
    dealInfo: Optional[dict] = None
    status: Optional[str] = None
    isLocked: Optional[bool] = None
    entryDate: Optional[str] = None

    @validator('status')
    def validate_status(cls, v):
        if v is None:
            return v
        if v not in ALLOWED_STATUSES:
            raise ValueError(f"status должен быть одним из: {sorted(ALLOWED_STATUSES)}")
        return v


@router.get("")
async def get_configurations(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    ticker: Optional[str] = None,
    author: Optional[str] = None,
    search: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Получить список всех конфигураций с пагинацией и фильтрами
    ЗАЧЕМ: Отображение списка сохранённых позиций на странице

    Параметры:
    - limit: количество записей (по умолчанию 50, макс 100)
    - offset: смещение для пагинации
    - ticker: фильтр по тикеру
    - author: фильтр по автору
    - search: поиск по названию, тикеру или автору
    - status: фильтр по статусу (pending | standard)
    """
    try:
        query = db.query(SavedConfiguration)

        # Фильтр по тикеру
        if ticker:
            query = query.filter(SavedConfiguration.ticker.ilike(f"%{ticker}%"))

        # Фильтр по автору
        if author:
            query = query.filter(SavedConfiguration.author.ilike(f"%{author}%"))

        # Фильтр по статусу позиции
        # ЗАЧЕМ: На странице списка пользователь может отфильтровать только pending
        # или только standard, чтобы быстро находить нужные позиции.
        if status:
            if status not in ALLOWED_STATUSES:
                raise HTTPException(status_code=400, detail=f"Недопустимое значение status: {status}")
            query = query.filter(SavedConfiguration.status == status)

        # Поиск по названию, тикеру или автору
        if search:
            search_pattern = f"%{search}%"
            query = query.filter(
                or_(
                    SavedConfiguration.name.ilike(search_pattern),
                    SavedConfiguration.ticker.ilike(search_pattern),
                    SavedConfiguration.author.ilike(search_pattern)
                )
            )
        
        # Подсчёт общего количества
        total = query.count()
        
        # Сортировка по дате создания (новые первые) и пагинация
        configurations = query.order_by(desc(SavedConfiguration.created_at)).offset(offset).limit(limit).all()
        
        return {
            "status": "success",
            "data": [config.to_dict() for config in configurations],
            "total": total,
            "limit": limit,
            "offset": offset
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка получения конфигураций: {str(e)}")


@router.delete("/all")
async def delete_all_configurations(
    user_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Удалить все конфигурации
    ЗАЧЕМ: Массовое удаление всех позиций одним запросом (вместо цикла по одной)
    """
    try:
        query = db.query(SavedConfiguration)
        if user_id:
            query = query.filter(SavedConfiguration.user_id == user_id)
        count = query.count()
        query.delete(synchronize_session=False)
        db.commit()
        return {
            "status": "success",
            "message": f"Удалено конфигураций: {count}",
            "deleted": count
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка удаления конфигураций: {str(e)}")


@router.get("/{config_id}")
async def get_configuration(config_id: str, db: Session = Depends(get_db)):
    """
    Получить одну конфигурацию по ID
    ЗАЧЕМ: Загрузка конфигурации в калькулятор
    """
    import time
    start_time = time.time()
    
    try:
        config = db.query(SavedConfiguration).filter(SavedConfiguration.id == config_id).first()
        
        if not config:
            raise HTTPException(status_code=404, detail="Конфигурация не найдена")
        
        result = config.to_dict()
        
        elapsed_time = (time.time() - start_time) * 1000  # в миллисекундах
        print(f"⏱️ [GET /api/configurations/{config_id}] Время выполнения: {elapsed_time:.2f}ms")
        
        return {
            "status": "success",
            "data": result
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка получения конфигурации: {str(e)}")


@router.post("")
async def create_configuration(
    config_data: ConfigurationCreate,
    db: Session = Depends(get_db)
):
    """
    Создать новую конфигурацию
    ЗАЧЕМ: Сохранение позиции из калькулятора в БД
    """
    try:
        # Парсим entryDate если передан
        entry_date = None
        if config_data.entryDate:
            try:
                entry_date = datetime.fromisoformat(config_data.entryDate.replace('Z', '+00:00'))
            except:
                pass
        
        # Нормализация статуса и связанного флага is_locked
        # ЗАЧЕМ: status='standard' означает «реально вошли в позицию» —
        # даты входа должны быть заморожены, поэтому всегда выставляем is_locked=true.
        # status='pending' — предварительная схема, замораживать даты не нужно.
        # Дефолт 'standard' — если клиент не прислал статус, сохраняем как «Зафиксирована».
        position_status = config_data.status or 'standard'
        is_locked_final = True if position_status == 'standard' else bool(config_data.isLocked)

        # Создаём новую запись
        new_config = SavedConfiguration(
            name=config_data.name,
            description=config_data.description,
            author=config_data.author,
            ticker=config_data.ticker,
            entry_date=entry_date,
            is_locked=is_locked_final,
            status=position_status,
            state=config_data.state,
            deal_settings=config_data.dealSettings,
            deal_info=config_data.dealInfo,
            user_id=config_data.userId
        )

        db.add(new_config)
        db.commit()
        db.refresh(new_config)

        return {
            "status": "success",
            "message": "Конфигурация успешно сохранена",
            "data": new_config.to_dict()
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка создания конфигурации: {str(e)}")


@router.put("/{config_id}")
async def update_configuration(
    config_id: str,
    config_data: ConfigurationUpdate,
    user_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Обновить существующую конфигурацию
    ЗАЧЕМ: Сохранение изменений при редактировании позиции
    
    Параметры:
    - user_id: ID пользователя для проверки прав (только автор может редактировать)
    """
    try:
        config = db.query(SavedConfiguration).filter(SavedConfiguration.id == config_id).first()
        
        if not config:
            raise HTTPException(status_code=404, detail="Конфигурация не найдена")
        
        # Проверка прав: только автор может редактировать
        # ЗАЧЕМ: Защита от несанкционированного изменения чужих позиций
        if user_id and config.user_id and config.user_id != user_id:
            raise HTTPException(status_code=403, detail="Нет прав для редактирования этой конфигурации")

        # Защита перехода смены статуса: standard → pending запрещён
        # ЗАЧЕМ: Зафиксированная позиция означает реально открытую сделку с фактическими
        # датами входа. Откат в «в ожидании» сломает эту семантику.
        # Если в БД status NULL (старая запись до миграции) — считаем её 'standard'
        # (по миграционной семантике: всё, что было до внедрения статусов = зафиксирована).
        current_status = config.status or 'standard'
        is_promotion_to_standard = (
            config_data.status is not None
            and current_status == 'pending'
            and config_data.status == 'standard'
        )

        if config_data.status is not None:
            if current_status == 'standard' and config_data.status == 'pending':
                raise HTTPException(
                    status_code=400,
                    detail="Невозможно перевести зафиксированную позицию обратно в «В ожидании»"
                )

        # Обновляем простые поля
        if config_data.name is not None:
            config.name = config_data.name
        if config_data.description is not None:
            config.description = config_data.description
        if config_data.dealSettings is not None:
            config.deal_settings = config_data.dealSettings
        if config_data.dealInfo is not None:
            config.deal_info = config_data.dealInfo

        # Применяем state из запроса (если передан)
        if config_data.state is not None:
            config.state = config_data.state

        # Применяем смену статуса (после записи state — чтобы накладывать
        # флаги isLockedPosition поверх свежего состояния)
        if is_promotion_to_standard:
            # Переход pending → standard: фиксируем даты входа
            # ЗАЧЕМ: Момент перевода в «Зафиксирована» = момент реального входа.
            # entry_date обновляется на сейчас, в state каждому опциону/позиции
            # проставляется isLockedPosition=true и пересчитывается initialDaysToExpiration.
            #
            # ВАЖНО (единая торговая база, см. app/utils/trading_date.py): раньше здесь был
            # datetime.utcnow() — «сегодня» по UTC могло разойтись на календарный день с
            # «сегодня» на фронте (America/New_York), и initialDaysToExpiration, уходящий
            # напрямую в ценообразование зафиксированных позиций (calculateDaysRemainingUTC/
            # PreciseET на фронте), считался от неверной даты. Теперь берём торговую дату NY.
            now_trading = get_trading_now()
            config.status = 'standard'
            config.is_locked = True
            # Колонка entry_date — TIMESTAMP без часового пояса, храним как naive-значение
            # (числа совпадают с NY wall-clock, как и остальные торговые даты в проекте).
            config.entry_date = now_trading.replace(tzinfo=None)

            target_state = config.state or {}
            today_trading_date = now_trading.date()
            today_iso = today_trading_date.isoformat()

            options = target_state.get('options') or []
            for opt in options:
                if not isinstance(opt, dict):
                    continue
                opt['isLockedPosition'] = True
                if not opt.get('entryDate'):
                    opt['entryDate'] = today_iso
                try:
                    exp_date_str = opt.get('date')
                    if exp_date_str:
                        exp_y, exp_m, exp_d = (int(p) for p in exp_date_str.split('-'))
                        exp_date = datetime(exp_y, exp_m, exp_d).date()
                        days = (exp_date - today_trading_date).days
                        opt['initialDaysToExpiration'] = max(days, 0)
                except Exception:
                    pass

            positions = target_state.get('positions') or []
            for pos in positions:
                if isinstance(pos, dict):
                    pos['isLockedPosition'] = True

            config.state = target_state
            # SQLAlchemy не отслеживает изменения внутри dict (для JSON/JSONB),
            # поэтому явно помечаем поле как изменённое.
            flag_modified(config, 'state')
        elif config_data.status is not None:
            # Статус не меняется на standard, но прислан в запросе — допускаем
            # обновление полей status/isLocked без затрагивания entry_date.
            config.status = config_data.status
            if config_data.isLocked is not None:
                config.is_locked = bool(config_data.isLocked)
        elif config_data.isLocked is not None:
            # Статус не передан — но клиент хочет изменить isLocked
            config.is_locked = bool(config_data.isLocked)

        # Ручное обновление entry_date (только если статус НЕ менялся)
        if config_data.entryDate is not None and not is_promotion_to_standard:
            try:
                config.entry_date = datetime.fromisoformat(
                    config_data.entryDate.replace('Z', '+00:00')
                )
            except Exception:
                pass

        db.commit()
        db.refresh(config)
        
        return {
            "status": "success",
            "message": "Конфигурация успешно обновлена",
            "data": config.to_dict()
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка обновления конфигурации: {str(e)}")


@router.delete("/{config_id}")
async def delete_configuration(
    config_id: str,
    user_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Удалить конфигурацию
    ЗАЧЕМ: Удаление ненужных позиций
    
    Параметры:
    - user_id: ID пользователя для проверки прав (только автор может удалять)
    """
    try:
        config = db.query(SavedConfiguration).filter(SavedConfiguration.id == config_id).first()
        
        if not config:
            raise HTTPException(status_code=404, detail="Конфигурация не найдена")
        
        # Проверка прав: только автор может удалять
        # ЗАЧЕМ: Защита от несанкционированного удаления чужих позиций
        if user_id and config.user_id and config.user_id != user_id:
            raise HTTPException(status_code=403, detail="Нет прав для удаления этой конфигурации")
        
        db.delete(config)
        db.commit()
        
        return {
            "status": "success",
            "message": "Конфигурация успешно удалена"
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка удаления конфигурации: {str(e)}")


@router.post("/batch")
async def create_configurations_batch(
    configs: List[ConfigurationCreate],
    db: Session = Depends(get_db)
):
    """
    Массовое создание конфигураций
    ЗАЧЕМ: Миграция из localStorage в БД одним запросом
    """
    try:
        created_configs = []
        
        for config_data in configs:
            # Парсим entryDate если передан
            entry_date = None
            if config_data.entryDate:
                try:
                    entry_date = datetime.fromisoformat(config_data.entryDate.replace('Z', '+00:00'))
                except:
                    pass
            
            position_status = config_data.status or 'standard'
            is_locked_final = True if position_status == 'standard' else bool(config_data.isLocked)

            new_config = SavedConfiguration(
                name=config_data.name,
                description=config_data.description,
                author=config_data.author,
                ticker=config_data.ticker,
                entry_date=entry_date,
                is_locked=is_locked_final,
                status=position_status,
                state=config_data.state,
                deal_settings=config_data.dealSettings,
                deal_info=config_data.dealInfo,
                user_id=config_data.userId
            )

            db.add(new_config)
            created_configs.append(new_config)
        
        db.commit()
        
        # Обновляем объекты после коммита
        for config in created_configs:
            db.refresh(config)
        
        return {
            "status": "success",
            "message": f"Успешно создано конфигураций: {len(created_configs)}",
            "data": [config.to_dict() for config in created_configs]
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка массового создания: {str(e)}")
