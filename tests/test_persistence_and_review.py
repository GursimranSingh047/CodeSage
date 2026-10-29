"""Tests for durable persistence and human review API endpoints."""

import json
from pathlib import Path
from fastapi.testclient import TestClient
import pytest

from codesage.persistence import ScanStorage
from codesage.server import ScanRequest, create_app


def test_scan_storage_save_and_load(tmp_path):
    storage = ScanStorage(storage_dir=tmp_path)
    run_data = {
        "id": "scan-123",
        "repo_url": "https://github.com/org/repo",
        "status": "complete",
        "started": 1000.0,
        "finished": 1020.0,
        "error": None,
        "completed": [{"finding_id": "f1", "status": "verified"}],
        "artifacts": {"f1": {"triage": {"is_real": True}}},
        "events": [{"type": "run_started"}],
    }
    saved_path = storage.save_run(run_data)
    assert saved_path.is_file()

    loaded = storage.load_run("scan-123")
    assert loaded is not None
    assert loaded["id"] == "scan-123"
    assert loaded["status"] == "complete"
    assert len(loaded["completed"]) == 1


def test_scan_storage_list_runs(tmp_path):
    storage = ScanStorage(storage_dir=tmp_path)
    storage.save_run({"id": "s1", "started": 10.0})
    storage.save_run({"id": "s2", "started": 50.0})
    storage.save_run({"id": "s3", "started": 30.0})

    runs = storage.list_runs()
    assert [r["id"] for r in runs] == ["s2", "s3", "s1"]


def test_human_review_endpoints(tmp_path):
    storage = ScanStorage(storage_dir=tmp_path)
    app = create_app(storage=storage)
    client = TestClient(app)

    # Seed a run with a needs_human_review finding
    run_id = "rev-scan-1"
    storage.save_run({
        "id": run_id,
        "repo_url": "/fake/repo",
        "status": "complete",
        "started": 100.0,
        "finished": 120.0,
        "completed": [
            {
                "finding_id": "bandit:app.py:10:B608",
                "status": "needs_human_review",
                "cwe_id": "CWE-89",
                "failure_reason": "test suite failed in sandbox",
            },
            {
                "finding_id": "bandit:app.py:20:B605",
                "status": "verified",
                "cwe_id": "CWE-78",
            },
        ],
        "artifacts": {},
        "events": [],
    })

    # Test GET /scan/{id}/human-review
    res = client.get(f"/scan/{run_id}/human-review")
    assert res.status_code == 200
    data = res.json()
    assert data["count"] == 1
    assert data["findings"][0]["finding_id"] == "bandit:app.py:10:B608"

    # Test POST /scan/{id}/findings/{fid}/review with invalid decision
    bad_res = client.post(
        f"/scan/{run_id}/findings/bandit:app.py:10:B608/review",
        json={"decision": "maybe"},
    )
    assert bad_res.status_code == 400

    # Test POST /scan/{id}/findings/{fid}/review with valid approval
    ok_res = client.post(
        f"/scan/{run_id}/findings/bandit:app.py:10:B608/review",
        json={"decision": "approved", "notes": "LGTM manually inspected"},
    )
    assert ok_res.status_code == 200
    assert ok_res.json()["review_status"] == "approved"

    # Verify persistence updated
    reloaded = storage.load_run(run_id)
    finding_entry = next(f for f in reloaded["completed"] if f["finding_id"] == "bandit:app.py:10:B608")
    assert finding_entry["review_status"] == "approved"
    assert finding_entry["review_notes"] == "LGTM manually inspected"
