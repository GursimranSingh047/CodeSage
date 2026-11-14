"""Comprehensive security and injection hardening tests for Module 1 (Repository Ingestion).

Covers Phase 1 requirements:
1. Arbitrary HTTPS host rejection (anti-SSRF and scope confinement).
2. No token forwarding to untrusted remote hosts.
3. Token absent from subprocess command-line arguments (process list privacy).
4. Missing GitHub token behavior (anonymous public clone).
5. Malicious branch rejection (git option and command injection defense).
6. Valid branch acceptance (nested paths, releases, hotfixes).
7. Local directory ingestion disabled by default via API.
8. Local directory confinement when enabled with CODESAGE_ALLOWED_LOCAL_DIR.
9. Symlink escape rejection during local path validation.
10. Sensitive directory rejection (.ssh, .aws, /etc, root /).
11. Temporary directory POSIX permission enforcement (0700).
12. Existing public repository ingestion compatibility.
13. Existing private repository authentication compatibility through mocks.
"""

import http.server
import os
import stat
import subprocess
import tempfile
import threading
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from starlette.testclient import TestClient

from codesage.ingestion import (
    IngestionError,
    RepoWorkspace,
    clone_repo,
    safe_cleanup_workspace,
    validate_git_branch,
    validate_github_url,
    validate_local_path,
)
from codesage.server import create_app


# ---------------------------------------------------------------------------
# 1. Remote Host Scope & Token Protection Tests
# ---------------------------------------------------------------------------

def test_arbitrary_https_host_rejected():
    """Verify that arbitrary non-GitHub HTTPS hosts are strictly rejected."""
    with pytest.raises(IngestionError, match="Unsupported host 'attacker.example.com'"):
        clone_repo("https://attacker.example.com/malicious/repo.git")


def test_no_token_forwarding_to_untrusted_hosts(monkeypatch):
    """Verify that GITHUB_TOKEN is never sent to a non-GitHub host."""
    monkeypatch.setenv("GITHUB_TOKEN", "super-secret-pat-token-999")
    with patch("subprocess.run") as mock_run:
        with pytest.raises(IngestionError):
            clone_repo("https://evil-server.org/repo.git", token="super-secret-pat-token-999")
        # Subprocess must never even have been called for untrusted host
        mock_run.assert_not_called()


def test_token_absent_from_subprocess_command_arguments():
    """Verify that GITHUB_TOKEN is passed strictly via environment, never via command arguments."""
    dummy_token = "github_pat_test_secret_credential_12345"

    with patch("subprocess.run") as mock_run, patch("pathlib.Path.rglob") as mock_rglob:
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_proc.stdout = ""
        mock_proc.stderr = ""
        mock_run.return_value = mock_proc
        mock_rglob.return_value = []

        clone_repo("https://github.com/pallets/flask.git", token=dummy_token)

        assert mock_run.called
        call_args, call_kwargs = mock_run.call_args
        command = call_args[0]
        env = call_kwargs.get("env", {})

        # Token must NOT be in the command argument list anywhere
        for arg in command:
            assert dummy_token not in str(arg), f"Token leaked into command argument: {arg}"

        # Command must separate positional arguments with '--'
        assert "--" in command
        dash_index = command.index("--")
        assert command[dash_index + 1] == "https://github.com/pallets/flask.git"

        # Token must be safely injected into the isolated subprocess environment with URL scoping
        assert env.get("GIT_CONFIG_COUNT") == "2"
        assert env.get("GIT_CONFIG_KEY_0") == "http.https://github.com/.extraHeader"
        assert dummy_token in env.get("GIT_CONFIG_VALUE_0", "")
        assert env.get("GIT_CONFIG_KEY_1") == "http.https://www.github.com/.extraHeader"
        assert dummy_token in env.get("GIT_CONFIG_VALUE_1", "")
        assert env.get("GIT_TERMINAL_PROMPT") == "0"


def test_git_http_redirect_strips_url_scoped_authorization_header():
    """Verify that URL-scoped Git headers are stripped by Git when following HTTP redirects."""
    received_headers = {}

    class RedirectHandler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            received_headers["initial"] = dict(self.headers)
            # Redirect to second server
            self.send_response(302)
            self.send_header("Location", f"http://127.0.0.1:{port2}/redirected/info/refs?service=git-upload-pack")
            self.end_headers()

        def log_message(self, *args):
            pass

    class TargetHandler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            received_headers["redirected"] = dict(self.headers)
            self.send_response(404)
            self.end_headers()

        def log_message(self, *args):
            pass

    server1 = http.server.HTTPServer(("127.0.0.1", 0), RedirectHandler)
    port1 = server1.server_port
    t1 = threading.Thread(target=server1.serve_forever, daemon=True)
    t1.start()

    server2 = http.server.HTTPServer(("127.0.0.1", 0), TargetHandler)
    port2 = server2.server_port
    t2 = threading.Thread(target=server2.serve_forever, daemon=True)
    t2.start()

    dest = tempfile.mkdtemp()
    env = os.environ.copy()
    env["GIT_CONFIG_COUNT"] = "1"
    # Scope ONLY to server1
    env["GIT_CONFIG_KEY_0"] = f"http.http://127.0.0.1:{port1}/.extraHeader"
    env["GIT_CONFIG_VALUE_0"] = "Authorization: Bearer test_scoped_secret_token"
    env["GIT_TERMINAL_PROMPT"] = "0"

    cmd = ["git", "clone", "--depth", "1", f"http://127.0.0.1:{port1}/initial", dest]
    subprocess.run(cmd, env=env, capture_output=True, text=True)

    auth_server1 = received_headers.get("initial", {}).get("Authorization")
    auth_server2 = received_headers.get("redirected", {}).get("Authorization")

    # Scoped server received authorization
    assert auth_server1 == "Bearer test_scoped_secret_token"
    # Redirected target received NO authorization header
    assert auth_server2 is None


def test_missing_github_token_behavior():
    """Verify that cloning without a token does not attach GIT_CONFIG credentials."""
    with patch("subprocess.run") as mock_run, patch("pathlib.Path.rglob") as mock_rglob:
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_proc.stdout = ""
        mock_proc.stderr = ""
        mock_run.return_value = mock_proc
        mock_rglob.return_value = []

        with patch.dict(os.environ, {}, clear=True):
            clone_repo("https://github.com/pallets/flask.git", token=None)

        assert mock_run.called
        call_args, call_kwargs = mock_run.call_args
        env = call_kwargs.get("env", {})
        assert "GIT_CONFIG_COUNT" not in env
        assert "GIT_CONFIG_KEY_0" not in env


# ---------------------------------------------------------------------------
# 2. Branch Name Sanitization & Option Injection Defense
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "malicious_branch, match_phrase",
    [
        ("--upload-pack=touch /tmp/pwned", "cannot start with a hyphen"),
        ("-u", "cannot start with a hyphen"),
        ("--config=core.sshCommand=evil", "cannot start with a hyphen"),
        ("-b", "cannot start with a hyphen"),
        ("feature/branch\x00malicious", "control characters"),
        ("feature/branch\nmalicious", "control characters"),
        ("branch with space", "whitespace"),
        ("feature..escape", "invalid ref sequence"),
        (".hidden-branch", "cannot start with a dot"),
        ("feature/.hidden", "cannot start with a dot"),
        ("feature/..hidden", "cannot start with a dot"),
        ("feature./branch", "cannot end with a dot"),
        ("feature/", "empty path component"),
        ("feature//double-slash", "empty path component"),
        ("branch@{1}", "invalid ref sequence"),
        ("branch.lock", "end with .lock"),
    ],
)
def test_malicious_branch_rejection(malicious_branch, match_phrase):
    """Verify that option flags and malicious branch names are rejected."""
    with pytest.raises(IngestionError, match=match_phrase):
        validate_git_branch(malicious_branch)

    # Also verify clone_repo rejects it upfront
    with patch("subprocess.run") as mock_run:
        with pytest.raises(IngestionError, match=match_phrase):
            clone_repo("https://github.com/pallets/flask", branch=malicious_branch)
        mock_run.assert_not_called()


@pytest.mark.parametrize(
    "valid_branch",
    [
        "main",
        "master",
        "develop",
        "feature/security-fix",
        "teams/backend/module-1",
        "hotfix/v1.2.3",
        "patch-1",
        "release-2026.11",
        "v1.2.3",
        "user_name/my-feature_v2",
    ],
)
def test_valid_branch_acceptance(valid_branch):
    """Verify that legitimate branch naming styles are preserved."""
    assert validate_git_branch(valid_branch) == valid_branch


def test_empty_or_none_branch_handling():
    """Verify None and empty branches return None."""
    assert validate_git_branch(None) is None
    assert validate_git_branch("") is None
    assert validate_git_branch("   ") is None


# ---------------------------------------------------------------------------
# 3. Local Directory Ingestion Authorization & Sandboxing
# ---------------------------------------------------------------------------

def test_local_directory_ingestion_disabled_by_default(tmp_path, monkeypatch):
    """Verify that local path scanning is rejected when CODESAGE_ALLOW_LOCAL_PATHS is unset."""
    monkeypatch.delenv("CODESAGE_ALLOW_LOCAL_PATHS", raising=False)
    test_dir = tmp_path / "custom-repo"
    test_dir.mkdir()

    with pytest.raises(IngestionError, match="disabled by security policy"):
        validate_local_path(test_dir)


def test_local_directory_confinement_when_enabled(tmp_path, monkeypatch):
    """Verify that when enabled, paths outside CODESAGE_ALLOWED_LOCAL_DIR are rejected."""
    monkeypatch.setenv("CODESAGE_ALLOW_LOCAL_PATHS", "1")
    sandbox_root = tmp_path / "sandbox"
    sandbox_root.mkdir()
    monkeypatch.setenv("CODESAGE_ALLOWED_LOCAL_DIR", str(sandbox_root))

    inside_dir = sandbox_root / "authorized-repo"
    inside_dir.mkdir()
    outside_dir = tmp_path / "outside-repo"
    outside_dir.mkdir()

    # Inside allowed root -> authorized
    validated = validate_local_path(inside_dir)
    assert validated == inside_dir.resolve()

    # Outside allowed root -> rejected
    with pytest.raises(IngestionError, match="outside the authorized local directory root"):
        validate_local_path(outside_dir)


@pytest.mark.parametrize(
    "sensitive_path",
    [
        "/etc",
        "/var",
        "~/.ssh",
        "~/.aws",
        "/",
    ],
)
def test_sensitive_directory_rejection(sensitive_path, monkeypatch):
    """Verify that system roots, home roots, and sensitive folders are always rejected."""
    monkeypatch.setenv("CODESAGE_ALLOW_LOCAL_PATHS", "1")
    with pytest.raises(IngestionError):
        validate_local_path(sensitive_path)


def test_symlink_escape_rejection(tmp_path, monkeypatch):
    """Verify that symlinks pointing outside the allowed root are rejected."""
    monkeypatch.setenv("CODESAGE_ALLOW_LOCAL_PATHS", "1")
    sandbox_root = tmp_path / "sandbox"
    sandbox_root.mkdir()
    monkeypatch.setenv("CODESAGE_ALLOWED_LOCAL_DIR", str(sandbox_root))

    secret_outside = tmp_path / "secrets"
    secret_outside.mkdir()

    symlink_inside = sandbox_root / "escape-link"
    try:
        symlink_inside.symlink_to(secret_outside)
    except OSError:
        pytest.skip("Symlink creation not supported on this environment.")

    with pytest.raises(IngestionError, match="outside the authorized local directory root"):
        validate_local_path(symlink_inside)


def test_approved_test_repo_preserved_without_env_flag():
    """Verify that designated local test repository ./test-target-repo remains usable."""
    test_repo = Path.cwd() / "test-target-repo"
    if test_repo.is_dir():
        validated = validate_local_path("./test-target-repo")
        assert validated == test_repo.resolve()


# ---------------------------------------------------------------------------
# 4. Temporary Repository Permissions (0700)
# ---------------------------------------------------------------------------

def test_temporary_directory_permissions(tmp_path):
    """Verify clone_repo creates workspace directories with 0700 permissions on POSIX."""
    local_repo = tmp_path / "source_repo"
    local_repo.mkdir()
    (local_repo / "main.py").write_text("print(1)\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(local_repo), "init", "-q"], check=True)
    subprocess.run(["git", "-C", str(local_repo), "-c", "user.name=t", "-c", "user.email=t@t", "add", "."], check=True)
    subprocess.run(["git", "-C", str(local_repo), "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init"], check=True)

    dest_parent = tmp_path / "secure-workspace"
    dest = clone_repo(str(local_repo), dest_parent=dest_parent)

    assert dest.is_dir()
    if hasattr(os, "stat"):
        parent_mode = dest_parent.stat().st_mode & 0o777
        dest_mode = dest.stat().st_mode & 0o777
        assert parent_mode == 0o700, f"Expected parent mode 0700, got {oct(parent_mode)}"
        assert dest_mode == 0o700, f"Expected dest mode 0700, got {oct(dest_mode)}"


# ---------------------------------------------------------------------------
# 5. FastAPI Endpoints Security Tests
# ---------------------------------------------------------------------------

@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)


def test_api_scan_rejects_arbitrary_system_paths(client, monkeypatch):
    """Verify that POST /scan rejects arbitrary system directories."""
    monkeypatch.delenv("CODESAGE_ALLOW_LOCAL_PATHS", raising=False)
    resp = client.post("/scan", json={"repo_url": "/etc"})
    assert resp.status_code == 400
    assert "disallowed" in resp.json()["detail"].lower() or "disabled" in resp.json()["detail"].lower()


def test_api_scan_rejects_malicious_branch(client):
    """Verify that POST /scan rejects option injection branches."""
    resp = client.post(
        "/scan",
        json={
            "repository_url": "https://github.com/pallets/flask",
            "branch": "--upload-pack=touch /tmp/pwned",
        },
    )
    assert resp.status_code == 400
    assert "hyphen" in resp.json()["detail"].lower()


def test_api_validate_rejects_malicious_branch(client):
    """Verify that GET /api/repositories/validate rejects option injection branches."""
    resp = client.get(
        "/api/repositories/validate",
        params={
            "url": "https://github.com/pallets/flask",
            "branch": "-u",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is False
    assert "hyphen" in data["error"].lower()


def test_api_scan_rejects_arbitrary_remote_host(client):
    """Verify that POST /scan rejects non-GitHub remote repository URLs."""
    resp = client.post(
        "/scan",
        json={"repository_url": "https://gitlab.com/owner/repo"},
    )
    assert resp.status_code == 400
    assert "unsupported host" in resp.json()["detail"].lower()


def test_public_api_rejects_server_fixture_path_outside_pytest(client, tmp_path, monkeypatch):
    """Verify that a path named server-fixture0 is rejected by public API when local scanning is disabled."""
    monkeypatch.delenv("CODESAGE_ALLOW_LOCAL_PATHS", raising=False)
    # Create the fixture folder so it exists on disk
    fake_fixture = tmp_path / "server-fixture0"
    fake_fixture.mkdir()

    resp = client.post(
        "/scan",
        json={"repo_url": str(fake_fixture)},
    )
    assert resp.status_code == 400
    assert "disabled" in resp.json()["detail"].lower()


def test_multiline_stderr_secret_redaction():
    """Verify that API token appearing anywhere in multiline stderr is fully redacted."""
    dummy_secret = "ghp_super_secret_multiline_token_999"

    with patch("subprocess.run") as mock_run:
        mock_proc = MagicMock()
        mock_proc.returncode = 128
        # Token is on line 1, generic error is on line 2
        mock_proc.stderr = (
            f"fatal: remote access denied with credential {dummy_secret}\n"
            "fatal: git clone exited with status 128"
        )
        mock_proc.stdout = ""
        mock_run.return_value = mock_proc

        with pytest.raises(IngestionError) as exc_info:
            clone_repo("https://github.com/pallets/flask.git", token=dummy_secret)

        err_msg = str(exc_info.value)
        # Token must NEVER appear in the exception message
        assert dummy_secret not in err_msg
        assert "git clone exited with status 128" in err_msg


# ---------------------------------------------------------------------------
# Phase 2: Lifecycle & Cleanup Architecture Tests
# ---------------------------------------------------------------------------

def test_safe_cleanup_workspace_basic_and_idempotent(tmp_path):
    target = tmp_path / "temp-ws-001"
    target.mkdir()
    (target / "dummy.txt").write_text("content")

    # First cleanup succeeds and removes target
    assert safe_cleanup_workspace(target, dest_parent=tmp_path) is True
    assert not target.exists()

    # Repeated cleanup is idempotent and returns True
    assert safe_cleanup_workspace(target, dest_parent=tmp_path) is True

    # Empty and None values return False safely
    assert safe_cleanup_workspace(None) is False
    assert safe_cleanup_workspace("") is False
    assert safe_cleanup_workspace("   ") is False


def test_safe_cleanup_workspace_symlink_does_not_delete_target(tmp_path):
    real_repo = tmp_path / "important_real_repo"
    real_repo.mkdir()
    secret_file = real_repo / "source_code.py"
    secret_file.write_text("print('critical source code')")

    symlink_repo = tmp_path / "symlink_ws"
    symlink_repo.symlink_to(real_repo, target_is_directory=True)

    assert symlink_repo.is_symlink()
    assert symlink_repo.exists()

    # Calling safe_cleanup_workspace on the symlink must delete the symlink itself
    assert safe_cleanup_workspace(symlink_repo, dest_parent=tmp_path) is True

    # Symlink is removed
    assert not symlink_repo.exists()
    assert not symlink_repo.is_symlink()

    # The target directory and its contents MUST remain 100% intact!
    assert real_repo.exists()
    assert secret_file.exists()
    assert secret_file.read_text() == "print('critical source code')"


def test_safe_cleanup_workspace_refuses_root_and_system_paths():
    # Root
    assert safe_cleanup_workspace("/") is False
    # CWD
    assert safe_cleanup_workspace(Path.cwd()) is False
    # System directories
    assert safe_cleanup_workspace("/etc") is False
    assert safe_cleanup_workspace("/bin") is False
    assert safe_cleanup_workspace("/System") is False
    # User home directory
    assert safe_cleanup_workspace(Path.home()) is False


def test_safe_cleanup_workspace_refuses_parent_container(tmp_path):
    dest_parent = tmp_path / "codesage-repos"
    dest_parent.mkdir()

    # Refuse to delete the parent directory container itself
    assert safe_cleanup_workspace(dest_parent, dest_parent=dest_parent) is False
    assert dest_parent.exists()

    # Refuse to delete system temp root
    temp_root = Path(tempfile.gettempdir())
    assert safe_cleanup_workspace(temp_root) is False
    assert temp_root.exists()


def test_safe_cleanup_workspace_handles_readonly_files(tmp_path):
    target = tmp_path / "readonly-ws"
    target.mkdir()
    ro_file = target / "readonly_pack.idx"
    ro_file.write_text("packed data")
    # Mark file as read-only (0400)
    ro_file.chmod(stat.S_IREAD)

    assert safe_cleanup_workspace(target, dest_parent=tmp_path) is True
    assert not target.exists()


def test_repo_workspace_context_manager_cleanup(tmp_path):
    temp_repo = tmp_path / "managed-repo-1"
    temp_repo.mkdir()
    (temp_repo / "app.py").write_text("print('hello')")

    ws = RepoWorkspace.from_existing(temp_repo, is_temporary=True, dest_parent=tmp_path)
    with ws as active_ws:
        assert active_ws.path == temp_repo.resolve()
        assert active_ws.repo_path == temp_repo.resolve()
        assert active_ws.is_temporary is True
        assert temp_repo.exists()

    # Automatically cleaned up on context exit
    assert not temp_repo.exists()


def test_repo_workspace_context_manager_exception_not_masked(tmp_path):
    temp_repo = tmp_path / "managed-repo-2"
    temp_repo.mkdir()
    (temp_repo / "app.py").write_text("print('hello')")

    ws = RepoWorkspace.from_existing(temp_repo, is_temporary=True, dest_parent=tmp_path)

    with pytest.raises(KeyError) as exc_info:
        with ws:
            raise KeyError("intentional_test_failure")

    assert "intentional_test_failure" in str(exc_info.value)
    # Temporary workspace must be cleaned up despite the exception
    assert not temp_repo.exists()


def test_repo_workspace_local_repo_never_deleted(tmp_path):
    local_repo = tmp_path / "user_project"
    local_repo.mkdir()
    code_file = local_repo / "main.py"
    code_file.write_text("def run(): pass")

    ws = RepoWorkspace.from_existing(local_repo, is_temporary=False, dest_parent=tmp_path)
    with ws as active_ws:
        assert active_ws.is_temporary is False
        assert active_ws.path.exists()

    # Local repo must NEVER be deleted on context exit
    assert local_repo.exists()
    assert code_file.exists()
    assert code_file.read_text() == "def run(): pass"

    # Repeated explicit cleanup also preserves local files
    assert ws.cleanup() is True
    assert local_repo.exists()
    assert code_file.exists()


def test_repo_workspace_remote_clone_cleanup_on_exit(tmp_path):
    simulated_clone_dest = tmp_path / "remote-clone-99"
    simulated_clone_dest.mkdir()
    (simulated_clone_dest / "repo_file.py").write_text("remote content")

    with patch("codesage.ingestion.clone_repo", return_value=simulated_clone_dest) as mock_clone:
        with RepoWorkspace("https://github.com/pallets/flask", dest_parent=tmp_path) as ws:
            assert ws.is_temporary is True
            assert ws.path.exists()
            mock_clone.assert_called_once()

        # On exit, the cloned workspace directory must be removed
        assert not simulated_clone_dest.exists()


def test_server_scan_finally_cleanup_on_success(tmp_path):
    from codesage.server import ScanRun, _run_scan
    from codesage.pipeline import PipelineConfig
    from codesage.llm import MockLLM

    temp_ws_dir = tmp_path / "server-scan-ws-1"
    temp_ws_dir.mkdir()
    (temp_ws_dir / "test.py").write_text("x = 1")

    run = ScanRun("scan-test-1", "https://github.com/pallets/flask")
    ws = RepoWorkspace.from_existing(temp_ws_dir, is_temporary=True, dest_parent=tmp_path)

    mock_app = MagicMock()
    mock_app.stream.return_value = [
        {"ingestion": {"workspace": ws, "repo_path": str(temp_ws_dir), "repo_metadata": {}, "technologies": {}}}
    ]

    with patch("codesage.server.build_pipeline", return_value=mock_app):
        cfg = PipelineConfig(repo_input="https://github.com/pallets/flask", llm=MockLLM(responder=lambda s, u: "{}"))
        _run_scan(run, cfg)

    assert run.status == "complete"
    # Guaranteed cleanup in finally block
    assert not temp_ws_dir.exists()


def test_server_scan_finally_cleanup_on_failure(tmp_path):
    from codesage.server import ScanRun, _run_scan
    from codesage.pipeline import PipelineConfig
    from codesage.llm import MockLLM

    temp_ws_dir = tmp_path / "server-scan-ws-fail"
    temp_ws_dir.mkdir()
    (temp_ws_dir / "test.py").write_text("x = 1")

    run = ScanRun("scan-test-fail", "https://github.com/pallets/flask")
    ws = RepoWorkspace.from_existing(temp_ws_dir, is_temporary=True, dest_parent=tmp_path)

    def failing_stream(*args, **kwargs):
        yield {"ingestion": {"workspace": ws, "repo_path": str(temp_ws_dir), "repo_metadata": {}, "technologies": {}}}
        raise RuntimeError("simulated pipeline crash during triage")

    mock_app = MagicMock()
    mock_app.stream.side_effect = failing_stream

    with patch("codesage.server.build_pipeline", return_value=mock_app):
        cfg = PipelineConfig(repo_input="https://github.com/pallets/flask", llm=MockLLM(responder=lambda s, u: "{}"))
        _run_scan(run, cfg)

    assert run.status == "failed"
    assert "simulated pipeline crash" in run.error
    # Temporary workspace MUST be cleaned up despite failure!
    assert not temp_ws_dir.exists()


def test_server_scan_finally_preserves_local_repo(tmp_path):
    from codesage.server import ScanRun, _run_scan
    from codesage.pipeline import PipelineConfig
    from codesage.llm import MockLLM

    local_repo = tmp_path / "server-local-repo"
    local_repo.mkdir()
    source_file = local_repo / "main.py"
    source_file.write_text("def local(): pass")

    run = ScanRun("scan-test-local", str(local_repo))
    ws = RepoWorkspace.from_existing(local_repo, is_temporary=False, dest_parent=tmp_path)

    mock_app = MagicMock()
    mock_app.stream.return_value = [
        {"ingestion": {"workspace": ws, "repo_path": str(local_repo), "repo_metadata": {}, "technologies": {}}}
    ]

    with patch("codesage.server.build_pipeline", return_value=mock_app):
        cfg = PipelineConfig(repo_input=str(local_repo), llm=MockLLM(responder=lambda s, u: "{}"))
        _run_scan(run, cfg)

    assert run.status == "complete"
    # Local repo must NEVER be deleted
    assert local_repo.exists()
    assert source_file.exists()
    assert source_file.read_text() == "def local(): pass"


# ---------------------------------------------------------------------------
# Phase 3: Pre-Clone Gatekeeping & Resource Caps Tests
# ---------------------------------------------------------------------------

def test_pre_clone_remote_size_rejected_before_workspace_allocation(tmp_path):
    dest_parent = tmp_path / "preclone-dest"
    dest_parent.mkdir()

    oversized_metadata = {
        "accessible": True,
        "name": "huge-repo",
        "owner": "test-org",
        "size_kb": 350 * 1024,  # 350 MB
    }

    with patch("subprocess.run") as mock_subproc:
        with pytest.raises(IngestionError) as exc_info:
            clone_repo(
                "https://github.com/test-org/huge-repo",
                dest_parent=dest_parent,
                max_size_mb=250,
                repo_metadata=oversized_metadata,
            )

        err_msg = str(exc_info.value)
        assert "350.0MB" in err_msg
        assert "250MB" in err_msg
        assert "blocked before clone" in err_msg

        # Must NOT have called git clone
        mock_subproc.assert_not_called()

        # Must NOT have created any workspace directory in dest_parent
        created_dirs = [d for d in dest_parent.iterdir() if d.is_dir()]
        assert len(created_dirs) == 0


def test_pre_clone_remote_size_under_limit_proceeds(tmp_path):
    dest_parent = tmp_path / "preclone-under-limit"
    dest_parent.mkdir()

    small_metadata = {
        "accessible": True,
        "name": "small-repo",
        "owner": "test-org",
        "size_kb": 50 * 1024,  # 50 MB
    }

    with patch("subprocess.run") as mock_subproc:
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_proc.stdout = ""
        mock_proc.stderr = ""
        mock_subproc.return_value = mock_proc

        result_path = clone_repo(
            "https://github.com/test-org/small-repo",
            dest_parent=dest_parent,
            max_size_mb=250,
            repo_metadata=small_metadata,
        )

        assert result_path.exists()
        mock_subproc.assert_called_once()


def test_pre_clone_metadata_unavailable_falls_back_gracefully(tmp_path):
    dest_parent = tmp_path / "preclone-fallback"
    dest_parent.mkdir()

    with patch("codesage.ingestion.get_github_repo_metadata", return_value={"accessible": False, "size_kb": 0}):
        with patch("subprocess.run") as mock_subproc:
            mock_proc = MagicMock()
            mock_proc.returncode = 0
            mock_proc.stdout = ""
            mock_proc.stderr = ""
            mock_subproc.return_value = mock_proc

            result_path = clone_repo(
                "https://github.com/test-org/fallback-repo",
                dest_parent=dest_parent,
                max_size_mb=250,
            )

            # Proceeds to clone without crashing due to unavailable metadata
            assert result_path.exists()
            mock_subproc.assert_called_once()


def test_bounded_manifest_parsing_large_file(tmp_path):
    from codesage.ingestion import detect_repository_technologies

    fake_repo = tmp_path / "large-manifest-repo"
    fake_repo.mkdir()

    # Create a >500KB requirements.txt
    req_file = fake_repo / "requirements.txt"
    # First 100 bytes contains fastapi
    head = "fastapi==0.100.0\nuvicorn==0.23.0\n"
    # Followed by filler lines
    padding = "# filler line comment for test\n" * 20000
    req_file.write_text(head + padding)

    assert req_file.stat().st_size > 500 * 1024

    tech = detect_repository_technologies(fake_repo)
    assert "FastAPI" in tech["frameworks"]


def test_bounded_manifest_parsing_binary_and_malformed(tmp_path):
    from codesage.ingestion import detect_repository_technologies

    fake_repo = tmp_path / "malformed-manifest-repo"
    fake_repo.mkdir()

    # Write corrupt binary bytes to package.json
    pkg_file = fake_repo / "package.json"
    pkg_file.write_bytes(b"\x80\xff\xfe\x00\x01\x02\x03random_corrupted_json{{{")

    # Write corrupt binary bytes to requirements.txt
    req_file = fake_repo / "requirements.txt"
    req_file.write_bytes(b"\x00\x01\x02\xff\xfe\xfa\xfb")

    # Must complete safely without raising UnicodeDecodeError or JSONDecodeError
    tech = detect_repository_technologies(fake_repo)
    assert isinstance(tech["frameworks"], list)


# ---------------------------------------------------------------------------
# Phase 4: Git Optimization & Subprocess Hardening Tests
# ---------------------------------------------------------------------------

def test_clone_repo_git_optimization_flags(tmp_path):
    dest_parent = tmp_path / "opt-dest"
    dest_parent.mkdir()

    with patch("subprocess.run") as mock_run:
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_proc.stdout = ""
        mock_proc.stderr = ""
        mock_run.return_value = mock_proc

        clone_repo(
            "https://github.com/pallets/flask",
            dest_parent=dest_parent,
            branch="main",
            repo_metadata={"accessible": True, "size_kb": 1024},
        )

        assert mock_run.called
        call_args, call_kwargs = mock_run.call_args
        cmd = call_args[0]
        env = call_kwargs["env"]

        # 1. --no-tags flag must be present in git clone command alongside --depth 1
        assert "--no-tags" in cmd
        assert "--depth" in cmd
        assert "1" in cmd

        # 2. GIT_LFS_SKIP_SMUDGE=1 must be set in subprocess environment
        assert env.get("GIT_LFS_SKIP_SMUDGE") == "1"
        assert env.get("GIT_TERMINAL_PROMPT") == "0"


def test_subprocess_process_group_termination_on_timeout():
    from codesage.ingestion import run_command_with_process_group
    import sys
    import time

    # Spawn a python script that sleeps
    test_cmd = [
        sys.executable,
        "-c",
        "import time; time.sleep(10)",
    ]

    start_time = time.time()
    with pytest.raises(subprocess.TimeoutExpired):
        run_command_with_process_group(test_cmd, timeout=0.3)
    duration = time.time() - start_time

    # Must timeout quickly and not hang
    assert duration < 2.0


def test_run_command_with_process_group_success():
    from codesage.ingestion import run_command_with_process_group
    import sys

    res = run_command_with_process_group([sys.executable, "-c", "print('hello_codesage')"], timeout=5)
    assert res.returncode == 0
    assert "hello_codesage" in res.stdout



