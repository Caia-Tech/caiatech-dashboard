import os
import subprocess
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse


def _env_csv(name: str) -> list[str]:
    raw = os.getenv(name)
    if raw is None:
        return []
    return [p.strip() for p in raw.split(",") if p.strip()]


def _clean_base_url(raw: str) -> str:
    v = (raw or "").strip()
    return v.rstrip("/") if v else ""


REGISTRY_URL = _clean_base_url(os.getenv("CAIA_REGISTRY_URL") or "http://127.0.0.1:8001")
REGISTRY_API_KEY = (os.getenv("CAIA_REGISTRY_API_KEY") or "").strip() or None

ARTIFACT_CACHE_URL = _clean_base_url(os.getenv("CAIA_ARTIFACT_CACHE_URL") or "http://127.0.0.1:8002")
ARTIFACT_CACHE_API_KEY = (os.getenv("CAIA_ARTIFACT_CACHE_API_KEY") or "").strip() or None

ONYX_API_URL = _clean_base_url(os.getenv("CAIA_ONYX_API_URL") or "http://127.0.0.1:8000")
ONYX_API_KEY = (os.getenv("CAIA_ONYX_API_KEY") or "").strip() or None

EVAL_SERVICE_DIR = Path(
    (os.getenv("CAIA_EVAL_SERVICE_DIR") or (Path(__file__).resolve().parents[1] / ".." / "caiatech-eval-service"))
).expanduser()
EVAL_RUNS_DIR = Path(os.getenv("CAIA_DASHBOARD_EVAL_RUNS_DIR") or (Path(__file__).resolve().parent / "eval_runs")).expanduser()

CORS_ORIGINS = _env_csv("CAIA_DASHBOARD_CORS_ORIGINS")
if not CORS_ORIGINS:
    CORS_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]


@asynccontextmanager
async def lifespan(app: FastAPI):
    timeout = httpx.Timeout(30.0, connect=3.0)
    app.state.http = httpx.AsyncClient(timeout=timeout)
    try:
        yield
    finally:
        await app.state.http.aclose()


app = FastAPI(title="Caia Dashboard API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _require_registry_key() -> str:
    if not REGISTRY_API_KEY:
        raise HTTPException(status_code=503, detail="CAIA_REGISTRY_API_KEY not set for dashboard API")
    return REGISTRY_API_KEY


async def _request_upstream(
    *,
    upstream: str,
    base_url: str,
    method: str,
    path: str,
    params: Optional[Dict[str, Any]] = None,
    json_body: Any = None,
    headers: Optional[Dict[str, str]] = None,
) -> Any:
    client: httpx.AsyncClient = app.state.http
    if not base_url:
        raise HTTPException(status_code=503, detail=f"{upstream} base URL not configured")
    url = f"{base_url}{path}"
    req_headers: Dict[str, str] = dict(headers or {})

    try:
        resp = await client.request(method, url, params=params, json=json_body, headers=req_headers)
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"{upstream} request failed: {e}") from e

    if resp.status_code >= 400:
        try:
            payload = resp.json()
        except Exception:
            payload = {"detail": resp.text}
        raise HTTPException(status_code=resp.status_code, detail={"upstream": upstream, "error": payload})

    if resp.status_code == 204:
        return None

    try:
        return resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"{upstream} returned invalid JSON: {e}") from e


async def _registry_request(
    method: str,
    path: str,
    *,
    params: Optional[Dict[str, Any]] = None,
    json_body: Any = None,
    require_key: bool = True,
) -> Any:
    headers: Dict[str, str] = {}
    if require_key:
        headers["X-API-Key"] = _require_registry_key()
    return await _request_upstream(
        upstream="model-registry",
        base_url=REGISTRY_URL,
        method=method,
        path=path,
        params=params,
        json_body=json_body,
        headers=headers,
    )


def _now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _safe_run_id(raw: str) -> str:
    s = (raw or "").strip()
    if not s:
        raise HTTPException(status_code=400, detail="eval_run_id is required")
    if any(c in s for c in ["/", "\\", "\0"]):
        raise HTTPException(status_code=400, detail="Invalid eval_run_id")
    return s


@app.get("/health")
async def health() -> Dict[str, Any]:
    registry_ok = False
    registry_detail: Any = None
    try:
        registry_detail = await _registry_request("GET", "/health", require_key=False)
        registry_ok = True
    except HTTPException as e:
        registry_detail = e.detail

    artifact_ok = False
    artifact_detail: Any = None
    try:
        artifact_detail = await _request_upstream(
            upstream="artifact-cache-service",
            base_url=ARTIFACT_CACHE_URL,
            method="GET",
            path="/health",
        )
        artifact_ok = True
    except HTTPException as e:
        artifact_detail = e.detail

    onyx_ok = False
    onyx_detail: Any = None
    try:
        onyx_detail = await _request_upstream(
            upstream="onyx-api",
            base_url=ONYX_API_URL,
            method="GET",
            path="/health",
        )
        onyx_ok = True
    except HTTPException as e:
        onyx_detail = e.detail

    return {
        "status": "ok",
        "registry": {
            "url": REGISTRY_URL,
            "reachable": registry_ok,
            "auth_configured": bool(REGISTRY_API_KEY),
            "detail": registry_detail,
        },
        "artifact_cache": {
            "url": ARTIFACT_CACHE_URL,
            "reachable": artifact_ok,
            "auth_configured": bool(ARTIFACT_CACHE_API_KEY),
            "detail": artifact_detail,
        },
        "onyx_api": {
            "url": ONYX_API_URL,
            "reachable": onyx_ok,
            "auth_configured": bool(ONYX_API_KEY),
            "detail": onyx_detail,
        },
        "eval": {
            "eval_service_dir": str(EVAL_SERVICE_DIR),
            "eval_service_present": EVAL_SERVICE_DIR.exists(),
            "eval_runs_dir": str(EVAL_RUNS_DIR),
        },
    }


@app.get("/api/stats")
async def stats() -> Any:
    return await _registry_request("GET", "/stats")


@app.get("/api/models")
async def list_models(
    status: Optional[str] = Query(None),
    name: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    sort: str = Query("updated_at"),
    order: str = Query("desc"),
) -> Any:
    params: Dict[str, Any] = {
        "limit": limit,
        "offset": offset,
        "sort": sort,
        "order": order,
    }
    if status:
        params["status"] = status
    if name:
        params["name"] = name
    if q:
        params["q"] = q
    if tag:
        params["tag"] = tag

    return await _registry_request("GET", "/models", params=params)


@app.get("/api/models/{model_id}")
async def get_model(model_id: int) -> Any:
    return await _registry_request("GET", f"/models/{model_id}")


@app.get("/api/models/{model_id}/metrics")
async def get_model_metrics(model_id: int, suite: Optional[str] = Query(None)) -> Any:
    params: Dict[str, Any] = {}
    if suite:
        params["suite"] = suite
    return await _registry_request("GET", f"/models/{model_id}/metrics", params=params)


@app.get("/api/models/{model_id}/events")
async def get_model_events(model_id: int, limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)) -> Any:
    return await _registry_request(
        "GET",
        f"/models/{model_id}/events",
        params={"limit": limit, "offset": offset},
    )


@app.post("/api/models/{model_id}/promote")
async def promote_model(model_id: int, to_status: str = Query("production")) -> Any:
    return await _registry_request(
        "POST",
        f"/models/{model_id}/promote",
        params={"to_status": to_status},
    )


# =============================================================================
# Artifact Cache
# =============================================================================


def _artifact_cache_headers() -> Dict[str, str]:
    headers: Dict[str, str] = {}
    if ARTIFACT_CACHE_API_KEY:
        headers["X-API-Key"] = ARTIFACT_CACHE_API_KEY
    return headers


@app.get("/api/artifacts/health")
async def artifact_health() -> Any:
    return await _request_upstream(
        upstream="artifact-cache-service",
        base_url=ARTIFACT_CACHE_URL,
        method="GET",
        path="/health",
        headers=_artifact_cache_headers(),
    )


@app.post("/api/artifacts/resolve")
async def artifact_resolve(body: Dict[str, Any]) -> Any:
    # Body contract matches artifact-cache-service: {artifact_uri, sha256, size_bytes}
    return await _request_upstream(
        upstream="artifact-cache-service",
        base_url=ARTIFACT_CACHE_URL,
        method="POST",
        path="/resolve",
        json_body=body,
        headers=_artifact_cache_headers(),
    )


@app.post("/api/models/{model_id}/resolve-checkpoint")
async def resolve_model_checkpoint(model_id: int) -> Any:
    model = await _registry_request("GET", f"/models/{model_id}")
    if not isinstance(model, dict):
        raise HTTPException(status_code=502, detail="model-registry returned invalid model payload")

    artifact_uri = model.get("artifact_uri")
    if not isinstance(artifact_uri, str) or not artifact_uri.strip():
        raise HTTPException(status_code=400, detail="Model is missing artifact_uri")
    artifact_uri = artifact_uri.strip()

    sha256 = model.get("checkpoint_sha256")
    size_bytes = model.get("checkpoint_size_bytes")

    if artifact_uri.startswith("s3://"):
        if not isinstance(sha256, str) or not sha256.strip():
            raise HTTPException(status_code=400, detail="Remote artifact requires checkpoint_sha256")
        if not isinstance(size_bytes, int) or size_bytes < 0:
            raise HTTPException(status_code=400, detail="Remote artifact requires checkpoint_size_bytes")
        payload = {"artifact_uri": artifact_uri, "sha256": sha256, "size_bytes": int(size_bytes)}
        return await _request_upstream(
            upstream="artifact-cache-service",
            base_url=ARTIFACT_CACHE_URL,
            method="POST",
            path="/resolve",
            json_body=payload,
            headers=_artifact_cache_headers(),
        )

    if artifact_uri.startswith("file://") or "://" not in artifact_uri:
        payload: Dict[str, Any] = {"artifact_uri": artifact_uri}
        if isinstance(sha256, str) and sha256.strip():
            payload["sha256"] = sha256.strip()
        if isinstance(size_bytes, int) and size_bytes >= 0:
            payload["size_bytes"] = int(size_bytes)
        return await _request_upstream(
            upstream="artifact-cache-service",
            base_url=ARTIFACT_CACHE_URL,
            method="POST",
            path="/resolve",
            json_body=payload,
            headers=_artifact_cache_headers(),
        )

    raise HTTPException(status_code=400, detail=f"Unsupported artifact_uri scheme for resolution: {artifact_uri}")


# =============================================================================
# Onyx Inference
# =============================================================================


def _onyx_headers() -> Dict[str, str]:
    headers: Dict[str, str] = {}
    if ONYX_API_KEY:
        headers["X-API-Key"] = ONYX_API_KEY
    return headers


@app.get("/api/onyx/health")
async def onyx_health() -> Any:
    return await _request_upstream(
        upstream="onyx-api",
        base_url=ONYX_API_URL,
        method="GET",
        path="/health",
        headers=_onyx_headers(),
    )


@app.get("/api/onyx/models_loaded")
async def onyx_models_loaded() -> Any:
    return await _request_upstream(
        upstream="onyx-api",
        base_url=ONYX_API_URL,
        method="GET",
        path="/models_loaded",
        headers=_onyx_headers(),
    )


@app.post("/api/onyx/generate")
async def onyx_generate(body: Dict[str, Any]) -> Any:
    # For now, always run non-streaming through the dashboard.
    if isinstance(body, dict):
        body = dict(body)
        body["stream"] = False
    return await _request_upstream(
        upstream="onyx-api",
        base_url=ONYX_API_URL,
        method="POST",
        path="/generate",
        json_body=body,
        headers=_onyx_headers(),
    )


@app.post("/api/onyx/chat")
async def onyx_chat(body: Dict[str, Any]) -> Any:
    if isinstance(body, dict):
        body = dict(body)
        body["stream"] = False
    return await _request_upstream(
        upstream="onyx-api",
        base_url=ONYX_API_URL,
        method="POST",
        path="/chat",
        json_body=body,
        headers=_onyx_headers(),
    )


# =============================================================================
# Evals (caiatech-eval-service)
# =============================================================================


def _eval_service_present() -> bool:
    return (EVAL_SERVICE_DIR / "caiatech_eval_service" / "runner.py").exists()


def _default_inference_url() -> str:
    return ONYX_API_URL or "http://127.0.0.1:8000"


@app.get("/api/evals/runs")
async def list_eval_runs(limit: int = Query(50, ge=1, le=500)) -> Any:
    EVAL_RUNS_DIR.mkdir(parents=True, exist_ok=True)
    summaries = sorted(EVAL_RUNS_DIR.glob("*_summary.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    out: list[Dict[str, Any]] = []
    for p in summaries[:limit]:
        try:
            data = p.read_text(encoding="utf-8")
            obj = httpx.Response(200, text=data).json()
        except Exception:
            continue
        if isinstance(obj, dict):
            obj = dict(obj)
            obj.setdefault("summary_path", str(p))
            out.append(obj)
    return out


@app.get("/api/evals/runs/{eval_run_id}/summary")
async def get_eval_summary(eval_run_id: str) -> Any:
    rid = _safe_run_id(eval_run_id)
    path = EVAL_RUNS_DIR / f"{rid}_summary.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Eval summary not found")
    return JSONResponse(content=httpx.Response(200, text=path.read_text(encoding="utf-8")).json())


@app.get("/api/evals/runs/{eval_run_id}/jsonl")
async def get_eval_jsonl(eval_run_id: str) -> Any:
    rid = _safe_run_id(eval_run_id)
    path = EVAL_RUNS_DIR / f"{rid}.jsonl"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Eval jsonl not found")
    return FileResponse(path, media_type="application/jsonl")


@app.post("/api/evals/run")
async def run_eval(body: Dict[str, Any]) -> Any:
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    model_id = body.get("model_id")
    suite = body.get("suite")
    inference_url = body.get("inference_url") or _default_inference_url()

    if not isinstance(model_id, int):
        raise HTTPException(status_code=400, detail="model_id must be an integer")
    if not isinstance(suite, str) or not suite.strip():
        raise HTTPException(status_code=400, detail="suite is required")
    suite = suite.strip()
    if suite not in {"smoke-v1", "core-v1", "math-corpus-v1"}:
        raise HTTPException(status_code=400, detail="suite must be one of: smoke-v1, core-v1, math-corpus-v1")
    if not isinstance(inference_url, str) or not inference_url.strip():
        raise HTTPException(status_code=400, detail="inference_url is required")

    if not _eval_service_present():
        raise HTTPException(status_code=503, detail=f"Eval service not found at {EVAL_SERVICE_DIR} (set CAIA_EVAL_SERVICE_DIR)")

    # Ensure runs dir exists.
    EVAL_RUNS_DIR.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable,
        "-m",
        "caiatech_eval_service.runner",
        "--registry-url",
        REGISTRY_URL,
        "--api-key",
        _require_registry_key(),
        "--suite",
        suite,
        "--model-id",
        str(model_id),
        "--inference-url",
        str(inference_url).strip(),
        "--eval-runs-dir",
        str(EVAL_RUNS_DIR),
    ]

    # Optional tuning knobs.
    for key, flag in [
        ("timeout_seconds", "--timeout-seconds"),
        ("retries", "--retries"),
        ("backoff_seconds", "--backoff-seconds"),
        ("max_tokens", "--max-tokens"),
        ("temperature", "--temperature"),
    ]:
        value = body.get(key)
        if value is None:
            continue
        cmd.extend([flag, str(value)])

    started_at = _now_utc_iso()
    proc = subprocess.run(
        cmd,
        cwd=str(EVAL_SERVICE_DIR),
        capture_output=True,
        text=True,
    )

    if proc.returncode != 0:
        raise HTTPException(
            status_code=502,
            detail={
                "upstream": "caiatech-eval-service",
                "returncode": proc.returncode,
                "stdout": (proc.stdout or "").strip(),
                "stderr": (proc.stderr or "").strip(),
            },
        )

    stdout = (proc.stdout or "").strip()
    try:
        result = httpx.Response(200, text=stdout).json()
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail={"upstream": "caiatech-eval-service", "error": f"Invalid JSON on stdout: {e}", "stdout": stdout},
        ) from e

    if not isinstance(result, dict) or not isinstance(result.get("eval_run_id"), str):
        raise HTTPException(status_code=502, detail={"upstream": "caiatech-eval-service", "error": "Missing eval_run_id"})

    result = dict(result)
    result["started_at"] = started_at
    result["finished_at"] = _now_utc_iso()
    return result
