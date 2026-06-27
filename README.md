# Command Center

A self-hosted personal command center — tasks, notes, reminders, deadlines, and
opportunity tracking. One calm, low-friction place. Runs on a NAS, accessed from
PC and phone via Tailscale.

## Stack

- **Backend:** Python 3.12, FastAPI, SQLModel, SQLite, Alembic, APScheduler
- **Frontend:** React + TypeScript + Vite + Tailwind + shadcn/ui *(Phase 2+)*
- **Hosting:** Docker on TrueNAS, accessed over Tailscale

---

## Quick start (local dev, no Docker)

### Prerequisites

- Python 3.12+

### Install & run

```bash
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload
```

The API is now at http://localhost:8000  
Interactive docs: http://localhost:8000/docs  
OpenAPI schema: http://localhost:8000/openapi.json

The database is created as `./command_center.db` on first run. Seed data (default
status sets, Inbox/Personal/Work spaces, demo items) is inserted automatically.

### Run tests

```bash
cd backend
pytest tests/ -v
```

### Frontend (dev)

The frontend is a Vite + React + TypeScript app. It needs **Node.js 20+** and
talks to the backend through a dev proxy, so **run the backend first** (above),
then:

```bash
cd frontend
npm install          # first time only
npm run dev          # http://localhost:5173
```

Vite proxies `/api` → `http://127.0.0.1:8000`, so the same relative API paths
work in dev and in the built app. To regenerate the TypeScript API types after
changing the backend (backend must be running):

```bash
npm run gen:api      # writes src/lib/api-types.ts from /openapi.json
```

Build the production bundle (type-checks, then bundles to `frontend/dist`):

```bash
npm run build
```

---

## Docker (single image: API **and** frontend)

The root `Dockerfile` is multi-stage: it builds the Vite frontend, then bakes the
output into the Python image at `app/static`. The backend serves both the `/api`
and the app itself, so everything runs on **one origin / one port** — no CORS, no
separate frontend server. This is exactly what makes phone access over Tailscale
simple (one URL).

```bash
docker compose up --build      # → http://localhost:8000  (app + API + /docs)
```

Data is persisted in `./data/command_center.db` on the host.

> Locally without Docker you still run the two dev servers (backend on 8000, Vite
> on 5173) — the single-origin serving only kicks in when `app/static` exists,
> which is the Docker build. To preview the production single-origin locally:
> `cd frontend && npm run build`, copy `frontend/dist` → `backend/app/static`,
> then run the backend; it'll serve the app at http://localhost:8000.

---

## Phone access over Tailscale

No public internet exposure — the app is reached privately through [Tailscale](https://tailscale.com).

1. **Install Tailscale** on the NAS/PC running the container and on your phone;
   sign both into the same tailnet.
2. Find the host's Tailscale name/IP (e.g. `nas` / `100.x.y.z`) — `tailscale ip -4`.
3. On the phone, open **`http://<tailscale-ip>:8000`** (or `http://nas:8000` with
   MagicDNS). That's the whole app — same URL the PC uses.
4. **Install to home screen** (makes it feel native + enables web push later):
   - **iOS (Safari):** Share → *Add to Home Screen*. Web push on iOS requires this
     installed PWA (iOS 16.4+).
   - **Android (Chrome):** menu → *Install app* / *Add to Home screen*.

The app ships a web manifest + a branded icon, so it installs as **“Command”**.

### Notifications (web push) need HTTPS

Web push only works in a **secure context** (HTTPS or `localhost`) — plain
`http://<tailscale-ip>:8000` won't do. Tailscale issues a free HTTPS cert for your
tailnet name:

```bash
# on the host, proxy HTTPS :443 → the app on :8000
tailscale serve --bg 8000
# now open https://<host>.<tailnet>.ts.net  on the phone, Add to Home Screen,
# then Settings → Reminders → Enable.
```

The backend generates a VAPID keypair on first run (persisted at `VAPID_KEY_PATH`,
on the data volume in Docker) and runs a daily **top-N digest** push
(`DAILY_DIGEST_HOUR` / `DAILY_DIGEST_COUNT`). *Settings → Reminders → Send test*
fires one immediately.

---

## Auth

One shared token, off by default (fine behind Tailscale), on when you set it:

```bash
# generate
python -c "import secrets; print(secrets.token_urlsafe(32))"
# then run the container with AUTH_TOKEN=<that>  (see docker-compose.yml)
```

When set, every `/api/*` data call needs `Authorization: Bearer <token>` — the web
app shows a one-time unlock screen (token stored in the browser), and it's the same
token you give Claude/Codex so their tools can call the API. `/api/health` and
`/api/auth/status` stay public.

---

## API overview

All endpoints are under `/api`. Interactive docs at `/docs`.

| Resource | Endpoints |
|---|---|
| Spaces | `GET/POST /api/spaces`, `GET/PATCH/DELETE /api/spaces/{id}` |
| Items | `GET/POST /api/items`, `GET/PATCH/DELETE /api/items/{id}` |
| Status Sets | `GET/POST /api/status-sets`, `PATCH /api/status-sets/{id}`, `GET/POST /api/status-sets/{id}/statuses` |
| Statuses | `GET /api/statuses`, `PATCH/DELETE /api/statuses/{id}` |
| Push | `GET /api/push/vapid-public-key`, `POST /api/push/subscribe`, `POST /api/push/unsubscribe`, `POST /api/push/test` |
| Auth / Health | `GET /api/health`, `GET /api/auth/status`, `GET /api/auth/check` |

### Item list filters

```
GET /api/items?space_id=1          # items in a specific space
GET /api/items?type=task           # filter by type
GET /api/items?behavior=active     # filter by status behavior (active/done/dismissed)
```

All deletes are **soft** (`deleted_at` is set; the row stays in the DB).

---

## NAS / Tailscale deployment

1. Build the Docker image and push to your NAS registry, or copy the files and
   build on the NAS.
2. Create a `docker-compose.yml` pointing the data volume at a ZFS dataset that
   is included in your snapshot schedule.
3. Add the NAS as a Tailscale node. Access the app at `http://<nas-tailscale-ip>:8000`.
4. **iOS web push:** to receive push notifications on iPhone, open the app in
   Safari and tap *Share → Add to Home Screen*. Web push on iOS requires the PWA
   to be installed to the home screen (iOS 16.4+). *(Push is a Phase 5 feature.)*

---

## Phases

| Phase | Status | Scope |
|---|---|---|
| 0 — Scaffold | ✅ Done | Repo layout, Docker, one end-to-end route |
| 1 — Data + API | ✅ Done | Models, seed, full CRUD routers |
| 2 — Frontend shell | ✅ Done | Dark theme, shadcn, routing, responsive layouts, spaces tree |
| 3 — Today + items | ✅ Done | Multi-state status marker (cycle + colour picker), Completed collapse |
| 4 — Capture + deadlines | ✅ Done | Quick capture, item create / edit / delete, deadlines rail |
| 5 — PWA + reminders | ✅ Done | Single-origin serving, installable PWA, service worker, web push (VAPID), APScheduler daily digest, token auth |
| 6 — Extras | 🚧 Ongoing | ✅ file attachments + space library, space descriptions, emoji picker, month calendar · ⬜ board view, rich link-preview fetching, native "open in Explorer" helper |

**Status-set editor** (was "Later") — ✅ shipped early at the owner's request.
At `/settings`: create sets, add/rename/recolour/reorder states, set each state's
behaviour, and assign a set to any space.
