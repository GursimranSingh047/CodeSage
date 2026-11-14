"""Tests for Phase 9: Incremental Scanning Integration in pipeline and server."""

import json
from pathlib import Path
import pytest

from codesage.llm import MockLLM
from codesage.persistence import ScanStorage
from codesage.pipeline import (
    PipelineConfig,
    _validate_incremental_data,
    build_pipeline,
)
from codesage.schemas import Finding
from codesage.scanning import compute_file_hashes
from codesage.server import ScanRun, _run_scan
from codesage.verification import LocalBackend


def _dummy_finding(fid: str, fpath: str, line: int = 1) -> Finding:
    return Finding(
        id=fid,
        file_path=fpath,
        line_number=line,
        cwe_id="CWE-78",
        severity="high",
        tool_source="bandit",
        raw_message="dummy message",
        code_snippet="os.system('test')",
    )


def _mock_llm():
    def responder(system, user):
        return json.dumps({
            "finding_id": "x",
            "is_real_vulnerability": False,
            "confidence": 0.8,
            "reasoning": "mock",
            "cwe_confirmed": "CWE-0",
            "exploitability": "low",
        })
    return MockLLM(responder=responder)


# ---------------------------------------------------------------------------
# 1. First scan -> full scan
# ---------------------------------------------------------------------------

def test_first_scan_performs_full_scan(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "app.py").write_text("import os\nos.system('echo hi')\n", encoding="utf-8")

    config = PipelineConfig(
        repo_input=str(repo),
        llm=_mock_llm(),
        backend=LocalBackend(),
        scanners=("bandit",),
        previous_hashes=None,
        previous_findings=None,
    )
    app = build_pipeline(config)
    initial = {
        "repo_url": str(repo),
        "findings": [],
        "completed_findings": [],
        "retry_count": 0,
    }
    events = list(app.stream(initial, stream_mode="updates"))
    scanning_delta = None
    for chunk in events:
        if "scanning" in chunk:
            scanning_delta = chunk["scanning"]
            break

    assert scanning_delta is not None
    assert "file_hashes" in scanning_delta
    assert "app.py" in scanning_delta["file_hashes"]
    assert any(f.file_path == "app.py" for f in scanning_delta["findings"])


# ---------------------------------------------------------------------------
# 2. Unchanged repository -> skipped files (no scanners invoked)
# ---------------------------------------------------------------------------

def test_unchanged_repo_skips_files(tmp_path, monkeypatch):
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "app.py").write_text("import os\nos.system('echo hi')\n", encoding="utf-8")

    initial_hashes = compute_file_hashes(repo)
    cached_finding = _dummy_finding("bandit:app.py:2:B605", "app.py", 2)

    def fail_if_scan_repo_called(*args, **kwargs):
        pytest.fail("scan_repo should NOT be called when repository is completely unchanged!")

    monkeypatch.setattr("codesage.pipeline.scan_repo", fail_if_scan_repo_called)

    config = PipelineConfig(
        repo_input=str(repo),
        llm=_mock_llm(),
        backend=LocalBackend(),
        scanners=("bandit",),
        previous_hashes=initial_hashes,
        previous_findings=[cached_finding],
    )
    app = build_pipeline(config)
    initial = {
        "repo_url": str(repo),
        "findings": [],
        "completed_findings": [],
        "retry_count": 0,
    }
    events = list(app.stream(initial, stream_mode="updates"))
    scanning_delta = None
    for chunk in events:
        if "scanning" in chunk:
            scanning_delta = chunk["scanning"]
            break

    assert scanning_delta is not None
    assert len(scanning_delta["findings"]) == 1
    assert scanning_delta["findings"][0].id == cached_finding.id
    assert scanning_delta["file_hashes"] == initial_hashes


# ---------------------------------------------------------------------------
# 3. Changed files -> rescanned
# ---------------------------------------------------------------------------

def test_changed_files_rescanned(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "a.py").write_text("import os\nos.system('echo a')\n", encoding="utf-8")
    (repo / "b.py").write_text("def safe(): return 42\n", encoding="utf-8")

    initial_hashes = compute_file_hashes(repo)
    cached_finding_a = _dummy_finding("bandit:a.py:2:B605", "a.py", 2)

    # Now modify b.py to introduce a vulnerability
    (repo / "b.py").write_text("import os\nos.system('echo b')\n", encoding="utf-8")

    config = PipelineConfig(
        repo_input=str(repo),
        llm=_mock_llm(),
        backend=LocalBackend(),
        scanners=("bandit",),
        previous_hashes=initial_hashes,
        previous_findings=[cached_finding_a],
    )
    app = build_pipeline(config)
    initial = {
        "repo_url": str(repo),
        "findings": [],
        "completed_findings": [],
        "retry_count": 0,
    }
    events = list(app.stream(initial, stream_mode="updates"))
    scanning_delta = None
    for chunk in events:
        if "scanning" in chunk:
            scanning_delta = chunk["scanning"]
            break

    assert scanning_delta is not None
    findings = scanning_delta["findings"]
    # a.py finding is retained from cache
    assert any(f.file_path == "a.py" and f.id == cached_finding_a.id for f in findings)
    # b.py is rescanned and newly discovered
    assert any(f.file_path == "b.py" for f in findings)
    assert scanning_delta["file_hashes"]["b.py"] != initial_hashes["b.py"]


# ---------------------------------------------------------------------------
# 4. Deleted files -> findings removed
# ---------------------------------------------------------------------------

def test_deleted_files_removes_findings(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "a.py").write_text("import os\nos.system('echo a')\n", encoding="utf-8")
    (repo / "b.py").write_text("import os\nos.system('echo b')\n", encoding="utf-8")

    initial_hashes = compute_file_hashes(repo)
    cached_a = _dummy_finding("bandit:a.py:2:B605", "a.py", 2)
    cached_b = _dummy_finding("bandit:b.py:2:B605", "b.py", 2)

    # Delete b.py from disk
    (repo / "b.py").unlink()

    config = PipelineConfig(
        repo_input=str(repo),
        llm=_mock_llm(),
        backend=LocalBackend(),
        scanners=("bandit",),
        previous_hashes=initial_hashes,
        previous_findings=[cached_a, cached_b],
    )
    app = build_pipeline(config)
    initial = {
        "repo_url": str(repo),
        "findings": [],
        "completed_findings": [],
        "retry_count": 0,
    }
    events = list(app.stream(initial, stream_mode="updates"))
    scanning_delta = None
    for chunk in events:
        if "scanning" in chunk:
            scanning_delta = chunk["scanning"]
            break

    assert scanning_delta is not None
    findings = scanning_delta["findings"]
    assert len(findings) == 1
    assert findings[0].file_path == "a.py"
    assert "b.py" not in scanning_delta["file_hashes"]


# ---------------------------------------------------------------------------
# 5. Newly added files -> newly added files detected
# ---------------------------------------------------------------------------

def test_newly_added_files_detected(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "a.py").write_text("import os\nos.system('echo a')\n", encoding="utf-8")

    initial_hashes = compute_file_hashes(repo)
    cached_a = _dummy_finding("bandit:a.py:2:B605", "a.py", 2)

    # Add a brand new file with vulnerability
    (repo / "new.py").write_text("import os\nos.system('echo new')\n", encoding="utf-8")

    config = PipelineConfig(
        repo_input=str(repo),
        llm=_mock_llm(),
        backend=LocalBackend(),
        scanners=("bandit",),
        previous_hashes=initial_hashes,
        previous_findings=[cached_a],
    )
    app = build_pipeline(config)
    initial = {
        "repo_url": str(repo),
        "findings": [],
        "completed_findings": [],
        "retry_count": 0,
    }
    events = list(app.stream(initial, stream_mode="updates"))
    scanning_delta = None
    for chunk in events:
        if "scanning" in chunk:
            scanning_delta = chunk["scanning"]
            break

    assert scanning_delta is not None
    findings = scanning_delta["findings"]
    assert any(f.file_path == "a.py" for f in findings)
    assert any(f.file_path == "new.py" for f in findings)
    assert "new.py" in scanning_delta["file_hashes"]


# ---------------------------------------------------------------------------
# 6. Invalid hash state -> full scan
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "bad_hashes, bad_findings",
    [
        ({}, []),
        ("not_a_dict", []),
        ({"a.py": None}, []),
        ({"a.py": 12345}, []),
        ({"a.py": ""}, []),
        ({"a.py": "hash"}, "not_a_list"),
        ({"a.py": "hash"}, [{"corrupted": "bad"}]),
        ({"a.py": "hash"}, [None]),
    ],
)
def test_invalid_hash_state_falls_back_to_full_scan(tmp_path, bad_hashes, bad_findings):
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "a.py").write_text("import os\nos.system('echo test')\n", encoding="utf-8")

    # Validator directly rejects it
    assert _validate_incremental_data(bad_hashes, bad_findings) is None

    config = PipelineConfig(
        repo_input=str(repo),
        llm=_mock_llm(),
        backend=LocalBackend(),
        scanners=("bandit",),
        previous_hashes=bad_hashes if isinstance(bad_hashes, dict) else None,
        previous_findings=bad_findings if isinstance(bad_findings, list) else None,
    )
    app = build_pipeline(config)
    initial = {
        "repo_url": str(repo),
        "previous_hashes": bad_hashes if not isinstance(bad_hashes, dict) else bad_hashes,
        "previous_findings": bad_findings if not isinstance(bad_findings, list) else bad_findings,
        "findings": [],
        "completed_findings": [],
        "retry_count": 0,
    }
    events = list(app.stream(initial, stream_mode="updates"))
    scanning_delta = None
    for chunk in events:
        if "scanning" in chunk:
            scanning_delta = chunk["scanning"]
            break

    assert scanning_delta is not None
    assert "file_hashes" in scanning_delta
    assert "a.py" in scanning_delta["file_hashes"]
    # Findings discovered via full scan
    assert any(f.file_path == "a.py" for f in scanning_delta["findings"])


# ---------------------------------------------------------------------------
# 7. Incremental failure -> safe full-scan fallback
# ---------------------------------------------------------------------------

def test_incremental_failure_falls_back_to_full_scan(tmp_path, monkeypatch):
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "a.py").write_text("import os\nos.system('echo crash')\n", encoding="utf-8")

    initial_hashes = compute_file_hashes(repo)
    cached_a = _dummy_finding("bandit:a.py:2:B605", "a.py", 2)

    def simulated_failure(*args, **kwargs):
        raise RuntimeError("Simulated crash in scan_repo_incremental")

    monkeypatch.setattr("codesage.pipeline.scan_repo_incremental", simulated_failure)

    config = PipelineConfig(
        repo_input=str(repo),
        llm=_mock_llm(),
        backend=LocalBackend(),
        scanners=("bandit",),
        previous_hashes=initial_hashes,
        previous_findings=[cached_a],
    )
    app = build_pipeline(config)
    initial = {
        "repo_url": str(repo),
        "findings": [],
        "completed_findings": [],
        "retry_count": 0,
    }
    # Must NOT raise RuntimeError, but fall back to full scan
    events = list(app.stream(initial, stream_mode="updates"))
    scanning_delta = None
    for chunk in events:
        if "scanning" in chunk:
            scanning_delta = chunk["scanning"]
            break

    assert scanning_delta is not None
    assert any(f.file_path == "a.py" for f in scanning_delta["findings"])
    assert "a.py" in scanning_delta["file_hashes"]


# ---------------------------------------------------------------------------
# 8. Storage & Server End-to-End Integration
# ---------------------------------------------------------------------------

def test_storage_and_server_incremental_integration(tmp_path, monkeypatch):
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "app.py").write_text("import os\nos.system('echo first')\n", encoding="utf-8")

    storage = ScanStorage(storage_dir=tmp_path / "scans")

    # Run Scan 1: First scan
    scan1_id = "scan-1"
    run1 = ScanRun(scan1_id, str(repo))
    config1 = PipelineConfig(
        repo_input=str(repo),
        llm=_mock_llm(),
        backend=LocalBackend(),
        scanners=("bandit",),
    )
    _run_scan(run1, config1, storage)
    assert run1.status == "complete"
    assert "app.py" in run1.file_hashes

    # Verify run1 persisted to storage with file_hashes and findings
    persisted1 = storage.load_run(scan1_id)
    assert persisted1 is not None
    assert "app.py" in persisted1["file_hashes"]
    assert len(persisted1["findings"]) > 0

    # Run Scan 2: Unchanged repository. Should automatically load from storage.
    call_counts = {"scan_repo": 0}
    real_scan_repo = __import__("codesage.pipeline", fromlist=["scan_repo"]).scan_repo

    def counted_scan_repo(*args, **kwargs):
        call_counts["scan_repo"] += 1
        return real_scan_repo(*args, **kwargs)

    monkeypatch.setattr("codesage.pipeline.scan_repo", counted_scan_repo)

    scan2_id = "scan-2"
    run2 = ScanRun(scan2_id, str(repo))
    config2 = PipelineConfig(
        repo_input=str(repo),
        llm=_mock_llm(),
        backend=LocalBackend(),
        scanners=("bandit",),
    )
    _run_scan(run2, config2, storage)

    assert run2.status == "complete"
    # Unchanged repo -> scan_repo should NOT be called
    assert call_counts["scan_repo"] == 0
    assert len(run2.findings) == len(run1.findings)
    assert run2.file_hashes == run1.file_hashes
