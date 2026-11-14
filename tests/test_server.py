"""Tests for Module 9: FastAPI backend + WebSocket event streaming.

Runs the real graph (Module 8) over the small os.system fixture repo with a
scripted LLM and the local verifier backend — same machinery as production,
no network needed.
"""

import json
import os
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from codesage.context import extract_code_context
from codesage.llm import MockLLM
from codesage.pipeline import PipelineConfig
from codesage.scanning import scan_repo
from codesage.server import ScanRequest, create_app
from codesage.verification import LocalBackend

APP_PY = '''"""Demo utilities."""
import os


def announce(msg: str) -> int:
    """Broadcast a message through the shell."""
    return os.system(f"echo {msg}")
'''

CONFTEST_PY = (
    "import os\nimport sys\n\n"
    "sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))\n"
)

TEST_APP_PY = '''from app import announce


def test_announce_returns_zero():
    assert announce("hello") == 0
'''


@pytest.fixture(scope="module")
def fixture_repo(tmp_path_factory):
    repo = tmp_path_factory.mktemp("server-fixture")
    (repo / "conftest.py").write_text(CONFTEST_PY, encoding="utf-8")
    (repo / "app.py").write_text(APP_PY, encoding="utf-8")
    (repo / "requirements.txt").write_text("# none\n", encoding="utf-8")
    tests_dir = repo / "tests"
    tests_dir.mkdir()
    (tests_dir / "test_app.py").write_text(TEST_APP_PY, encoding="utf-8")
    return repo


def _factory_for(repo: Path):
    finding = scan_repo(repo, scanners=("semgrep",))[0]
    context = extract_code_context(finding, repo)
    good_body = context.enclosing_function.replace(
        'return os.system(f"echo {msg}")',
        'import subprocess\n    return subprocess.run(["echo", msg], check=False).returncode',
    )

    def responder(system, user):
        if "reviewing static analysis findings" in system:
            return json.dumps({
                "finding_id": "x", "is_real_vulnerability": "at app.py" in user,
                "confidence": 0.9, "reasoning": "scripted", "cwe_confirmed": "CWE-0",
                "exploitability": "high",
            })
        span = user.split("Original function:\n", 1)[1]
        span = span.split("\n\nYour previous patch attempt failed verification", 1)[0].rstrip()
        body = good_body if 'os.system(f"echo {msg}")' in span else span
        return json.dumps({
            "finding_id": "x", "original_code": "ignored", "patched_code": body,
            "explanation": "scripted fix", "attempt_number": 1,
        })

    def factory(req: ScanRequest):
        return PipelineConfig(
            repo_input=str(repo), llm=MockLLM(responder=responder),
            backend=LocalBackend(), scanners=("semgrep",),
        )

    return factory


@pytest.fixture(scope="module")
def client(fixture_repo):
    old_allow = os.environ.get("CODESAGE_ALLOW_LOCAL_PATHS")
    old_root = os.environ.get("CODESAGE_ALLOWED_LOCAL_DIR")
    os.environ["CODESAGE_ALLOW_LOCAL_PATHS"] = "1"
    os.environ["CODESAGE_ALLOWED_LOCAL_DIR"] = str(fixture_repo.parent)
    try:
        app = create_app(config_factory=_factory_for(fixture_repo))
        with TestClient(app) as test_client:
            yield test_client, fixture_repo
    finally:
        if old_allow is not None:
            os.environ["CODESAGE_ALLOW_LOCAL_PATHS"] = old_allow
        else:
            os.environ.pop("CODESAGE_ALLOW_LOCAL_PATHS", None)
        if old_root is not None:
            os.environ["CODESAGE_ALLOWED_LOCAL_DIR"] = old_root
        else:
            os.environ.pop("CODESAGE_ALLOWED_LOCAL_DIR", None)


def _start_scan(test_client, fixture_repo) -> str:
    resp = test_client.post("/scan", json={"repo_url": str(fixture_repo)})
    assert resp.status_code == 200
    return resp.json()["scan_id"]


def _wait_complete(test_client, scan_id, timeout=120) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        payload = test_client.get(f"/scan/{scan_id}/status").json()
        if payload["status"] == "complete":
            return payload
        if payload["status"] == "failed":
            raise AssertionError(f"scan failed: {payload.get('error')}")
        time.sleep(0.3)
    raise AssertionError(f"scan did not complete within {timeout}s")


def test_scan_unknown_repo_returns_400(client):
    test_client, _ = client
    resp = test_client.post("/scan", json={"repo_url": "/does/not/exist"})
    assert resp.status_code == 400


def test_unknown_scan_id_is_404(client):
    test_client, _ = client
    assert test_client.get("/scan/deadbeef/status").status_code == 404
    assert test_client.get("/scan/deadbeef/findings").status_code == 404


def test_full_scan_streams_expected_event_sequence(client):
    test_client, fixture_repo = client
    scan_id = _start_scan(test_client, fixture_repo)

    status = _wait_complete(test_client, scan_id)
    assert status["counts"] == {"verified_pr_skipped": 1}

    events = test_client.get(f"/scan/{scan_id}/events").json()["events"]
    types = [e["type"] for e in events]
    assert types[0] == "run_started"
    assert "findings_discovered" in types
    assert types[-1] == "run_complete"

    # exact choreography for one finding: every node activates then completes,
    # in architecture.md pipeline order
    stages = [(e["stage"], e["status"]) for e in events if e["type"] == "stage"]
    assert stages == [
        ("ingestion", "done"),
        ("scanning", "active"), ("scanning", "done"),
        ("context", "active"), ("context", "done"),
        ("triage", "active"), ("triage", "done"),
        ("patch", "active"), ("patch", "done"),
        ("verify", "active"), ("verify", "done"),
        ("pr", "active"), ("pr", "done"),
    ]

    done_events = [e for e in events if e["type"] == "finding_done"]
    assert len(done_events) == 1
    assert done_events[0]["status"] == "verified_pr_skipped"
    # architecture.md baseline fields: stage-level events carry {finding_id,
    # stage, ts}; run-level stages (before any finding exists) omit finding_id
    stage_events = [e for e in events if e["type"] == "stage"]
    assert all({"stage", "ts"} <= set(e) for e in stage_events)
    assert all(
        "finding_id" in e
        for e in stage_events
        if e["stage"] not in ("ingestion", "scanning")
    )

    # retry event must NOT appear on a first-attempt pass
    assert not [e for e in events if e["type"] == "retry"]


def test_completed_findings_and_artifacts(client):
    test_client, fixture_repo = client
    scan_id = _start_scan(test_client, fixture_repo)
    _wait_complete(test_client, scan_id)

    findings = test_client.get(f"/scan/{scan_id}/findings").json()
    assert findings["current_finding"] is None
    assert len(findings["completed"]) == 1
    finding_id = findings["completed"][0]["finding_id"]

    artifacts = test_client.get(
        f"/scan/{scan_id}/findings/{finding_id}/artifacts"
    ).json()
    assert artifacts["triage"]["is_real_vulnerability"] is True
    assert "patched_code" in artifacts["patch"]
    assert artifacts["verification"]["passed"] is True
    assert "enclosing_function" in artifacts["context"]
    assert test_client.get(
        f"/scan/{scan_id}/findings/nope/artifacts"
    ).status_code == 404


def test_websocket_replays_history_and_streams_live(client):
    test_client, fixture_repo = client
    scan_id = _start_scan(test_client, fixture_repo)
    _wait_complete(test_client, scan_id)  # finish BEFORE connecting: replay path

    with test_client.websocket_connect(f"/ws/{scan_id}") as ws:
        events = []
        while True:
            event = ws.receive_json()
            events.append(event)
            if event["type"] == "run_complete":
                break

    types = [e["type"] for e in events]
    assert types[0] == "run_started"          # replay includes pre-connect history
    assert types[-1] == "run_complete"
    assert "finding_done" in types
