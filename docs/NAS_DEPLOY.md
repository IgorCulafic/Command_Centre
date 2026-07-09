# NAS Deployment — TODO / Runbook

> **Status: not yet deployed.** The app has only run on the dev PC. This is the
> guide (and the open checklist) for putting it on the TrueNAS so it's always-on —
> which is the actual product goal (sustained daily use, not running it by hand).

## What deploys

One Docker image (root `Dockerfile`, multi-stage): builds the Vite frontend and
bakes it into the Python backend, which serves the API **and** the app on a single
origin/port (`8000`). No separate frontend container, no CORS. See `docker-compose.yml`.

## Steps

1. **Get the code onto the NAS** — clone the repo on the NAS, or build the image
   elsewhere and push it to a registry the NAS can pull.
2. **Pick a data location with snapshots.** The `./data` volume holds *everything*
   that matters: `command_center.db` (SQLite), `files/` (attachments), and
   `vapid_private.pem` (push key). Point it at a ZFS dataset that's in your snapshot
   schedule. In `docker-compose.yml` the volume is `./data:/data`.
3. **Set environment** (in compose). Sensible NAS values:
   - `DATABASE_URL=sqlite:////data/command_center.db`
   - `FILES_DIR=/data/files`
   - `VAPID_KEY_PATH=/data/vapid_private.pem`
   - `AUTH_TOKEN=<long random>` — **set this** (see below). Generate:
     `python -c "import secrets; print(secrets.token_urlsafe(32))"`
   - Optional: `DAILY_DIGEST_HOUR=8`, `DAILY_DIGEST_COUNT=3`
4. **Run it:** `docker compose up --build -d` → app on `http://<nas>:8000`.
5. **Tailscale:** add the NAS to the tailnet. For HTTPS (needed for push + PWA
   install) run on the NAS: `tailscale serve --bg 8000` → `https://<nas>.<tailnet>.ts.net`.

## Post-deploy checklist (the open items)

- [ ] **Set `AUTH_TOKEN`** — currently unset, so the app is open to the whole tailnet.
      Set it, then unlock once in the browser and hand the same token to Claude/Codex.
- [ ] **HTTPS via `tailscale serve`** — without it, push reminders and "install to
      home screen" won't work (browsers require a secure context).
- [ ] **Verify a real push** — open the HTTPS URL on the phone → Add to Home Screen →
      Settings → Reminders → Enable → Send test. This path has been *built* but never
      confirmed on a real device.
- [ ] **Confirm snapshots** actually cover the `/data` dataset.
- [ ] (Optional) put the NAS app behind the token before sharing the tailnet with anyone.

## Notes / gotchas

- The backend must bind `0.0.0.0` (the Dockerfile CMD already does) so the NAS's
  Tailscale IP can reach it. Locally it binds `127.0.0.1`.
- Schema changes apply automatically on startup via `db.run_migrations()` (idempotent
  column adds) + `create_all` for new tables — no manual migration step today. Revisit
  with Alembic if the schema gets complex.
- First startup generates the VAPID key into `/data` and seeds demo data only if the
  DB is empty.
