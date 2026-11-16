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
import concurrent.futures
from contextlib import asynccontextmanager
import json
import logging
import os
import tempfile
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, List, Optional, Union

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from codesage.ingestion import (
    IngestionError,
    get_github_repo_metadata,
    safe_cleanup_workspace,
    validate_git_branch,
    validate_github_url,
    validate_local_path,
)
from codesage.pipeline import PipelineCancelled, PipelineConfig, build_pipeline

logger = logging.getLogger(__name__)

DEFAULT_MAX_CONCURRENT_SCANS = int(os.environ.get("CODESAGE_MAX_CONCURRENT_SCANS", "3"))
DEFAULT_MAX_QUEUE_SIZE = int(os.environ.get("CODESAGE_MAX_QUEUE_SIZE", "0"))

DASHBOARD_DIST = Path(__file__).resolve().parent.parent / "dashboard" / "dist"


from codesage.persistence import ScanStorage

class ScanRequest(BaseModel):
    repo_url: Optional[str] = None
    repository_url: Optional[str] = None
    branch: Optional[str] = None
    base_branch: Optional[str] = None
    github_repo: Optional[str] = None
    github_token: Optional[str] = None
    scanners: tuple = ("semgrep", "bandit", "gitleaks")

    @property
    def target_url(self) -> str:
        return (self.repository_url or self.repo_url or "").strip()

    @property
    def target_branch(self) -> Optional[str]:
        return self.branch or self.base_branch


class ReviewRequest(BaseModel):
    decision: str  # approved | rejected
    notes: Optional[str] = None
    manual_patch: Optional[str] = None


class ScanRun:
    """Thread-safe record of one pipeline run with persistence support."""

    def __init__(
        self,
        scan_id: str,
        repo_url: str,
        branch: Optional[str] = None,
        github_repo: Optional[str] = None,
    ):
        self.id = scan_id
        self.repo_url = repo_url
        self.branch = branch
        self.github_repo = github_repo
        if not self.github_repo and self.repo_url:
            try:
                from codesage.ingestion import validate_github_url
                val = validate_github_url(self.repo_url)
                self.github_repo = val.get("full_name")
            except Exception:
                pass
        self.status = "running"
        self.started = time.time()
        self.finished: Optional[float] = None
        self.error: Optional[str] = None
        self.current_finding = None
        self.completed: list = []
        self.artifacts: dict = {}  # finding_id -> {stage: detail dict}
        self.repository_metadata: dict = {}
        self.technologies: dict = {}
        self.workspace: Optional[object] = None
        self.repo_path: Optional[str] = None
        self._events: list = []
        self._lock = threading.Lock()
        self._cancel_requested = threading.Event()
        self.file_hashes: dict = {}
        self.findings: list = []

    def request_cancel(self) -> bool:
        """Thread-safely request cancellation of this scan."""
        with self._lock:
            if self.status in ("complete", "failed", "cancelled"):
                return False
            self._cancel_requested.set()
            if self.status == "queued":
                self.status = "cancelled"
                self.finished = time.time()
                self.emit({"type": "cancelled", "message": "Scan cancelled while in queue"})
            return True

    @property
    def is_cancelled(self) -> bool:
        return self._cancel_requested.is_set()

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
            status = entry.get("status", "")
            counts[status] = counts.get(status, 0) + 1
        return counts

    def summary_metrics(self) -> dict:
        metrics: dict = {
            "total": len(self.completed),
            "critical": 0,
            "high": 0,
            "medium": 0,
            "low": 0,
            "informational": 0,
            "confirmed": 0,
            "false_positive": 0,
            "verified": 0,
        }
        for entry in self.completed:
            status = entry.get("status", "")
            metrics[status] = metrics.get(status, 0) + 1
            sev = str(entry.get("severity", "medium")).lower()
            if sev in metrics:
                metrics[sev] += 1
            if status == "false_positive":
                metrics["false_positive"] += 1
            else:
                metrics["confirmed"] += 1
            if status in ("verified_pr_opened", "verified_pr_skipped"):
                metrics["verified"] += 1
        return metrics

    def to_dict(self) -> dict:
        with self._lock:
            return {
                "id": self.id,
                "repo_url": self.repo_url,
                "branch": self.branch,
                "github_repo": getattr(self, "github_repo", None),
                "status": self.status,
                "started": self.started,
                "finished": self.finished,
                "error": self.error,
                "completed": self.completed,
                "artifacts": self.artifacts,
                "repository_metadata": self.repository_metadata,
                "technologies": self.technologies,
                "events": self._events,
                "file_hashes": getattr(self, "file_hashes", {}),
                "findings": getattr(self, "findings", []),
            }

    @classmethod
    def from_dict(cls, data: dict) -> "ScanRun":
        run = cls(
            data["id"],
            data["repo_url"],
            branch=data.get("branch"),
            github_repo=data.get("github_repo"),
        )
        run.status = data.get("status", "completed")
        run.started = data.get("started", 0.0)
        run.finished = data.get("finished")
        run.error = data.get("error")
        run.completed = data.get("completed", [])
        run.artifacts = data.get("artifacts", {})
        run.repository_metadata = data.get("repository_metadata", {})
        run.technologies = data.get("technologies", {})
        run._events = data.get("events", [])
        run.file_hashes = data.get("file_hashes", {})
        run.findings = data.get("findings", [])
        return run



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
        meta = delta.get("repo_metadata") or {}
        tech = delta.get("technologies") or {}
        run.repository_metadata = meta
        run.technologies = tech
        if delta.get("branch"):
            run.branch = delta["branch"]
        if "workspace" in delta:
            run.workspace = delta["workspace"]
        if "repo_path" in delta:
            run.repo_path = delta["repo_path"]
        stage("done", "ingestion", detail={"metadata": meta, "technologies": tech, "branch": run.branch})
        run.emit({
            "type": "repo_ingested",
            "metadata": meta,
            "technologies": tech,
            "branch": run.branch,
        })
        stage("active", "scanning")
    elif node == "scanning":
        if "findings" in delta:
            run.findings = [_detail_of(f) for f in delta["findings"]]
        if "file_hashes" in delta:
            run.file_hashes = dict(delta["file_hashes"])
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
                "pr_number": entry.get("pr_number"),
                "branch": entry.get("branch"),
                "attempts": entry.get("attempts", 1),
                "failure_reason": entry.get("failure_reason"),
            })
    # any delta may carry the full completed list — keep the run in sync
    if node not in ("ingestion",) and "completed_findings" in delta:
        run.completed = list(delta["completed_findings"])


def _run_scan(
    run: ScanRun,
    config: PipelineConfig,
    storage: Optional[ScanStorage] = None,
) -> None:
    config.is_cancelled = lambda: run.is_cancelled
    if config.storage is None and storage is not None:
        config.storage = storage
    if config.previous_hashes is None and storage is not None:
        try:
            prev_run = storage.get_latest_completed_run(run.repo_url, branch=run.branch)
            if prev_run:
                config.previous_hashes = prev_run.get("file_hashes")
                config.previous_findings = prev_run.get("findings") or prev_run.get("completed")
        except Exception as exc:
            logger.warning("Failed to retrieve previous scan data from storage: %s", exc)
    try:
        if run.is_cancelled:
            raise PipelineCancelled("Scan cancelled before pipeline execution")
        run.status = "running"
        run.emit({"type": "run_started", "repo": run.repo_url})
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
            if run.is_cancelled:
                raise PipelineCancelled("Scan cancelled by user request")
            # single-mode stream yields {node_name: delta} per step
            for node, delta in chunk.items():
                delta = {k: v for k, v in delta.items() if not k.startswith("__")}
                if not delta:
                    continue
                _handle_delta(run, node, delta)
            if run.is_cancelled:
                raise PipelineCancelled("Scan cancelled by user request")
        if not run.is_cancelled:
            run.status = "complete"
            run.emit({
                "type": "run_complete",
                "duration_s": round(time.time() - run.started, 1),
                "counts": run.counts(),
            })
    except PipelineCancelled as exc:
        logger.info("Scan %s cancelled: %s", run.id, exc)
        run.status = "cancelled"
        run.emit({"type": "cancelled", "message": str(exc)})
    except Exception as exc:  # noqa: BLE001 - surfaced to the dashboard, never swallowed
        logger.exception("pipeline run failed")
        run.status = "failed"
        run.error = f"{type(exc).__name__}: {exc}"
        run.emit({"type": "error", "message": run.error})
    finally:
        run.finished = time.time()
        if getattr(run, "workspace", None) is not None:
            try:
                run.workspace.cleanup()
            except Exception as exc:
                logger.warning("Failed to clean up workspace for scan %s: %s", run.id, exc)
        elif getattr(run, "repo_path", None) is not None:
            try:
                safe_cleanup_workspace(run.repo_path)
            except Exception as exc:
                logger.warning("Failed to clean up repo path for scan %s: %s", run.id, exc)
        if storage:
            try:
                storage.save_run(run.to_dict())
            except Exception as exc:
                logger.warning("Failed to persist scan run %s: %s", run.id, exc)


# ---------------------------------------------------------------------------
# Concurrency Limiter & Startup Janitor
# ---------------------------------------------------------------------------

class ScanLimiter:
    """Bounded scan execution limiter preventing unlimited simultaneous scans and threads."""

    def __init__(self, max_concurrent: int = 3, max_queue: int = 0):
        self.max_concurrent = max(1, max_concurrent)
        self.max_queue = max(0, max_queue)
        self._lock = threading.Lock()
        self._active_scans: set = set()
        self._queued_scans: list = []
        self._executor = concurrent.futures.ThreadPoolExecutor(
            max_workers=self.max_concurrent,
            thread_name_prefix="codesage-scan",
        )

    @property
    def active_count(self) -> int:
        with self._lock:
            return len(self._active_scans)

    @property
    def queued_count(self) -> int:
        with self._lock:
            return len(self._queued_scans)

    def try_submit(self, scan_id: str, fn: Callable, *args, **kwargs) -> Optional[str]:
        """Attempt to schedule a scan run.

        Returns:
            "running" if worker slot acquired immediately,
            "queued" if placed in the bounded queue,
            None if rejected (concurrency and queue limits reached).
        """
        with self._lock:
            if len(self._active_scans) < self.max_concurrent:
                self._active_scans.add(scan_id)
                status = "running"
            elif len(self._queued_scans) < self.max_queue:
                self._queued_scans.append(scan_id)
                status = "queued"
            else:
                return None

        def worker():
            with self._lock:
                if scan_id in self._queued_scans:
                    self._queued_scans.remove(scan_id)
                self._active_scans.add(scan_id)
            try:
                fn(*args, **kwargs)
            finally:
                with self._lock:
                    self._active_scans.discard(scan_id)

        self._executor.submit(worker)
        return status

    def shutdown(self, wait: bool = False):
        self._executor.shutdown(wait=wait)


def cleanup_stale_workspaces(temp_dirs: Optional[List[Union[str, Path]]] = None) -> int:
    """Startup janitor: safely remove orphaned CodeSage temporary workspaces
    left behind by previous abnormal process terminations.

    Targets ONLY:
    - codesage-verify-* directories under temporary root
    - codesage-repos/* directories under temporary root

    Reuses safe_cleanup_workspace() to enforce symlink safety, containment,
    and prevent deletion of system paths, root, home, CWD, or non-CodeSage files.
    """
    if temp_dirs is None:
        roots = [Path(tempfile.gettempdir())]
        tmp_path = Path("/tmp")
        if tmp_path.exists():
            try:
                if tmp_path.resolve() != roots[0].resolve():
                    roots.append(tmp_path)
            except Exception:
                pass
    else:
        roots = [Path(d) for d in temp_dirs]

    cleaned_count = 0
    for root in roots:
        try:
            if not root.is_dir():
                continue
        except Exception:
            continue

        # 1. Target codesage-verify-* workspaces
        try:
            for item in root.glob("codesage-verify-*"):
                try:
                    if safe_cleanup_workspace(item, dest_parent=root):
                        cleaned_count += 1
                except Exception as exc:
                    logger.warning("Janitor failed to clean %s: %s", item, exc)
        except Exception as exc:
            logger.warning("Janitor failed searching verify workspaces in %s: %s", root, exc)

        # 2. Target codesage-repos/* workspaces (child repos only, preserving container)
        repos_dir = root / "codesage-repos"
        try:
            if repos_dir.is_dir() and not repos_dir.is_symlink():
                for item in repos_dir.iterdir():
                    try:
                        if safe_cleanup_workspace(item, dest_parent=repos_dir):
                            cleaned_count += 1
                    except Exception as exc:
                        logger.warning("Janitor failed to clean %s: %s", item, exc)
        except Exception as exc:
            logger.warning("Janitor failed searching repo workspaces in %s: %s", repos_dir, exc)

    return cleaned_count


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

    gh_repo = req.github_repo
    if not gh_repo and req.target_url:
        try:
            val = validate_github_url(req.target_url)
            gh_repo = val.get("full_name")
        except Exception:
            pass

    gh_token = req.github_token or os.environ.get("GITHUB_TOKEN")

    return PipelineConfig(
        repo_input=req.target_url, llm=MockLLM(responder=responder),
        backend=LocalBackend(), github_repo=gh_repo, github_token=gh_token,
        base_branch=req.target_branch, scanners=tuple(req.scanners),
    )


def create_app(
    config_factory: Optional[Callable[[ScanRequest], PipelineConfig]] = None,
    storage: Optional[ScanStorage] = None,
    max_concurrent_scans: Optional[int] = None,
    max_queue_size: Optional[int] = None,
    limiter: Optional[ScanLimiter] = None,
):
    storage = storage if storage is not None else ScanStorage()
    runs: dict = {}

    if limiter is None:
        conc = (
            max_concurrent_scans
            if max_concurrent_scans is not None
            else int(os.environ.get("CODESAGE_MAX_CONCURRENT_SCANS", str(DEFAULT_MAX_CONCURRENT_SCANS)))
        )
        q = (
            max_queue_size
            if max_queue_size is not None
            else int(os.environ.get("CODESAGE_MAX_QUEUE_SIZE", str(DEFAULT_MAX_QUEUE_SIZE)))
        )
        limiter = ScanLimiter(max_concurrent=conc, max_queue=q)

    # Initial janitor run at app creation
    try:
        cleaned = cleanup_stale_workspaces()
        if cleaned > 0:
            logger.info("Startup janitor cleaned up %d stale workspace(s)", cleaned)
    except Exception as exc:
        logger.warning("Startup janitor encountered an error: %s", exc)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        try:
            cleanup_stale_workspaces()
        except Exception as exc:
            logger.warning("Lifespan startup janitor error: %s", exc)
        yield
        try:
            limiter.shutdown(wait=False)
        except Exception:
            pass

    app = FastAPI(title="CodeSage", lifespan=lifespan)
    app.state.limiter = limiter
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_methods=["*"], allow_headers=["*"],
    )

    # Hydrate past scan runs from durable storage
    for run_data in storage.list_runs():
        try:
            r = ScanRun.from_dict(run_data)
            runs[r.id] = r
        except Exception as exc:
            logger.warning("Failed to hydrate scan from disk: %s", exc)

    def default_factory(req: ScanRequest) -> PipelineConfig:
        if os.environ.get("CODESAGE_DEMO_MOCK") == "1":
            logger.warning("CODESAGE_DEMO_MOCK=1 — scripted LLM + non-sandboxed verifier")
            return _demo_config(req)
        from codesage.llm import create_llm
        from codesage.verification import get_backend

        gh_repo = req.github_repo
        if not gh_repo and req.target_url:
            try:
                val = validate_github_url(req.target_url)
                gh_repo = val.get("full_name")
            except Exception:
                pass

        gh_token = req.github_token or os.environ.get("GITHUB_TOKEN")

        return PipelineConfig(
            repo_input=req.target_url, llm=create_llm(), backend=get_backend(),
            github_repo=gh_repo, github_token=gh_token,
            base_branch=req.target_branch,
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
                    "branch": run.branch,
                    "status": run.status,
                    "started": run.started,
                    "finished": run.finished,
                    "counts": run.counts(),
                    "repository_metadata": run.repository_metadata,
                    "technologies": run.technologies,
                }
                for run in sorted(runs.values(), key=lambda r: r.started, reverse=True)
            ]
        }

    @app.post("/scan")
    def start_scan(req: ScanRequest):
        target_url = req.target_url
        if not target_url:
            raise HTTPException(status_code=400, detail="Repository URL is required.")

        target_branch = req.target_branch
        if target_branch:
            try:
                target_branch = validate_git_branch(target_branch)
            except IngestionError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc

        # Validate URL if it is a remote repository, or authorize local path
        is_remote = target_url.startswith(("http://", "https://", "git@", "ssh://")) or "://" in target_url
        if is_remote:
            try:
                val = validate_github_url(target_url)
                target_url = val["normalized_url"]
                if not target_branch and val.get("extracted_branch"):
                    target_branch = validate_git_branch(val["extracted_branch"])
            except IngestionError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
        else:
            try:
                validated_local = validate_local_path(target_url)
                target_url = str(validated_local)
            except IngestionError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc

        try:
            config = factory(req)
            if target_branch:
                config.base_branch = target_branch
            if req.github_repo and not config.github_repo:
                config.github_repo = req.github_repo
            if is_remote and not config.github_repo and val.get("full_name"):
                config.github_repo = val.get("full_name")
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        scan_id = uuid.uuid4().hex[:12]
        run = ScanRun(scan_id, target_url, branch=target_branch, github_repo=config.github_repo)
        runs[scan_id] = run

        status = limiter.try_submit(scan_id, _run_scan, run, config, storage)
        if status is None:
            del runs[scan_id]
            raise HTTPException(
                status_code=429,
                detail=f"Scan concurrency limit reached ({limiter.max_concurrent} active scans). Please retry after existing scans finish.",
            )

        run.status = status
        storage.save_run(run.to_dict())
        return {
            "scan_id": scan_id,
            "status": status,
            "repository_url": target_url,
            "branch": target_branch,
            "message": "Repository scan initiated" if status == "running" else "Repository scan queued (concurrency limit reached)",
        }

    @app.post("/api/repositories/scan")
    def api_repositories_scan(req: ScanRequest):
        """Initiate an engineering and security scan of an accessible repository."""
        return start_scan(req)

    @app.post("/scan/{scan_id}/cancel")
    def cancel_scan(scan_id: str):
        """Safely cancel an ongoing or queued scan."""
        run = _get_run(scan_id)
        if run.status in ("complete", "failed", "cancelled"):
            return {
                "scan_id": scan_id,
                "status": run.status,
                "message": f"Scan is already {run.status}",
                "cancelled": False,
            }
        run.request_cancel()
        storage.save_run(run.to_dict())
        return {
            "scan_id": scan_id,
            "status": "cancelled",
            "message": "Scan cancellation requested",
            "cancelled": True,
        }

    @app.post("/api/repositories/scan/{scan_id}/cancel")
    def api_repositories_scan_cancel(scan_id: str):
        """Initiate safe scan cancellation via api/repositories route."""
        return cancel_scan(scan_id)

    @app.get("/api/repositories/validate")
    def validate_repository(
        url: str = Query(..., description="GitHub repository URL"),
        branch: Optional[str] = Query(None, description="Optional branch name"),
        token: Optional[str] = Query(None, description="Optional personal access token"),
    ):
        """Validate a GitHub repository URL and fetch metadata prior to scanning."""
        try:
            if branch:
                validate_git_branch(branch)
            val = validate_github_url(url)
            meta = get_github_repo_metadata(val["owner"], val["repo"], token=token)
            if not meta.get("accessible", True):
                return {
                    "valid": False,
                    "error": meta.get("error", "Repository is private or inaccessible."),
                    "owner": val["owner"],
                    "repo": val["repo"],
                    "private": True,
                }
            return {
                "valid": True,
                "owner": val["owner"],
                "repo": val["repo"],
                "full_name": val["full_name"],
                "normalized_url": val["normalized_url"],
                "default_branch": meta.get("default_branch", "main"),
                "is_private": meta.get("is_private", False),
                "description": meta.get("description", ""),
                "stars": meta.get("stars", 0),
                "size_kb": meta.get("size_kb", 0),
                "is_empty": meta.get("is_empty", False),
                "language": meta.get("language", "unknown"),
            }
        except IngestionError as exc:
            return {"valid": False, "error": str(exc)}
        except Exception as exc:
            return {"valid": False, "error": f"Validation error: {exc}"}

    def _get_run(scan_id: str) -> ScanRun:
        run = runs.get(scan_id)
        if run is None:
            # Check if stored on disk but not yet in memory
            disk_data = storage.load_run(scan_id)
            if disk_data:
                run = ScanRun.from_dict(disk_data)
                runs[scan_id] = run
            else:
                raise HTTPException(status_code=404, detail=f"unknown scan {scan_id!r}")
        return run

    @app.get("/scan/{scan_id}/report")
    def download_report(scan_id: str):
        """Generate a complete Markdown Engineering Audit Report for a scan."""
        run = _get_run(scan_id)
        repo_name = run.repository_metadata.get("full_name") or run.repo_url
        counts = run.summary_metrics()
        lines = [
            f"# CodeSage — Engineering & Security Audit Report",
            f"",
            f"- **Repository**: `{repo_name}`",
            f"- **Scan ID**: `{run.id}`",
            f"- **Status**: `{run.status}`",
            f"- **Branch**: `{run.branch or 'default'}`",
            f"- **Commit SHA**: `{run.repository_metadata.get('commit_sha', 'unknown')}`",
            f"- **Scanned At**: `{datetime.fromtimestamp(run.started, tz=timezone.utc).isoformat() if run.started else 'unknown'}`",
            f"",
            f"## 1. Executive Summary",
            f"- Total Findings: **{counts.get('total', 0)}**",
            f"- Critical: **{counts.get('critical', 0)}**",
            f"- High: **{counts.get('high', 0)}**",
            f"- Medium: **{counts.get('medium', 0)}**",
            f"- Low: **{counts.get('low', 0)}**",
            f"- Confirmed Vulnerabilities: **{counts.get('confirmed', 0)}**",
            f"- Filtered False Positives: **{counts.get('false_positive', 0)}**",
            f"- Verified Fixes: **{counts.get('verified', 0)}**",
            f"",
            f"## 2. Technology Stack",
        ]
        tech = run.technologies or {}
        langs = tech.get("languages", {})
        if langs:
            lines.append("### Detected Languages")
            for lang, info in langs.items():
                lines.append(f"- **{lang.capitalize()}**: {info.get('file_count')} files ({info.get('percentage')}%)")
        frameworks = tech.get("frameworks", [])
        if frameworks:
            lines.append(f"\n### Frameworks & Tools\n- " + ", ".join(frameworks))
        lines.append(f"\n- Files Analyzed: {tech.get('files_analyzed', len(run.completed))}")
        lines.append(f"- Files Skipped: {tech.get('files_skipped', 0)}")
        lines.append("\n## 3. Findings Breakdown\n")
        for f in run.completed:
            lines.append(f"### [{str(f.get('severity', 'MEDIUM')).upper()}] {f.get('cwe_id', 'Security Finding')} — {f.get('file_path')}:{f.get('line_number', '')}")
            lines.append(f"- **Tool Source**: {f.get('tool_source')}")
            lines.append(f"- **Status**: {f.get('status')}")
            if f.get('reasoning'):
                lines.append(f"- **AI Analysis**: {f.get('reasoning')}")
            if f.get('raw_message'):
                lines.append(f"- **Scanner Message**: {f.get('raw_message')}")
            lines.append("")
        from fastapi.responses import Response
        return Response(content="\n".join(lines), media_type="text/markdown")


    @app.get("/scan/{scan_id}/status")
    def scan_status(scan_id: str):
        run = _get_run(scan_id)
        return {
            "scan_id": run.id,
            "status": run.status,
            "repo_url": run.repo_url,
            "branch": run.branch,
            "repository_metadata": run.repository_metadata,
            "technologies": run.technologies,
            "started": run.started,
            "finished": run.finished,
            "counts": run.counts(),
            "summary_metrics": run.summary_metrics(),
            "error": run.error,
            "current_finding": run.current_finding.id if run.current_finding else None,
        }

    def _find_completed_entry(run, fid: str):
        """Find a finding entry in run.completed by canonical finding_id, id, or display_id."""
        if not fid:
            return None
        clean_fid = str(fid).strip()
        for idx, entry in enumerate(run.completed):
            if (
                entry.get("finding_id") == clean_fid
                or entry.get("id") == clean_fid
                or entry.get("display_id") == clean_fid
            ):
                return entry
            # Match 1-based index or display format (e.g. F-001 or F-1)
            if clean_fid.upper() in (f"F-{idx+1:03d}", f"F-{idx+1}", f"F-0{idx+1}"):
                return entry
        return None

    @app.get("/scan/{scan_id}/findings")
    def scan_findings(scan_id: str):
        run = _get_run(scan_id)
        # Ensure display_id and id are always populated on each completed item
        for idx, entry in enumerate(run.completed):
            if not entry.get("id"):
                entry["id"] = entry.get("finding_id")
            if not entry.get("display_id"):
                entry["display_id"] = f"F-{idx+1:03d}"
        return {"completed": run.completed, "current_finding": run.current_finding}

    @app.get("/scan/{scan_id}/findings/{finding_id:path}/artifacts")
    def finding_artifacts(scan_id: str, finding_id: str):
        run = _get_run(scan_id)
        artifacts = run.artifacts.get(finding_id)
        if artifacts is None:
            target = _find_completed_entry(run, finding_id)
            if target:
                canonical = target.get("finding_id") or target.get("id")
                if canonical:
                    artifacts = run.artifacts.get(canonical)
        if artifacts is None:
            raise HTTPException(status_code=404, detail=f"no artifacts for {finding_id!r}")
        return artifacts

    @app.get("/scan/{scan_id}/human-review")
    def get_human_review(scan_id: str):
        """Retrieve all findings in needs_human_review status for a given scan."""
        run = _get_run(scan_id)
        review_items = [f for f in run.completed if f.get("status") == "needs_human_review"]
        return {"scan_id": run.id, "count": len(review_items), "findings": review_items}

    @app.post("/scan/{scan_id}/findings/{finding_id:path}/review")
    def review_finding(scan_id: str, finding_id: str, req: ReviewRequest):
        """Approve or reject a finding that was escalated to human review."""
        run = _get_run(scan_id)
        decision = req.decision.strip().lower()
        if decision not in ("approved", "rejected"):
            raise HTTPException(status_code=400, detail="decision must be 'approved' or 'rejected'")

        target = _find_completed_entry(run, finding_id)
        if target is None:
            raise HTTPException(status_code=404, detail=f"finding {finding_id!r} not found in scan")

        canonical_fid = target.get("finding_id") or target.get("id") or finding_id
        target["review_status"] = decision
        target["review_notes"] = req.notes
        if req.manual_patch:
            target["manual_patch"] = req.manual_patch

        run.emit({
            "type": "finding_reviewed",
            "finding_id": canonical_fid,
            "decision": decision,
            "notes": req.notes,
        })
        storage.save_run(run.to_dict())
        return {
            "status": "ok",
            "finding_id": canonical_fid,
            "review_status": decision,
            "review_notes": req.notes,
        }

    @app.get("/health/github")
    def github_health_check(
        repository: Optional[str] = Query(None, description="Repository name to check access against (e.g. owner/repo)"),
        scan_id: Optional[str] = Query(None, description="Scan ID to derive repository from"),
    ):
        """Safe backend diagnostic check that verifies whether GITHUB_TOKEN can access GitHub and repository.
        Never returns or logs the secret token.
        """
        import os
        from dotenv import load_dotenv

        token = os.environ.get("GITHUB_TOKEN", "").strip()
        if not token:
            root_env = Path(__file__).resolve().parent.parent / ".env"
            if root_env.is_file():
                load_dotenv(root_env, override=True)
                token = os.environ.get("GITHUB_TOKEN", "").strip()

        if not token:
            return {
                "status": "error",
                "github_authentication": "FAILED (GITHUB_TOKEN missing)",
                "repository_access": "FAILED",
                "contents_write_permission": "FAILED",
                "pull_request_permission": "FAILED",
                "detail": "GITHUB_TOKEN is not configured in the server environment (.env).",
            }

        try:
            from github import Auth, Github
            from codesage.pr_agent import _explain_github_exception
        except ImportError:
            return {
                "status": "error",
                "github_authentication": "FAILED",
                "detail": "PyGithub is not installed in the environment.",
            }

        try:
            client = Github(auth=Auth.Token(token))
            user = client.get_user()
            user_login = user.login
        except Exception as exc:
            return {
                "status": "error",
                "github_authentication": "FAILED",
                "repository_access": "FAILED",
                "contents_write_permission": "FAILED",
                "pull_request_permission": "FAILED",
                "detail": f"Authentication failed: {_explain_github_exception(exc)}",
            }

        # Resolve target repository
        target_repo_name = repository
        if not target_repo_name and scan_id:
            try:
                run = _get_run(scan_id)
                target_repo_name = run.github_repo
                if not target_repo_name and run.repo_url:
                    val = validate_github_url(run.repo_url)
                    target_repo_name = val.get("full_name")
            except Exception:
                pass
        if not target_repo_name:
            target_repo_name = os.environ.get("GITHUB_REPOSITORY") or "GursimranSingh047/AI-stack-auditor"

        try:
            repo = client.get_repo(target_repo_name)
            perms = getattr(repo, "permissions", None)
            has_push = bool(perms and perms.push)
            has_pull = bool(perms and perms.pull)
            return {
                "status": "ok",
                "github_authentication": "OK",
                "repository_access": "OK",
                "contents_write_permission": "OK" if has_push else "NO_WRITE_PERMISSION",
                "pull_request_permission": "OK" if (has_push or has_pull) else "NO_PR_PERMISSION",
                "authenticated_user": user_login,
                "target_repository": repo.full_name,
                "default_branch": repo.default_branch,
            }
        except Exception as exc:
            return {
                "status": "warning",
                "github_authentication": "OK",
                "repository_access": "FAILED",
                "contents_write_permission": "FAILED",
                "pull_request_permission": "FAILED",
                "authenticated_user": user_login,
                "target_repository": target_repo_name,
                "detail": f"Repository check failed: {_explain_github_exception(exc)}",
            }

    @app.post("/scan/{scan_id}/findings/{finding_id:path}/create-pr")
    def create_pr_for_finding(
        scan_id: str,
        finding_id: str,
        github_repo: Optional[str] = Query(None, description="Optional GitHub repo owner/name override"),
    ):
        """Create a real GitHub Pull Request for a verified finding remediation."""
        run = _get_run(scan_id)

        target = _find_completed_entry(run, finding_id)
        if target is None:
            raise HTTPException(status_code=404, detail=f"finding {finding_id!r} not found in scan")

        canonical_fid = target.get("finding_id") or target.get("id") or finding_id

        # Resolve authoritative scanned repository
        scanned_repo = run.github_repo
        if not scanned_repo and run.repository_metadata:
            scanned_repo = run.repository_metadata.get("full_name")
        if not scanned_repo and run.repo_url:
            try:
                val = validate_github_url(run.repo_url)
                scanned_repo = val.get("full_name")
            except Exception:
                pass

        if github_repo and scanned_repo:
            if github_repo.strip().lower() != scanned_repo.strip().lower():
                raise HTTPException(
                    status_code=400,
                    detail=f"Repository mismatch: requested PR repository '{github_repo}' differs from scanned repository '{scanned_repo}'.",
                )

        gh_repo = scanned_repo or github_repo
        if not gh_repo:
            raise HTTPException(
                status_code=400,
                detail="Target repository is not a valid GitHub repository (e.g. owner/repo).",
            )

        # 1. Duplicate PR protection: return existing PR info if already created
        if target.get("pr_url"):
            return {
                "success": True,
                "finding_id": canonical_fid,
                "pr_number": target.get("pr_number"),
                "pr_url": target.get("pr_url"),
                "repository": gh_repo,
                "branch": target.get("branch"),
                "base_branch": target.get("base_branch"),
                "status": "pr_created",
                "title": target.get("title", f"Fix for {canonical_fid}"),
            }

        artifacts = run.artifacts.get(canonical_fid, {}) or run.artifacts.get(finding_id, {})
        if artifacts.get("pr", {}).get("pr_url"):
            pr_info = artifacts["pr"]
            target["pr_url"] = pr_info["pr_url"]
            target["pr_number"] = pr_info.get("pr_number")
            target["branch"] = pr_info.get("branch")
            target["base_branch"] = pr_info.get("base_branch")
            target["status"] = "verified_pr_opened"
            storage.save_run(run.to_dict())
            return {
                "success": True,
                "finding_id": canonical_fid,
                "pr_number": pr_info.get("pr_number"),
                "pr_url": pr_info["pr_url"],
                "repository": gh_repo,
                "branch": pr_info.get("branch"),
                "base_branch": pr_info.get("base_branch"),
                "status": "pr_created",
                "title": pr_info.get("title", f"Fix for {canonical_fid}"),
            }

        # 2. Validate patch, triage, and verification artifacts
        patch_data = artifacts.get("patch")
        if not patch_data:
            raise HTTPException(
                status_code=400,
                detail="No patch available for this finding. A patch must be generated before creating a PR.",
            )

        patched_code = patch_data.get("patched_code", "")
        original_code = patch_data.get("original_code", "")
        if not patched_code.strip() or patched_code.strip() == original_code.strip():
            raise HTTPException(
                status_code=400,
                detail="Patch is empty or identical to original code. Cannot submit an empty PR.",
            )

        verif_data = artifacts.get("verification")
        if verif_data:
            # Handle repositories with no test suite: do not automatically block PR creation
            is_no_tests = (
                not verif_data.get("tests_available", True)
                or verif_data.get("tests_status") == "not_available"
                or verif_data.get("failure_reason") == "no test suite found in repository (verification inconclusive)"
            )
            if is_no_tests and verif_data.get("scan_clean", False):
                verif_data["tests_available"] = False
                verif_data["tests_status"] = "not_available"
                verif_data["passed"] = True
                verif_data["failure_reason"] = None
            elif not verif_data.get("passed", False):
                if target.get("status") not in ("verified_pr_skipped", "verified_pr_opened"):
                    failure_msg = verif_data.get("failure_reason") if verif_data else "Verification has not passed"
                    raise HTTPException(
                        status_code=400,
                        detail=f"Cannot create PR: {failure_msg}",
                    )
        else:
            if target.get("status") not in ("verified_pr_skipped", "verified_pr_opened"):
                if run.repo_path and Path(run.repo_path).is_dir():
                    try:
                        from codesage.verification import Verifier
                        from codesage.schemas import Finding, Patch
                        v = Verifier(Path(run.repo_path))
                        v_res = v.verify(Finding(**target), Patch(**patch_data))
                        verif_data = v_res.model_dump()
                        artifacts["verification"] = verif_data
                        run.artifacts.setdefault(canonical_fid, {})["verification"] = verif_data
                        if not v_res.passed:
                            raise HTTPException(status_code=400, detail=f"Cannot create PR: {v_res.failure_reason}")
                    except HTTPException:
                        raise
                    except Exception as exc:
                        raise HTTPException(status_code=400, detail=f"Cannot create PR: verification failed: {exc}")
                else:
                    raise HTTPException(status_code=400, detail="Cannot create PR: finding has not passed verification.")

        triage_data = artifacts.get("triage")

        # 3. Resolve GitHub authentication token securely from env
        token = os.environ.get("GITHUB_TOKEN", "").strip()
        if not token:
            from dotenv import load_dotenv
            root_env = Path(__file__).resolve().parent.parent / ".env"
            if root_env.is_file():
                load_dotenv(root_env, override=True)
                token = os.environ.get("GITHUB_TOKEN", "").strip()

        if not token:
            raise HTTPException(
                status_code=400,
                detail="GITHUB_TOKEN is not configured in the server environment. Please configure GITHUB_TOKEN in .env.",
            )

        # 4. Instantiate schemas and invoke PyGithub PR agent
        from codesage.pr_agent import PRError, _api, branch_name_for, create_pull_request, get_repo
        from codesage.schemas import Patch, TriageResult, VerificationResult

        try:
            patch = Patch(**patch_data)
            triage = (
                TriageResult(**triage_data)
                if triage_data
                else TriageResult(
                    finding_id=canonical_fid,
                    is_real_vulnerability=True,
                    confidence=target.get("confidence", 0.9),
                    reasoning=target.get("reasoning", "Vulnerability remediation"),
                    cwe_confirmed=target.get("cwe_id", "CWE-Security"),
                    exploitability="high",
                )
            )
            verif = (
                VerificationResult(**verif_data)
                if verif_data
                else VerificationResult(
                    finding_id=canonical_fid,
                    scan_clean=True,
                    tests_passed=False,
                    tests_available=False,
                    tests_status="not_available",
                    passed=True,
                )
            )
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid finding artifacts schema: {exc}") from exc

        display_id = target.get("display_id")
        expected_branch = branch_name_for(patch, display_id=display_id)

        try:
            repo = get_repo(token, gh_repo)

            logger.info(
                "PR Creation: scan_id=%s finding_id=%s repository=%s branch=%s base_branch=%s",
                scan_id, canonical_fid, gh_repo, expected_branch, run.branch or repo.default_branch,
            )

            # Check if an open PR already exists on GitHub for this head branch
            try:
                open_prs = _api(
                    lambda: list(repo.get_pulls(state="open", head=f"{repo.owner.login}:{expected_branch}")),
                    "checking existing pull requests",
                )
            except Exception:
                open_prs = []

            if open_prs:
                existing_pr = open_prs[0]
                target["pr_url"] = existing_pr.html_url
                target["pr_number"] = existing_pr.number
                target["branch"] = expected_branch
                target["base_branch"] = existing_pr.base.ref
                target["status"] = "verified_pr_opened"
                pr_record = {
                    "scan_id": run.id,
                    "finding_id": canonical_fid,
                    "repository": gh_repo,
                    "branch": expected_branch,
                    "base_branch": existing_pr.base.ref,
                    "pr_number": existing_pr.number,
                    "pr_url": existing_pr.html_url,
                    "created_at": existing_pr.created_at.timestamp() if existing_pr.created_at else time.time(),
                    "status": "pr_created",
                    "title": existing_pr.title,
                }
                run.artifacts.setdefault(canonical_fid, {})["pr"] = pr_record
                if finding_id != canonical_fid:
                    run.artifacts.setdefault(finding_id, {})["pr"] = pr_record
                storage.save_run(run.to_dict())
                return {
                    "success": True,
                    "finding_id": canonical_fid,
                    "pr_number": existing_pr.number,
                    "pr_url": existing_pr.html_url,
                    "repository": gh_repo,
                    "branch": expected_branch,
                    "base_branch": existing_pr.base.ref,
                    "status": "pr_created",
                    "title": existing_pr.title,
                }

            # If branch already exists without an open PR, clean it up before creating new PR
            try:
                existing_ref = repo.get_git_ref(f"heads/{expected_branch}")
                if existing_ref:
                    existing_ref.delete()
                    logger.info("Cleaned up existing branch %s before re-creating PR", expected_branch)
            except Exception:
                pass

            base = run.branch or repo.default_branch
            info = create_pull_request(
                repo,
                patch,
                triage,
                verif,
                base_branch=base,
                head_branch=expected_branch,
                vuln_title=target.get("title") or target.get("cwe_id"),
                severity=target.get("severity"),
                display_id=display_id,
            )

            pr_record = {
                "scan_id": run.id,
                "finding_id": canonical_fid,
                "repository": gh_repo,
                "branch": info["branch"],
                "base_branch": info["base_branch"],
                "commit_sha": info.get("commit_sha"),
                "pr_number": info["pr_number"],
                "pr_url": info["pr_url"],
                "created_at": time.time(),
                "status": "pr_created",
                "title": info.get("title", f"Fix for {canonical_fid}"),
            }

            target["pr_url"] = info["pr_url"]
            target["pr_number"] = info["pr_number"]
            target["branch"] = info["branch"]
            target["base_branch"] = info["base_branch"]
            target["commit_sha"] = info.get("commit_sha")
            target["status"] = "verified_pr_opened"
            run.artifacts.setdefault(canonical_fid, {})["pr"] = pr_record
            if finding_id != canonical_fid:
                run.artifacts.setdefault(finding_id, {})["pr"] = pr_record

            run.emit({
                "type": "finding_done",
                "finding_id": canonical_fid,
                "status": "verified_pr_opened",
                "cwe_id": target.get("cwe_id"),
                "pr_url": info["pr_url"],
                "pr_number": info["pr_number"],
                "branch": info["branch"],
            })
            storage.save_run(run.to_dict())

            return {
                "success": True,
                "finding_id": canonical_fid,
                "pr_number": info["pr_number"],
                "pr_url": info["pr_url"],
                "repository": gh_repo,
                "branch": info["branch"],
                "base_branch": info["base_branch"],
                "status": "pr_created",
                "title": info.get("title", f"Fix for {canonical_fid}"),
            }
        except PRError as exc:
            logger.error("Failed to create GitHub PR for %s: %s", finding_id, exc)
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            logger.exception("Unexpected error creating GitHub PR for %s", finding_id)
            raise HTTPException(status_code=500, detail=f"Failed to create GitHub PR: {exc}") from exc
            logger.exception("Unexpected error creating GitHub PR for %s", finding_id)
            raise HTTPException(status_code=500, detail=f"Failed to create GitHub PR: {exc}") from exc

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
