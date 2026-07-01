"""Server-side, user-editable settings (persisted in the Setting table).

Currently the daily-digest schedule + count. Each value falls back to its env var
(the old config) when unset, so existing deployments keep their behavior until the
owner changes something in the app. Functions take a Session so request handlers
use the request's session and the scheduler passes its own (and tests can override)."""

from __future__ import annotations

import os

from sqlmodel import Session

from app.models import Setting

# key -> env var providing the default
_DEFAULTS = {
    "digest_hour": ("DAILY_DIGEST_HOUR", "8"),
    "digest_minute": ("DAILY_DIGEST_MINUTE", "0"),
    "digest_count": ("DAILY_DIGEST_COUNT", "3"),
}


def _read(session: Session, key: str) -> int:
    env_var, default = _DEFAULTS[key]
    row = session.get(Setting, key)
    raw = row.value if row is not None else os.getenv(env_var, default)
    try:
        return int(raw)
    except (TypeError, ValueError):
        return int(default)


def get_digest_config(session: Session) -> dict:
    return {key: _read(session, key) for key in _DEFAULTS}


def set_values(session: Session, values: dict[str, int]) -> None:
    for key, val in values.items():
        if key not in _DEFAULTS:
            continue
        row = session.get(Setting, key)
        if row:
            row.value = str(val)
        else:
            row = Setting(key=key, value=str(val))
        session.add(row)
    session.commit()
