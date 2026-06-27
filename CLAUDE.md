# Command Center — Project Handoff & Architecture

> **What this file is.** This is the single source of truth for building *Command
> Center*, a self-hosted personal "command center" (checklists, notes, reminders,
> opportunity tracker). It is written as a handoff for an agentic coding tool
> (Claude Code, or Codex via `AGENTS.md`) **and** as a plain-English explanation
> for the project owner, who is learning web development as he goes. Wherever a
> decision is non-obvious, there is a short **Why** note explaining the reasoning
> so nothing is a black box.
>
> **How an agent should use it.** Read this whole file before writing code. Build
> in the phases in §11, in order. Do not build features marked *Later* until the
> MVP (§10) is working and in daily use. When a decision listed in §13 (Open
> Questions) blocks you, ask rather than guess.

---

## 1. Purpose & the problem being solved

The owner currently scatters tasks, notes, reminders, links, job applications,
courses, and project ideas across spreadsheets, notebooks, and loose files. The
fragmentation makes each system inconvenient, so he abandons them. **The product
goal is not features — it is sustained use.** One calm, good-looking place that is
low-friction enough that he actually keeps using it.

This reframes every trade-off: a feature that adds friction or clutter is a
*liability*, even if it's individually nice. When in doubt, cut or defer.

## 2. Design principles (the guardrails)

These override feature requests when they conflict.

1. **Low friction beats completeness.** The default landing screen is *Today* with
   the top priorities. Opening the app and seeing "my top 3" is the core daily
   habit. Protect that path above all.
2. **It must look genuinely nice.** An ugly tool is a dead tool. Use a component
   library (shadcn/ui) and a coherent dark theme; never hand-roll bespoke CSS when
   a polished primitive exists. Calm, uncluttered, generous whitespace.
3. **Desktop and phone are both first-class.** Same components, two responsive
   layouts (see §9). Build mobile-aware from the first commit, never retrofit.
4. **AI operates the app from the outside, via the REST API.** There is **no
   in-app AI chat** and **no paid API usage** in the core product. The owner edits
   data by talking to Claude/Codex/ChatGPT in *their own apps*, which call this
   app's API. Keep AI interactions on-demand (see §12).
5. **MVP discipline.** Ship the §10 slice first. The mockups show the full vision;
   most of it is roadmap, not first build.
6. **Single user, light security.** This runs behind Tailscale on the owner's NAS.
   Do not build multi-tenant auth, roles, or an elaborate permission system.
7. **Never hard-delete** — *with one deliberate exception: the Trash.* Use soft
   deletes (`deleted_at`) everywhere; deletion is recoverable and the SQLite file
   lives on the NAS with snapshots. The single place the app hard-deletes is an
   explicit **purge from the Trash** (all / one / selected), only on rows already
   soft-deleted, always behind a confirm. The JSON export (which includes
   soft-deleted rows) is the pre-purge safety net. See DECISIONS.md (2026-06-21).
8. **Separate presentation from semantics** (see §7). What a thing *looks like*
   (label, color) is independent of what it *means to the app* (behavior). This
   single idea makes the status system flexible without breaking the app's logic.

## 3. Tech stack (with rationale)

**Backend**
- **Python 3.12+, FastAPI** — matches the owner's language; FastAPI auto-generates
  an **OpenAPI schema**, which doubles as the instruction manual any AI agent reads
  to learn how to call the app. The same choice that's good for learning is what
  makes the AI integration clean.
- **SQLModel** (SQLAlchemy + Pydantic) for models, **SQLite** for storage,
  **Alembic** for migrations, **Uvicorn** to serve.
  - *Why SQLite:* single user, dozens–hundreds of items. SQLite is the correct tool,
    not a compromise — zero config, the whole DB is one file that NAS snapshots back
    up for free. SQLModel makes a later move to Postgres trivial if ever needed.
- **APScheduler** for the daily reminder job (§8).

**Frontend**
- **React + TypeScript + Vite**, **Tailwind CSS**, **shadcn/ui** components,
  **lucide-react** icons.
- **TanStack Query** for server state (fetching/caching/mutations), **React Router**
  for routing, light client state via React Context or Zustand.
- *Why TypeScript:* generate API types from the backend's OpenAPI schema
  (`openapi-typescript`) so the frontend and backend can't silently drift — a good
  habit and a real bug-preventer.

**Packaging & ops**
- **Docker**: the backend serves the built frontend as static files → **one image**,
  simple to run as a custom app / `docker-compose` service on TrueNAS.
- **Tailscale** (outside the app) for secure phone access away from home — no public
  internet exposure. This is an ops note, not app code.

## 4. Architecture overview

```
        ┌────────────┐         ┌────────────┐
        │  PC browser │         │ Phone (PWA) │
        └─────┬───────┘         └──────┬──────┘
              │   HTTPS over Tailscale  │
              └───────────┬─────────────┘
                          ▼
                 ┌──────────────────┐
                 │  FastAPI backend  │  ── OpenAPI schema ──▶ read by AI agents
                 │  (serves frontend │
                 │   static + REST)  │
                 └─────────┬─────────┘
                           ▼
                      ┌─────────┐
                      │ SQLite  │  (single file on NAS, snapshotted)
                      └─────────┘
```

**There is no "sync."** One database lives on the NAS. The PC and phone are both
just clients of one server. Edit on the PC → the row changes → the phone sees it on
next fetch. This deletes the entire class of file-sync/conflict problems.

## 5. Repository layout

```
command-center/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app, serves API + static frontend
│   │   ├── db.py              # engine/session
│   │   ├── models/            # SQLModel tables (§6)
│   │   ├── schemas/           # Pydantic request/response models
│   │   ├── routers/           # one router per resource (spaces, items, ...)
│   │   ├── services/          # business logic: views, scheduling, seeding
│   │   └── seed.py            # default status sets + demo data
│   ├── alembic/               # migrations
│   ├── tests/
│   ├── pyproject.toml
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/        # shadcn primitives + shared UI
│   │   ├── features/          # today/, spaces/, items/, statuses/, inbox/
│   │   ├── layouts/           # DesktopLayout, MobileLayout (§9)
│   │   ├── lib/               # api client, generated types, query hooks
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   └── package.json
├── docs/
│   ├── CLAUDE.md              # this file (primary)
│   ├── AGENTS.md              # pointer to this file for Codex
│   ├── DECISIONS.md           # running log of decisions + why
│   └── mockups/               # the approved desktop + mobile reference images
├── docker-compose.yml
└── README.md
```

## 6. Data model

The shape of the data is the most important early decision; the rest leans on it.
Definitions below are the intended shape (SQLModel-flavored), to be refined in code.

### Space — the tree node (folder / list / project)

A single self-nesting entity. Top-level spaces are the big categories (Home,
Chores, Job Applications…); children nest beneath (Workshop › Projects › Project 1).

```python
class Space:
    id: int
    name: str
    icon: str | None            # emoji or lucide icon name
    color: str | None           # hex; used in the sidebar
    parent_id: int | None       # self-reference → adjacency-list tree
    position: int               # order among siblings
    is_pinned: bool = False
    is_favorite: bool = False
    status_set_id: int | None   # which status set items here use; None → default
    notifications_muted: bool = False   # (used Later)
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
```

> **Why an adjacency list (`parent_id`):** it's the simplest correct way to store a
> tree in SQL and is plenty for this scale. The sidebar tree is built by querying
> all spaces and assembling parent→children in memory.

### Item — the flexible content unit

One table holds every content type, distinguished by `type`, with type-specific
fields in a JSON `metadata` column.

```python
class Item:
    id: int
    space_id: int
    type: str                   # "task" | "note" | "link" | "opportunity" | "event"
    title: str
    body: str | None            # markdown
    status_id: int | None       # FK → Status (for task/opportunity types)
    priority: int = 0           # higher = more important
    due_at: datetime | None
    remind_at: datetime | None
    position: int
    is_pinned: bool = False
    metadata: dict              # JSON; e.g. link → {url, preview_image};
                                # opportunity → {amount, location, source_url};
                                # event → {start, end, location}
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None
    deleted_at: datetime | None
```

> **Why one flexible table instead of twelve typed tables:** the owner wants the AI
> to reorganize fluidly and wants new item types to be cheap to add. A single
> `Item` with a `type` discriminator + JSON `metadata` trades a little schema purity
> for a lot of flexibility — the right call at this scale. Fields that *every* item
> needs (title, due date, status, position) are real columns; fields only some types
> need live in `metadata`.

### StatusSet & Status — the multi-state system

See §7 for the full explanation. The data:

```python
class StatusSet:
    id: int
    name: str                   # "Default", "Task triage", "Job application"
    is_default: bool = False

class Status:
    id: int
    status_set_id: int
    label: str                  # "Done", "Did not do", "Don't care"
    color: str                  # hex — fully custom, independent of behavior
    behavior: str               # "active" | "done" | "dismissed"  (fixed vocabulary)
    position: int               # order in the cycle / picker
```

An item's *available* statuses = the statuses in its space's `status_set`
(or the default set). `Item.status_id` points at the currently selected one.

### Inbox / quick capture (MVP-simple)

Quick capture creates a minimal `Item` (type `note` or `task`) inside a built-in
**Inbox** space. The owner dumps messy text; later he asks an AI (in its own app) to
structure and move it. No separate table needed for MVP.

## 7. The status system (foundational — read carefully)

The owner wants checkboxes that can hold **more than done/not-done**, with **custom
labels, custom colors, and a custom number of states, per context** — e.g. tasks use
Done (green) / Did not do (red) / Don't care (orange); a Job Applications space uses
Interested / Applied / Interview / Rejected / Offer.

The principle that makes this work without breaking the app's logic:

> **A state's *presentation* (label + color) is fully user-customizable. Its
> *semantics* is one of a small fixed set of behaviors the app understands.**

Every `Status` carries a `behavior` ∈ `{active, done, dismissed}`:
- `active` — item is still live; shows in active lists; counts as "to do."
- `done` — finished successfully; folds into Completed; rendered struck-through.
- `dismissed` — closed but not done (skipped / don't care / rejected / expired);
  also leaves the active list, but stays visually distinct via its own color.

The owner's example maps as: **Done** → `done`/green, **Did not do** →
`dismissed`/red, **Don't care** → `dismissed`/orange. Two are `dismissed` to the
app, but distinct colors keep them distinct *for him*.

**Why this matters:** the app's logic keys off `behavior`, never off the label or
color. So *Today's tasks* = items whose status behavior is `active`; *Completed* =
`done` or `dismissed`. Rename a state, recolor it, or add a fifth one — nothing
breaks, because the thing the code reads never changed. (The opportunity statuses
the owner wanted are **the same mechanism** — opportunities are just items using a
richer status set. One system, used everywhere.)

**Interaction (§9 covers placement):** tapping the status marker advances to the
next status in the set (fast for the common case). Long-press (mobile) / right-click
(desktop) opens a picker showing every state as a colored dot — for jumping directly.

**Scope:** build the schema for N custom states **now** (cheap to design in,
painful to retrofit), but ship the MVP with built-in seeded sets (Default 2-state;
Task triage 3-state; Opportunity). The visual *editor* for creating new sets is
**Later**.

## 8. Reminders & notifications

- **Web Push** (service worker + Web Push API / VAPID) delivers notifications to PC
  and phone browsers without a native app. This rides on the PWA (§9).
- A backend **APScheduler** job runs daily, computes the owner's **top 3** (highest
  priority / nearest `due_at` among `active` items), and sends a push. Count is
  configurable in settings. Deadline reminders fire from items' `remind_at`.
- **iOS caveat:** iOS delivers web push only to a PWA that has been *added to the
  home screen* (iOS 16.4+). Document this in the README; it affects phone setup.

## 9. User interface — two layouts, one component set

The two approved reference mockups live in `docs/mockups/` (desktop three-pane and
mobile two-frame). **Treat them as visual direction — colors, density, composition —
not a pixel spec.** Theme: dark, deep-charcoal background (not pure black), soft
rounded corners, subtle shadows, one calm accent (muted indigo/teal), crisp
sans-serif. No "AI Assistant" button anywhere (removed by decision).

**The center is context-driven** (important navigation rule): selecting *Today* /
*This Week* shows a cross-space feed of what matters now; selecting a space shows
*that space's* mixed contents. Same components, different query. Keep the Today feed
lean — priority cards + today's tasks + upcoming deadlines, not an everything-stack.

### Desktop layout (three panes)
- **Left sidebar:** Quick Add button; Pinned section; the nested Spaces tree with
  per-row icon, color, and item-count badge; Settings at the bottom.
- **Center:** context-driven (above). Top-3 priority cards, grouped item lists with
  multi-state markers, a `Completed (n) ▾` collapsed section.
- **Right rail:** upcoming-deadlines list with countdown badges ("5d", "12d").
  (Full month-calendar widget is *Later*; the list delivers most of its value now.)

### Mobile layout (single column)
- **Top bar:** hamburger (opens the Spaces drawer), "Today" + date, search +
  notifications + avatar.
- **Body:** swipeable priority-card carousel; "Today's tasks" (lean) with multi-state
  markers; `Completed (n)` collapsed; compact "Upcoming deadlines."
- **Bottom nav:** Today · Spaces · large center **+** (quick capture) · Deadlines ·
  Profile. The center **+** is the away-from-PC capture path — two taps from anywhere.
- **Drawer:** the full Spaces tree + Pinned + Quick Add + Settings, slid in from left.

### Responsive strategy
Build `DesktopLayout` and `MobileLayout` that compose the **same** feature
components (Today feed, item rows, deadline list, status marker). Switch on a
breakpoint. Set up the app as a **PWA** (manifest + service worker) so the phone can
"add to home screen" and receive web push.

## 10. MVP scope (build this first)

In:
- Spaces tree (create/rename/nest/reorder/pin) in sidebar + drawer.
- Items of type task/note/link/opportunity (CRUD), with title, body, due date,
  priority, position.
- The **status system** with seeded built-in sets and the multi-state marker
  interaction. Today/Completed logic derived from `behavior`.
- Context-driven center: Today feed (top-3 + today's tasks) and per-space view.
- Upcoming-deadlines list with countdowns.
- Quick capture into the Inbox space (desktop button + mobile center **+**).
- Responsive desktop + mobile layouts; PWA shell.
- Light single-user auth; Docker image; runs on the NAS.

Out / **Later** (roadmap, do not build yet):
- Status-set *editor* UI (creating custom sets) — schema supports it; editor later.
- Full month-calendar widget; board/grid views; rich link previews with fetched
  thumbnails; per-folder notification muting; audit log; desktop overlay widget;
  autonomous AI automations (§12).

## 11. Suggested build order (phases)

0. **Scaffold:** repo layout, backend + frontend skeletons, Docker, one end-to-end
   "hello" route rendering through the served frontend.
1. **Data + API:** models, Alembic migration, `seed.py` (default status sets, an
   Inbox space, a little demo data), and tested CRUD routers for spaces + items +
   status sets. Soft-delete throughout. Verify the OpenAPI docs render.
2. **Frontend shell:** theming (dark tokens from the mockups), shadcn setup, routing,
   `DesktopLayout` + `MobileLayout`, sidebar/drawer tree from the API.
3. **Today + items:** context-driven center, item rows, the **multi-state status
   marker** (cycle + picker), `Completed` collapse.
4. **Capture + deadlines:** quick capture → Inbox; upcoming-deadlines list/view.
5. **PWA + reminders:** manifest, service worker, web push, the daily top-3
   APScheduler job (configurable count).
6. **Later:** items from the *Out* list, picked by real usage pain — not all at once.

## 12. AI integration (how AI uses the app — no paid API in the core)

- The app exposes a clean, authenticated **REST API**; FastAPI's auto-generated
  **OpenAPI schema** is the contract an AI reads to know how to call it.
- **Interactive (the common case, free under subscription):** the owner works in
  Claude Code / Codex / ChatGPT and those tools call the API as him — create lists,
  add tasks, change statuses, file opportunities. This runs within his existing
  subscriptions, **not** metered per-token API billing. Keep it on-demand.
- **Autonomous (Later, deliberately deferred):** a scheduled agent (e.g. Codex
  Automations running locally on the PC/NAS, which has LAN/Tailscale access to the
  API; or a plain NAS cron job) can do daily lookups and write findings in. Scope any
  such agent to *only* this API, never full machine access.
- **Design rule:** the *scheduler is swappable; the API is the stable contract.*
  Build the API well and any of these layers plugs in later without rework.

## 13. Open questions (resolve before the affected phase)

1. **Auth mechanism:** simplest acceptable option behind Tailscale — a single
   long-lived token, a password login, or trusting Tailscale identity? (Blocks
   Phase 1 finalization. Recommend a minimal token/password; do not overbuild.)
2. **Mobile offline:** MVP assumes connectivity (via Tailscale). Confirm that's
   acceptable, or whether the PWA should queue captures offline (adds complexity).
3. **Notification reach:** confirm the phone OS for the iOS web-push caveat (§8).
4. **One container vs two:** backend-serves-static (recommended, simpler) vs
   separate frontend container.

## 14. Conventions

- **Python:** full type hints, `ruff` + `black`, `pytest`. Business logic in
  `services/`, thin routers.
- **TypeScript:** `strict` mode, `eslint` + `prettier`. Generate API types from
  OpenAPI (`openapi-typescript`); never hand-write request/response types.
- **Time:** store UTC in the DB; render in local time.
- **Deletes:** soft only (`deleted_at`); never destructive.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:` …).
- **Decisions:** when a non-trivial choice is made, append it to `docs/DECISIONS.md`
  with a one-line *why*, so the reasoning stays recoverable (and teachable).
- Keep `README.md` with exact run/build/deploy commands as they're established.
