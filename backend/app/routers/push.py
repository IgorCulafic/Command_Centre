from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.models import PushSubscription
from app.services.push import get_public_key
from app.services.scheduler import send_daily_digest

router = APIRouter(prefix="/push", tags=["push"])


class Keys(BaseModel):
    p256dh: str
    auth: str


class SubscriptionIn(BaseModel):
    endpoint: str
    keys: Keys


class Unsubscribe(BaseModel):
    endpoint: str


@router.get("/vapid-public-key")
def vapid_public_key():
    """The browser needs this as its applicationServerKey to subscribe."""
    return {"key": get_public_key()}


@router.post("/subscribe", status_code=status.HTTP_201_CREATED)
def subscribe(payload: SubscriptionIn, session: Session = Depends(get_session)):
    existing = session.exec(
        select(PushSubscription).where(
            PushSubscription.endpoint == payload.endpoint
        )
    ).first()
    if existing:
        existing.p256dh = payload.keys.p256dh
        existing.auth = payload.keys.auth
        session.add(existing)
    else:
        session.add(
            PushSubscription(
                endpoint=payload.endpoint,
                p256dh=payload.keys.p256dh,
                auth=payload.keys.auth,
            )
        )
    session.commit()
    return {"ok": True}


@router.post("/unsubscribe")
def unsubscribe(payload: Unsubscribe, session: Session = Depends(get_session)):
    sub = session.exec(
        select(PushSubscription).where(
            PushSubscription.endpoint == payload.endpoint
        )
    ).first()
    if sub:
        session.delete(sub)
        session.commit()
    return {"ok": True}


@router.post("/test")
def test_push():
    """Send the daily-digest push right now (so the owner can confirm it works)."""
    return send_daily_digest()
