"""Module 9 — FastAPI backend: REST + WebSocket live pipeline events.

Endpoints (architecture.md 2.2):
    POST /scan                            {repo_url, github_repo?, ...} -> {scan_id}
    GET  /scan/{id}/status                run status + per-status counts
    GET  /scan/{id}/findings              completed findings + current finding
    GET  /scan/{id}/findings/{fid}/artifacts   triage/patch/verification/context
    GET  /scan/{id}/events                full event replay (REST fallback)
    WS   /ws/{scan_id}                    live event stream (replays from t0)

Event schema (superset of architecture.md's {finding_id, stage, timestamp}):
    run_started      {repo}
    findings_discovered {count}
    stage            {finding_id, stage, status: active|done, detail?}
    retry            {finding_id, attempt, failure_reason}          <- explicit addition
    finding_done     {finding_id, status, pr_url?, attempts, failure_reason?}
    run_complete     {duration_s, counts}
    error            {message, stage?}

The adapter converts LangGraph's `app.stream(stream_mode="updates")` deltas
into these events — pipeline.py itself is untouched. Demo mode
(CODESAGE_DEMO_MOCK=1) runs the identical graph with a scripted LLM and the
local (non-sandboxed) verifier so the dashboard is demonstrable without
credentials; real mode requires ANTHROPIC_API_KEY (or Ollama) and uses the
auto-detected verification backend.
"""

import asyncio
import json
import logging
import os
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from codesage.pipeline import PipelineConfig, build_pipeline

logger = logging.getLogger(__name__)

DASHBOARD_DIST = Path(__file__).resolve().parent.parent / "dashboard" / "dist"


class ScanRequest(BaseModel):
    repo_url: str
    github_repo: Optional[str] = None
    base_branch: Optional[str] = None
    scanners: tuple = ("semgrep", "bandit", "gitleaks")


class ScanRun:
    """Thread-safe in-memory record of one pipeline run."""

    def __init__(self, scan_id: str, repo_url: str):
        self.id = scan_id
        self.repo_url = repo_url
        self.status = "running"
        self.started = time.time()
        self.finished: Optional[float] = None
        self.error: Optional[str] = None
        self.current_finding = None
        self.completed: list = []
        self.artifacts: dict = {}  # finding_id -> {stage: detail dict}
        self._events: list = []
        self._lock = threading.Lock()

    def emit(self, event: dict) -> None:
        event["ts"] = datetime.now(timezone.utc).isoformat()
        with self._lock:
            self._events.append(event)

    def snapshot(self, after: int = 0):
        with self._lock:
            return list(self._events[after:]), len(self._events)

    def counts(self) -> dict:
        counts: dict = {}
        for entry in self.completed:
            counts[entry["status"]] = counts.get(entry["status"], 0) + 1
        return counts


# ---------------------------------------------------------------------------
# Stream adapter: graph node deltas -> dashboard events
# ---------------------------------------------------------------------------

def _detail_of(value):
    if value is None:
        return None
    if hasattr(value, "model_dump"):
        return value.model_dump()
    return value


def _handle_delta(run: ScanRun, node: str, delta: dict) -> None:
    def stage(status: str, stage_name: str, detail=None, finding=None):
        event = {"type": "stage", "stage": stage_name, "status": status}
        target = finding or run.current_finding
        if target is not None:
            event["finding_id"] = target.id  # run-level stages have no finding yet
        if detail is not None:
            event["detail"] = detail
        run.emit(event)

    if node == "ingestion":
        stage("done", "ingestion")
        stage("active", "scanning")
    elif node == "scanning":
        stage("done", "scanning", detail={"count": len(delta.get("findings", []))})
        run.emit({"type": "findings_discovered", "count": len(delta.get("findings", []))})
    elif node == "next_finding":
        current = delta.get("current_finding")
        run.current_finding = current  # None once the queue drains
        if current is not None:
            stage("active", "context", finding=current)
    elif node == "context":
        context = _detail_of(delta.get("context"))
        run.artifacts.setdefault(run.current_finding.id, {})["context"] = context
        stage("done", "context", detail={"enclosing_function": context["enclosing_function"]})
        stage("active", "triage")
    elif node == "triage":
        triage = _detail_of(delta.get("triage_result"))
        if triage is not None:
            run.artifacts.setdefault(triage["finding_id"], {})["triage"] = triage
            stage("done", "triage", detail=triage)
            if triage["is_real_vulnerability"]:
                stage("active", "patch")
            else:
                run.emit({
                    "type": "finding_done",
                    "finding_id": triage["finding_id"],
                    "status": "false_positive",
                    "cwe_id": triage["cwe_confirmed"],
                    "confidence": triage["confidence"],
                    "reasoning": triage["reasoning"],
                })
        else:  # triage failed after the JSON retry budget (design.md section 6)
            entry = delta["completed_findings"][-1]
            run.emit({
                "type": "finding_done",
                "finding_id": entry["finding_id"],
                "status": entry["status"],
                "cwe_id": entry.get("cwe_id"),
                "failure_reason": entry.get("failure_reason"),
            })
    elif node == "patch":
        patch = _detail_of(delta.get("patch"))
        if patch is not None:
            run.artifacts.setdefault(patch["finding_id"], {})["patch"] = patch
            stage("done", "patch", detail=patch)
            stage("active", "verify")
        else:  # patch generation failed after the JSON retry budget
            entry = delta["completed_findings"][-1]
            run.emit({
                "type": "finding_done",
                "finding_id": entry["finding_id"],
                "status": entry["status"],
                "cwe_id": entry.get("cwe_id"),
                "failure_reason": entry.get("failure_reason"),
            })
    elif node == "verify":
        verification = _detail_of(delta.get("verification_result"))
        if verification is not None:
            run.artifacts.setdefault(verification["finding_id"], {})["verification"] = verification
            stage("done", "verify", detail=verification)
            if verification["passed"]:
                stage("active", "pr")
            else:
                run.emit({
                    "type": "retry",
                    "finding_id": verification["finding_id"],
                    "attempt": delta.get("retry_count", 0) + 1,
                    "failure_reason": verification["failure_reason"],
                })
                stage("active", "patch")
    elif node in ("pr", "human_review"):
        stage("done", node)
        if delta.get("completed_findings"):
            entry = delta["completed_findings"][-1]
            run.emit({
                "type": "finding_done",
                "finding_id": entry["finding_id"],
                "status": entry["status"],
                "cwe_id": entry.get("cwe_id"),
                "pr_url": entry.get("pr_url"),
                "attempts": entry.get("attempts", 1),
                "failure_reason": entry.get("failure_reason"),
            })
    # any delta may carry the full completed list — keep the run in sync
    if node not in ("ingestion",) and "completed_findings" in delta:
        run.completed = list(delta["completed_findings"])


def _run_scan(run: ScanRun, config: PipelineConfig) -> None:
    run.emit({"type": "run_started", "repo": run.repo_url})
    try:
        app = build_pipeline(config)
        initial = {
            "repo_url": config.repo_input,
            "findings": [],
            "completed_findings": [],
            "retry_count": 0,
        }
        for chunk in app.stream(
            initial, stream_mode="updates", config={"recursion_limit": 2000}
        ):
            # single-mode stream yields {node_name: delta} per step
            for node, delta in chunk.items():
                delta = {k: v for k, v in delta.items() if not k.startswith("__")}
                if not delta:
                    continue
                _handle_delta(run, node, delta)
        run.status = "complete"
        run.emit({
            "type": "run_complete",
            "duration_s": round(time.time() - run.started, 1),
            "counts": run.counts(),
        })
    except Exception as exc:  # noqa: BLE001 - surfaced to the dashboard, never swallowed
        logger.exception("pipeline run failed")
        run.status = "failed"
        run.error = f"{type(exc).__name__}: {exc}"
        run.emit({"type": "error", "message": run.error})
    finally:
        run.finished = time.time()


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

def _demo_config(req: ScanRequest) -> PipelineConfig:
    """CODESAGE_DEMO_MOCK=1: same graph, scripted LLM, local verifier."""
    from codesage.llm import MockLLM
    from codesage.verification import LocalBackend

    fixes = [
        ('exit_status = os.system(f"ping -c 1 {host}")',
         'import subprocess\n    exit_status = subprocess.run(["ping", "-c", "1", host], check=False).returncode'),
        ('task = pickle.loads(raw)',
         'import json\n        task = json.loads(raw.decode("utf-8"))'),
    ]
    confirm = ("shop.py", "payments.py", "tasks.py", "files.py", "admin.py", "main.py")

    def responder(system: str, user: str) -> str:
        if "reviewing static analysis findings" in system:
            confirmed = any(f"at {name}" in user for name in confirm)
            return json.dumps({
                "finding_id": "x", "is_real_vulnerability": confirmed,
                "confidence": 0.9 if confirmed else 0.6,
                "reasoning": "demo-mode scripted verdict",
                "cwe_confirmed": "CWE-0",
                "exploitability": "high" if confirmed else "low",
            })
        span = user.split("Original function:\n", 1)[1]
        span = span.split("\n\nYour previous patch attempt failed verification", 1)[0].rstrip()
        body = span
        for orig, fixed in fixes:
            if orig in span:
                body = span.replace(orig, fixed)
                break
        return json.dumps({
            "finding_id": "x", "original_code": "ignored",
            "patched_code": body, "explanation": "demo-mode scripted fix",
            "attempt_number": 1,
        })

    return PipelineConfig(
        repo_input=req.repo_url, llm=MockLLM(responder=responder),
        backend=LocalBackend(), github_repo=req.github_repo,
        base_branch=req.base_branch, scanners=tuple(req.scanners),
    )


def create_app(config_factory: Optional[Callable[[ScanRequest], PipelineConfig]] = None):
    app = FastAPI(title="CodeSage")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_methods=["*"], allow_headers=["*"],
    )

    runs: dict = {}

    def default_factory(req: ScanRequest) -> PipelineConfig:
        if os.environ.get("CODESAGE_DEMO_MOCK") == "1":
            logger.warning("CODESAGE_DEMO_MOCK=1 — scripted LLM + non-sandboxed verifier")
            return _demo_config(req)
        from codesage.llm import create_llm
        from codesage.verification import get_backend

        return PipelineConfig(
            repo_input=req.repo_url, llm=create_llm(), backend=get_backend(),
            github_repo=req.github_repo, base_branch=req.base_branch,
            scanners=tuple(req.scanners),
        )

    factory = config_factory or default_factory

    @app.get("/scans")
    def list_scans():
        """Scan history (most recent first) for the dashboard history page."""
        return {
            "scans": [
                {
                    "scan_id": run.id,
                    "repo_url": run.repo_url,
                    "status": run.status,
                    "started": run.started,
                    "finished": run.finished,
                    "counts": run.counts(),
                }
                for run in sorted(runs.values(), key=lambda r: r.started, reverse=True)
            ]
        }

    @app.post("/scan")
    def start_scan(req: ScanRequest):
        if not Path(req.repo_url).expanduser().is_dir() and "://" not in req.repo_url:
            raise HTTPException(status_code=400, detail=f"Repository not found: {req.repo_url!r}")
        try:
            config = factory(req)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        scan_id = uuid.uuid4().hex[:12]
        run = ScanRun(scan_id, req.repo_url)
        runs[scan_id] = run
        threading.Thread(target=_run_scan, args=(run, config), daemon=True,
                         name=f"scan-{scan_id}").start()
        return {"scan_id": scan_id, "status": "running"}

    def _get_run(scan_id: str) -> ScanRun:
        run = runs.get(scan_id)
        if run is None:
            raise HTTPException(status_code=404, detail=f"unknown scan {scan_id!r}")
        return run

    @app.get("/scan/{scan_id}/status")
    def scan_status(scan_id: str):
        run = _get_run(scan_id)
        return {
            "scan_id": run.id, "status": run.status, "repo_url": run.repo_url,
            "started": run.started, "finished": run.finished, "counts": run.counts(),
            "error": run.error,
            "current_finding": run.current_finding.id if run.current_finding else None,
        }

    @app.get("/scan/{scan_id}/findings")
    def scan_findings(scan_id: str):
        run = _get_run(scan_id)
        return {"completed": run.completed, "current_finding": run.current_finding}

    @app.get("/scan/{scan_id}/findings/{finding_id}/artifacts")
    def finding_artifacts(scan_id: str, finding_id: str):
        run = _get_run(scan_id)
        artifacts = run.artifacts.get(finding_id)
        if artifacts is None:
            raise HTTPException(status_code=404, detail=f"no artifacts for {finding_id!r}")
        return artifacts

    @app.get("/scan/{scan_id}/events")
    def scan_events(scan_id: str):
        events, _ = _get_run(scan_id).snapshot()
        return {"events": events}

    @app.websocket("/ws/{scan_id}")
    async def scan_ws(websocket: WebSocket, scan_id: str):
        if scan_id not in runs:
            await websocket.close(code=4404)
            return
        run = runs[scan_id]
        await websocket.accept()
        index = 0
        try:
            while True:
                events, index = run.snapshot(after=index)
                for event in events:
                    await websocket.send_json(event)
                if run.status != "running" and index >= len(run._events):
                    break
                await asyncio.sleep(0.15)
        except WebSocketDisconnect:
            pass
        finally:
            try:
                await websocket.close()
            except Exception:  # noqa: BLE001
                pass

    if DASHBOARD_DIST.is_dir():
        # SPA fallback: serve built assets, or index.html for client-side routes
        from fastapi.responses import FileResponse

        dist_root = str(DASHBOARD_DIST.resolve())

        @app.get("/{full_path:path}", include_in_schema=False)
        def spa_fallback(full_path: str):
            candidate = (DASHBOARD_DIST / full_path).resolve()
            if full_path and candidate.is_file() and str(candidate).startswith(dist_root):
                return FileResponse(candidate)
            return FileResponse(DASHBOARD_DIST / "index.html")

    return app


app = create_app()
