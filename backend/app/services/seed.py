"""Seed the database with default status sets, spaces, and demo items."""

from datetime import timedelta

from sqlmodel import Session, select

from app.db import utcnow
from app.models import Item, Space, Status, StatusSet


def run_seed(session: Session) -> None:
    """Run seed only if the DB is empty (no status sets exist)."""
    existing = session.exec(select(StatusSet)).first()
    if existing:
        return

    # ── Status Sets ────────────────────────────────────────────────────────────

    default_set = StatusSet(name="Default", is_default=True)
    triage_set = StatusSet(name="Task Triage", is_default=False)
    opportunity_set = StatusSet(name="Opportunity", is_default=False)

    session.add_all([default_set, triage_set, opportunity_set])
    session.flush()  # get IDs

    statuses = [
        # Default
        Status(
            status_set_id=default_set.id,
            label="To Do",
            color="#6366f1",
            behavior="active",
            position=0,
        ),
        Status(
            status_set_id=default_set.id,
            label="Done",
            color="#22c55e",
            behavior="done",
            position=1,
        ),
        # Task Triage
        Status(
            status_set_id=triage_set.id,
            label="Active",
            color="#6366f1",
            behavior="active",
            position=0,
        ),
        Status(
            status_set_id=triage_set.id,
            label="Done",
            color="#22c55e",
            behavior="done",
            position=1,
        ),
        Status(
            status_set_id=triage_set.id,
            label="Did Not Do",
            color="#ef4444",
            behavior="dismissed",
            position=2,
        ),
        Status(
            status_set_id=triage_set.id,
            label="Don't Care",
            color="#f97316",
            behavior="dismissed",
            position=3,
        ),
        # Opportunity
        Status(
            status_set_id=opportunity_set.id,
            label="Interested",
            color="#6366f1",
            behavior="active",
            position=0,
        ),
        Status(
            status_set_id=opportunity_set.id,
            label="Applied",
            color="#3b82f6",
            behavior="active",
            position=1,
        ),
        Status(
            status_set_id=opportunity_set.id,
            label="Interview",
            color="#8b5cf6",
            behavior="active",
            position=2,
        ),
        Status(
            status_set_id=opportunity_set.id,
            label="Offer",
            color="#22c55e",
            behavior="done",
            position=3,
        ),
        Status(
            status_set_id=opportunity_set.id,
            label="Rejected",
            color="#ef4444",
            behavior="dismissed",
            position=4,
        ),
    ]
    session.add_all(statuses)
    session.flush()

    # Look up a status id by (set, label) — used when wiring demo items below.
    status_id = {(s.status_set_id, s.label): s.id for s in statuses}

    # ── Spaces ─────────────────────────────────────────────────────────────────

    inbox = Space(
        name="Inbox",
        icon="📥",
        is_pinned=True,
        position=0,
        status_set_id=default_set.id,
    )
    personal = Space(
        name="Personal",
        icon="🏠",
        position=1,
        status_set_id=default_set.id,
    )
    work = Space(
        name="Work",
        icon="💼",
        position=2,
        status_set_id=triage_set.id,
    )
    jobs = Space(
        name="Job Applications",
        icon="🧭",
        position=3,
        status_set_id=opportunity_set.id,
    )
    session.add_all([inbox, personal, work, jobs])
    session.flush()

    now = utcnow()

    # ── Demo Items ─────────────────────────────────────────────────────────────
    # Spread across status sets so the multi-state marker, colours, and the
    # Completed section are all visible out of the box.

    demo_items = [
        # Inbox — Default set (To Do / Done)
        Item(
            space_id=inbox.id,
            type="task",
            title="Set up Command Center on the NAS",
            body=(
                "Follow the README — build the Docker image, mount the data "
                "volume, configure Tailscale."
            ),
            status_id=status_id[(default_set.id, "To Do")],
            priority=10,
            position=0,
        ),
        Item(
            space_id=inbox.id,
            type="task",
            title="Add phone to home screen (PWA)",
            body=(
                "Visit the app in Safari / Chrome and use 'Add to Home Screen' "
                "to enable web push."
            ),
            status_id=status_id[(default_set.id, "To Do")],
            priority=8,
            position=1,
        ),
        Item(
            space_id=inbox.id,
            type="note",
            title="Welcome to Command Center",
            body=(
                "This is your Inbox — dump anything here and sort it later.\n\n"
                "- Use **Today** in the sidebar to see your top priorities.\n"
                "- Use the **+** button (or bottom nav on mobile) for quick capture.\n"
                "- Talk to Claude/Codex in their own apps; they can call this "
                "API to organize things for you."
            ),
            priority=0,
            position=2,
        ),
        # Work — Task Triage set (Active / Done / Did Not Do / Don't Care)
        Item(
            space_id=work.id,
            type="task",
            title="Submit Q3 report",
            body="Final numbers due to finance.",
            status_id=status_id[(triage_set.id, "Active")],
            priority=9,
            due_at=now + timedelta(days=3),
            position=0,
        ),
        Item(
            space_id=work.id,
            type="task",
            title="Reply to recruiter email",
            status_id=status_id[(triage_set.id, "Active")],
            priority=4,
            position=1,
        ),
        Item(
            space_id=work.id,
            type="task",
            title="Watch optional webinar",
            body="Decided it wasn't worth the time.",
            status_id=status_id[(triage_set.id, "Don't Care")],
            priority=0,
            position=2,
        ),
        # Job Applications — Opportunity set (Interested → Offer / Rejected)
        Item(
            space_id=jobs.id,
            type="opportunity",
            title="Senior Engineer @ Acme",
            body="Remote · referred by Sam.",
            status_id=status_id[(opportunity_set.id, "Interview")],
            priority=7,
            due_at=now + timedelta(days=5),
            metadata_={"location": "Remote", "source_url": "https://acme.example/jobs"},
            position=0,
        ),
        Item(
            space_id=jobs.id,
            type="opportunity",
            title="Platform Lead @ Globex",
            status_id=status_id[(opportunity_set.id, "Applied")],
            priority=5,
            position=1,
        ),
        Item(
            space_id=jobs.id,
            type="opportunity",
            title="Founding Engineer @ Initech",
            body="Equity-heavy; passed for now.",
            status_id=status_id[(opportunity_set.id, "Rejected")],
            priority=0,
            position=2,
        ),
    ]
    session.add_all(demo_items)
    session.commit()
