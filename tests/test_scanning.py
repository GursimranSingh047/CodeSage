"""Tests for scan_repo orchestration and an end-to-end scan of test-target-repo.

The end-to-end tests need real scanner binaries; each skips gracefully when
its binary is absent so the suite stays usable on machines without them.
"""

import shutil
from pathlib import Path

import pytest

import codesage.scanning as scanning
from codesage.schemas import Finding
from codesage.scanning import ScannerError, scan_repo

REPO_ROOT = Path(__file__).resolve().parent.parent
TEST_TARGET = REPO_ROOT / "test-target-repo"

SEMGREP_AVAILABLE = scanning.find_binary("semgrep", "SEMGREP_BIN") is not None
BANDIT_AVAILABLE = scanning.find_binary("bandit", "BANDIT_BIN") is not None
GITLEAKS_AVAILABLE = scanning.find_binary("gitleaks", "GITLEAKS_BIN") is not None


def test_scan_repo_missing_repo_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        scan_repo(tmp_path / "nope")


def test_scan_repo_skips_scanner_that_crashes(tmp_path, monkeypatch):
    # design.md section 6: a crashing scanner is skipped, the others continue.
    def boom(_repo):
        raise ScannerError("simulated crash")

    def fake_gitleaks(_repo):
        return [{
            "RuleID": "generic-api-key", "File": "payments.py", "StartLine": 10,
            "Match": 'KEY = "sk_live_x"',
        }]

    monkeypatch.setitem(scanning._RUNNERS, "bandit", boom)
    monkeypatch.setitem(scanning._RUNNERS, "gitleaks", fake_gitleaks)

    findings = scan_repo(tmp_path, scanners=("bandit", "gitleaks"))
    assert len(findings) == 1
    assert findings[0].tool_source == "gitleaks"


def test_scan_repo_skips_scanner_without_binary(tmp_path, monkeypatch):
    monkeypatch.setattr(scanning, "find_binary", lambda name, env: None)
    findings = scan_repo(tmp_path, scanners=("semgrep", "bandit", "gitleaks"))
    assert findings == []


def test_scan_repo_survives_malformed_raw_results(tmp_path, monkeypatch):
    monkeypatch.setitem(scanning._RUNNERS, "bandit", lambda _r: [{"garbage": True}])
    findings = scan_repo(tmp_path, scanners=("bandit",))
    assert findings == []  # logged and dropped, scan still completes


@pytest.mark.skipif(not SEMGREP_AVAILABLE, reason="semgrep not installed")
def test_semgrep_catches_planted_vulnerabilities():
    findings = scan_repo(TEST_TARGET, scanners=("semgrep",))
    by_file = {f.file_path for f in findings}
    assert findings, "semgrep returned no findings"

    assert any(f.id.startswith("semgrep:shop.py") for f in findings), \
        "V1 SQL injection not detected"
    assert any(f.id.startswith("semgrep:tasks.py") for f in findings), \
        "V4 pickle deserialization not detected"
    assert any(f.id.startswith("semgrep:admin.py") for f in findings), \
        "V6 command injection not detected"
    assert any(f.id.startswith("semgrep:files.py") for f in findings), \
        "V5 path traversal not detected"
    assert any(f.id.startswith("semgrep:payments.py") for f in findings), \
        "V2 hardcoded key not detected"
    assert any(f.id.startswith("semgrep:main.py") for f in findings), \
        "V7 wildcard CORS not detected"

    assert "test-target-repo" not in " ".join(by_file)  # paths stay repo-relative
    assert all(f.tool_source == "semgrep" for f in findings)
    assert all(f.cwe_id and f.cwe_id.startswith("CWE-") for f in findings)


@pytest.mark.skipif(not BANDIT_AVAILABLE, reason="bandit not installed")
def test_bandit_catches_planted_vulnerabilities():
    findings = scan_repo(TEST_TARGET, scanners=("bandit",))
    ids = {f.id for f in findings}
    assert findings, "bandit returned no findings"

    assert any(":B608" in i for i in ids), "V1 SQL injection (B608) not detected"
    assert any(":B301" in i for i in ids), "V4 pickle deserialization (B301) not detected"
    assert any(":B605" in i for i in ids), "V6 os.system (B605) not detected"
    assert all("venv" not in f.file_path for f in findings), "venv must be excluded"


@pytest.mark.skipif(not GITLEAKS_AVAILABLE, reason="gitleaks binary not installed")
def test_gitleaks_catches_hardcoded_key():
    findings = scan_repo(TEST_TARGET, scanners=("gitleaks",))
    assert any(
        f.file_path == "payments.py" and f.tool_source == "gitleaks"
        for f in findings
    ), "V2 hardcoded API key not detected by gitleaks"
    assert all("venv" not in f.file_path for f in findings)


@pytest.mark.skipif(
    not (SEMGREP_AVAILABLE and BANDIT_AVAILABLE and GITLEAKS_AVAILABLE),
    reason="not all scanner binaries installed",
)
def test_full_scan_unified_schema():
    findings = scan_repo(TEST_TARGET)
    assert len(findings) >= 5

    ids = [f.id for f in findings]
    assert len(ids) == len(set(ids)), "finding ids must be unique"

    tools = {f.tool_source for f in findings}
    assert tools == {"semgrep", "bandit", "gitleaks"}

    for finding in findings:
        assert isinstance(finding, Finding)
        assert finding.severity in {"low", "medium", "high", "critical"}
        assert not finding.file_path.startswith("/")
        assert finding.line_number >= 1 or finding.tool_source == "gitleaks"

    # Ground-truth coverage across tools (VULNERABILITIES.md V1-V8):
    # caught: V1, V2, V4, V5, V6, V7 — V3 (plaintext auth) and V8 (dep pins)
    # are expected misses for these three tools and will show up as recall
    # gaps in the Module 10 metrics.
    flagged_files = {f.file_path for f in findings}
    for expected in ("shop.py", "payments.py", "tasks.py", "files.py", "admin.py", "main.py"):
        assert expected in flagged_files, f"{expected} finding missing"
    assert "auth.py" not in flagged_files  # documents the known miss (V3)
