import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session, select

from app.auth import require_auth, require_auth_query
from app.db import get_session, utcnow
from app.models import Attachment

# Where uploaded bytes live. On the NAS this is on the /data volume so a local AI
# agent can read/write the same files the API serves.
FILES_DIR = Path(os.getenv("FILES_DIR", "files"))

router = APIRouter(prefix="/attachments", tags=["attachments"])


class AttachmentRead(BaseModel):
    id: int
    item_id: Optional[int]
    space_id: Optional[int]
    filename: str
    content_type: Optional[str]
    size: int
    created_at: datetime
    path: str  # absolute server path (useful for CLI / AI / copy-path)

    model_config = ConfigDict(from_attributes=True)


def _to_read(att: Attachment) -> AttachmentRead:
    return AttachmentRead(
        id=att.id,
        item_id=att.item_id,
        space_id=att.space_id,
        filename=att.filename,
        content_type=att.content_type,
        size=att.size,
        created_at=att.created_at,
        path=str((FILES_DIR / att.stored_name).resolve()),
    )


def _get_live(att_id: int, session: Session) -> Attachment:
    att = session.get(Attachment, att_id)
    if not att or att.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return att


@router.get(
    "",
    response_model=List[AttachmentRead],
    dependencies=[Depends(require_auth)],
)
def list_attachments(
    item_id: Optional[int] = Query(default=None),
    space_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
):
    query = select(Attachment).where(Attachment.deleted_at.is_(None))
    if item_id is not None:
        query = query.where(Attachment.item_id == item_id)
    if space_id is not None:
        query = query.where(Attachment.space_id == space_id)
    query = query.order_by(Attachment.created_at.desc())
    return [_to_read(a) for a in session.exec(query).all()]


@router.post(
    "",
    response_model=AttachmentRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_auth)],
)
def upload_attachment(
    file: UploadFile = File(...),
    item_id: Optional[int] = Form(default=None),
    space_id: Optional[int] = Form(default=None),
    session: Session = Depends(get_session),
):
    FILES_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "").suffix
    stored_name = f"{uuid.uuid4().hex}{ext}"
    dest = FILES_DIR / stored_name

    size = 0
    with dest.open("wb") as out:
        while chunk := file.file.read(1024 * 1024):
            out.write(chunk)
            size += len(chunk)

    att = Attachment(
        item_id=item_id,
        space_id=space_id,
        filename=file.filename or stored_name,
        stored_name=stored_name,
        content_type=file.content_type,
        size=size,
    )
    session.add(att)
    session.commit()
    session.refresh(att)
    return _to_read(att)


@router.get("/{att_id}/raw", dependencies=[Depends(require_auth_query)])
def raw_attachment(att_id: int, session: Session = Depends(get_session)):
    """Serve inline (image/PDF preview in the browser)."""
    att = _get_live(att_id, session)
    return FileResponse(
        FILES_DIR / att.stored_name,
        media_type=att.content_type or "application/octet-stream",
    )


@router.get("/{att_id}/download", dependencies=[Depends(require_auth_query)])
def download_attachment(att_id: int, session: Session = Depends(get_session)):
    """Serve as a download with the original filename."""
    att = _get_live(att_id, session)
    return FileResponse(
        FILES_DIR / att.stored_name,
        media_type=att.content_type or "application/octet-stream",
        filename=att.filename,
    )


@router.delete(
    "/{att_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_auth)],
)
def delete_attachment(att_id: int, session: Session = Depends(get_session)):
    att = _get_live(att_id, session)
    att.deleted_at = utcnow()
    session.add(att)
    session.commit()
