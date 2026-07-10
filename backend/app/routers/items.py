import calendar
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import or_
from sqlmodel import Session, select

from app.db import get_session, utcnow
from app.models import Attachment, Item, Space, Status, StatusSet
from app.schemas import ItemCreate, ItemRead, ItemUpdate

router = APIRouter(prefix="/items", tags=["items"])


class PurgeRequest(BaseModel):
    """Body for purging a selected set of trashed items."""

    ids: List[int]


def _purge_item_rows(session: Session, ids: List[int]) -> None:
    """Permanently delete items (and their attachment rows). Caller commits."""
    if not ids:
        return
    attachments = session.exec(
        select(Attachment).where(Attachment.item_id.in_(ids))
    ).all()
    for att in attachments:
        session.delete(att)
    for iid in ids:
        item = session.get(Item, iid)
        if item:
            session.delete(item)

# Types that carry a checkable status; notes/links/events don't.
_STATUSED_TYPES = {"task", "opportunity"}

_RECURRENCES = {"daily", "weekly", "monthly"}


def _advance(dt: datetime, recurrence: str) -> datetime:
    """Move a datetime forward by one recurrence step (month-end safe)."""
    if recurrence == "daily":
        return dt + timedelta(days=1)
    if recurrence == "weekly":
        return dt + timedelta(weeks=1)
    # monthly: add a month, clamping the day (e.g. Jan 31 -> Feb 28/29).
    month = dt.month + 1
    year = dt.year + (month - 1) // 12
    month = (month - 1) % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    return dt.replace(year=year, month=month, day=min(dt.day, last_day))


def _spawn_next_occurrence(session: Session, item: Item) -> None:
    """When a recurring task is completed, create its next occurrence (fresh,
    active, with due/remind advanced by the recurrence). The completed one stays
    as history."""
    meta = item.metadata_ or {}
    recurrence = meta.get("recurrence")
    if recurrence not in _RECURRENCES:
        return
    base = item.due_at or utcnow()
    session.add(
        Item(
            space_id=item.space_id,
            type=item.type,
            title=item.title,
            body=item.body,
            status_id=_default_status_id(session, item.space_id, item.type),
            priority=item.priority,
            due_at=_advance(base, recurrence),
            remind_at=_advance(item.remind_at, recurrence) if item.remind_at else None,
            position=item.position,
            is_pinned=item.is_pinned,
            metadata_=dict(meta),
        )
    )


def _default_status_id(session: Session, space_id: int, item_type: str) -> int | None:
    """The first active status of the item's space's set — so a freshly created
    task/opportunity is immediately live (shows in Today, gets a marker) instead
    of landing without a status."""
    if item_type not in _STATUSED_TYPES:
        return None
    space = session.get(Space, space_id)
    set_id = space.status_set_id if space and space.status_set_id else None
    if set_id is None:
        default_set = session.exec(
            select(StatusSet).where(StatusSet.is_default)
        ).first()
        set_id = default_set.id if default_set else None
    if set_id is None:
        return None
    statuses = session.exec(
        select(Status)
        .where(Status.status_set_id == set_id)
        .order_by(Status.position)
    ).all()
    active = [s for s in statuses if s.behavior == "active"]
    if active:
        return active[0].id
    return statuses[0].id if statuses else None


def _item_to_read(item: Item) -> ItemRead:
    return ItemRead(
        id=item.id,
        space_id=item.space_id,
        type=item.type,
        title=item.title,
        body=item.body,
        status_id=item.status_id,
        priority=item.priority,
        due_at=item.due_at,
        remind_at=item.remind_at,
        position=item.position,
        is_pinned=item.is_pinned,
        metadata=item.metadata_ or {},
        created_at=item.created_at,
        updated_at=item.updated_at,
        completed_at=item.completed_at,
        deleted_at=item.deleted_at,
    )


@router.get("", response_model=List[ItemRead])
def list_items(
    space_id: Optional[int] = Query(default=None),
    type: Optional[str] = Query(default=None),
    behavior: Optional[str] = Query(default=None),
    session: Session = Depends(get_session),
):
    query = select(Item).where(Item.deleted_at.is_(None))
    if space_id is not None:
        query = query.where(Item.space_id == space_id)
    else:
        # Cross-space feeds (Today, deadlines, filters) must skip items whose space
        # is archived or in the Trash — otherwise a put-away or deleted space's
        # items keep showing up. A per-space request (space_id given) is exempt.
        hidden_spaces = select(Space.id).where(
            or_(Space.archived_at.is_not(None), Space.deleted_at.is_not(None))
        )
        query = query.where(Item.space_id.not_in(hidden_spaces))
    if type is not None:
        query = query.where(Item.type == type)
    if behavior is not None:
        # Join to Status to filter by behavior
        query = query.join(Status, Item.status_id == Status.id).where(
            Status.behavior == behavior
        )
    query = query.order_by(Item.priority.desc(), Item.position)
    items = session.exec(query).all()
    return [_item_to_read(i) for i in items]


@router.post("", response_model=ItemRead, status_code=status.HTTP_201_CREATED)
def create_item(payload: ItemCreate, session: Session = Depends(get_session)):
    data = payload.model_dump()
    target = session.get(Space, data["space_id"])
    if target and target.is_group:
        raise HTTPException(
            status_code=400, detail="Groups hold spaces, not items"
        )
    metadata = data.pop("metadata", {})
    if data.get("status_id") is None:
        data["status_id"] = _default_status_id(session, data["space_id"], data["type"])
    item = Item(**data, metadata_=metadata)
    session.add(item)
    session.commit()
    session.refresh(item)
    return _item_to_read(item)


@router.post(
    "/{item_id}/duplicate", response_model=ItemRead, status_code=status.HTTP_201_CREATED
)
def duplicate_item(item_id: int, session: Session = Depends(get_session)):
    """Copy an item into the same space — fresh (active status, no completed/remind
    stamps), so recurring-style tasks don't need re-entry. Tags/subtasks carry over."""
    item = session.get(Item, item_id)
    if not item or item.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Item not found")
    copy = Item(
        space_id=item.space_id,
        type=item.type,
        title=item.title,
        body=item.body,
        status_id=_default_status_id(session, item.space_id, item.type),
        priority=item.priority,
        due_at=item.due_at,
        remind_at=None,
        position=item.position,
        is_pinned=False,
        metadata_=dict(item.metadata_ or {}),
    )
    session.add(copy)
    session.commit()
    session.refresh(copy)
    return _item_to_read(copy)


@router.get("/trash", response_model=List[ItemRead])
def list_trash(session: Session = Depends(get_session)):
    """Soft-deleted items, most-recently-deleted first (for the Trash view).

    Defined before /{item_id} so 'trash' isn't parsed as an id.
    """
    items = session.exec(
        select(Item)
        .where(Item.deleted_at.is_not(None))
        .order_by(Item.deleted_at.desc())
    ).all()
    return [_item_to_read(i) for i in items]


@router.post("/trash/empty")
def empty_trash(session: Session = Depends(get_session)):
    """Permanently delete everything in the Trash. Returns how many were purged."""
    ids = list(session.exec(select(Item.id).where(Item.deleted_at.is_not(None))).all())
    _purge_item_rows(session, ids)
    session.commit()
    return {"purged": len(ids)}


@router.post("/trash/purge")
def purge_selected_items(
    payload: PurgeRequest, session: Session = Depends(get_session)
):
    """Permanently delete the given items — but only ones already in the Trash."""
    ids = list(
        session.exec(
            select(Item.id).where(
                Item.id.in_(payload.ids), Item.deleted_at.is_not(None)
            )
        ).all()
    )
    _purge_item_rows(session, ids)
    session.commit()
    return {"purged": len(ids)}


@router.delete("/{item_id}/purge", status_code=status.HTTP_204_NO_CONTENT)
def purge_item(item_id: int, session: Session = Depends(get_session)):
    """Permanently delete a single item — only allowed once it's in the Trash."""
    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.deleted_at is None:
        raise HTTPException(
            status_code=400, detail="Only trashed items can be purged"
        )
    _purge_item_rows(session, [item_id])
    session.commit()


@router.post("/{item_id}/restore", response_model=ItemRead)
def restore_item(item_id: int, session: Session = Depends(get_session)):
    """Bring a soft-deleted item back (clears deleted_at)."""
    item = session.get(Item, item_id)
    if not item or item.deleted_at is None:
        raise HTTPException(status_code=404, detail="Item not in trash")
    item.deleted_at = None
    item.updated_at = utcnow()
    session.add(item)
    session.commit()
    session.refresh(item)
    return _item_to_read(item)


@router.get("/{item_id}", response_model=ItemRead)
def get_item(item_id: int, session: Session = Depends(get_session)):
    item = session.get(Item, item_id)
    if not item or item.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Item not found")
    return _item_to_read(item)


@router.patch("/{item_id}", response_model=ItemRead)
def update_item(
    item_id: int, payload: ItemUpdate, session: Session = Depends(get_session)
):
    item = session.get(Item, item_id)
    if not item or item.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Item not found")
    update_data = payload.model_dump(exclude_unset=True)
    if "metadata" in update_data:
        item.metadata_ = update_data.pop("metadata")

    # When the status changes, keep completed_at in sync with the new status's
    # behavior: closing an item (done / dismissed) stamps it; reopening clears
    # it. The app keys "Completed" off behavior (CLAUDE.md §7), and completed_at
    # gives a stable timestamp to order closed items by. An explicit completed_at
    # in the payload always wins.
    spawn_next = False
    if "status_id" in update_data and "completed_at" not in update_data:
        new_status_id = update_data["status_id"]
        new_status = (
            session.get(Status, new_status_id) if new_status_id is not None else None
        )
        behavior = new_status.behavior if new_status else None
        if behavior in ("done", "dismissed"):
            # Spawn the next recurrence only on a fresh transition to "done"
            # (None -> set), so toggling done->done doesn't duplicate.
            if item.completed_at is None and behavior == "done":
                spawn_next = True
            item.completed_at = item.completed_at or utcnow()
        else:
            item.completed_at = None

    # Rescheduling (or clearing) the reminder lets it fire again.
    if "remind_at" in update_data:
        item.reminded_at = None

    for key, value in update_data.items():
        setattr(item, key, value)
    item.updated_at = utcnow()
    session.add(item)
    if spawn_next:
        _spawn_next_occurrence(session, item)
    session.commit()
    session.refresh(item)
    return _item_to_read(item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: int, session: Session = Depends(get_session)):
    item = session.get(Item, item_id)
    if not item or item.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Item not found")
    item.deleted_at = utcnow()
    item.updated_at = utcnow()
    session.add(item)
    session.commit()
