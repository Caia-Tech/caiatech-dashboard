# Caia Dashboard (WIP)

Local-first dashboard for Caia’s model lifecycle, backed by the **Caia Model Registry**.

This repo intentionally starts small:
- `api/`: FastAPI service that talks to your existing `model-registry` (keeps the registry API key server-side)
- `web/`: React (Vite) UI

## Prereqs

- `model-registry` running (default: `http://127.0.0.1:8001`)
- A registry API key configured on `model-registry` (`CAIA_REGISTRY_API_KEY`) and provided to this dashboard API.

## Run (dev)

### 1) Start the dashboard API

```bash
cd api
python -m venv .venv
source .venv/bin/activate
python -m pip install -U pip
pip install -r requirements.txt -r requirements-dev.txt

export CAIA_REGISTRY_URL=http://127.0.0.1:8001
export CAIA_REGISTRY_API_KEY=dev

uvicorn server:app --host 127.0.0.1 --port 8003 --reload
```

### 2) Start the web UI

```bash
cd web
npm install
cp .env.example .env
npm run dev
```

Then open the Vite URL (usually `http://127.0.0.1:5173`).

## Configuration

Dashboard API:
- `CAIA_REGISTRY_URL` (default `http://127.0.0.1:8001`)
- `CAIA_REGISTRY_API_KEY` (required)
- `CAIA_DASHBOARD_CORS_ORIGINS` (optional CSV; default allows localhost dev ports)

Web UI:
- `VITE_API_BASE_URL` (default empty = same-origin; set to `http://127.0.0.1:8003` if not using the Vite proxy)
# caiatech-dashboard
