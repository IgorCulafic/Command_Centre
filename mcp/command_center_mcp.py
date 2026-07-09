#!/usr/bin/env python3
"""MCP server for Command Center.

Exposes the Command Center REST API as MCP tools so an AI client (Claude
Desktop, Claude Code, etc.) can read and edit your lists in natural language —
"add the Riverside night market to my Local Events", "what's due this week",
"mark the dentist task done".

It is a thin client over the REST API (the API is the stable contract, per
CLAUDE.md S12). It holds no data of its own and does no scraping — the AI client
does any finding/scraping in its own environment and posts results here.

Config via environment variables:
  COMMAND_CENTER_URL    Base URL of the backend (default: the Tailscale HTTPS URL).
  COMMAND_CENTER_TOKEN  Bearer token, only if the backend has AUTH_TOKEN set.

Run (stdio transport): python command_center_mcp.py
"""

from __future__ import annotations

import json
import os
import re
from enum import Enum
from typing import Annotated, Any, Optional
from urllib.parse import urljoin

import httpx
from mcp.server.fastmcp import FastMCP
from pydantic import Field

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_URL = os.environ.get(
    "COMMAND_CENTER_URL", "https://igorc-1.tailac7b3.ts.net"
).rstrip("/")
API = f"{BASE_URL}/api"
TOKEN = os.environ.get("COMMAND_CENTER_TOKEN", "").strip()
TIMEOUT = 30.0

mcp = FastMCP("command_center_mcp")


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _headers() -> dict[str, str]:
    """Auth header, only when a token is configured (backend may run open)."""
    return {"Authorization": f"Bearer {TOKEN}"} if TOKEN else {}


async def _request(method: str, endpoint: str, **kwargs: Any) -> Any:
    """Single place all HTTP goes through, with auth + raise-for-status."""
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.request(
            method, f"{API}/{endpoint.lstrip('/')}", headers=_headers(), **kwargs
        )
        resp.raise_for_status()
        if resp.status_code == 204 or not resp.content:
            return None
        return resp.json()


def _error(e: Exception) -> str:
    """Turn an exception into an actionable message for the agent."""
    if isinstance(e, httpx.HTTPStatusError):
        code = e.response.status_code
        if code == 401:
            return (
                "Error: Unauthorized. The backend requires a token — set "
                "COMMAND_CENTER_TOKEN in the MCP server's environment."
            )
        if code == 404:
            return "Error: Not found. Check the id is correct (use cc_list_items / cc_list_spaces)."
        if code == 422:
            return f"Error: Invalid request data: {e.response.text[:300]}"
        return f"Error: API returned HTTP {code}: {e.response.text[:200]}"
    if isinstance(e, httpx.ConnectError):
        return (
            f"Error: Cannot reach the backend at {BASE_URL}. Is it running and "
            "are you on the Tailscale network? Override with COMMAND_CENTER_URL."
        )
    if isinstance(e, httpx.TimeoutException):
        return "Error: Request timed out. Try again."
    return f"Error: {type(e).__name__}: {e}"


async def _resolve_space_id(space: str) -> int:
    """Accept a space id ('3') or a name ('Personal', case-insensitive)."""
    space = space.strip()
    spaces = await _request("GET", "spaces")
    if space.isdigit():
        sid = int(space)
        if any(s["id"] == sid for s in spaces):
            return sid
        raise ValueError(f"No space with id {sid}.")
    matches = [s for s in spaces if s["name"].lower() == space.lower()]
    if not matches:
        names = ", ".join(s["name"] for s in spaces)
        raise ValueError(f"No space named '{space}'. Available: {names}.")
    return matches[0]["id"]


_OG_PATTERNS = (
    r'<meta[^>]+property=["\']og:image(?::url)?["\'][^>]+content=["\']([^"\']+)["\']',
    r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image(?::url)?["\']',
    r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']',
)


async def _fetch_og_image(url: str) -> Optional[str]:
    """Best-effort: pull a page's og:image / twitter:image to use as the thumbnail.

    Returns an absolute image URL, or None on any failure (never raises — a missing
    poster must not block creating the item).
    """
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.get(
                url, headers={"User-Agent": "Mozilla/5.0 (CommandCenterBot)"}
            )
            resp.raise_for_status()
            html = resp.text
        for pat in _OG_PATTERNS:
            m = re.search(pat, html, re.IGNORECASE)
            if m:
                img = m.group(1).strip()
                if img.startswith("//"):
                    return "https:" + img
                if img.startswith("/"):
                    return urljoin(url, img)
                return img
    except Exception:  # noqa: BLE001 — best-effort, any failure → no image
        return None
    return None


def _slim_item(it: dict) -> dict:
    """Compact item view for responses (keeps the agent's context small)."""
    meta = it.get("metadata") or {}
    return {
        "id": it["id"],
        "title": it["title"],
        "type": it["type"],
        "space_id": it["space_id"],
        "status_id": it.get("status_id"),
        "priority": it.get("priority", 0),
        "due_at": it.get("due_at"),
        "completed_at": it.get("completed_at"),
        "url": meta.get("url"),
        "image": meta.get("preview_image"),
    }


class ItemType(str, Enum):
    task = "task"
    note = "note"
    link = "link"
    opportunity = "opportunity"
    event = "event"


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@mcp.tool(
    name="cc_list_spaces",
    annotations={
        "title": "List Command Center spaces (lists)",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def cc_list_spaces() -> str:
    """List all spaces (your lists/folders), so you know where to file things.

    Returns a JSON array of spaces, each: {id, name, icon, parent_id, description}.
    Top-level lists have parent_id null; others nest under a parent. Call this
    before creating items if you're unsure which space to target.
    """
    try:
        spaces = await _request("GET", "spaces")
        slim = [
            {
                "id": s["id"],
                "name": s["name"],
                "icon": s.get("icon"),
                "parent_id": s.get("parent_id"),
                "description": s.get("description"),
            }
            for s in spaces
        ]
        return json.dumps(slim, indent=2)
    except Exception as e:  # noqa: BLE001
        return _error(e)


@mcp.tool(
    name="cc_list_items",
    annotations={
        "title": "List items in Command Center",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def cc_list_items(
    space: Annotated[
        Optional[str],
        Field(description="Filter to one list, by name ('Personal') or id ('3'). Omit for all."),
    ] = None,
    type: Annotated[
        Optional[ItemType], Field(description="Filter by item type.")
    ] = None,
    limit: Annotated[int, Field(description="Max items to return.", ge=1, le=200)] = 50,
) -> str:
    """List items, optionally filtered to one list and/or type.

    Returns JSON: {"count": int, "items": [{id, title, type, space_id, status_id,
    priority, due_at, completed_at, url, image}, ...]}. Use the ids with
    cc_update_item / cc_delete_item.
    """
    try:
        query: dict[str, Any] = {}
        if space:
            query["space_id"] = await _resolve_space_id(space)
        if type:
            query["type"] = type.value
        items = await _request("GET", "items", params=query)
        items = [_slim_item(it) for it in items][:limit]
        return json.dumps({"count": len(items), "items": items}, indent=2)
    except Exception as e:  # noqa: BLE001
        return _error(e)


@mcp.tool(
    name="cc_create_item",
    annotations={
        "title": "Create an item (post) in Command Center",
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": False,
        "openWorldHint": False,
    },
)
async def cc_create_item(
    space: Annotated[
        str, Field(description="Destination list, by name ('Local Events') or id.")
    ],
    title: Annotated[
        str, Field(description="Short title / headline.", min_length=1, max_length=500)
    ],
    type: Annotated[
        ItemType,
        Field(description="task | note | link | opportunity | event. Use 'event' for things to attend."),
    ] = ItemType.task,
    body: Annotated[
        Optional[str], Field(description="Longer description / notes (markdown allowed).")
    ] = None,
    url: Annotated[
        Optional[str], Field(description="Source/details link (e.g. the event page).")
    ] = None,
    image_url: Annotated[
        Optional[str],
        Field(description="Card thumbnail image. If omitted and a url is given, the page's og:image (poster/preview) is fetched automatically."),
    ] = None,
    due_at: Annotated[
        Optional[str],
        Field(description="When it happens/is due, ISO 8601 (e.g. '2026-06-20T19:00:00'). For events, the start time."),
    ] = None,
    location: Annotated[
        Optional[str], Field(description="Place/venue (stored in metadata, handy for events).")
    ] = None,
    priority: Annotated[
        int, Field(description="0 = normal, higher = more important.", ge=0, le=5)
    ] = 0,
) -> str:
    """Create a new item ("post") in a list — a task, note, link, opportunity, or event.

    This is the main tool for filing things you've found. For an event you've
    discovered, pass type='event', the event page as url, the poster/photo as
    image_url, the start time as due_at, and the venue as location. The image
    shows as the card's thumbnail; the link is clickable in the UI.

    Returns JSON of the created item (includes its new "id"), or "Error: ...".
    Note: task/opportunity items are auto-assigned the list's first active status
    so they show up immediately.
    """
    try:
        space_id = await _resolve_space_id(space)
        # Auto-poster: if a link is given but no image, use the page's og:image.
        if url and not image_url:
            image_url = await _fetch_og_image(url)
        metadata: dict[str, Any] = {}
        if url:
            metadata["url"] = url
        if image_url:
            metadata["preview_image"] = image_url
        if location:
            metadata["location"] = location

        payload: dict[str, Any] = {
            "space_id": space_id,
            "type": type.value,
            "title": title,
            "priority": priority,
            "position": 0,
            "is_pinned": False,
            "metadata": metadata,
        }
        if body:
            payload["body"] = body
        if due_at:
            payload["due_at"] = due_at

        created = await _request("POST", "items", json=payload)
        return json.dumps(_slim_item(created), indent=2)
    except Exception as e:  # noqa: BLE001
        return _error(e)


@mcp.tool(
    name="cc_update_item",
    annotations={
        "title": "Update an item in Command Center",
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def cc_update_item(
    item_id: Annotated[int, Field(description="Id of the item to change (from cc_list_items).")],
    title: Annotated[Optional[str], Field(description="New title.", max_length=500)] = None,
    body: Annotated[Optional[str], Field(description="New body/notes.")] = None,
    url: Annotated[Optional[str], Field(description="Set/replace the source link.")] = None,
    image_url: Annotated[Optional[str], Field(description="Set/replace the thumbnail image.")] = None,
    due_at: Annotated[Optional[str], Field(description="New due/start time, ISO 8601.")] = None,
    priority: Annotated[Optional[int], Field(description="New priority 0-5.", ge=0, le=5)] = None,
    status_id: Annotated[
        Optional[int], Field(description="New status id (see cc_list_statuses).")
    ] = None,
    move_to_space: Annotated[
        Optional[str], Field(description="Move to another list, by name or id.")
    ] = None,
) -> str:
    """Edit an existing item: retitle, change notes/link/image/date/priority,
    set its status, or move it to another list.

    To mark something done, set status_id to a status whose behavior is 'done'
    (see cc_list_statuses); the backend then records completed_at automatically.
    Only the fields you pass are changed. url/image_url merge into the item's
    existing metadata (other keys preserved).

    Returns JSON of the updated item, or "Error: ...".
    """
    try:
        patch: dict[str, Any] = {}
        if title is not None:
            patch["title"] = title
        if body is not None:
            patch["body"] = body
        if due_at is not None:
            patch["due_at"] = due_at
        if priority is not None:
            patch["priority"] = priority
        if status_id is not None:
            patch["status_id"] = status_id
        if move_to_space is not None:
            patch["space_id"] = await _resolve_space_id(move_to_space)

        if url is not None or image_url is not None:
            current = await _request("GET", f"items/{item_id}")
            meta = dict(current.get("metadata") or {})
            if url is not None:
                meta["url"] = url
            if image_url is not None:
                meta["preview_image"] = image_url
            patch["metadata"] = meta

        if not patch:
            return "Error: nothing to update — provide at least one field to change."

        updated = await _request("PATCH", f"items/{item_id}", json=patch)
        return json.dumps(_slim_item(updated), indent=2)
    except Exception as e:  # noqa: BLE001
        return _error(e)


@mcp.tool(
    name="cc_delete_item",
    annotations={
        "title": "Delete an item (soft delete)",
        "readOnlyHint": False,
        "destructiveHint": True,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def cc_delete_item(
    item_id: Annotated[int, Field(description="Id of the item to delete.")],
) -> str:
    """Soft-delete an item (sets deleted_at; recoverable, never destroyed).

    Returns a confirmation string, or "Error: ...".
    """
    try:
        await _request("DELETE", f"items/{item_id}")
        return f"Deleted item {item_id} (soft delete — recoverable)."
    except Exception as e:  # noqa: BLE001
        return _error(e)


@mcp.tool(
    name="cc_create_space",
    annotations={
        "title": "Create a space (list)",
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": False,
        "openWorldHint": False,
    },
)
async def cc_create_space(
    name: Annotated[str, Field(description="List name.", min_length=1, max_length=200)],
    parent: Annotated[
        Optional[str],
        Field(description="Nest under this list (name or id). Omit for a top-level list."),
    ] = None,
    icon: Annotated[Optional[str], Field(description="An emoji, e.g. '🎟️'.")] = None,
    description: Annotated[
        Optional[str], Field(description="Optional blurb shown at the top of the list.")
    ] = None,
) -> str:
    """Create a new list (space), optionally nested under another.

    Use this when a fitting list doesn't exist yet — e.g. create "Local Events"
    before filing events into it.

    Returns JSON of the created space (with its "id"), or "Error: ...".
    """
    try:
        payload: dict[str, Any] = {
            "name": name,
            "position": 0,
            "is_pinned": False,
            "is_favorite": False,
            "notifications_muted": False,
        }
        if icon:
            payload["icon"] = icon
        if description:
            payload["description"] = description
        if parent:
            payload["parent_id"] = await _resolve_space_id(parent)
        created = await _request("POST", "spaces", json=payload)
        return json.dumps(
            {"id": created["id"], "name": created["name"], "parent_id": created.get("parent_id")},
            indent=2,
        )
    except Exception as e:  # noqa: BLE001
        return _error(e)


@mcp.tool(
    name="cc_list_statuses",
    annotations={
        "title": "List status sets and statuses",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
)
async def cc_list_statuses() -> str:
    """List every status, with id/label/color/behavior and its status set.

    behavior is one of active | done | dismissed — the app keys logic off it.
    Use the returned status ids with cc_update_item to move an item between
    states (e.g. a 'done' status to complete a task, or 'Interview' for a job
    application).

    Returns a JSON array: [{id, label, color, behavior, status_set_id}, ...].
    """
    try:
        statuses = await _request("GET", "statuses")
        slim = [
            {
                "id": s["id"],
                "label": s["label"],
                "color": s.get("color"),
                "behavior": s.get("behavior"),
                "status_set_id": s.get("status_set_id"),
            }
            for s in statuses
        ]
        return json.dumps(slim, indent=2)
    except Exception as e:  # noqa: BLE001
        return _error(e)


if __name__ == "__main__":
    mcp.run()
