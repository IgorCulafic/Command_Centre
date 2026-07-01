"""Web Push (VAPID) — key management and sending.

A VAPID keypair is generated once and persisted to ``VAPID_KEY_PATH`` (a PEM file;
in Docker put it on the /data volume so it survives restarts). The public key is
handed to the browser as the ``applicationServerKey``; the private key signs each
push. Requires a secure context (HTTPS or localhost) on the client — see the README
note about Tailscale HTTPS.
"""

from __future__ import annotations

import base64
import json
import os
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid
from pywebpush import WebPushException, webpush

VAPID_KEY_PATH = Path(os.getenv("VAPID_KEY_PATH", "vapid_private.pem"))
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:admin@command-center.local")

_vapid: Vapid | None = None
_public_key_b64: str | None = None


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _load() -> Vapid:
    """Load the VAPID key, generating + persisting it on first use."""
    global _vapid, _public_key_b64
    if _vapid is not None:
        return _vapid

    if VAPID_KEY_PATH.exists():
        vapid = Vapid.from_file(str(VAPID_KEY_PATH))
    else:
        vapid = Vapid()
        vapid.generate_keys()
        VAPID_KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
        vapid.save_key(str(VAPID_KEY_PATH))

    raw = vapid.public_key.public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    _vapid = vapid
    _public_key_b64 = _b64url(raw)
    return vapid


def get_public_key() -> str:
    """The base64url applicationServerKey for the browser to subscribe with."""
    _load()
    assert _public_key_b64 is not None
    return _public_key_b64


def send_push(subscription_info: dict, payload: dict) -> int | None:
    """Send one push. Returns None on success, or the HTTP status code on failure
    (404/410 mean the subscription is dead and should be deleted)."""
    _load()
    try:
        webpush(
            subscription_info=subscription_info,
            data=json.dumps(payload),
            vapid_private_key=str(VAPID_KEY_PATH),
            vapid_claims={"sub": VAPID_SUBJECT},
            timeout=10,
        )
        return None
    except WebPushException as exc:
        return getattr(exc.response, "status_code", 0) if exc.response else 0
