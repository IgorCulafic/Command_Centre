"""APScheduler daily 'top-N' push digest (CLAUDE.md §8).

Once a day it computes the highest-priority active items and pushes them to every
stored subscription. Count + time are env-configurable. Dead subscriptions
(404/410) are pruned as we go.
"""

from __future__ import annotations

import os

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlmodel import Session, select

from app.db import engine, utcnow
from app.models import Item, PushSubscription, Space, Status
from app.services.push import send_push
from app.services.settings_store import get_digest_config

scheduler = BackgroundScheduler()


def send_due_reminders() -> dict:
    """Push per-item reminders whose remind_at has passed (each fires once).

    Runs on a short interval. Marks reminded_at so a reminder isn't re-sent;
    changing an item's remind_at clears that flag so it can fire again.
    """
    now = utcnow()
    with Session(engine) as session:
        due = session.exec(
            select(Item)
            .join(Space, Item.space_id == Space.id)
            .where(
                Item.deleted_at.is_(None),
                Item.completed_at.is_(None),
                Item.reminded_at.is_(None),
                Item.remind_at.is_not(None),
                Item.remind_at <= now,
                Space.notifications_muted == False,  # noqa: E712
                Space.deleted_at.is_(None),
                Space.archived_at.is_(None),
            )
        ).all()
        if not due:
            return {"due": 0, "sent": 0}

        subs = session.exec(select(PushSubscription)).all()
        sent = 0
        for item in due:
            payload = {"title": "Reminder", "body": item.title, "url": "/"}
            for sub in subs:
                info = {
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                }
                code = send_push(info, payload)
                if code is None:
                    sent += 1
                elif code in (404, 410):
                    session.delete(sub)
            item.reminded_at = now  # consume it whether or not anyone's subscribed
            session.add(item)
        session.commit()
        return {"due": len(due), "sent": sent}


def _top_active_titles(session: Session, n: int) -> list[str]:
    query = (
        select(Item)
        .join(Status, Item.status_id == Status.id)
        .join(Space, Item.space_id == Space.id)
        .where(
            Item.deleted_at.is_(None),
            Status.behavior == "active",
            Space.notifications_muted == False,  # noqa: E712
            Space.deleted_at.is_(None),
            Space.archived_at.is_(None),
        )
        .order_by(Item.priority.desc(), Item.position)
        .limit(n)
    )
    return [item.title for item in session.exec(query).all()]


def send_daily_digest() -> dict:
    """Compute the top-N active items and push them to all subscriptions.
    Returns a small summary (also used by the /api/push/test endpoint)."""
    with Session(engine) as session:
        count = get_digest_config(session)["digest_count"]
        titles = _top_active_titles(session, count)
        if titles:
            payload = {
                "title": f"Your top {len(titles)} for today",
                "body": " · ".join(titles),
                "url": "/",
            }
        else:
            payload = {
                "title": "Today",
                "body": "Nothing active — enjoy the breather 🎉",
                "url": "/",
            }

        subs = session.exec(select(PushSubscription)).all()
        sent = 0
        removed = 0
        for sub in subs:
            info = {
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
            }
            status_code = send_push(info, payload)
            if status_code is None:
                sent += 1
            elif status_code in (404, 410):
                session.delete(sub)
                removed += 1
        if removed:
            session.commit()

        return {
            "subscriptions": len(subs),
            "sent": sent,
            "removed": removed,
            "preview": payload,
        }


def start_scheduler() -> None:
    with Session(engine) as session:
        cfg = get_digest_config(session)
    scheduler.add_job(
        send_daily_digest,
        CronTrigger(hour=cfg["digest_hour"], minute=cfg["digest_minute"]),
        id="daily_digest",
        replace_existing=True,
    )
    # Per-item reminders: check frequently so remind_at fires roughly on time.
    every = int(os.getenv("REMINDER_CHECK_MINUTES", "5"))
    scheduler.add_job(
        send_due_reminders,
        IntervalTrigger(minutes=every),
        id="due_reminders",
        replace_existing=True,
    )
    if not scheduler.running:
        scheduler.start()


def reschedule_digest() -> None:
    """Re-point the daily-digest job at the currently-stored time (after a settings
    change). No-op when the scheduler isn't running (e.g. under tests)."""
    if not scheduler.running:
        return
    with Session(engine) as session:
        cfg = get_digest_config(session)
    scheduler.add_job(
        send_daily_digest,
        CronTrigger(hour=cfg["digest_hour"], minute=cfg["digest_minute"]),
        id="daily_digest",
        replace_existing=True,
    )


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
