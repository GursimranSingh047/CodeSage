"""End-to-End integration test suite covering all 15 required audit scenarios.

Scenarios:
 1. A repository with no findings
 2. A repository with a known vulnerability
 3. A finding classified as a false positive
 4. A genuine finding with a generated patch
 5. A patch that passes verification
 6. A patch that fails verification
 7. Retry exhaustion followed by human review
 8. Multiple findings in one repository
 9. A scanner that fails while another scanner succeeds
10. An LLM timeout or malformed response
11. An invalid repository URL
12. A repository containing files with unusual names
13. A missing test suite (inconclusive verification)
14. A Docker-unavailable scenario (clean fallback)
15. A GitHub API failure (rate limits / auth error mapping)
"""

import json
import os
import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch as mock_patch

import pytest

from codesage.ingestion import IngestionError, clone_repo
from codesage.llm import BaseLLM, LLMError, MockLLM
from codesage.patching import generate_patch
from codesage.pipeline import PipelineConfig, build_pipeline
from codesage.pr_agent import PRError, create_pull_request
from codesage.schemas import CodeContext, Finding, Patch, TriageResult, VerificationResult
from codesage.scanning import ScannerError, scan_repo
from codesage.triage import TriageError, triage_finding
from codesage.verification import (
    LocalBackend,
    PatchNotApplicable,
    VerificationError,
    Verifier,
    apply_patch_to_copy,
    get_backend,
    run_verification_loop,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
TEST_TARGET = REPO_ROOT / "test-target-repo"


def _make_finding(
    fid="test:app.py:10:B608",
    file_path="app.py",
    line=10,
    cwe="CWE-89",
    severity="high",
    tool="bandit",
    raw_message="SQL injection",
    code="query = f'SELECT * FROM x WHERE id={id}'",
):
    return Finding(
        id=fid,
        file_path=file_path,
        line_number=line,
        cwe_id=cwe,
        severity=severity,
        tool_source=tool,
        raw_message=raw_message,
        code_snippet=code,
    )


def _make_triage(finding, real=True, confidence=0.95):
    return TriageResult(
        finding_id=finding.id,
        is_real_vulnerability=real,
        confidence=confidence,
        reasoning="integration test assessment",
        cwe_confirmed=finding.cwe_id or "CWE-0",
        exploitability="high" if real else "low",
    )


def _run_pipeline_collect(config):
    app = build_pipeline(config)
    initial = {
        "repo_url": config.repo_input,
        "findings": [],
        "completed_findings": [],
        "retry_count": 0,
    }
    completed = []
    for chunk in app.stream(initial, stream_mode="updates"):
        for node, delta in chunk.items():
            if "completed_findings" in delta:
                completed = delta["completed_findings"]
    return completed


# ---------------------------------------------------------------------------
# Scenario 1: Repository with no findings
# ---------------------------------------------------------------------------
def test_scenario_1_repo_with_no_findings(tmp_path):
    clean_repo = tmp_path / "clean_repo"
    clean_repo.mkdir()
    (clean_repo / "clean.py").write_text("def add(a: int, b: int) -> int:\n    return a + b\n")

    cfg = PipelineConfig(
        repo_input=str(clean_repo),
        llm=MockLLM(responder=lambda s, u: "{}"),
        backend=LocalBackend(),
        scanners=("semgrep", "bandit"),
    )
    completed = _run_pipeline_collect(cfg)
    assert completed == [], "clean repo should produce zero completed findings"


# ---------------------------------------------------------------------------
# Scenario 2: Repository with a known vulnerability
# ---------------------------------------------------------------------------
def test_scenario_2_repo_with_known_vulnerability(tmp_path):
    repo = tmp_path / "sqli_repo"
    repo.mkdir()
    (repo / "db.py").write_text("def find_user(uid):\n    query = f'SELECT * FROM users WHERE id={uid}'\n    return query\n")

    findings = scan_repo(repo, scanners=("bandit",))
    assert any("B608" in f.id or "SQL" in f.raw_message for f in findings)


# ---------------------------------------------------------------------------
# Scenario 3: Finding classified as a false positive
# ---------------------------------------------------------------------------
def test_scenario_3_false_positive_skips_patching(tmp_path):
    finding = _make_finding()
    ctx = CodeContext(
        finding_id=finding.id,
        enclosing_function="def query(): pass",
        imports=[],
        related_chunks=[],
    )
    # Responder returns false positive
    llm = MockLLM(
        responder=lambda s, u: json.dumps({
            "finding_id": finding.id,
            "is_real_vulnerability": False,
            "confidence": 0.99,
            "reasoning": "Controlled constant, not exploitable",
            "cwe_confirmed": "CWE-89",
            "exploitability": "low",
        })
    )
    result = triage_finding(finding, ctx, llm)
    assert result.is_real_vulnerability is False
    assert result.exploitability == "low"


# ---------------------------------------------------------------------------
# Scenario 4: Genuine finding with a generated patch
# ---------------------------------------------------------------------------
def test_scenario_4_genuine_finding_generates_patch():
    finding = _make_finding()
    triage = _make_triage(finding, real=True)
    orig_code = "def search(q):\n    return db.execute(f'SELECT * FROM items WHERE name={q}')"
    ctx = CodeContext(
        finding_id=finding.id,
        enclosing_function=orig_code,
        imports=["import db"],
        related_chunks=[],
    )
    patched_code = "def search(q):\n    return db.execute('SELECT * FROM items WHERE name=?', (q,))"

    llm = MockLLM(
        responder=lambda s, u: json.dumps({
            "finding_id": finding.id,
            "original_code": orig_code,
            "patched_code": patched_code,
            "explanation": "Used parameterized query instead of string interpolation.",
            "attempt_number": 1,
        })
    )
    patch = generate_patch(finding, ctx, triage, llm)
    assert patch.finding_id == finding.id
    assert patch.original_code == orig_code
    assert patch.patched_code == patched_code
    assert "parameterized" in patch.explanation


# ---------------------------------------------------------------------------
# Scenario 5: Patch that passes verification
# ---------------------------------------------------------------------------
def test_scenario_5_patch_passes_verification(tmp_path):
    repo = tmp_path / "verified_repo"
    repo.mkdir()
    file_content = (
        "def ping(host: str):\n"
        "    import os\n"
        "    return os.system(f'ping -c 1 {host}')\n"
    )
    (repo / "admin.py").write_text(file_content)

    finding = _make_finding(
        fid="bandit:admin.py:3:B605",
        file_path="admin.py",
        line=3,
        cwe="CWE-78",
        tool="bandit",
    )
    patched_content = (
        "def ping(host: str):\n"
        "    import subprocess\n"
        "    return subprocess.run(['ping', '-c', '1', host]).returncode\n"
    )
    patch = Patch(
        finding_id=finding.id,
        original_code=file_content.strip(),
        patched_code=patched_content.strip(),
        explanation="Used subprocess without shell",
        attempt_number=1,
    )

    verifier = Verifier(repo, backend=LocalBackend())
    # Mock clean scan and tests
    with mock_patch.object(LocalBackend, "run_scan", return_value=(True, None)), \
         mock_patch.object(LocalBackend, "run_tests", return_value=(True, None)):
        result = verifier.verify(finding, patch)
        assert result.passed is True
        assert result.scan_clean is True
        assert result.tests_passed is True


# ---------------------------------------------------------------------------
# Scenario 6: Patch that fails verification
# ---------------------------------------------------------------------------
def test_scenario_6_patch_fails_verification(tmp_path):
    repo = tmp_path / "failed_verify_repo"
    repo.mkdir()
    file_content = "def ping(host: str):\n    import os\n    return os.system(host)\n"
    (repo / "admin.py").write_text(file_content)

    finding = _make_finding(fid="bandit:admin.py:3:B605", file_path="admin.py")
    patch = Patch(
        finding_id=finding.id,
        original_code=file_content.strip(),
        patched_code=file_content.strip(),  # No-op fix
        explanation="did not change anything",
        attempt_number=1,
    )
    verifier = Verifier(repo, backend=LocalBackend())
    with mock_patch.object(LocalBackend, "run_scan", return_value=(False, "rule still flags")):
        result = verifier.verify(finding, patch)
        assert result.passed is False
        assert "rule still flags" in (result.failure_reason or "")


# ---------------------------------------------------------------------------
# Scenario 7: Retry exhaustion followed by human review
# ---------------------------------------------------------------------------
def test_scenario_7_retry_exhaustion_escalates_to_human_review(tmp_path):
    repo = tmp_path / "exhaust_repo"
    repo.mkdir()
    code = "def bad():\n    return eval(x)\n"
    (repo / "app.py").write_text(code)

    finding = _make_finding(fid="bandit:app.py:2:B307", file_path="app.py")
    ctx = CodeContext(finding_id=finding.id, enclosing_function=code.strip(), imports=[], related_chunks=[])
    triage = _make_triage(finding, real=True)

    def failing_patch(s, u):
        return json.dumps({
            "finding_id": finding.id,
            "original_code": code.strip(),
            "patched_code": "def bad():\n    return eval(x) # retry\n",
            "explanation": "attempt",
            "attempt_number": 1,
        })

    llm = MockLLM(responder=failing_patch)
    verifier = Verifier(repo, backend=LocalBackend())
    with mock_patch.object(LocalBackend, "run_scan", return_value=(False, "eval still present")):
        outcome = run_verification_loop(finding, ctx, triage, llm, verifier, max_attempts=2)
        assert outcome.status == "needs_human_review"
        assert outcome.attempts == 2


# ---------------------------------------------------------------------------
# Scenario 8: Multiple findings in one repository
# ---------------------------------------------------------------------------
def test_scenario_8_multiple_findings_processed(tmp_path):
    repo = tmp_path / "multi_repo"
    repo.mkdir()
    (repo / "sqli.py").write_text(
        "def query_user(user_id):\n"
        "    import sqlite3\n"
        "    query = f'SELECT * FROM users WHERE id = {user_id}'\n"
        "    return sqlite3.connect(':memory:').execute(query)\n"
    )
    (repo / "cmd.py").write_text(
        "def run_cmd(user_cmd):\n"
        "    import os\n"
        "    return os.system(user_cmd)\n"
    )

    findings = scan_repo(repo, scanners=("bandit",))
    assert len(findings) >= 2
    paths = {f.file_path for f in findings}
    assert "sqli.py" in paths
    assert "cmd.py" in paths


# ---------------------------------------------------------------------------
# Scenario 9: Scanner fails while another succeeds
# ---------------------------------------------------------------------------
def test_scenario_9_scanner_crash_fault_tolerance(tmp_path):
    repo = tmp_path / "fault_repo"
    repo.mkdir()
    (repo / "sample.py").write_text("import os\ndef f(x): return os.system(x)\n")

    with mock_patch("codesage.scanning.run_semgrep", side_effect=ScannerError("semgrep crashed")):
        findings = scan_repo(repo, scanners=("semgrep", "bandit"))
        assert any(f.tool_source == "bandit" for f in findings), "bandit should succeed despite semgrep crash"


# ---------------------------------------------------------------------------
# Scenario 10: LLM timeout or malformed response
# ---------------------------------------------------------------------------
def test_scenario_10_llm_malformed_response_retries_and_raises():
    finding = _make_finding()
    ctx = CodeContext(finding_id=finding.id, enclosing_function="def x(): pass", imports=[], related_chunks=[])
    llm = MockLLM(responder=lambda s, u: "NOT VALID JSON AT ALL")

    with pytest.raises(TriageError) as exc_info:
        triage_finding(finding, ctx, llm, max_attempts=2)
    assert "triage failed" in str(exc_info.value)


# ---------------------------------------------------------------------------
# Scenario 11: Invalid repository URL
# ---------------------------------------------------------------------------
def test_scenario_11_invalid_repo_url_raises_ingestion_error():
    with pytest.raises(IngestionError) as exc_info:
        clone_repo("https://invalid-non-existent-domain-1234567.com/repo.git")
    assert "Could not clone" in str(exc_info.value) or "timed out" in str(exc_info.value)


# ---------------------------------------------------------------------------
# Scenario 12: Repository containing files with unusual names
# ---------------------------------------------------------------------------
def test_scenario_12_unusual_file_names(tmp_path):
    repo = tmp_path / "odd_names_repo"
    repo.mkdir()
    odd_file = repo / "file with spaces #1 & symbols.py"
    odd_file.write_text("import os\ndef ping(h):\n    os.system(h)\n")

    findings = scan_repo(repo, scanners=("bandit",))
    assert any("symbols.py" in f.file_path for f in findings)


# ---------------------------------------------------------------------------
# Scenario 13: Missing test suite (inconclusive verification)
# ---------------------------------------------------------------------------
def test_scenario_13_missing_test_suite_inconclusive(tmp_path):
    repo = tmp_path / "notests_repo"
    repo.mkdir()
    (repo / "main.py").write_text("def hello(): return 'world'\n")

    backend = LocalBackend()
    passed, reason = backend.run_tests(repo, repo)
    assert passed is False
    assert "no test suite found" in (reason or "")


# ---------------------------------------------------------------------------
# Scenario 14: Docker unavailable scenario (clean fallback)
# ---------------------------------------------------------------------------
def test_scenario_14_docker_unavailable_fallback():
    with mock_patch.dict(os.environ, {"CODESAGE_VERIFY_BACKEND": ""}):
        with mock_patch("codesage.verification.DockerBackend", side_effect=VerificationError("Docker daemon down")):
            backend = get_backend()
            assert backend.name == "local" or isinstance(backend, LocalBackend)


# ---------------------------------------------------------------------------
# Scenario 15: GitHub API failure
# ---------------------------------------------------------------------------
def test_scenario_15_github_api_failure_handled():
    finding = _make_finding()
    triage = _make_triage(finding)
    patch_obj = Patch(
        finding_id=finding.id,
        original_code="orig",
        patched_code="fixed",
        explanation="fixed",
        attempt_number=1,
    )
    v_res = VerificationResult(finding_id=finding.id, scan_clean=True, tests_passed=True, passed=True)

    mock_repo = MagicMock()
    mock_repo.get_branch.side_effect = Exception("401 Bad credentials")

    with pytest.raises(PRError) as exc_info:
        create_pull_request(mock_repo, patch_obj, triage, v_res)
    assert "GitHub API error" in str(exc_info.value) or "credentials" in str(exc_info.value)
