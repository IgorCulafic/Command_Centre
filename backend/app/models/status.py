from typing import Optional

from sqlmodel import Field, SQLModel


class StatusSet(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    is_default: bool = False


class Status(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    status_set_id: int = Field(foreign_key="statusset.id")
    label: str
    color: str
    behavior: str  # "active" | "done" | "dismissed"
    position: int = 0
