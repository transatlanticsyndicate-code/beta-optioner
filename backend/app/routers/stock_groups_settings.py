"""
API роутер для настроек групп акций
ЗАЧЕМ: Позволяет сохранять и загружать настройки классификации акций
Затрагивает: страница настроек, классификатор акций
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
import json
import os

router = APIRouter(prefix="/api/stock-groups-settings", tags=["stock-groups-settings"])

# Путь к файлу настроек
CONFIG_DIR = os.path.join(os.path.dirname(__file__), "..", "config")
SETTINGS_FILE = os.path.join(CONFIG_DIR, "stock_groups_settings.json")


# ============================================================================
# МОДЕЛИ ДАННЫХ
# ============================================================================

class GroupMultipliers(BaseModel):
    down: float = 1.0
    up: float = 1.0

class StockGroup(BaseModel):
    label: str
    description: str
    multipliers: GroupMultipliers

class Thresholds(BaseModel):
    stable_min_cap: float = 100
    stable_max_beta: float = 1.2
    tech_growth_min_cap: float = 10
    tech_growth_max_cap: float = 250
    illiquid_max_cap: float = 5
    illiquid_min_beta: float = 2.0
    illiquid_max_volume: float = 2
    mega_cap_threshold: float = 50
    high_volume_threshold: float = 10
    earnings_proximity_days: int = 14
    event_driven_down_mult: float = 0.9
    event_driven_up_mult: float = 0.95

class StockGroupsSettingsRequest(BaseModel):
    groups: Optional[Dict[str, Any]] = None
    thresholds: Optional[Dict[str, Any]] = None


# ============================================================================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ============================================================================

def load_settings() -> Dict[str, Any]:
    """Загружает настройки из JSON файла"""
    try:
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        print(f"[stock_groups_settings] Ошибка загрузки настроек: {e}")
    
    # Возвращаем значения по умолчанию
    return get_default_settings()


def save_settings(settings: Dict[str, Any]) -> bool:
    """Сохраняет настройки в JSON файл"""
    try:
        # Создаём директорию если не существует
        os.makedirs(CONFIG_DIR, exist_ok=True)
        
        with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"[stock_groups_settings] Ошибка сохранения настроек: {e}")
        return False


def get_default_settings() -> Dict[str, Any]:
    """Возвращает настройки по умолчанию"""
    return {
        "groups": {
            "stable": {
                "label": "Стабильные",
                "description": "Large-cap акции с низкой волатильностью",
                "multipliers": {"down": 1.0, "up": 1.0}
            },
            "tech-growth": {
                "label": "Tech Growth",
                "description": "Tech-акции $10-250B (HUBS, ZS, DDOG)",
                "multipliers": {"down": 0.70, "up": 1.1}
            },
            "growth": {
                "label": "Рост/События",
                "description": "Growth-акции, event-driven, высокая IV",
                "multipliers": {"down": 0.55, "up": 1.05}
            },
            "illiquid": {
                "label": "Неликвидные",
                "description": "Small-cap, низкий объём, высокий beta",
                "multipliers": {"down": 1.0, "up": 1.2}
            }
        },
        "thresholds": {
            "stable_min_cap": 100,
            "stable_max_beta": 1.2,
            "tech_growth_min_cap": 10,
            "tech_growth_max_cap": 250,
            "illiquid_max_cap": 5,
            "illiquid_min_beta": 2.0,
            "illiquid_max_volume": 2,
            "mega_cap_threshold": 50,
            "high_volume_threshold": 10,
            "earnings_proximity_days": 14,
            "event_driven_down_mult": 0.9,
            "event_driven_up_mult": 0.95
        }
    }


# ============================================================================
# API ЭНДПОИНТЫ
# ============================================================================

@router.get("")
async def get_settings():
    """
    Получить текущие настройки групп акций
    ЗАЧЕМ: Для отображения в UI и использования в классификаторе
    """
    settings = load_settings()
    return settings


@router.post("")
async def update_settings(request: StockGroupsSettingsRequest):
    """
    Обновить настройки групп акций
    ЗАЧЕМ: Сохранение изменений из страницы настроек
    """
    # Загружаем текущие настройки
    current = load_settings()
    
    # Мержим с новыми данными
    if request.groups:
        current["groups"] = request.groups
    if request.thresholds:
        current["thresholds"] = request.thresholds
    
    # Сохраняем
    if save_settings(current):
        return {"status": "success", "message": "Настройки сохранены"}
    else:
        raise HTTPException(status_code=500, detail="Ошибка сохранения настроек")


@router.post("/reset")
async def reset_settings():
    """
    Сбросить настройки к значениям по умолчанию
    ЗАЧЕМ: Восстановление дефолтных значений
    """
    default = get_default_settings()
    if save_settings(default):
        return {"status": "success", "message": "Настройки сброшены", "settings": default}
    else:
        raise HTTPException(status_code=500, detail="Ошибка сброса настроек")
