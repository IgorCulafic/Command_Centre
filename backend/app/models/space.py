from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.db import utcnow


class Space(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    icon: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None
    parent_id: Optional[int] = Field(default=None, foreign_key="space.id")
    position: int = 0
    is_pinned: bool = False
    is_favorite: bool = False
    # A group is a folder for other spaces (a collapsible sidebar section). It
    # holds child spaces, never items — so item-target pickers exclude it and the
    # API rejects creating items inside one.
    is_group: bool = False
    status_set_id: Optional[int] = Field(default=None, foreign_key="statusset.id")
    notifications_muted: bool = False
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    # Archived = put away (hidden from sidebar + cross-space feeds) but kept and
    # restorable; distinct from deleted_at (Trash). See spaces router.
    archived_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
