from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ItemCreate(BaseModel):
    space_id: int
    type: str
    title: str
    body: Optional[str] = None
    status_id: Optional[int] = None
    priority: int = 0
    due_at: Optional[datetime] = None
    remind_at: Optional[datetime] = None
    position: int = 0
    is_pinned: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)


class ItemUpdate(BaseModel):
    space_id: Optional[int] = None
    type: Optional[str] = None
    title: Optional[str] = None
    body: Optional[str] = None
    status_id: Optional[int] = None
    priority: Optional[int] = None
    due_at: Optional[datetime] = None
    remind_at: Optional[datetime] = None
    position: Optional[int] = None
    is_pinned: Optional[bool] = None
    metadata: Optional[dict[str, Any]] = None
    completed_at: Optional[datetime] = None


class ItemRead(BaseModel):
    id: int
    space_id: int
    type: str
    title: str
    body: Optional[str]
    status_id: Optional[int]
    priority: int
    due_at: Optional[datetime]
    remind_at: Optional[datetime]
    position: int
    is_pinned: bool
    metadata: dict[str, Any]
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime]
    deleted_at: Optional[datetime]

    @model_validator(mode="before")
    @classmethod
    def remap_metadata(cls, values):
        # ORM object: read metadata_ attr into metadata key
        if hasattr(values, "metadata_"):
            data = (
                dict(values.__dict__) if hasattr(values, "__dict__") else dict(values)
            )
            data["metadata"] = values.metadata_ or {}
            return data
        # dict input: keep metadata as-is
        return values

    model_config = ConfigDict(from_attributes=True)
