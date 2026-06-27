from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select

from app.auth import auth_required, require_auth
from app.db import create_db_and_tables, engine, get_session, run_migrations, utcnow
from app.models import Item, Space, Status, StatusSet
from app.routers import attachments, items, push, settings, spaces, statuses
from app.routers.items import _item_to_read
from app.services.scheduler import start_scheduler, stop_scheduler
from app.services.seed import run_seed

# Built frontend (Vite output) is copied here in the Docker image. When present,
# the backend serves the SPA so PC + phone hit ONE origin (no CORS, no separate
# port) — which is exactly what the Tailscale phone setup wants. In local dev the
# folder is absent and the Vite dev server (5173) serves the frontend instead.
STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    create_db_and_tables()
    run_migrations()
    with Session(engine) as session:
        run_seed(session)
    start_scheduler()  # daily top-N push digest
    yield
    # Shutdown
    stop_scheduler()


app = FastAPI(
    title="Command Center API",
    description=(
        "Personal command center — tasks, notes, reminders, opportunities. "
        "All state lives here; AI agents call this API to read and write data."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Data routes require the token when AUTH_TOKEN is configured (else open in dev).
_auth = [Depends(require_auth)]
app.include_router(spaces.router, prefix="/api", dependencies=_auth)
app.include_router(items.router, prefix="/api", dependencies=_auth)
app.include_router(statuses.router, prefix="/api", dependencies=_auth)
app.include_router(push.router, prefix="/api", dependencies=_auth)
app.include_router(settings.router, prefix="/api", dependencies=_auth)
# Attachments declare auth per-route (download/raw also accept ?token= so plain
# <img>/download links work), so no router-level guard here.
app.include_router(attachments.router, prefix="/api")


@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok"}


@app.get("/api/auth/status", tags=["meta"])
def auth_status():
    """Public — lets the frontend know whether to show a login prompt."""
    return {"auth_required": auth_required()}


@app.get("/api/auth/check", tags=["meta"], dependencies=_auth)
def auth_check():
    """Protected — the login form calls this to validate the entered token."""
    return {"ok": True}


@app.get("/api/export", tags=["meta"], dependencies=_auth)
def export_all(session: Session = Depends(get_session)):
    """Full JSON snapshot of everything (incl. soft-deleted) — a portable backup."""
    spaces = session.exec(select(Space)).all()
    sets = session.exec(select(StatusSet)).all()
    statuses = session.exec(select(Status)).all()
    items = session.exec(select(Item)).all()
    return {
        "app": "Command Center",
        "version": app.version,
        "exported_at": utcnow(),
        "spaces": [s.model_dump() for s in spaces],
        "status_sets": [s.model_dump() for s in sets],
        "statuses": [s.model_dump() for s in statuses],
        "items": [_item_to_read(i).model_dump() for i in items],
    }


# ── Serve the built frontend (production single-container) ──────────────────────
# Registered AFTER the API routers so /api/* and /docs always win. The catch-all
# returns real static files when they exist (assets, manifest, icons) and falls
# back to index.html for client-side routes (/space/1, /settings, …).
if STATIC_DIR.is_dir():
    app.mount(
        "/assets",
        StaticFiles(directory=STATIC_DIR / "assets"),
        name="assets",
    )

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        candidate = (STATIC_DIR / full_path).resolve()
        is_real = bool(
            full_path
            and STATIC_DIR.resolve() in candidate.parents
            and candidate.is_file()
        )
        path = candidate if is_real else (STATIC_DIR / "index.html")
        resp = FileResponse(path)
        # The HTML entry point + service worker must never be cached, or clients
        # (esp. the desktop WebView) keep loading an old index.html that points at
        # a stale JS bundle and never see new deploys. Hashed /assets are immutable
        # and safe to cache (the StaticFiles mount handles those).
        if path.name in ("index.html", "sw.js", "manifest.webmanifest"):
            resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        return resp
