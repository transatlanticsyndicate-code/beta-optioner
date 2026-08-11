"""
SQLAlchemy модель для сохранённых промптов стратегии «Север GPT»
ЗАЧЕМ: общая библиотека промптов на сервере (без привязки к пользователю —
аутентификация в проекте отключена, пользователей всего двое). Промпт,
активный по умолчанию, определяется по метке last_used_at (последний
использованный — единый для всех).
"""
from sqlalchemy import Column, String, Text, TIMESTAMP
from sqlalchemy.sql import func
import uuid

from app.database import Base

# ЗАЧЕМ: три изолированных набора промптов — по одному на режим работы стратегии.
# Список держим рядом с моделью: и колонка, и валидация в роутере смотрят сюда.
NORTH_GPT_MODES = ("with_asset", "options_only", "call_only")
DEFAULT_NORTH_GPT_MODE = "options_only"


class NorthGptPrompt(Base):
    """Промпт для ИИ-подбора комбинаций (стратегия «Север GPT»)"""
    __tablename__ = "north_gpt_prompts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False, index=True)
    text = Column(Text, nullable=False)
    # ЗАЧЕМ: режим стратегии, к которому относится промпт. Наборы изолированы —
    # в выпадающем списке формы видны только промпты выбранного режима.
    # VARCHAR, а не Enum: расширять список значений дешевле (правки типа в PG не нужны),
    # корректность обеспечивает валидация на входе в роутере.
    mode = Column(
        String(20),
        nullable=False,
        index=True,
        default=DEFAULT_NORTH_GPT_MODE,
        server_default=DEFAULT_NORTH_GPT_MODE,
    )
    created_at = Column(TIMESTAMP, server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now(), nullable=False)
    # ЗАЧЕМ: метка последнего использования — по ней промпт становится активным по умолчанию
    last_used_at = Column(TIMESTAMP, nullable=True, index=True)

    def __repr__(self):
        return f"<NorthGptPrompt(id={self.id}, name={self.name})>"

    def to_dict(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "text": self.text,
            "mode": self.mode or DEFAULT_NORTH_GPT_MODE,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
            "lastUsedAt": self.last_used_at.isoformat() if self.last_used_at else None,
        }
