# Decisions Log

A running log of non-trivial decisions with the reasoning behind them,
so nothing is a black box.

---

## 2026-06-01 — Phase 0 + 1 scaffold

**Item.metadata_ Python attr / `metadata` JSON column**
SQLModel/SQLAlchemy reserves the name `metadata` as a class attribute on all mapped
classes (it's the `MetaData` object). Using `metadata_` as the Python attribute name
and mapping it to a column named `metadata` via `sa_column=Column("metadata", JSON)`
keeps the DB column name clean while avoiding the conflict. The API layer explicitly
maps `metadata_` ↔ `metadata` in schemas and router helpers.

**One flexible Item table instead of typed tables**
Tasks, notes, links, opportunities, and events share most columns (title, due date,
status, priority). Type-specific fields live in the JSON `metadata` column. This
makes new item types cheap to add and lets the AI reorganize freely without schema
changes.

**SQLite + adjacency list for Spaces tree**
Single user, dozens to hundreds of rows. SQLite is the correct tool — zero config,
one file, free NAS snapshots. Adjacency list (`parent_id`) is the simplest correct
tree representation at this scale; the full tree is assembled in memory from a flat
query.

**CORS allow-all origins for dev**
The app runs behind Tailscale (no public internet exposure). Allow-all simplifies
local dev and Docker testing. Tighten to the Tailscale hostname in production if
desired.

**Soft deletes everywhere**
`deleted_at` timestamp signals deletion; rows are never removed from the DB.
Matches the "never hard-delete" principle from the CLAUDE.md spec. Recovery is
always possible; the SQLite file is snapshotted by the NAS.

**Seed runs once on startup (empty-DB check)**
`run_seed` checks for any existing `StatusSet` rows before inserting. Safe to call
on every startup — it no-ops after the first run. No separate migration or CLI
command needed for initial data.

**Auth deferred**
Auth is listed as an open question in CLAUDE.md §13. No auth is implemented in
Phase 0/1 — the API is fully open. This is acceptable behind Tailscale for the MVP.
A simple bearer-token or HTTP Basic scheme should be added before the NAS deployment.

**`utcnow()` helper instead of `datetime.utcnow()`**
`datetime.utcnow()` is deprecated in Python 3.12+ (scheduled for removal). We use a
small `utcnow()` helper in `db.py` that does `datetime.now(timezone.utc)` and then
drops the tzinfo, so every stored timestamp is **naive UTC**. Keeping all datetimes
naive (never mixing aware + naive) avoids `TypeError: can't compare offset-naive and
offset-aware datetimes` when SQLite hands values back. Matches CLAUDE.md §14 ("store
UTC; render local").

**`.is_(None)` not `== None` in query filters**
In SQLAlchemy/SQLModel, a `.where()` clause must use `column.is_(None)` to generate
`IS NULL` SQL. Writing `column is None` would evaluate to a Python boolean *before*
the query is built (wrong), and `column == None` works but trips the linter (E711).
So soft-delete filters use `Item.deleted_at.is_(None)`. Note this only applies to
**query expressions** — checking a *loaded* object still uses normal Python
(`if item.deleted_at is not None`).

**Python 3.14 in dev / 3.12 in Docker**
Local dev machine has Python 3.14; the Dockerfile pins `python:3.12-slim`. All deps
install cleanly on both (wheels available). `requires-python = ">=3.12"` covers the
range. No code depends on 3.13/3.14-only features.

---

## 2026-06-01 — Phase 2 frontend shell

**TypeScript pinned to 5.x (not 6.x)**
`create-vite` scaffolded TypeScript 6.0, but most of the ecosystem still declares a
`peer typescript@^5.x` (openapi-typescript, eslint plugins, shadcn). To avoid a
cascade of peer-dependency conflicts we pinned `typescript@~5.8`. Stability over
newest — revisit when the toolchain catches up to TS 6.

**Tailwind v4 + shadcn set up by hand (not `shadcn init`)**
Versions are bleeding edge (Vite 8, React 19, Tailwind v4). Rather than bet on the
`shadcn init` CLI working against that combo, we wrote the pieces directly:
`@tailwindcss/vite` plugin, the `@/*` path alias (vite + both tsconfigs),
`components.json`, `lib/utils.ts` (`cn`), and the theme tokens in `index.css`.
`shadcn add <component>` still works for pulling in primitives (button, sheet, …).

**Dark-first theme via `<html class="dark">`**
The app ships dark (CLAUDE.md §9). Tokens are defined for both `:root` (light) and
`.dark` in oklch; `index.html` hard-sets `class="dark"`. A light mode is a token
flip away later. Accent is indigo (`oklch ≈ #6366f1`) to match the seeded statuses.

**API types generated from OpenAPI, never hand-written**
`npm run gen:api` runs `openapi-typescript` against the live `/openapi.json` →
`src/lib/api-types.ts`. The whole frontend type-checks against the backend contract,
so the two can't silently drift (CLAUDE.md §14). The friendly aliases (`Space`,
`Item`, …) live in `src/lib/api.ts`.

**Vite dev proxy `/api` → `127.0.0.1:8000`**
The frontend uses relative `/api` paths everywhere. In dev, Vite proxies them to the
backend; in production the backend serves the built frontend from the same origin,
so the same paths work unchanged — no CORS, no env-specific base URLs. Target is
`127.0.0.1` (not `localhost`) to dodge the Windows IPv6 `::1` resolution quirk.

**Responsive: two layouts, shared feature components**
`DesktopLayout` (three-pane) and `MobileLayout` (single column + bottom nav + drawer)
both compose the *same* feature components (Today feed, item rows, spaces tree,
deadlines). `App` switches between them at the `lg` (1024px) breakpoint via a
`useMediaQuery` hook. The deadlines rail is a separate pane on wide desktop and
inlines into the page below `xl`.

**Preview/launch on Windows uses node.exe directly**
`.claude/launch.json` points `runtimeExecutable` at the absolute `node.exe` running
`node_modules/vite/bin/vite.js`, because the preview process manager doesn't inherit
the shell PATH (Node was installed mid-session) and can't resolve `npm`/`node` by
name. Plain `npm run dev` works fine in a normal terminal.

---

## 2026-06-01 — Phase 3 multi-state status markers

**`completed_at` synced server-side from status behavior**
`PATCH /api/items/{id}` watches `status_id`: moving to a `done`/`dismissed` status
stamps `completed_at`; moving back to `active` clears it. Putting this in the backend
(not the UI) means the AI API and the frontend get identical behavior, and the
"Completed" partition has a stable timestamp to sort by. An explicit `completed_at`
in the payload still wins.

**`GET /api/statuses` — whole vocabulary in one call**
Added a flat "all statuses across all sets" endpoint so the frontend loads every
label/colour/behavior once and builds an in-memory index (`buildStatusIndex`),
rather than fetching per-set. An item's cycle is derived from its current status's
set — no extra space→set lookup needed at the marker.

**Marker interaction: click cycles, right-click / long-press picks**
The fast path (click → next status) covers the common case; the picker (a controlled
Popover anchored on the marker, opened via `contextmenu` or a 450ms long-press)
covers jumping directly to any state. Long-press sets a `suppressClick` ref so the
trailing click doesn't also cycle. Colour + shape come from the status: `active` =
hollow ring, `done`/`dismissed` = filled with a check / ✕.

**Status mutations invalidate all `["items"]` queries**
A status change can move an item between lists (off Today, into a space's Completed
section), so the mutation invalidates every items query rather than patching one
cache entry. Cheap over the LAN; revisit with optimistic updates if it ever feels
laggy.

**Seed spread across all three status sets**
Demo data now lands in spaces using each set — Inbox (Default 2-state), Work (Triage
4-state, incl. a "Don't Care" dismissed item), and a new **Job Applications** space
(Opportunity 5-state, matching CLAUDE.md's own example). Two items carry due dates so
the deadlines rail is populated out of the box. This makes the whole status system
visible on first run instead of looking like a plain checkbox.

**Custom status-set *editor* pulled forward (was CLAUDE.md §7 "Later")**
The owner's signature ask, so it shipped early. UI at `/settings` (the sidebar
Settings link). Backend gained `PATCH /api/status-sets/{id}`; everything else reused
existing CRUD.

- *Single default:* marking a set default clears the flag on all others
  (server-side, in `update_status_set`) so exactly one default always holds.
- *Commit on blur:* labels and colours edit in local component state and PATCH on
  blur (smooth typing / colour-dragging); behaviour (a Select) commits immediately.
  Reorder swaps two neighbours' `position` values; add/delete are immediate.
- *Invalidation reach:* status mutations invalidate the `["statuses"]` prefix, which
  (TanStack prefix-matching) also refreshes `["statuses","all"]` — so recolouring or
  renaming a state instantly updates every item marker that uses it.
- *Known soft-inconsistency:* reassigning a space to a different set leaves existing
  items pointing at their old status_id. The marker derives its cycle from the item's
  current status, so those items keep working (old set's options) until changed; no
  migration is done. Acceptable for a single user — revisit if it bites.

---

## 2026-06-01 — Phase 4 quick capture + item CRUD

**Server auto-assigns a status on create (task / opportunity)**
`POST /api/items` with no `status_id`, for a task or opportunity, gets the first
active status of its space's set (falling back to the default set). So a captured
task is immediately "live" — shows in Today (the `behavior=active` filter needs a
status) and gets an interactive marker. Notes/links/events stay status-less. Done in
the backend so the AI API benefits too, not just the UI.

**One DialogsProvider owns the item dialogs**
Quick-capture and edit dialogs are triggered from many places (sidebar Quick Add,
mobile + FAB, space "Add item", clicking any row). Rather than thread state through
all of them, a `DialogsProvider` at the app root renders both dialogs and exposes
`openCapture(spaceId?)` / `openItem(item)` via a `useDialogs()` hook.

**Quick capture is deliberately minimal**
Title (autofocused, Enter submits) + Space + Type — that's it. Defaults to the Inbox
space (by name → pinned → first) unless opened from a space ("Add item" pre-selects
that space). Body/priority/due live in the edit dialog, reached by clicking a row.
Protects the low-friction capture path (CLAUDE.md §2).

**Status editing stays inline, not in the edit dialog**
The edit dialog covers title/body/type/space/priority/due + delete, but *not* status
— that already has a nicer inline UX (the marker). Keeps the dialog simple and avoids
re-resolving the space's set inside it.

**`ItemCreate` required fields**
openapi-typescript marks Pydantic fields that have defaults (`priority`, `position`,
`is_pinned`) as **required** in the generated request type, so the capture payload
sends them explicitly (0 / 0 / false). Not a bug — just the generated contract.

---

## 2026-06-01 — Space view: group + tint by status

**Items grouped into a section per status (not one flat active list)**
The space view now renders one section per status — Interested / Applied / Interview
each their own labelled field — ordered by (behaviour, position): active stages
first, then done, then dismissed. Driven entirely by the status set, so editing a set
in Settings reshapes these sections automatically. `groupByStatus()` in `lib/status.ts`
does the partition; status-less items (notes) fall into an "Other" section.

**Completed is sub-grouped by status too**
The collapsible "Completed (n)" contains a section per closed status (e.g. Offer,
Rejected, Did Not Do) rather than a flat list — so "done vs failed vs not-interested"
stay distinct, with their own colours. Answers the owner's question directly.

**Highlighter row tint in the status colour**
Each item row gets a translucent wash (`hexToRgba(color, 0.12)`) plus a 4px coloured
left spine in its status colour. Inline styles (so any user-chosen hex works) override
the card background; hover uses `brightness-110` since the inline bg beats Tailwind's
hover bg. Status-less rows keep the plain card. Today's task rows inherit the tint too.

Today's cross-space feed is intentionally left ungrouped (mixing sets would be noisy);
grouping is a per-space-view concern.

---

## 2026-06-01 — Spaces CRUD UI, link rendering, deadline focus/snooze

**Spaces created/nested entirely from the sidebar**
A "+" on the Spaces header makes a top-level space; each row's "…" menu (Radix
dropdown) offers Add subspace / Rename / Delete. New spaces append after their
siblings (`max(position)+1`). Subspaces pass `parent_id`, so the adjacency-list tree
nests them automatically. Delete uses `window.confirm` (soft-delete, recoverable) —
deliberately lightweight vs. adding an AlertDialog. No backend change: spaces already
had full CRUD; only a couple of mutation hooks were added.

**Link items: external-link affordance + preview image**
For any item with `metadata.url`, the row shows an external-link icon by the title
and the URL beneath, both opening in a new tab; `metadata.preview_image` renders as a
clickable thumbnail. All link/thumbnail clicks `stopPropagation()` so they don't also
open the item editor (the row's own click).

**Long bodies expand inline**
Rows whose body is >120 chars or multi-line get a chevron that toggles between a
one-line preview and the full `whitespace-pre-wrap` text — local component state, no
fetch. (Gotcha when testing via the preview: React state updates are async, so verify
the toggle in a *separate* eval call, not the same one that clicks.)

**Deadlines: focus + snooze**
Each upcoming-deadline row's title (and a "…" menu) navigates to the item's space
("focus"); the menu also snoozes the due date to tomorrow / +3 days / next week via a
PATCH. Snooze writes `${yyyy-mm-dd}T00:00:00` (same date-at-midnight convention as the
edit dialog), and invalidation re-sorts the list.

**Radix menus need pointer events, not `.click()`**
Noted for future preview testing: Radix DropdownMenu/Select triggers open on
`pointerdown`, so a synthetic `.click()` doesn't open them — dispatch
pointerdown/pointerup instead.

---

## 2026-06-01 — Icon picker, drag-and-drop, front-page settings

**Front-page preferences live client-side (localStorage), not the DB**
Single user → a `SettingsProvider` (context + localStorage, key
`command-center.settings.v1`) holds `todayTopCount`, `upcomingCount`, and
`hiddenFromToday[]`. No backend/migration needed; survives reloads per-browser.
Today + the deadline rail read these to size the front page and exclude hidden
spaces. Editable in Settings → Front page, and per-space via the sidebar "…" →
Hide/Show on Today.

**Emoji icon picker (curated grid + custom field)**
Space icons are chosen from a Popover grid of ~40 curated emoji, with a free-text
"Custom" field for anything else. Replaces the raw text box.

**Drag-and-drop tree re-parenting (native HTML5 DnD)**
Sidebar rows are `draggable`; dropping one onto another sets its `parent_id`
(nest); dropping on empty list area moves it to top level. Cycle-safe: a parent
can't be dropped onto its own descendant (checked via a `parentOf` map walked up
from the target). Reuses the existing `PATCH /api/spaces/{id}` — no backend change.
NavLinks are `draggable={false}` so the row drag wins over native link dragging.

---

## 2026-06-01 — Phase 5 (part 1): single-origin serving + installable PWA

**Backend serves the built frontend (one origin)**
`main.py` mounts the Vite build from `app/static` (present only in the Docker image)
and adds a catch-all that returns real static files or falls back to `index.html`
for client routes — registered *after* the API routers so `/api/*` and `/docs` win.
PC and phone hit a single URL/port. No CORS, no second server in production. In
local dev `app/static` is absent, so this is inert and the Vite dev server (5173)
serves the frontend. Verified: `/`, `/settings` → SPA; `/manifest.webmanifest`,
`/favicon.svg` → real files; `/api/*`, `/docs` → unchanged.

**Root multi-stage Dockerfile (one image)**
Stage 1 (node:22) builds the frontend; stage 2 (python:3.12) installs the backend
and copies the build into `app/static`. `docker compose up --build` → the whole app
on `:8000`. The old `backend/Dockerfile` was removed (context couldn't see the
frontend). `app/static/` is gitignored — it's a build artifact.

**Installable PWA (manifest + branded icon)**
Added `manifest.webmanifest` (standalone, dark theme colour), a branded `favicon.svg`
(indigo "C"), and iOS `apple-mobile-web-app-*` meta + `apple-touch-icon`. Enough to
"Add to Home Screen" on phone over Tailscale and have it look like an app.

**Tailscale is the phone↔PC transport (ops, documented)**
No public exposure: both devices join the tailnet, the phone opens
`http://<tailscale-ip>:8000`. Container binds `0.0.0.0` (Dockerfile CMD). Steps in
README. Web push on iOS still requires the installed PWA (iOS 16.4+).

**Still TODO in Phase 5:** a real service worker (offline + push), web-push (VAPID)
subscription endpoints, the APScheduler daily top-N reminder job — and the auth
open question (CLAUDE.md §13) before the app leaves the tailnet's trust boundary.
PNG app icons (vs the current SVG) would sharpen the iOS home-screen icon.

---

## 2026-06-01 — Phase 5 (part 2): auth + web-push reminders

**Auth: one shared token, off by default**
`AUTH_TOKEN` env var (constant-time compared). Empty → auth disabled (dev, no
friction); set → every `/api/*` data route needs `Authorization: Bearer <token>`
via a router-level `Depends(require_auth)`. `/api/health` + `/api/auth/status` stay
public so the frontend can detect whether to prompt. The web app shows a one-time
unlock screen (`AuthGate`, token in localStorage); the same token is what the owner
gives Claude/Codex. Verified: no-token → 401, right → 200, wrong → 401, health open.

**Web push via VAPID (pywebpush)**
Keypair generated once and persisted to `VAPID_KEY_PATH` (PEM; on /data in Docker).
Public key → browser `applicationServerKey`. `PushSubscription` table stores
endpoint+keys (idempotent upsert by endpoint). `send_push` returns the HTTP status
so 404/410 subscriptions get pruned. Service worker (`public/sw.js`) handles `push`
+ `notificationclick` only — no fetch caching, so it never fights Vite HMR.

**Secure-context constraint is real**
Web push + service workers require HTTPS or localhost. Plain `http://tailscale-ip`
won't work — documented `tailscale serve` (free tailnet HTTPS cert) as the fix. The
frontend checks `window.isSecureContext` and explains this if false. Couldn't
end-to-end test real delivery here (headless browser denies Notifications + no push
service round-trip); verified everything up to the permission grant + the digest
computation/send path.

**APScheduler daily digest**
`BackgroundScheduler` + `CronTrigger` (hour/minute env-configurable) runs
`send_daily_digest`: top-N active items by priority → push to all subscriptions.
`DAILY_DIGEST_COUNT` (default 3) is a *separate* knob from the client-side
`todayTopCount` (the backend can't read the browser's localStorage). Started in
lifespan, stopped on shutdown; lifespan doesn't run under TestClient so tests don't
spin a scheduler. `POST /api/push/test` triggers the digest on demand.

**Phase 5 is now complete.** Remaining nice-to-haves: PNG icons, offline caching in
the SW, per-item `remind_at` reminders (vs. only the daily digest).

---

## 2026-06-02 — Files, descriptions, emoji picker, calendar (owner requests)

**Lightweight column migrations (not Alembic, yet)**
The DB predates Alembic and holds real data, so rather than risk a baseline/stamp
dance, `db.run_migrations()` does idempotent `ALTER TABLE … ADD COLUMN` guarded by
`PRAGMA`/inspector (the `_COLUMN_MIGRATIONS` map). `create_all` still makes new
*tables*; this only handles new *columns* on existing tables. Verified the `space.
description` add on the live DB (no data loss). Adopt Alembic if the schema grows.

**Attachments live on disk, records in the DB (`Attachment` table)**
Files stored under `FILES_DIR` (`/data/files` in Docker) as `uuid+ext`; the record
keeps the original name. Attachable to an item *or* a space (both FKs nullable) — the
space case is the "Library". Endpoints: list / upload (multipart) / `raw` (inline
preview) / `download` / soft-delete. AI agents use the same API; the read model
exposes the absolute `path` so a local agent (or you, via copy-path) can reach the
exact file. `raw`/`download` accept `?token=` (via `require_auth_query`) so plain
`<img>`/`<a>` links work when auth is on. Verified upload→list→download→delete + image
thumbnail preview live.

**Broken images fail silently; AI covers ride on attachments**
`PreviewThumb` hides the image on `onError` (no broken-image icon) — fixed the dead
external link thumbnail. "AI-generated image/chart" needs no new UI: an agent uploads
an image attachment and sets `metadata.preview_image` (an external URL, or the
attachment's `…/raw?token=` URL) — the existing row rendering shows it. No in-app/paid
AI (CLAUDE.md §4) — generation is the agent's job; the app provides the hooks.

**Emoji icon picker via `frimousse`**
Replaced the type-an-emoji box with `frimousse` (searchable, categorised, touch-
friendly; loads emoji data from a CDN). Lives in a Popover inside the space dialog.

**Calendar (react-day-picker via shadcn)**
Month grid with due-date days highlighted; click a day → its items (opens the editor).
Desktop right rail is now a Deadlines/Calendar toggle (`RightRail`); mobile bottom nav
swapped the Deadlines tab for a Calendar tab → `/calendar`. Fixed the shadcn calendar's
`table`→`month_grid` classNames key for react-day-picker v9.

**Native "open in Explorer" deferred (owner chose "later")**
Web can't launch the OS file manager. Now: download / inline preview / copy server
path. Later: a small local helper agent that opens paths in Explorer on the PC.

---

## 2026-06-14 — MCP server (the AI "input" — interactive mode)

**The AI integration is an MCP server over the REST API, not in-app chat**
CLAUDE.md §4/§9/§12 are explicit: no in-app AI chat, no paid API in the core; AI
operates the app from *outside* via the API. So the "AI input" the owner wanted is
realised as an **MCP server** (`mcp/command_center_mcp.py`, server name
`command_center_mcp`) that any AI client (Claude Desktop/Code, etc.) loads. The
owner then just talks to Claude — "add the night market to Local Events" — and the
client calls the tools. Runs under his subscription; no metered API billing.

**Thin client over the API (FastMCP, stdio)**
Python FastMCP (matches the backend stack the owner is learning) over **stdio** (a
local server the client launches). It calls the REST API via httpx — never touches
the DB directly — so the API stays the single contract. Config via env:
`COMMAND_CENTER_URL` (default the Tailscale HTTPS URL), `COMMAND_CENTER_TOKEN`
(only if `AUTH_TOKEN` is set). Own venv at `mcp/.venv` (gitignored).

**Flat tool params, not a wrapper model**
First cut used a single Pydantic `params` model per tool, but FastMCP then nests
every field under a `params` object in the inputSchema — awkward for the model to
call. Switched to flat `Annotated[type, Field(...)]` parameters so the schema is
flat (e.g. `cc_create_item(space, title, type, url, image_url, due_at, …)`).
Verified end-to-end over stdio (list → create event with link+image+date → delete).

**Seven tools, composable**
`cc_list_spaces`, `cc_list_items`, `cc_create_item` (the rich "post" — link +
image + date → a list), `cc_update_item` (edit / set status / move), `cc_delete_item`
(soft), `cc_create_space`, `cc_list_statuses`. Space args accept a **name or id**
(resolved server-side) so the owner can say "Personal" not "#2".

**No local scraping — the AI client scrapes, this just receives**
Per the owner's decision: scrapers live *inside* the AI clients (they find events/
jobs in their own environment) and POST findings here as posts. So there is no
autonomous local agent; Command Center is the destination. The ChatGPT path is
possible too but needs public exposure (Tailscale Funnel) since Custom-GPT actions
call from OpenAI's servers, off-tailnet — deferred in favour of the Claude/MCP path.

---

## 2026-06-14 — Posters, post-detail view, auto-updating native apps

**Auto-poster: og:image fetched at create time**
`cc_create_item` (MCP), when given a `url` but no `image_url`, fetches the page's
`og:image`/`twitter:image` (best-effort, never fatal) and stores it as
`metadata.preview_image`. So events/links arrive with a thumbnail automatically —
no special prompt. Same logic backfilled the first Podgorica events.

**Click a post → read view, not the editor**
Clicking an item used to open the editor straight away — cumbersome for just
reading. Now it opens `ItemDetailDialog`, a calm "full post" view (hero image,
title, type/status/date/venue, body with `**bold**`, open-link, attachments) with
an **Edit** button that hands off to the existing editor. All click sources route
through `openDetail` (rows, Today priority cards, calendar entries, deadline menu);
`openItem` stays as the direct-to-editor path the Edit button uses.

**Native apps load the UI from the server (remote), not a bundled copy**
To make UI updates automatic, both shells now point at the HTTPS Tailscale URL —
Tauri window `url`, Capacitor `server.url` — instead of bundling `dist`. Publishing
a new UI is `scripts/deploy-frontend.ps1` (build → `backend/app/static`, which the
backend already serves at `/`); every client (PWA + both native apps) picks it up
on next launch, **no reinstall**. Reinstall only for shell changes (version, URL,
native plugin/permission, Tauri/Capacitor upgrade) — the owner's "major revisions".
- *Trade-off:* the apps need network at launch to load the UI — fine, they're
  already always-online thin clients (no offline mode by design, CLAUDE.md §13).
- *Server build uses relative `/api`* (default `npm run build`, no `VITE_API_BASE`),
  so the remote-loaded UI calls the same origin. The per-mode `.env.tauri/.env.
  capacitor` builds are now unused for serving.
- *CSP is null* in `tauri.conf.json`, so the external URL loads without a policy
  block; the web UI uses no Tauri IPC, so no capability wiring is needed.

---

## 2026-06-21 — UX/IA redesign: unified actions + space lifecycle + Trash

Context: features had been built one-by-one with no interaction plan, so actions
were hidden/inconsistent (hover-only menus dead on touch, faint "+", browser
right-click hijack, finicky drag, checklists that only appeared where data existed,
a Trash that grew forever). A full rethink, shipped in phases.

**One action definition per object, surfaced three ways**
`features/actions/` holds `useItemActions` / `useSpaceActions` returning
`ActionGroup[]`, rendered by a single `renderActionItems` into both a kebab
(`ActionMenu`, DropdownMenu) and a right-click/long-press menu (`ObjectContextMenu`,
a new `components/ui/context-menu` Radix primitive). Change an action once → it
updates everywhere (the Ctrl/K palette is the planned third surface). Affordances
are visible at rest (low-opacity → full), never `opacity-0`.

**Custom right-click replaces the browser menu**
Radix `ContextMenu.Trigger` preventDefaults the native `contextmenu`, so right-click
on items/spaces (both are `<a>`) shows app actions instead of the browser's link
menu. The status marker stops propagation so its own picker still wins on the dot.

**Checklists are global; drag handle made visible**
The detail view always renders a Checklist section with an "Add item" field (was
gated on `subs.length > 0`, which made it look space-specific). The reorder grip went
from `/40` opacity (invisible) to a clear hit target; PointerSensor distance 5 → 8.

**Space lifecycle: archive · cascade-delete · restore · purge**
New `archived_at` column (via the lightweight `_COLUMN_MIGRATIONS`, not Alembic).
Deleting a space now **cascades**: the whole subtree (descendant spaces + their live
items) is soft-deleted under one timestamp, so `restore` revives exactly that set
(items the user had trashed earlier on their own stay trashed). This also fixed a
real bug where deleting a space orphaned its items (they kept showing in Today) — and
cross-space feeds (`GET /api/items` with no `space_id`) now exclude items whose space
is archived or trashed. Archive cascades the subtree too (hidden from sidebar + feeds,
kept and restorable); a per-space view (`space_id` given) still shows them. There was
no space `restore` endpoint at all before (the delete dialog *promised* restore) —
now there is.

**Trash purge — the deliberate `never hard-delete` exception (CLAUDE.md §2 #7)**
The owner explicitly asked for a deletable Trash (it was stacking infinitely).
So Trash is the one place the app hard-deletes, with three guarded paths — purge all
(`POST /{items,spaces}/trash/empty`), purge one (`DELETE /{id}/purge`), purge
selected (`POST /trash/purge {ids}`) — each: **only on rows already soft-deleted**
(400 otherwise), and **always behind an explicit confirm** in the UI. Purging a space
hard-deletes its subtree + items + attachment rows. The JSON `/api/export` (includes
soft-deleted) is the pre-purge safety net. New `TrashView` at `/trash` (items + spaces
sections, restore / delete-forever / multi-select, "Empty trash"); sidebar gained a
Trash entry with a count and an Archived section with one-tap unarchive.

**Deferred from this pass:** the pure consistency refactor (a shared `ViewHeader` +
extracted `useSelection`) and the optional desktop detail side-panel — lower value
than the functional asks (Trash, Settings, groups), to be picked up later.

**Phase 7 — named group/folder layer (the "both" half of grouping).** A space can be
a *group* (`Space.is_group`, lightweight migration): a collapsible sidebar section
that holds spaces, never items. Implemented on top of the existing `parent_id` tree
(a group is just a space that renders as a header and can't take items) rather than a
parallel data model. `create_item` rejects a group target (400); every item-target
picker (quick capture, editor, move-to-space, bulk move, inbox auto-pick) filters
groups out; `SpaceView` renders a group as a list of its child spaces. "Move to group"
is a space action, cycle-guarded by excluding self + descendants (computed from the
flat space list, since the menu hook has no tree). Groups are created via a "Make this
a group" toggle in the space dialog. Sidebar IA was already Today-first
(Views → Spaces → Archived → Trash → Settings). Still deferred: surfacing per-object
actions inside the command palette as a third surface — the kebab + right-click cover
it, and per-result action hooks would be heavy (~40 results × several mutations).
