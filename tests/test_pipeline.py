"""Unit tests for Module 8: LangGraph orchestration (architecture.md 2.3).

All paths are exercised offline with MockLLM + LocalBackend against the small
fixture repo (os.system finding + benign test suite).
"""

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from codesage.context import extract_code_context
from codesage.llm import MockLLM
from codesage.pipeline import (
    PipelineConfig,
    PipelineError,
    build_pipeline,
    run_pipeline,
)
from codesage.scanning import scan_repo
from codesage.verification import LocalBackend

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

ARCHITECTURE_NODES = {
    "ingestion", "scanning", "next_finding", "context", "triage",
    "patch", "verify", "pr", "human_review",
}

TRIAGE_CWES = ("CWE-78",)  # findings with these CWEs are confirmed REAL by the mock


@pytest.fixture(scope="module")
def fixture_repo(tmp_path_factory):
    repo = tmp_path_factory.mktemp("pipeline-fixture")
    (repo / "conftest.py").write_text(CONFTEST_PY, encoding="utf-8")
    (repo / "app.py").write_text(APP_PY, encoding="utf-8")
    (repo / "requirements.txt").write_text("# no third-party deps\n", encoding="utf-8")
    tests_dir = repo / "tests"
    tests_dir.mkdir()
    (tests_dir / "test_app.py").write_text(TEST_APP_PY, encoding="utf-8")
    return repo


def make_config(fixture_repo, llm, **overrides):
    values = dict(
        repo_input=str(fixture_repo),
        llm=llm,
        backend=LocalBackend(),
        scanners=("semgrep",),  # deterministic single-tool queue for tests
    )
    values.update(overrides)
    return PipelineConfig(**values)


def make_llm(confirm_cwes=TRIAGE_CWES, patch_bodies=None):
    """MockLLM that routes triage vs patch prompts.

    Triage confirms only findings whose prompt mentions one of confirm_cwes.
    patch_bodies: optional list of patched function bodies served in order;
    when exhausted, the last body keeps being returned.
    """
    bodies = list(patch_bodies or [])
    state = {"used": 0}

    def responder(system, user):
        if "reviewing static analysis findings" in system:
            confirmed = any(cwe in user for cwe in confirm_cwes)
            return json.dumps(
                {"finding_id": "x", "is_real_vulnerability": confirmed,
                 "confidence": 0.9 if confirmed else 0.6,
                 "reasoning": "mock triage", "cwe_confirmed": "CWE-0",
                 "exploitability": "high" if confirmed else "low"}
            )
        span = user.split("Original function:\n", 1)[1]
        # on §3.3 retry prompts the failure section follows the span — a real
        # LLM returns only the fixed function, so the mock must strip it too
        span = span.split("\n\nYour previous patch attempt failed verification", 1)[0].rstrip()
        if bodies:
            body = bodies[min(state["used"], len(bodies) - 1)]
            state["used"] += 1
        else:
            body = span  # default: a no-op "patch"
        return json.dumps(
            {"finding_id": "x", "original_code": "ignored", "patched_code": body,
             "explanation": "mock fix", "attempt_number": 1}
        )

    return MockLLM(responder=responder)


def good_body_for(fixture_repo, finding):
    context = extract_code_context(finding, fixture_repo)
    return context.enclosing_function.replace(
        'return os.system(f"echo {msg}")',
        'import subprocess\n    return subprocess.run(["echo", msg], check=False).returncode',
    )


def noop_body_for(fixture_repo, finding):
    context = extract_code_context(finding, fixture_repo)
    return context.enclosing_function + "\n    # TODO: fix later"


# ---------------------------------------------------------------------------
# Graph shape
# ---------------------------------------------------------------------------

def test_graph_contains_all_architecture_nodes(fixture_repo):
    app = build_pipeline(make_config(fixture_repo, make_llm()))
    node_names = {node.name for node in app.get_graph().nodes.values()}
    assert ARCHITECTURE_NODES <= node_names


# ---------------------------------------------------------------------------
# Happy paths
# ---------------------------------------------------------------------------

def test_verified_pipeline_end_to_end(fixture_repo):
    finding = scan_repo(fixture_repo, scanners=("semgrep",))[0]
    config = make_config(fixture_repo, make_llm(patch_bodies=[good_body_for(fixture_repo, finding)]))
    final_state = run_pipeline(config)

    assert final_state["findings"] == []  # queue drained
    assert final_state["current_finding"] is None
    completed = final_state["completed_findings"]
    assert len(completed) == 1
    entry = completed[0]
    assert entry["status"] == "verified_pr_skipped"  # no --github-repo configured
    assert entry["attempts"] == 1
    assert entry["cwe_id"] == "CWE-78"
    assert final_state["repo_path"] == str(fixture_repo.resolve())


def test_false_positive_findings_are_recorded_and_skipped(fixture_repo):
    llm = make_llm(confirm_cwes=())  # nothing confirmed -> everything FP
    final_state = run_pipeline(make_config(fixture_repo, llm))
    completed = final_state["completed_findings"]
    assert all(entry["status"] == "false_positive" for entry in completed)
    assert len(completed) >= 1


def test_mixed_queue_processes_every_finding(tmp_path_factory):
    """Two findings: one triaged false positive, one patched and verified."""
    repo = tmp_path_factory.mktemp("two-vulns")
    (repo / "conftest.py").write_text(CONFTEST_PY, encoding="utf-8")
    (repo / "app.py").write_text(APP_PY + "\n\nimport pickle\n\n\ndef deserialize(blob):\n    return pickle.loads(blob)\n", encoding="utf-8")
    (repo / "requirements.txt").write_text("# none\n", encoding="utf-8")
    tests_dir = repo / "tests"
    tests_dir.mkdir()
    (tests_dir / "test_app.py").write_text(TEST_APP_PY, encoding="utf-8")

    # confirm only the os.system finding (CWE-78); the pickle one is "false positive"
    command_finding = next(
        f for f in scan_repo(repo, scanners=("semgrep",)) if f.cwe_id == "CWE-78"
    )
    llm = make_llm(confirm_cwes=("CWE-78",),
                   patch_bodies=[good_body_for(repo, command_finding)])
    config = make_config(repo, llm, scanners=("semgrep",))
    final_state = run_pipeline(config)

    completed = final_state["completed_findings"]
    statuses = sorted(entry["status"] for entry in completed)
    assert statuses == ["false_positive", "verified_pr_skipped"]
    assert final_state["findings"] == []


# ---------------------------------------------------------------------------
# design.md 4.2 retry loop inside the graph
# ---------------------------------------------------------------------------

def test_retry_loop_feeds_failure_reason_and_then_verifies(fixture_repo):
    finding = next(
        f for f in scan_repo(fixture_repo, scanners=("semgrep",))
        if f.cwe_id == "CWE-78"
    )
    llm = make_llm(patch_bodies=[noop_body_for(fixture_repo, finding),
                                 good_body_for(fixture_repo, finding)])
    final_state = run_pipeline(make_config(fixture_repo, llm))

    completed = final_state["completed_findings"]
    assert completed[0]["status"] == "verified_pr_skipped"
    assert completed[0]["attempts"] == 2  # one retry consumed

    patch_calls = [call for call in llm.calls
                   if "fixing a confirmed vulnerability" in call[0]]
    assert len(patch_calls) == 2
    first_user, second_user = patch_calls[0][1], patch_calls[1][1]
    assert "failed verification" not in first_user
    assert "Your previous patch attempt failed verification for this reason:" in second_user
    assert "python-command-injection" in second_user  # attempt 1's scan reason


def test_retries_exhausted_routes_to_human_review(fixture_repo):
    finding = next(
        f for f in scan_repo(fixture_repo, scanners=("semgrep",))
        if f.cwe_id == "CWE-78"
    )
    llm = make_llm(patch_bodies=[noop_body_for(fixture_repo, finding)])
    final_state = run_pipeline(make_config(fixture_repo, llm))

    completed = final_state["completed_findings"]
    assert completed[0]["status"] == "needs_human_review"
    assert completed[0]["attempts"] == 2
    assert "python-command-injection" in completed[0]["failure_reason"]


# ---------------------------------------------------------------------------
# Failure handling (design.md section 6 semantics)
# ---------------------------------------------------------------------------

def test_triage_failure_is_recorded_and_pipeline_continues(fixture_repo):
    class BrokenTriageLLM(MockLLM):
        def complete(self, system, user):
            if "reviewing static analysis findings" in system:
                return "not json"
            return super().complete(system, user)

    final_state = run_pipeline(
        make_config(fixture_repo, BrokenTriageLLM(responder=lambda s, u: "{}"))
    )
    completed = final_state["completed_findings"]
    assert completed[0]["status"] == "triage_failed"
    assert final_state["findings"] == []  # queue still drained


def test_patch_generation_failure_is_recorded(fixture_repo):
    class BrokenPatchLLM(MockLLM):
        def complete(self, system, user):
            if "fixing a confirmed vulnerability" in system:
                return "not json"
            return super().complete(system, user)

    def valid_triage(system, user):
        confirmed = "at app.py" in user
        return json.dumps(
            {"finding_id": "x", "is_real_vulnerability": confirmed,
             "confidence": 0.9, "reasoning": "mock triage",
             "cwe_confirmed": "CWE-0", "exploitability": "high"}
        )

    final_state = run_pipeline(
        make_config(fixture_repo, BrokenPatchLLM(responder=valid_triage))
    )
    completed = final_state["completed_findings"]
    assert completed[0]["status"] == "patch_generation_failed"


# ---------------------------------------------------------------------------
# Ingestion edge cases
# ---------------------------------------------------------------------------

def test_pipeline_error_for_missing_local_repo(tmp_path):
    config = make_config(tmp_path / "nope", make_llm())
    with pytest.raises(PipelineError, match="not found"):
        run_pipeline(config)
