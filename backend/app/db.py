import os
from datetime import datetime, timezone

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./command_center.db")

# SQLite needs check_same_thread=False for FastAPI
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args, echo=False)


def utcnow() -> datetime:
    """Current UTC time as a naive datetime.

    We store naive-UTC throughout (CLAUDE.md §14: "store UTC in the DB; render
    in local time"). datetime.utcnow() is deprecated in 3.12+, so we derive a
    tz-aware UTC value and drop the tzinfo to keep all stored datetimes naive —
    avoiding aware/naive comparison bugs when SQLite returns plain strings.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)


# Lightweight, idempotent column additions. `create_all` creates *new* tables but
# never ALTERs existing ones, and our DB predates Alembic. For a single-user SQLite
# app this is a safe, data-preserving way to evolve existing tables: each entry adds
# a column only if it's missing. (Adopt Alembic if the schema ever gets complex.)
_COLUMN_MIGRATIONS: dict[str, dict[str, str]] = {
    # table: { column: SQLite column definition }
    "space": {
        "description": "VARCHAR",
        "archived_at": "DATETIME",
        "is_group": "BOOLEAN NOT NULL DEFAULT 0",
    },
    "item": {"reminded_at": "DATETIME"},
}


def run_migrations() -> None:
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    with engine.begin() as conn:
        for table, columns in _COLUMN_MIGRATIONS.items():
            if table not in tables:
                continue  # fresh DB → create_all already built it with all columns
            existing = {c["name"] for c in insp.get_columns(table)}
            for column, ddl in columns.items():
                if column not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))


def get_session():
    with Session(engine) as session:
        yield session
