from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.db import utcnow


class Attachment(SQLModel, table=True):
    """A file stored on the server, attached to an item or a space (or loose).

    The bytes live on disk under FILES_DIR as ``stored_name``; the original name is
    kept for display/download. AI agents reach these via the API, and — since the
    files sit at a known path on the NAS — a local agent can read/write them too.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    item_id: Optional[int] = Field(default=None, foreign_key="item.id", index=True)
    space_id: Optional[int] = Field(default=None, foreign_key="space.id", index=True)
    filename: str
    stored_name: str  # unique on-disk name (uuid + ext)
    content_type: Optional[str] = None
    size: int = 0
    created_at: datetime = Field(default_factory=utcnow)
    deleted_at: Optional[datetime] = None
