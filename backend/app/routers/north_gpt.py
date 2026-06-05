"""
API роутер стратегии «Север GPT»
ЗАЧЕМ: библиотека промптов (CRUD) и эндпоинт ИИ-подбора опционных комбинаций
через ChatGPT. Аутентификации в проекте нет — промпты общие для всех.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from sqlalchemy import nullslast
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models.north_gpt_prompt import NorthGptPrompt

router = APIRouter(prefix="/api/north-gpt", tags=["north_gpt"])


# ============ Pydantic: промпты ============
class PromptCreate(BaseModel):
    name: str
    text: str


class PromptUpdate(BaseModel):
    name: Optional[str] = None
    text: Optional[str] = None


# ============ CRUD библиотеки промптов ============
@router.get("/prompts")
def list_prompts(db: Session = Depends(get_db)):
    """
    Список промптов. Первым идёт последний использованный
    (last_used_at desc, NULL — в конце), затем по дате обновления.
    ЗАЧЕМ: фронтенд берёт первый элемент как активный по умолчанию.
    """
    items = (
        db.query(NorthGptPrompt)
        .order_by(
            nullslast(NorthGptPrompt.last_used_at.desc()),
            NorthGptPrompt.updated_at.desc(),
        )
        .all()
    )
    return {"status": "success", "data": [p.to_dict() for p in items]}


@router.post("/prompts")
def create_prompt(body: PromptCreate, db: Session = Depends(get_db)):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Название промпта не может быть пустым")
    if not (body.text or "").strip():
        raise HTTPException(status_code=400, detail="Текст промпта не может быть пустым")
    prompt = NorthGptPrompt(name=name, text=body.text)
    db.add(prompt)
    db.commit()
    db.refresh(prompt)
    return {"status": "success", "data": prompt.to_dict()}


@router.put("/prompts/{prompt_id}")
def update_prompt(prompt_id: str, body: PromptUpdate, db: Session = Depends(get_db)):
    prompt = db.query(NorthGptPrompt).filter(NorthGptPrompt.id == prompt_id).first()
    if not prompt:
        raise HTTPException(status_code=404, detail="Промпт не найден")
    if body.name is not None:
        new_name = body.name.strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Название промпта не может быть пустым")
        prompt.name = new_name
    if body.text is not None:
        prompt.text = body.text
    db.commit()
    db.refresh(prompt)
    return {"status": "success", "data": prompt.to_dict()}


@router.delete("/prompts/{prompt_id}")
def delete_prompt(prompt_id: str, db: Session = Depends(get_db)):
    prompt = db.query(NorthGptPrompt).filter(NorthGptPrompt.id == prompt_id).first()
    if not prompt:
        raise HTTPException(status_code=404, detail="Промпт не найден")
    db.delete(prompt)
    db.commit()
    return {"status": "success"}


@router.post("/prompts/{prompt_id}/touch")
def touch_prompt(prompt_id: str, db: Session = Depends(get_db)):
    """Отметить промпт как последний использованный (обновить last_used_at)."""
    prompt = db.query(NorthGptPrompt).filter(NorthGptPrompt.id == prompt_id).first()
    if not prompt:
        raise HTTPException(status_code=404, detail="Промпт не найден")
    prompt.last_used_at = func.now()
    db.commit()
    db.refresh(prompt)
    return {"status": "success", "data": prompt.to_dict()}
