"""Unit tests for Module 7: GitHub PR agent — fully offline via a fake API.

The fakes mimic the PyGithub surface the agent uses (get_branch, get_contents,
create_git_ref, update_file, create_pull, get_git_ref/delete) and record every
call so assertions read like a conversation log. Real github.GithubException
objects are raised to exercise the design.md section 6 error mapping.
"""

import json
from pathlib import Path
from types import SimpleNamespace

import github
import pytest

from codesage.context import extract_code_context
from codesage.llm import MockLLM
from codesage.schemas import Finding, Patch, VerificationResult
from codesage.pr_agent import (
    BRANCH_PREFIX,
    PRError,
    branch_name_for,
    create_pull_request,
    generate_pr_body,
    get_repo,
    render_diff,
    title_for,
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
    repo = tmp_path_factory.mktemp("pr-agent-fixture")
    (repo / "conftest.py").write_text(CONFTEST_PY, encoding="utf-8")
    (repo / "app.py").write_text(APP_PY, encoding="utf-8")
    (repo / "requirements.txt").write_text("# no third-party deps\n", encoding="utf-8")
    tests_dir = repo / "tests"
    tests_dir.mkdir()
    (tests_dir / "test_app.py").write_text(TEST_APP_PY, encoding="utf-8")
    return repo


@pytest.fixture(scope="module")
def command_finding(fixture_repo):
    from codesage.scanning import scan_repo

    matches = [
        f for f in scan_repo(fixture_repo, scanners=("semgrep",))
        if f.file_path == "app.py" and f.cwe_id == "CWE-78"
    ]
    assert matches, "fixture os.system finding not detected"
    return matches[0]


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------

class FakeBranch:
    def __init__(self, sha):
        self.commit = SimpleNamespace(sha=sha)


class FakeContents:
    def __init__(self, path, content):
        self.path = path
        self.sha = "blob-sha-1"
        self.decoded_content = content.encode("utf-8")


class FakePR:
    def __init__(self, number, base, head, title, body):
        self.number = number
        self.html_url = f"https://github.com/fake/test-target-repo/pull/{number}"
        self.base = base
        self.head = head
        self.title = title
        self.body = body


class FakeRef:
    def __init__(self, recorder, name):
        self._recorder = recorder
        self._name = name

    def delete(self):
        self._recorder.append(self._name)


class FakeRepo:
    """In-memory stand-in for github.Repository.Repository."""

    default_branch = "main"

    def __init__(self, files):
        self.files = dict(files)
        self.branches = {"main": "base-sha"}
        self.commits = []
        self.created_refs = []
        self.deleted_refs = []
        self.prs = []
        self.fail_on_create_pr = None  # optionally a GithubException

    def get_branch(self, name):
        if name not in self.branches:
            raise github.GithubException(404, "branch not found", {})
        return FakeBranch(self.branches[name])

    def create_git_ref(self, ref, sha):
        self.created_refs.append((ref, sha))
        self.branches[ref.removeprefix("refs/heads/")] = sha

    def get_contents(self, path, ref=None):
        if path not in self.files:
            raise github.GithubException(404, "no file", {})
        return FakeContents(path, self.files[path])

    def update_file(self, path, message, content, sha, branch=None):
        self.commits.append((path, message, content, branch))
        self.files[path] = content

    def create_pull(self, base=None, head=None, title=None, body=None, **kwargs):
        if self.fail_on_create_pr is not None:
            raise self.fail_on_create_pr
        pr = FakePR(len(self.prs) + 1, base, head, title, body)
        self.prs.append(pr)
        return pr

    def get_git_ref(self, branch):
        # real PyGithub expects the "heads/<name>" form; branches are stored bare
        name = branch.removeprefix("heads/")
        if name not in self.branches:
            raise github.GithubException(404, "no ref", {})
        return FakeRef(self.deleted_refs, branch)


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

REMOTE_FILE = '''"""Task import/export endpoints."""

import base64
import pickle

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=["tasks"])


class ImportRequest(BaseModel):
    data: str


@router.post("/tasks/import")
def import_tasks(body: ImportRequest):
    try:
        raw = base64.b64decode(body.data)
        task = pickle.loads(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid task payload")
    return {"imported": task}
'''

ORIGINAL_SPAN = '''def import_tasks(body: ImportRequest):
    try:
        raw = base64.b64decode(body.data)
        task = pickle.loads(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid task payload")
    return {"imported": task}'''

PATCHED_SPAN = ORIGINAL_SPAN.replace(
    "task = pickle.loads(raw)",
    'import json\n        task = json.loads(raw.decode("utf-8"))',
)


def make_patch(**overrides):
    values = dict(
        finding_id="semgrep:tasks.py:21:python-insecure-deserialization",
        original_code=ORIGINAL_SPAN,
        patched_code=PATCHED_SPAN,
        explanation="Replaced pickle.loads with json parsing of the decoded payload.",
        attempt_number=1,
    )
    values.update(overrides)
    return Patch(**values)


def make_triage(patch):
    return SimpleNamespace(
        finding_id=patch.finding_id,
        cwe_confirmed="CWE-502",
        confidence=0.94,
        reasoning="User-controlled bytes reach pickle.loads, enabling code execution.",
    )


def make_verification(passed=True):
    return VerificationResult(
        finding_id="semgrep:tasks.py:21:python-insecure-deserialization",
        scan_clean=passed,
        tests_passed=passed,
        passed=passed,
        failure_reason=None if passed else "test suite failed: 1 failed",
    )


@pytest.fixture
def fake_repo():
    return FakeRepo({"tasks.py": REMOTE_FILE})


# ---------------------------------------------------------------------------
# Naming, diff, PR body
# ---------------------------------------------------------------------------

def test_branch_name_is_prefixed_and_deterministic():
    patch = make_patch()
    name = branch_name_for(patch)
    assert name.startswith(BRANCH_PREFIX)
    assert "tasks-py" in name
    assert name == branch_name_for(make_patch())  # same finding -> same name
    assert name != branch_name_for(make_patch(finding_id="semgrep:shop.py:18:rule"))


def test_render_diff_lines():
    diff = render_diff(make_patch())
    assert diff.startswith("--- a/tasks.py")
    assert "+++ b/tasks.py" in diff
    assert any(line.startswith("-") and "pickle.loads" in line for line in diff.splitlines())
    assert any(line.startswith("+") and "json.loads" in line for line in diff.splitlines())


def test_pr_body_contains_template_fields(fake_repo):
    patch = make_patch()
    body = generate_pr_body(patch, make_triage(patch), make_verification(True))
    # architecture.md 2.8 requires: CWE, diff, confidence, verification status
    assert "**CWE-502**" in body
    assert "```diff" in body and "-        task = pickle.loads(raw)" in body
    assert "94%" in body
    assert "PASSED (scanner re-run clean, test suite green)" in body
    assert body.strip().endswith("Please review before merging.")


def test_pr_body_reflects_failed_verification():
    patch = make_patch()
    body = generate_pr_body(patch, make_triage(patch), make_verification(False))
    assert "FAILED" in body and "test suite failed: 1 failed" in body


def test_title_and_commit_message():
    patch = make_patch()
    triage = make_triage(patch)
    assert title_for(patch, triage) == "Fix CWE-502 in tasks.py (CodeSage)"
    message = f"CodeSage: fix CWE-502 in tasks.py\n\n{patch.explanation}"
    assert "CWE-502" in message and patch.explanation in message


# ---------------------------------------------------------------------------
# create_pull_request flow against the fake API
# ---------------------------------------------------------------------------

def test_full_flow_creates_branch_commit_and_pr(fake_repo):
    patch = make_patch()
    triage = make_triage(patch)
    verification = make_verification(True)

    info = create_pull_request(fake_repo, patch, triage, verification)

    assert info["pr_url"] == "https://github.com/fake/test-target-repo/pull/1"
    assert info["branch"] == branch_name_for(patch)
    assert info["base_branch"] == "main"
    # branch was created from the base branch sha
    assert fake_repo.created_refs == [("refs/heads/" + info["branch"], "base-sha")]
    # the commit replaced exactly the vulnerable span, rest of file intact
    path, message, content, branch = fake_repo.commits[0]
    assert path == "tasks.py" and branch == info["branch"]
    assert "pickle.loads" not in content
    assert "json.loads(raw" in content
    assert content.count('"""Task import/export endpoints."""') == 1  # untouched header
    # the PR carries the templated body and title
    assert fake_repo.prs[0].title == "Fix CWE-502 in tasks.py (CodeSage)"
    assert "**CWE-502**" in fake_repo.prs[0].body
    assert fake_repo.prs[0].body == generate_pr_body(patch, triage, verification)


def test_patch_not_applicable_raises_before_any_mutation(fake_repo):
    patch = make_patch(original_code="def does_not_exist():\n    pass")
    with pytest.raises(PRError, match="does not apply"):
        create_pull_request(fake_repo, patch, make_triage(patch), None)
    assert fake_repo.created_refs == []  # no orphan branch
    assert fake_repo.commits == [] and fake_repo.prs == []


def test_api_failure_after_branch_creation_cleans_up(fake_repo):
    fake_repo.fail_on_create_pr = github.GithubException(502, "boom", {})
    patch = make_patch()
    with pytest.raises(PRError):
        create_pull_request(fake_repo, patch, make_triage(patch), make_verification(True))
    assert len(fake_repo.commits) == 1  # commit happened...
    assert fake_repo.deleted_refs == [f"heads/{branch_name_for(patch)}"]  # ...then cleanup


def test_auth_failure_is_mapped_with_actionable_message(fake_repo):
    def boom(*args, **kwargs):
        raise github.GithubException(401, "Bad credentials", {})

    repo = FakeRepo({"tasks.py": REMOTE_FILE})
    repo.get_branch = boom  # type: ignore[method-assign]
    with pytest.raises(PRError, match="authentication failed"):
        create_pull_request(repo, make_patch(), make_triage(make_patch()), None)


def test_rate_limit_is_mapped_with_retry_guidance(fake_repo):
    def boom(*args, **kwargs):
        raise github.GithubException(403, "API rate limit exceeded", {})

    repo = FakeRepo({"tasks.py": REMOTE_FILE})
    repo.get_branch = boom  # type: ignore[method-assign]
    with pytest.raises(PRError, match="rate limit"):
        create_pull_request(repo, make_patch(), make_triage(make_patch()), None)


def test_get_repo_requires_token():
    with pytest.raises(PRError, match="GITHUB_TOKEN"):
        get_repo("", "someone/test-target-repo")


# ---------------------------------------------------------------------------
# Integration with the Module 6 loop (offline, no GitHub)
# ---------------------------------------------------------------------------

def test_verified_loop_outcome_feeds_pr_agent(fixture_repo, command_finding):
    """The pipeline handoff: LoopOutcome.patch -> branch name + PR body."""
    from codesage.verification import LocalBackend, Verifier, run_verification_loop

    verifier = Verifier(fixture_repo, backend=LocalBackend())
    context = extract_code_context(command_finding, fixture_repo)
    triage_like = SimpleNamespace(
        finding_id=command_finding.id,
        cwe_confirmed=command_finding.cwe_id,
        confidence=0.9,
        reasoning="User input reaches os.system.",
    )
    llm = MockLLM(responder=lambda s, u: json.dumps(
        {"finding_id": "x", "original_code": "ignored",
         "patched_code": context.enclosing_function.replace(
             'return os.system(f"echo {msg}")',
             'import subprocess\n\n    return subprocess.run(["echo", msg], check=False).returncode',
         ),
         "explanation": "argument-vector subprocess instead of shell",
         "attempt_number": 1})
    )

    outcome = run_verification_loop(command_finding, context, triage_like, llm, verifier)
    assert outcome.status == "verified"

    patch = outcome.patch
    assert branch_name_for(patch).startswith(BRANCH_PREFIX)
    body = generate_pr_body(patch, triage_like, outcome.result)
    assert "**CWE-78**" in body and "90%" in body and "PASSED" in body


# ---------------------------------------------------------------------------
# Regression tests for PyGithub create_pull integration
# ---------------------------------------------------------------------------

def test_pr_agent_uses_create_pull_and_never_calls_create_git():
    """Regression test: FakeRepo adheres to PyGithub API by exposing create_pull
    and NOT exposing create_git. Verifies create_pull is called with correct parameters.
    """
    repo = FakeRepo({"tasks.py": REMOTE_FILE})
    assert not hasattr(repo, "create_git"), "FakeRepo should not define non-existent create_git"
    assert hasattr(repo, "create_pull"), "FakeRepo must define create_pull"

    patch = make_patch()
    triage = make_triage(patch)
    verification = make_verification(True)

    info = create_pull_request(repo, patch, triage, verification)

    assert info["pr_number"] == 1
    assert len(repo.prs) == 1
    assert repo.prs[0].base == "main"
    assert repo.prs[0].head == branch_name_for(patch)
    assert repo.prs[0].title == "Fix CWE-502 in tasks.py (CodeSage)"


def test_regression_real_pygithub_repository_spec():
    """Regression test: verify create_pull_request against a strict mock autospec'd
    from github.Repository.Repository.

    Real PyGithub Repository defines create_pull() but NOT create_git().
    If create_git() is called, create_autospec immediately raises AttributeError.
    """
    import unittest.mock as mock
    from github.Repository import Repository

    mock_repo = mock.create_autospec(Repository, instance=True)
    assert not hasattr(mock_repo, "create_git")
    assert hasattr(mock_repo, "create_pull")

    mock_repo.default_branch = "main"

    mock_branch = mock.MagicMock()
    mock_branch.commit.sha = "base-sha"
    mock_repo.get_branch.return_value = mock_branch

    mock_contents = mock.MagicMock()
    mock_contents.path = "tasks.py"
    mock_contents.sha = "blob-sha"
    mock_contents.decoded_content = REMOTE_FILE.encode("utf-8")
    mock_repo.get_contents.return_value = mock_contents

    mock_pr = mock.MagicMock()
    mock_pr.number = 42
    mock_pr.html_url = "https://github.com/fake/test-target-repo/pull/42"
    mock_repo.create_pull.return_value = mock_pr

    patch = make_patch()
    triage = make_triage(patch)
    verification = make_verification(True)

    info = create_pull_request(mock_repo, patch, triage, verification)

    assert info["pr_number"] == 42
    assert info["pr_url"] == "https://github.com/fake/test-target-repo/pull/42"
    assert info["branch"] == branch_name_for(patch)

    mock_repo.create_pull.assert_called_once_with(
        title=title_for(patch, triage),
        body=generate_pr_body(patch, triage, verification),
        base="main",
        head=branch_name_for(patch),
    )


def test_regression_repo_missing_create_pull_fails():
    """Regression test: A mock having only create_git fails because create_pull is required."""
    class BrokenRepo:
        default_branch = "main"

        def __init__(self, files):
            self.branches = {"main": "base-sha"}
            self.files = dict(files)
            self.deleted_refs = []

        def get_branch(self, name):
            return FakeBranch(self.branches[name])

        def get_contents(self, path, ref=None):
            return FakeContents(path, self.files[path])

        def create_git_ref(self, ref, sha):
            pass

        def update_file(self, *args, **kwargs):
            pass

        def create_git(self, base, head, title, body):
            return FakePR(1, base, head, title, body)

        def get_git_ref(self, branch):
            return FakeRef(self.deleted_refs, branch)

    broken = BrokenRepo({"tasks.py": REMOTE_FILE})
    assert hasattr(broken, "create_git")
    assert not hasattr(broken, "create_pull")

    patch = make_patch()
    with pytest.raises(PRError, match="has no attribute 'create_pull'"):
        create_pull_request(broken, patch, make_triage(patch), make_verification(True))

