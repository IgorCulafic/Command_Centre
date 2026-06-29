from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

from app.db import utcnow


class Item(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    space_id: int = Field(foreign_key="space.id")
    type: str  # "task" | "note" | "link" | "opportunity" | "event"
    title: str
    body: Optional[str] = None
    status_id: Optional[int] = Field(default=None, foreign_key="status.id")
    priority: int = 0
    due_at: Optional[datetime] = None
    remind_at: Optional[datetime] = None
    # When the remind_at push was sent (so we fire each reminder once). Cleared
    # when remind_at is changed, so a rescheduled reminder fires again.
    reminded_at: Optional[datetime] = None
    position: int = 0
    is_pinned: bool = False
    metadata_: dict = Field(default_factory=dict, sa_column=Column("metadata", JSON))
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    completed_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
