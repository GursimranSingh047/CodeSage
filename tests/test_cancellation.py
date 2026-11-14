"""Tests for Backend Phase 8: Safe Scan Cancellation.

Verifies:
1. Cancel running scan stops execution and transitions status to 'cancelled'.
2. Cancel before pipeline starts halts immediately without executing any nodes.
3. Cancel between findings stops new finding processing and preserves completed findings.
4. Cancel after verification but before PR prevents GitHub PR creation.
5. Cancel already completed scan returns idempotent response without altering status.
6. Cancellation cleanup reliably removes temporary workspaces while preserving local repos.
7. Cancellation persistence preserves the 'cancelled' state in durable storage.
"""

import json
import os
import shutil
import tempfile
import threading
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from codesage.ingestion import RepoWorkspace, safe_cleanup_workspace
from codesage.llm import MockLLM
from codesage.persistence import ScanStorage
from codesage.pipeline import (
    PipelineCancelled,
    PipelineConfig,
    build_pipeline,
)
from codesage.schemas import Finding, Patch, VerificationResult
from codesage.server import ScanRequest, ScanRun, create_app, _run_scan


@pytest.fixture
def local_repo_fixture(tmp_path):
    repo = tmp_path / "cancel_test_repo"
    repo.mkdir()
    (repo / "app.py").write_text("import os\nos.system('ping')\n")
    return repo


# ---------------------------------------------------------------------------
# 1. Cancel running scan
# ---------------------------------------------------------------------------

def test_cancel_running_scan(local_repo_fixture):
    """Test cancelling an actively running scan via POST /scan/{id}/cancel."""
    triage_started = threading.Event()
    scan_may_resume = threading.Event()

    def slow_responder(system, user):
        triage_started.set()
        scan_may_resume.wait(timeout=10)
        return json.dumps({
            "finding_id": "x",
            "is_real_vulnerability": False,
            "confidence": 0.5,
            "cwe_confirmed": "CWE-0",
            "exploitability": "low",
            "reasoning": "slow",
        })

    def factory(req: ScanRequest) -> PipelineConfig:
        return PipelineConfig(
            repo_input=str(local_repo_fixture),
            llm=MockLLM(responder=slow_responder),
            scanners=("semgrep",),
        )

    monkeypatch_obj = pytest.MonkeyPatch()
    monkeypatch_obj.setenv("CODESAGE_ALLOW_LOCAL_PATHS", "1")
    monkeypatch_obj.setenv("CODESAGE_ALLOWED_LOCAL_DIR", str(local_repo_fixture.parent))

    try:
        app = create_app(config_factory=factory)
        with TestClient(app) as client:
            resp = client.post("/scan", json={"repo_url": str(local_repo_fixture)})
            assert resp.status_code == 200
            scan_id = resp.json()["scan_id"]

            # Wait until scan enters pipeline execution
            assert triage_started.wait(timeout=10), "Scan did not reach triage node"

            # Request cancellation
            cancel_resp = client.post(f"/scan/{scan_id}/cancel")
            assert cancel_resp.status_code == 200
            assert cancel_resp.json()["status"] == "cancelled"
            assert cancel_resp.json()["cancelled"] is True

            # Allow slow responder to unblock so pipeline loop evaluates cancellation
            scan_may_resume.set()

            # Poll for final status
            deadline = time.time() + 5
            final_status = None
            while time.time() < deadline:
                st = client.get(f"/scan/{scan_id}/status").json()
                if st["status"] == "cancelled":
                    final_status = "cancelled"
                    break
                time.sleep(0.1)

            assert final_status == "cancelled"

            # Verify cancellation event
            events = client.get(f"/scan/{scan_id}/events").json()["events"]
            assert any(e["type"] == "cancelled" for e in events)
    finally:
        scan_may_resume.set()
        monkeypatch_obj.undo()


# ---------------------------------------------------------------------------
# 2. Cancel before pipeline starts
# ---------------------------------------------------------------------------

def test_cancel_before_pipeline_starts(local_repo_fixture, tmp_path):
    """Test cancellation requested prior to _run_scan entering pipeline execution."""
    storage = ScanStorage(storage_dir=tmp_path / "scans")
    run = ScanRun("cancel-early", str(local_repo_fixture))
    config = PipelineConfig(
        repo_input=str(local_repo_fixture),
        llm=MockLLM(responder=lambda s, u: "{}"),
    )

    # Cancel before execution
    run.request_cancel()
    assert run.is_cancelled is True

    # Run should exit immediately without running the pipeline
    _run_scan(run, config, storage)

    assert run.status == "cancelled"
    assert any(e["type"] == "cancelled" for e in run._events)
    loaded = storage.load_run("cancel-early")
    assert loaded["status"] == "cancelled"


# ---------------------------------------------------------------------------
# 3. Cancel between findings
# ---------------------------------------------------------------------------

def test_cancel_between_findings(tmp_path):
    """Test cancellation between findings prevents processing of subsequent findings."""
    f1 = Finding(
        id="finding-1",
        file_path="app.py",
        line_number=1,
        cwe_id="CWE-78",
        severity="high",
        tool_source="semgrep",
        raw_message="command injection",
        code_snippet="os.system('x')",
    )
    f2 = Finding(
        id="finding-2",
        file_path="app.py",
        line_number=2,
        cwe_id="CWE-89",
        severity="high",
        tool_source="semgrep",
        raw_message="sql injection",
        code_snippet="cursor.execute('x')",
    )

    processed = []
    cancelled_flag = threading.Event()

    def responder(system, user):
        if not processed:
            processed.append("f1")
            # Trigger cancellation after finding 1 is processed
            cancelled_flag.set()
            return json.dumps({
                "finding_id": f1.id,
                "is_real_vulnerability": False,
                "confidence": 0.5,
                "cwe_confirmed": "CWE-78",
                "exploitability": "low",
                "reasoning": "fp",
            })
        processed.append("f2")
        return json.dumps({
            "finding_id": f2.id,
            "is_real_vulnerability": False,
            "confidence": 0.5,
            "cwe_confirmed": "CWE-89",
            "exploitability": "low",
            "reasoning": "fp",
        })

    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "app.py").write_text("os.system('x')\ncursor.execute('x')\n")

    monkeypatch_obj = pytest.MonkeyPatch()
    monkeypatch_obj.setenv("CODESAGE_ALLOW_LOCAL_PATHS", "1")
    monkeypatch_obj.setenv("CODESAGE_ALLOWED_LOCAL_DIR", str(tmp_path.parent))
    monkeypatch_obj.setattr("codesage.pipeline.scan_repo", lambda p, scanners=(): [f1, f2])

    try:
        config = PipelineConfig(
            repo_input=str(repo),
            llm=MockLLM(responder=responder),
            is_cancelled=lambda: cancelled_flag.is_set(),
        )

        app = build_pipeline(config)
        initial = {
            "repo_url": str(repo),
            "repo_path": str(repo),
            "findings": [],
            "completed_findings": [],
            "retry_count": 0,
        }

        # Running app.stream should raise PipelineCancelled when trying to process finding 2
        with pytest.raises(PipelineCancelled, match="Scan cancelled before"):
            for chunk in app.stream(initial, stream_mode="updates"):
                pass

        assert "f1" in processed
        assert "f2" not in processed
    finally:
        monkeypatch_obj.undo()


# ---------------------------------------------------------------------------
# 4. Cancel after verification but before PR
# ---------------------------------------------------------------------------

def test_cancel_after_verification_before_pr(tmp_path):
    """Test cancellation after a patch passes verification prevents PR creation."""
    f = Finding(
        id="finding-pr",
        file_path="app.py",
        line_number=1,
        cwe_id="CWE-78",
        severity="high",
        tool_source="semgrep",
        raw_message="command injection",
        code_snippet="os.system('x')",
    )
    repo = tmp_path / "repo_pr"
    repo.mkdir()
    (repo / "app.py").write_text("os.system('x')\n")

    cancelled_flag = threading.Event()
    pr_called = threading.Event()

    class FakePRRepo:
        default_branch = "main"

        def create_pull(self, *args, **kwargs):
            pr_called.set()
            return MagicMock(html_url="https://github.com/fake/pr/1", number=1)

    # Cancel flag is set after verification passes
    def check_cancel():
        return cancelled_flag.is_set()

    config = PipelineConfig(
        repo_input=str(repo),
        llm=MockLLM(responder=lambda s, u: '{"finding_id": "finding-pr", "is_real_vulnerability": true, "confidence": 0.9, "cwe_confirmed": "CWE-78", "reasoning": "real"}'),
        github_repo="owner/repo",
        is_cancelled=check_cancel,
    )

    app = build_pipeline(config)

    # Cancel right before pr node
    cancelled_flag.set()

    # pr_node should abort without calling GitHub
    from codesage.pipeline import PipelineState

    state: PipelineState = {
        "current_finding": f,
        "patch": Patch(
            finding_id=f.id,
            original_code="os.system('x')",
            patched_code="pass",
            explanation="fixed",
            attempt_number=1,
        ),
        "triage_result": SimpleNamespace(confidence=0.9, cwe_confirmed="CWE-78", reasoning="real"),
        "verification_result": VerificationResult(finding_id=f.id, scan_clean=True, tests_passed=True, passed=True),
        "completed_findings": [],
    }

    # Verify that pr_node raises PipelineCancelled
    pr_node = app.nodes["pr"]
    with pytest.raises(PipelineCancelled, match="cancelled before PR"):
        pr_node.invoke(state)

    assert not pr_called.is_set(), "PR creation must never be invoked if cancelled"


# ---------------------------------------------------------------------------
# 5. Cancel already completed scan
# ---------------------------------------------------------------------------

def test_cancel_already_completed_scan(tmp_path):
    """Test that cancelling a completed scan is idempotent and returns cancelled=False."""
    storage = ScanStorage(storage_dir=tmp_path / "scans")
    app = create_app(storage=storage)
    with TestClient(app) as client:
        # Non-existent scan should be 404
        assert client.post("/scan/non-existent-scan-xyz/cancel").status_code == 404

        # Save an already-completed run
        scan_id = "completed-scan-123"
        run = ScanRun(scan_id, str(tmp_path))
        run.status = "complete"
        storage.save_run(run.to_dict())

        # Now cancel via API
        resp = client.post(f"/scan/{scan_id}/cancel")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "complete"
        assert data["cancelled"] is False
        assert "already complete" in data["message"].lower()


# ---------------------------------------------------------------------------
# 6. Cancellation cleanup & local repo preservation
# ---------------------------------------------------------------------------

def test_cancellation_cleanup_removes_temp_workspace(tmp_path):
    """Verify that cancelled scans clean up temporary workspaces and preserve local repos."""
    storage = ScanStorage(storage_dir=tmp_path / "scans")

    # A) Temporary workspace should be cleaned up on cancellation
    temp_workspace_dir = tmp_path / "codesage-verify-cancel-test"
    temp_workspace_dir.mkdir()
    (temp_workspace_dir / "file.py").write_text("temp")

    ws = RepoWorkspace(temp_workspace_dir, is_temporary=True)
    run_temp = ScanRun("scan-temp-cancel", str(temp_workspace_dir))
    run_temp.workspace = ws
    run_temp.repo_path = str(temp_workspace_dir)

    run_temp.request_cancel()
    _run_scan(run_temp, PipelineConfig(repo_input=str(temp_workspace_dir), llm=MockLLM(responder=lambda s, u: "{}")), storage)

    assert not temp_workspace_dir.exists(), "Temporary workspace should be cleaned up after cancellation"

    # B) User local repository MUST NOT be deleted
    local_user_repo = tmp_path / "user_project"
    local_user_repo.mkdir()
    (local_user_repo / "main.py").write_text("print('preserve me')")

    ws_local = RepoWorkspace(local_user_repo, is_temporary=False)
    run_local = ScanRun("scan-local-cancel", str(local_user_repo))
    run_local.workspace = ws_local
    run_local.repo_path = str(local_user_repo)

    run_local.request_cancel()
    _run_scan(run_local, PipelineConfig(repo_input=str(local_user_repo), llm=MockLLM(responder=lambda s, u: "{}")), storage)

    assert local_user_repo.exists(), "User local repository MUST NEVER be deleted upon cancellation"
    assert (local_user_repo / "main.py").read_text() == "print('preserve me')"


# ---------------------------------------------------------------------------
# 7. Cancellation persistence
# ---------------------------------------------------------------------------

def test_cancellation_persistence(tmp_path):
    """Verify that cancelled state is persisted to disk and accurately reloaded."""
    storage = ScanStorage(storage_dir=tmp_path / "scans")
    run = ScanRun("persist-cancel", "https://github.com/owner/repo")
    run.request_cancel()

    config = PipelineConfig(
        repo_input="https://github.com/owner/repo",
        llm=MockLLM(responder=lambda s, u: "{}"),
    )

    _run_scan(run, config, storage)

    assert run.status == "cancelled"
    disk_data = storage.load_run("persist-cancel")
    assert disk_data is not None
    assert disk_data["status"] == "cancelled"
    assert disk_data["finished"] is not None

    # Verify hydration into a new ScanRun instance
    rehydrated = ScanRun.from_dict(disk_data)
    assert rehydrated.status == "cancelled"
    assert rehydrated.id == "persist-cancel"
