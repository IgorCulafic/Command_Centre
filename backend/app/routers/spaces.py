from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session, utcnow
from app.models import Attachment, Item, Space
from app.schemas import SpaceCreate, SpaceRead, SpaceUpdate

router = APIRouter(prefix="/spaces", tags=["spaces"])


class PurgeRequest(BaseModel):
    """Body for purging a selected set of trashed spaces."""

    ids: List[int]


def _subtree_ids(session: Session, root_id: int) -> List[int]:
    """All space ids in the subtree rooted at root_id (incl. root), breadth-first.

    Walks parent_id over every space (deleted/archived included) so a cascade can
    find the whole subtree even after it's been put away."""
    rows = session.exec(select(Space.id, Space.parent_id)).all()
    children: dict[int | None, List[int]] = {}
    for sid, pid in rows:
        children.setdefault(pid, []).append(sid)
    order: List[int] = []
    queue: List[int] = [root_id]
    while queue:
        cur = queue.pop(0)
        order.append(cur)
        queue.extend(children.get(cur, []))
    return order


def _purge_space_rows(session: Session, space_ids: List[int]) -> None:
    """Permanently delete spaces, their items, and all related attachment rows.
    Caller commits. Deepest-first to keep self-referential FKs happy."""
    if not space_ids:
        return
    item_ids = list(
        session.exec(select(Item.id).where(Item.space_id.in_(space_ids))).all()
    )
    if item_ids:
        for att in session.exec(
            select(Attachment).where(Attachment.item_id.in_(item_ids))
        ).all():
            session.delete(att)
        for iid in item_ids:
            item = session.get(Item, iid)
            if item:
                session.delete(item)
    for att in session.exec(
        select(Attachment).where(Attachment.space_id.in_(space_ids))
    ).all():
        session.delete(att)
    for sid in reversed(space_ids):
        space = session.get(Space, sid)
        if space:
            session.delete(space)


@router.get("", response_model=List[SpaceRead])
def list_spaces(session: Session = Depends(get_session)):
    """Live spaces — excludes both archived and trashed."""
    spaces = session.exec(
        select(Space)
        .where(Space.deleted_at.is_(None), Space.archived_at.is_(None))
        .order_by(Space.position)
    ).all()
    return spaces


@router.post("", response_model=SpaceRead, status_code=status.HTTP_201_CREATED)
def create_space(payload: SpaceCreate, session: Session = Depends(get_session)):
    space = Space(**payload.model_dump())
    session.add(space)
    session.commit()
    session.refresh(space)
    return space


@router.get("/archived", response_model=List[SpaceRead])
def list_archived(session: Session = Depends(get_session)):
    """Archived (put-away) spaces, most-recently-archived first. Declared before
    /{space_id} so 'archived' isn't parsed as an id."""
    spaces = session.exec(
        select(Space)
        .where(Space.archived_at.is_not(None), Space.deleted_at.is_(None))
        .order_by(Space.archived_at.desc())
    ).all()
    return spaces


@router.get("/trash", response_model=List[SpaceRead])
def list_space_trash(session: Session = Depends(get_session)):
    """Trashed spaces, most-recently-deleted first (for the Trash view)."""
    spaces = session.exec(
        select(Space)
        .where(Space.deleted_at.is_not(None))
        .order_by(Space.deleted_at.desc())
    ).all()
    return spaces


@router.post("/trash/empty")
def empty_space_trash(session: Session = Depends(get_session)):
    """Permanently delete every trashed space (and its items)."""
    ids = list(
        session.exec(select(Space.id).where(Space.deleted_at.is_not(None))).all()
    )
    _purge_space_rows(session, ids)
    session.commit()
    return {"purged": len(ids)}


@router.post("/trash/purge")
def purge_selected_spaces(
    payload: PurgeRequest, session: Session = Depends(get_session)
):
    """Permanently delete the given spaces (and their trashed subtree + items) —
    only ones already in the Trash."""
    selected = set(
        session.exec(
            select(Space.id).where(
                Space.id.in_(payload.ids), Space.deleted_at.is_not(None)
            )
        ).all()
    )
    all_ids: List[int] = []
    for sid in selected:
        for descendant in _subtree_ids(session, sid):
            if descendant not in all_ids:
                all_ids.append(descendant)
    # Defensive: never hard-delete a space that isn't actually trashed.
    trashed = {
        s_id
        for s_id in session.exec(
            select(Space.id).where(
                Space.id.in_(all_ids), Space.deleted_at.is_not(None)
            )
        ).all()
    }
    ids = [s_id for s_id in all_ids if s_id in trashed]
    _purge_space_rows(session, ids)
    session.commit()
    return {"purged": len(ids)}


@router.get("/{space_id}", response_model=SpaceRead)
def get_space(space_id: int, session: Session = Depends(get_session)):
    space = session.get(Space, space_id)
    if not space or space.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Space not found")
    return space


@router.patch("/{space_id}", response_model=SpaceRead)
def update_space(
    space_id: int, payload: SpaceUpdate, session: Session = Depends(get_session)
):
    space = session.get(Space, space_id)
    if not space or space.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Space not found")
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(space, key, value)
    space.updated_at = utcnow()
    session.add(space)
    session.commit()
    session.refresh(space)
    return space


@router.delete("/{space_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_space(space_id: int, session: Session = Depends(get_session)):
    """Soft-delete the space AND its whole subtree (descendant spaces + their live
    items), stamped with one timestamp so restore can revive exactly this set."""
    space = session.get(Space, space_id)
    if not space or space.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Space not found")
    ts = utcnow()
    ids = _subtree_ids(session, space_id)
    for sid in ids:
        sp = session.get(Space, sid)
        if sp and sp.deleted_at is None:
            sp.deleted_at = ts
            sp.updated_at = ts
            session.add(sp)
    items = session.exec(
        select(Item).where(Item.space_id.in_(ids), Item.deleted_at.is_(None))
    ).all()
    for it in items:
        it.deleted_at = ts
        it.updated_at = ts
        session.add(it)
    session.commit()


@router.post("/{space_id}/restore", response_model=SpaceRead)
def restore_space(space_id: int, session: Session = Depends(get_session)):
    """Revive a trashed space and everything trashed *with* it (same timestamp).
    Items the user had trashed earlier on their own stay in the Trash."""
    space = session.get(Space, space_id)
    if not space or space.deleted_at is None:
        raise HTTPException(status_code=404, detail="Space not in trash")
    ts = space.deleted_at
    now = utcnow()
    ids = _subtree_ids(session, space_id)
    for sid in ids:
        sp = session.get(Space, sid)
        if sp and sp.deleted_at == ts:
            sp.deleted_at = None
            sp.updated_at = now
            session.add(sp)
    items = session.exec(
        select(Item).where(Item.space_id.in_(ids), Item.deleted_at == ts)
    ).all()
    for it in items:
        it.deleted_at = None
        it.updated_at = now
        session.add(it)
    session.commit()
    session.refresh(space)
    return space


@router.delete("/{space_id}/purge", status_code=status.HTTP_204_NO_CONTENT)
def purge_space(space_id: int, session: Session = Depends(get_session)):
    """Permanently delete a trashed space and its subtree. Trash-only."""
    space = session.get(Space, space_id)
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    if space.deleted_at is None:
        raise HTTPException(
            status_code=400, detail="Only trashed spaces can be purged"
        )
    ids = _subtree_ids(session, space_id)
    _purge_space_rows(session, ids)
    session.commit()


@router.post("/{space_id}/archive", response_model=SpaceRead)
def archive_space(space_id: int, session: Session = Depends(get_session)):
    """Archive (put away) the space and its subtree — hidden from the sidebar and
    cross-space feeds, kept and restorable. Items are preserved, not trashed."""
    space = session.get(Space, space_id)
    if not space or space.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Space not found")
    ts = utcnow()
    for sid in _subtree_ids(session, space_id):
        sp = session.get(Space, sid)
        if sp and sp.archived_at is None and sp.deleted_at is None:
            sp.archived_at = ts
            sp.updated_at = ts
            session.add(sp)
    session.commit()
    session.refresh(space)
    return space


@router.post("/{space_id}/unarchive", response_model=SpaceRead)
def unarchive_space(space_id: int, session: Session = Depends(get_session)):
    """Bring an archived space (and everything archived with it) back."""
    space = session.get(Space, space_id)
    if not space or space.archived_at is None:
        raise HTTPException(status_code=404, detail="Space not archived")
    ts = space.archived_at
    now = utcnow()
    for sid in _subtree_ids(session, space_id):
        sp = session.get(Space, sid)
        if sp and sp.archived_at == ts:
            sp.archived_at = None
            sp.updated_at = now
            session.add(sp)
    session.commit()
    session.refresh(space)
    return space
