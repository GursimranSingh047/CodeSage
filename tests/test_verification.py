"""Unit tests for Module 6: verification agent + design.md 4.2 retry loop.

Offline tests use a LocalBackend against a small fixture repo whose benign
test suite passes both before and after the fix (mirroring how a real repo's
tests behave). Docker tests skip unless a daemon is reachable.
"""

import json
import shutil
from pathlib import Path

import pytest

from codesage.context import extract_code_context
from codesage.llm import MockLLM
from codesage.schemas import Finding, Patch, VerificationResult
from codesage.scanning import scan_repo
from codesage.verification import (
    DockerBackend,
    LocalBackend,
    LoopOutcome,
    PatchNotApplicable,
    Verifier,
    VerificationError,
    apply_patch_to_copy,
    get_backend,
    run_verification_loop,
)

REPO_ROOT = Path(__file__).resolve().parent.parent

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
    repo = tmp_path_factory.mktemp("vuln-fixture")
    (repo / "conftest.py").write_text(CONFTEST_PY, encoding="utf-8")
    (repo / "app.py").write_text(APP_PY, encoding="utf-8")
    (repo / "requirements.txt").write_text("# no third-party deps\n", encoding="utf-8")
    tests_dir = repo / "tests"
    tests_dir.mkdir()
    (tests_dir / "test_app.py").write_text(TEST_APP_PY, encoding="utf-8")
    return repo


@pytest.fixture(scope="module")
def command_finding(fixture_repo):
    findings = scan_repo(fixture_repo, scanners=("semgrep",))
    matches = [f for f in findings if f.file_path == "app.py" and f.cwe_id == "CWE-78"]
    assert matches, "fixture os.system finding not detected"
    return matches[0]


def good_patch(finding, fixture_repo) -> Patch:
    context = extract_code_context(finding, fixture_repo)
    patched = context.enclosing_function.replace(
        'return os.system(f"echo {msg}")',
        'import subprocess\n\n    return subprocess.run(["echo", msg], check=False).returncode',
    )
    return Patch(
        finding_id=finding.id,
        original_code=context.enclosing_function,
        patched_code=patched,
        explanation="Replaced the shell call with an argument-vector subprocess call.",
        attempt_number=1,
    )


def noop_patch(finding, fixture_repo) -> Patch:
    context = extract_code_context(finding, fixture_repo)
    return Patch(
        finding_id=finding.id,
        original_code=context.enclosing_function,
        patched_code=context.enclosing_function + "\n    # TODO: fix later",
        explanation="cosmetic only",
        attempt_number=1,
    )


def breaking_patch(finding, fixture_repo) -> Patch:
    context = extract_code_context(finding, fixture_repo)
    return Patch(
        finding_id=finding.id,
        original_code=context.enclosing_function,
        patched_code="def announce(msg: str) -> int:\n    return 1",
        explanation="breaks behavior",
        attempt_number=1,
    )


# ---------------------------------------------------------------------------
# Patch application
# ---------------------------------------------------------------------------

def test_apply_patch_to_copy_replaces_span(fixture_repo, command_finding):
    patch = good_patch(command_finding, fixture_repo)
    workdir = apply_patch_to_copy(fixture_repo, patch)
    try:
        app = (workdir / "app.py").read_text(encoding="utf-8")
        assert "os.system" not in app
        assert "subprocess.run" in app
        assert (workdir / "tests" / "test_app.py").is_file()  # whole repo copied
    finally:
        shutil.rmtree(workdir.parent, ignore_errors=True)


def test_apply_patch_rejects_unknown_span(fixture_repo, command_finding):
    context = extract_code_context(command_finding, fixture_repo)
    patch = context and Patch(
        finding_id=command_finding.id,
        original_code="def this_does_not_exist():\n    pass",
        patched_code="def still_not_here():\n    pass",
        explanation="n/a",
        attempt_number=1,
    )
    with pytest.raises(PatchNotApplicable, match="not found"):
        apply_patch_to_copy(fixture_repo, patch)


def test_apply_patch_rejects_ambiguous_span(tmp_path):
    # two identical functions -> the span matches twice -> refuse
    dup = tmp_path / "repo"
    dup.mkdir()
    (dup / "app.py").write_text(APP_PY + "\n\n" + APP_PY, encoding="utf-8")
    span = 'def announce(msg: str) -> int:\n    """Broadcast a message through the shell."""\n    return os.system(f"echo {msg}")'
    patch = Patch(
        finding_id="semgrep:app.py:5:python-command-injection",
        original_code=span,
        patched_code=span + "\n",
        explanation="n/a",
        attempt_number=1,
    )
    with pytest.raises(PatchNotApplicable, match="ambiguous"):
        apply_patch_to_copy(dup, patch)


# ---------------------------------------------------------------------------
# LocalBackend: re-scan + tests
# ---------------------------------------------------------------------------

def test_local_backend_scan_detects_vulnerable_copy(fixture_repo, command_finding):
    backend = LocalBackend()
    clean, reason = backend.run_scan(fixture_repo, command_finding)
    assert clean is False
    assert "python-command-injection" in reason


def test_local_backend_scan_clean_after_good_patch(fixture_repo, command_finding):
    patch = good_patch(command_finding, fixture_repo)
    workdir = apply_patch_to_copy(fixture_repo, patch)
    try:
        clean, reason = LocalBackend().run_scan(workdir, command_finding)
        assert clean is True, reason
        assert reason is None
    finally:
        shutil.rmtree(workdir.parent, ignore_errors=True)


def test_local_backend_runs_fixture_tests(fixture_repo):
    passed, reason = LocalBackend().run_tests(fixture_repo, fixture_repo)
    assert passed is True, reason


# ---------------------------------------------------------------------------
# Verifier end-to-end (offline backend)
# ---------------------------------------------------------------------------

def test_verifier_accepts_good_patch(fixture_repo, command_finding):
    verifier = Verifier(fixture_repo, backend=LocalBackend())
    result = verifier.verify(command_finding, good_patch(command_finding, fixture_repo))
    assert isinstance(result, VerificationResult)
    assert result.scan_clean and result.tests_passed and result.passed
    assert result.failure_reason is None


def test_verifier_rejects_noop_patch_on_scan(fixture_repo, command_finding):
    verifier = Verifier(fixture_repo, backend=LocalBackend())
    result = verifier.verify(command_finding, noop_patch(command_finding, fixture_repo))
    assert result.passed is False
    assert result.scan_clean is False
    assert result.tests_passed is True  # behavior intact, but rule still fires
    assert "python-command-injection" in result.failure_reason


def test_verifier_rejects_breaking_patch_on_tests(fixture_repo, command_finding):
    verifier = Verifier(fixture_repo, backend=LocalBackend())
    result = verifier.verify(command_finding, breaking_patch(command_finding, fixture_repo))
    assert result.passed is False
    assert result.scan_clean is True   # os.system is gone...
    assert result.tests_passed is False  # ...but the suite broke
    assert "test suite failed" in result.failure_reason


def test_verifier_reports_unapplicable_patch(fixture_repo, command_finding):
    verifier = Verifier(fixture_repo, backend=LocalBackend())
    patch = Patch(
        finding_id=command_finding.id,
        original_code="def missing():\n    pass",
        patched_code="def missing():\n    pass  # fixed",
        explanation="n/a",
        attempt_number=1,
    )
    result = verifier.verify(command_finding, patch)
    assert result.passed is False
    assert "patch does not apply" in result.failure_reason


# ---------------------------------------------------------------------------
# design.md 4.2 retry loop
# ---------------------------------------------------------------------------

def patch_response_json(patch_body):
    return json.dumps(
        {"finding_id": "x", "original_code": "ignored", "patched_code": patch_body,
         "explanation": "mock fix", "attempt_number": 1}
    )


def test_loop_verified_on_first_attempt(fixture_repo, command_finding):
    verifier = Verifier(fixture_repo, backend=LocalBackend())
    context = extract_code_context(command_finding, fixture_repo)
    triage = {"cwe_confirmed": command_finding.cwe_id, "reasoning": "shell exec"}
    llm = MockLLM(responder=lambda s, u: patch_response_json(
        good_patch(command_finding, fixture_repo).patched_code
    ))

    outcome = run_verification_loop(
        command_finding, context, _fake_triage(command_finding), llm, verifier
    )
    assert outcome.status == "verified"
    assert outcome.attempts == 1
    assert outcome.patch.attempt_number == 1
    assert outcome.result.passed is True
    assert "failed verification" not in llm.calls[0][1]


def test_loop_retries_with_failure_reason_then_verifies(fixture_repo, command_finding):
    responses = iter([
        patch_response_json(noop_patch(command_finding, fixture_repo).patched_code),
        patch_response_json(good_patch(command_finding, fixture_repo).patched_code),
    ])
    llm = MockLLM(responder=lambda s, u: next(responses))
    verifier = Verifier(fixture_repo, backend=LocalBackend())
    context = extract_code_context(command_finding, fixture_repo)

    outcome = run_verification_loop(
        command_finding, context, _fake_triage(command_finding), llm, verifier
    )
    assert outcome.status == "verified"
    assert outcome.attempts == 2
    assert outcome.patch.attempt_number == 2  # verification retry, not JSON retry
    # the 3.3 failure section must carry attempt 1's reason into attempt 2
    retry_prompt = llm.calls[1][1]
    assert "Your previous patch attempt failed verification for this reason:" in retry_prompt
    assert "python-command-injection" in retry_prompt
    assert "Please correct the issue in a new patch." in retry_prompt


def test_loop_escalates_to_human_review_after_two_attempts(fixture_repo, command_finding):
    llm = MockLLM(responder=lambda s, u: patch_response_json(
        noop_patch(command_finding, fixture_repo).patched_code
    ))
    verifier = Verifier(fixture_repo, backend=LocalBackend())
    context = extract_code_context(command_finding, fixture_repo)

    outcome = run_verification_loop(
        command_finding, context, _fake_triage(command_finding), llm, verifier
    )
    assert outcome.status == "needs_human_review"
    assert outcome.attempts == 2
    assert outcome.result.passed is False
    assert len(llm.calls) == 2  # exactly max_attempts patch generations


def test_loop_reports_patch_generation_failure(fixture_repo, command_finding):
    llm = MockLLM(responder=lambda s, u: "not json")
    verifier = Verifier(fixture_repo, backend=LocalBackend())
    context = extract_code_context(command_finding, fixture_repo)

    outcome = run_verification_loop(
        command_finding, context, _fake_triage(command_finding), llm, verifier
    )
    assert outcome.status == "patch_generation_failed"
    assert outcome.patch is None
    assert len(llm.calls) == 2  # the JSON-format retry budget inside generate_patch


class _FakeTriage:
    """Minimal stand-in exposing the fields the 3.2 prompt needs."""

    def __init__(self, finding):
        self.finding_id = finding.id
        self.cwe_confirmed = finding.cwe_id or "CWE-unknown"
        self.reasoning = "User input reaches a dangerous sink."


def _fake_triage(finding):
    return _FakeTriage(finding)


# ---------------------------------------------------------------------------
# Backend selection + Docker (skipped without a daemon)
# ---------------------------------------------------------------------------

def test_get_backend_local_selection(monkeypatch):
    monkeypatch.setenv("CODESAGE_VERIFY_BACKEND", "local")
    assert isinstance(get_backend(), LocalBackend)


def test_get_backend_docker_without_daemon_raises(monkeypatch):
    monkeypatch.setenv("CODESAGE_VERIFY_BACKEND", "docker")
    if shutil.which("docker") or _docker_daemon_reachable():
        pytest.skip("docker is available on this machine")
    with pytest.raises(VerificationError):
        get_backend()


def _docker_daemon_reachable() -> bool:
    try:
        DockerBackend()
        return True
    except VerificationError:
        return False


DOCKER_READY = None


def _docker_ready() -> bool:
    global DOCKER_READY
    if DOCKER_READY is None:
        try:
            DockerBackend()
            DOCKER_READY = True
        except VerificationError:
            DOCKER_READY = False
    return DOCKER_READY


@pytest.mark.skipif(not _docker_ready(), reason="Docker daemon not reachable")
def test_docker_backend_verifies_good_patch(fixture_repo, command_finding):
    backend = DockerBackend()
    verifier = Verifier(fixture_repo, backend=backend)
    result = verifier.verify(command_finding, good_patch(command_finding, fixture_repo))
    assert result.passed is True, result.failure_reason
