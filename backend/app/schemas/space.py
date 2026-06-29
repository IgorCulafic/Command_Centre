from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class SpaceCreate(BaseModel):
    name: str
    icon: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None
    parent_id: Optional[int] = None
    position: int = 0
    is_pinned: bool = False
    is_favorite: bool = False
    is_group: bool = False
    status_set_id: Optional[int] = None
    notifications_muted: bool = False


class SpaceUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None
    parent_id: Optional[int] = None
    position: Optional[int] = None
    is_pinned: Optional[bool] = None
    is_favorite: Optional[bool] = None
    is_group: Optional[bool] = None
    status_set_id: Optional[int] = None
    notifications_muted: Optional[bool] = None


class SpaceRead(BaseModel):
    id: int
    name: str
    icon: Optional[str]
    color: Optional[str]
    description: Optional[str] = None
    parent_id: Optional[int]
    position: int
    is_pinned: bool
    is_favorite: bool
    is_group: bool = False
    status_set_id: Optional[int]
    notifications_muted: bool
    created_at: datetime
    updated_at: datetime
    archived_at: Optional[datetime] = None
    deleted_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)
