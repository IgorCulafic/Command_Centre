"""Minimal single-user auth (CLAUDE.md §13).

One shared token via the ``AUTH_TOKEN`` env var. When it's empty (local dev), auth
is *disabled* — every request passes. When it's set (NAS deploy), every data route
requires ``Authorization: Bearer <token>``. The same token is what the owner hands to
Claude/Codex so their tools can call the API.

This is deliberately tiny: the app lives behind Tailscale, so this is a second,
simple lock — not a full identity system.
"""

from __future__ import annotations

import os
import secrets

from fastapi import Header, HTTPException, Query, status

AUTH_TOKEN = os.getenv("AUTH_TOKEN", "").strip()


def auth_required() -> bool:
    return bool(AUTH_TOKEN)


def require_auth(authorization: str | None = Header(default=None)) -> None:
    """FastAPI dependency guarding the data routes."""
    if not AUTH_TOKEN:
        return  # auth disabled (no token configured)

    expected = f"Bearer {AUTH_TOKEN}"
    # Constant-time compare to avoid leaking the token via timing.
    if authorization is None or not secrets.compare_digest(authorization, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_auth_query(
    authorization: str | None = Header(default=None),
    token: str | None = Query(default=None),
) -> None:
    """Like require_auth, but also accepts ``?token=`` — needed for plain
    ``<img src>`` / download links that can't send an Authorization header."""
    if not AUTH_TOKEN:
        return
    if authorization is not None and secrets.compare_digest(
        authorization, f"Bearer {AUTH_TOKEN}"
    ):
        return
    if token is not None and secrets.compare_digest(token, AUTH_TOKEN):
        return
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing token",
        headers={"WWW-Authenticate": "Bearer"},
    )
