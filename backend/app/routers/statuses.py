from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import Status, StatusSet
from app.schemas import (
    StatusCreate,
    StatusRead,
    StatusSetCreate,
    StatusSetRead,
    StatusSetUpdate,
    StatusUpdate,
)

router = APIRouter(tags=["statuses"])


# ── Status Sets ────────────────────────────────────────────────────────────────


@router.get("/status-sets", response_model=List[StatusSetRead])
def list_status_sets(session: Session = Depends(get_session)):
    return session.exec(select(StatusSet)).all()


@router.post(
    "/status-sets", response_model=StatusSetRead, status_code=status.HTTP_201_CREATED
)
def create_status_set(
    payload: StatusSetCreate, session: Session = Depends(get_session)
):
    ss = StatusSet(**payload.model_dump())
    session.add(ss)
    session.commit()
    session.refresh(ss)
    return ss


@router.patch("/status-sets/{set_id}", response_model=StatusSetRead)
def update_status_set(
    set_id: int, payload: StatusSetUpdate, session: Session = Depends(get_session)
):
    ss = session.get(StatusSet, set_id)
    if not ss:
        raise HTTPException(status_code=404, detail="StatusSet not found")
    update_data = payload.model_dump(exclude_unset=True)
    # Only one set may be the default — clear the flag on the others first.
    if update_data.get("is_default"):
        for other in session.exec(
            select(StatusSet).where(StatusSet.is_default)
        ).all():
            other.is_default = False
            session.add(other)
    for key, value in update_data.items():
        setattr(ss, key, value)
    session.add(ss)
    session.commit()
    session.refresh(ss)
    return ss


@router.get("/status-sets/{set_id}/statuses", response_model=List[StatusRead])
def list_statuses(set_id: int, session: Session = Depends(get_session)):
    ss = session.get(StatusSet, set_id)
    if not ss:
        raise HTTPException(status_code=404, detail="StatusSet not found")
    return session.exec(
        select(Status).where(Status.status_set_id == set_id).order_by(Status.position)
    ).all()


@router.post(
    "/status-sets/{set_id}/statuses",
    response_model=StatusRead,
    status_code=status.HTTP_201_CREATED,
)
def create_status(
    set_id: int, payload: StatusCreate, session: Session = Depends(get_session)
):
    ss = session.get(StatusSet, set_id)
    if not ss:
        raise HTTPException(status_code=404, detail="StatusSet not found")
    s = Status(status_set_id=set_id, **payload.model_dump())
    session.add(s)
    session.commit()
    session.refresh(s)
    return s


# ── Individual Statuses ────────────────────────────────────────────────────────


@router.get("/statuses", response_model=List[StatusRead])
def list_all_statuses(session: Session = Depends(get_session)):
    """Every status across all sets — lets the frontend load the whole
    multi-state vocabulary (labels, colors, behaviors) in one request."""
    return session.exec(
        select(Status).order_by(Status.status_set_id, Status.position)
    ).all()


@router.patch("/statuses/{status_id}", response_model=StatusRead)
def update_status(
    status_id: int, payload: StatusUpdate, session: Session = Depends(get_session)
):
    s = session.get(Status, status_id)
    if not s:
        raise HTTPException(status_code=404, detail="Status not found")
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(s, key, value)
    session.add(s)
    session.commit()
    session.refresh(s)
    return s


@router.delete("/statuses/{status_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_status(status_id: int, session: Session = Depends(get_session)):
    s = session.get(Status, status_id)
    if not s:
        raise HTTPException(status_code=404, detail="Status not found")
    session.delete(s)
    session.commit()
