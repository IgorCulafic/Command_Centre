from typing import Optional

from pydantic import BaseModel, ConfigDict


class StatusSetCreate(BaseModel):
    name: str
    is_default: bool = False


class StatusSetUpdate(BaseModel):
    name: Optional[str] = None
    is_default: Optional[bool] = None


class StatusSetRead(BaseModel):
    id: int
    name: str
    is_default: bool

    model_config = ConfigDict(from_attributes=True)


class StatusCreate(BaseModel):
    label: str
    color: str
    behavior: str  # "active" | "done" | "dismissed"
    position: int = 0


class StatusUpdate(BaseModel):
    label: Optional[str] = None
    color: Optional[str] = None
    behavior: Optional[str] = None
    position: Optional[int] = None


class StatusRead(BaseModel):
    id: int
    status_set_id: int
    label: str
    color: str
    behavior: str
    position: int

    model_config = ConfigDict(from_attributes=True)
