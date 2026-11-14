"""Tests for Backend Phase 7: Concurrency Limiting & Startup Janitor.

Verifies:
1. Concurrency limit prevents unlimited simultaneous scans and threads.
2. Accepted scan returns 200 and runs.
3. Rejected scan returns 429 when concurrency limit (and queue) is reached.
4. Queued scan returns 200 with status='queued' when bounded queue is enabled.
5. Startup janitor removes stale codesage-verify-* and codesage-repos/* workspaces.
6. Startup janitor preserves parent containers, system directories, CWD, and user repos.
7. Symlink safety: symlinks in temporary locations are unlinked without touching targets.
"""

import os
import threading
import time
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from codesage.ingestion import safe_cleanup_workspace
from codesage.pipeline import PipelineConfig
from codesage.server import (
    ScanLimiter,
    ScanRequest,
    cleanup_stale_workspaces,
    create_app,
)


# ---------------------------------------------------------------------------
# Part A: Concurrency Limiting Tests
# ---------------------------------------------------------------------------

def test_concurrency_limit_accepted_and_rejected(tmp_path):
    """Verify that scans up to the limit are accepted and subsequent scans
    are rejected with HTTP 429 when max_queue_size=0.
    """
    proceed_event = threading.Event()

    def blocking_factory(req: ScanRequest) -> PipelineConfig:
        config = MagicMock(spec=PipelineConfig)
        config.repo_input = str(tmp_path)
        config.scanners = ()
        config.base_branch = None
        return config

    # Mock _run_scan so it blocks until proceed_event is set
    original_run_scan = None
    import codesage.server as srv

    def slow_run_scan(run, config, storage=None):
        run.status = "running"
        run.emit({"type": "run_started", "repo": run.repo_url})
        proceed_event.wait(timeout=10)
        run.status = "complete"
        run.finished = time.time()
        run.emit({"type": "run_complete", "duration_s": 0.1, "counts": {}})

    monkeypatch_obj = pytest.MonkeyPatch()
    monkeypatch_obj.setattr(srv, "_run_scan", slow_run_scan)

    # Allow local paths
    monkeypatch_obj.setenv("CODESAGE_ALLOW_LOCAL_PATHS", "1")
    monkeypatch_obj.setenv("CODESAGE_ALLOWED_LOCAL_DIR", str(tmp_path.parent))

    try:
        app = create_app(
            config_factory=blocking_factory,
            max_concurrent_scans=1,
            max_queue_size=0,
        )

        with TestClient(app) as client:
            # 1. Accepted scan: slot available
            resp1 = client.post("/scan", json={"repo_url": str(tmp_path)})
            assert resp1.status_code == 200
            data1 = resp1.json()
            assert data1["status"] == "running"
            assert "scan_id" in data1

            # Give thread a moment to register as active
            time.sleep(0.1)

            # 2. Rejected scan: concurrency limit reached (1 active scan)
            resp2 = client.post("/scan", json={"repo_url": str(tmp_path)})
            assert resp2.status_code == 429
            assert "limit reached" in resp2.json()["detail"].lower()

            # Unblock scan 1
            proceed_event.set()
            time.sleep(0.3)

            # 3. Accepted scan after previous scan completes
            proceed_event.clear()
            resp3 = client.post("/scan", json={"repo_url": str(tmp_path)})
            assert resp3.status_code == 200
            assert resp3.json()["status"] == "running"

            # Cleanly unblock scan 3
            proceed_event.set()
    finally:
        proceed_event.set()
        monkeypatch_obj.undo()


def test_concurrency_limit_with_queuing(tmp_path):
    """Verify that when queueing is enabled (max_queue_size > 0), excess scans
    are accepted as 'queued' until the queue is full, after which they are rejected.
    """
    first_started = threading.Event()
    first_finish = threading.Event()
    second_started = threading.Event()
    second_finish = threading.Event()

    import codesage.server as srv

    def controlled_run_scan(run, config, storage=None):
        if not first_started.is_set():
            first_started.set()
            first_finish.wait(timeout=10)
        else:
            second_started.set()
            second_finish.wait(timeout=10)
        run.status = "complete"
        run.finished = time.time()

    monkeypatch_obj = pytest.MonkeyPatch()
    monkeypatch_obj.setattr(srv, "_run_scan", controlled_run_scan)
    monkeypatch_obj.setenv("CODESAGE_ALLOW_LOCAL_PATHS", "1")
    monkeypatch_obj.setenv("CODESAGE_ALLOWED_LOCAL_DIR", str(tmp_path.parent))

    def dummy_factory(req):
        return MagicMock(spec=PipelineConfig, repo_input=str(tmp_path), scanners=(), base_branch=None)

    try:
        # 1 active scan, 1 queued scan
        app = create_app(
            config_factory=dummy_factory,
            max_concurrent_scans=1,
            max_queue_size=1,
        )

        with TestClient(app) as client:
            # Scan 1: accepted immediately -> running
            resp1 = client.post("/scan", json={"repo_url": str(tmp_path)})
            assert resp1.status_code == 200
            assert resp1.json()["status"] == "running"
            assert first_started.wait(timeout=5)

            # Scan 2: queued -> queued
            resp2 = client.post("/scan", json={"repo_url": str(tmp_path)})
            assert resp2.status_code == 200
            assert resp2.json()["status"] == "queued"

            # Scan 3: rejected -> 429 (active=1, queue=1)
            resp3 = client.post("/scan", json={"repo_url": str(tmp_path)})
            assert resp3.status_code == 429
            assert "concurrency limit reached" in resp3.json()["detail"].lower()

            # Finish scan 1 -> worker picks up scan 2
            first_finish.set()
            assert second_started.wait(timeout=5)

            # Finish scan 2
            second_finish.set()
    finally:
        first_finish.set()
        second_finish.set()
        monkeypatch_obj.undo()


# ---------------------------------------------------------------------------
# Part B: Startup Janitor & Symlink Safety Tests
# ---------------------------------------------------------------------------

def test_startup_janitor_cleans_stale_verify_and_repo_workspaces(tmp_path):
    """Verify that cleanup_stale_workspaces targets only codesage-verify-*
    and codesage-repos/* child directories, preserving parent containers
    and arbitrary files.
    """
    # 1. Stale verify workspaces
    v1 = tmp_path / "codesage-verify-abc1"
    v1.mkdir()
    (v1 / "temp.py").write_text("v1")

    v2 = tmp_path / "codesage-verify-abc2"
    v2.mkdir()
    (v2 / "temp.py").write_text("v2")

    # 2. Stale repo workspaces inside codesage-repos container
    repos_container = tmp_path / "codesage-repos"
    repos_container.mkdir()
    r1 = repos_container / "repo-deadbeef"
    r1.mkdir()
    (r1 / "app.py").write_text("r1")

    # 3. Arbitrary/unrelated file & directory that MUST NOT be deleted
    unrelated_dir = tmp_path / "other-app-cache"
    unrelated_dir.mkdir()
    (unrelated_dir / "keep.txt").write_text("important")

    unrelated_file = tmp_path / "important_temp_file.txt"
    unrelated_file.write_text("keep this too")

    # Run cleanup targeting tmp_path
    cleaned = cleanup_stale_workspaces(temp_dirs=[tmp_path])

    assert cleaned == 3
    assert not v1.exists(), "codesage-verify-abc1 should have been cleaned"
    assert not v2.exists(), "codesage-verify-abc2 should have been cleaned"
    assert not r1.exists(), "repo-deadbeef should have been cleaned"

    # Preserved paths
    assert repos_container.exists(), "codesage-repos container directory should be preserved"
    assert unrelated_dir.exists(), "unrelated directory must not be deleted"
    assert unrelated_file.exists(), "unrelated file must not be deleted"


def test_system_path_protection():
    """Verify that safe_cleanup_workspace refuses to delete root, system
    directories, cwd, and user home directory.
    """
    assert safe_cleanup_workspace("/") is False
    assert safe_cleanup_workspace("/etc") is False
    assert safe_cleanup_workspace("/bin") is False
    assert safe_cleanup_workspace("/usr") is False
    assert safe_cleanup_workspace(Path.cwd()) is False
    assert safe_cleanup_workspace(Path.home()) is False

    # Janitor given a system path must not delete it
    cleaned = cleanup_stale_workspaces(temp_dirs=["/etc"])
    assert cleaned == 0


def test_symlink_safety(tmp_path):
    """Verify that symlinks inside temporary workspace locations are unlinked
    without following into or deleting the underlying target files.
    """
    # Create target directory outside temporary root with valuable files
    valuable_dir = tmp_path / "my_precious_repo"
    valuable_dir.mkdir()
    precious_file = valuable_dir / "data.json"
    precious_file.write_text('{"secret": 42}')

    temp_root = tmp_path / "temp_root"
    temp_root.mkdir()

    # Create symlink pointing to valuable_dir
    symlink_verify = temp_root / "codesage-verify-symlink"
    symlink_verify.symlink_to(valuable_dir)

    repos_dir = temp_root / "codesage-repos"
    repos_dir.mkdir()
    symlink_repo = repos_dir / "repo-symlink"
    symlink_repo.symlink_to(valuable_dir)

    assert symlink_verify.is_symlink()
    assert symlink_repo.is_symlink()

    cleaned = cleanup_stale_workspaces(temp_dirs=[temp_root])
    assert cleaned == 2

    # Verify symlinks were deleted
    assert not symlink_verify.is_symlink()
    assert not symlink_verify.exists()
    assert not symlink_repo.is_symlink()
    assert not symlink_repo.exists()

    # Verify target directory and file remain completely intact!
    assert valuable_dir.exists()
    assert precious_file.exists()
    assert precious_file.read_text() == '{"secret": 42}'


def test_app_creation_triggers_startup_janitor(tmp_path, monkeypatch):
    """Verify that create_app invokes cleanup_stale_workspaces automatically."""
    monkeypatch.setattr("tempfile.gettempdir", lambda: str(tmp_path))

    stale_verify = tmp_path / "codesage-verify-startup-test"
    stale_verify.mkdir()
    (stale_verify / "test.txt").write_text("stale")
    assert stale_verify.exists()

    app = create_app()
    assert not stale_verify.exists(), "stale workspace should be cleaned during create_app()"
