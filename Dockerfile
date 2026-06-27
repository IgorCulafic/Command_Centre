# ── Stage 1: build the frontend (Vite → static files) ──────────────────────────
FROM node:22-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python backend that serves the API + the built frontend ───────────
FROM python:3.12-slim
WORKDIR /app

COPY backend/pyproject.toml ./
RUN pip install --no-cache-dir -e .

COPY backend/app/ app/
# The built SPA lands in app/static; main.py serves it on the same origin, so
# PC and phone (over Tailscale) hit one URL — no CORS, no second port.
COPY --from=frontend /frontend/dist app/static

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
