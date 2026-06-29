from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.db import utcnow


class PushSubscription(SQLModel, table=True):
    """A browser Web Push subscription (one per installed PWA / browser)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    endpoint: str = Field(index=True, unique=True)
    p256dh: str
    auth: str
    created_at: datetime = Field(default_factory=utcnow)
