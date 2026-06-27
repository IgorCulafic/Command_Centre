# AGENTS.md

This project's full instructions, architecture, data model, UI specs, scope, and
build plan live in **[`CLAUDE.md`](./CLAUDE.md)** — that is the single source of
truth. Read it in full before working on this repo.

Keeping one canonical document (rather than duplicating it here) prevents the two
files from drifting out of sync. If anything in this project's instructions changes,
update `CLAUDE.md`, not this file.

Quick orientation:
- **What we're building:** Command Center — a self-hosted personal command center
  (checklists, notes, reminders, opportunity tracker). The product goal is
  *sustained daily use*, so low friction and a calm, good-looking UI beat feature
  completeness.
- **Stack:** FastAPI + SQLModel + SQLite (backend), React + TypeScript + Vite +
  Tailwind + shadcn/ui (frontend), Docker on a TrueNAS host, Tailscale for access.
- **Build in phases**, in order; do not build features marked *Later* until the MVP
  is working (see `CLAUDE.md` §10–§11).
- **Non-negotiables:** soft-delete only; single-user light auth; no in-app AI chat
  and no paid API in the core; desktop + mobile are both first-class; presentation
  (label/color) is kept separate from semantics (behavior) in the status system.
