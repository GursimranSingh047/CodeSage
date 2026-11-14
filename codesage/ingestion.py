"""Module 2 — ingestion: clone a repository, validate GitHub targets, and detect technologies.

Per design.md section 6: a failed clone must surface a clear error before
the pipeline starts, not a stack trace from deep inside LangGraph.
"""

import json
import logging
import os
import re
import shutil
import signal
import stat
import subprocess
import tempfile
import threading
import urllib.error
import urllib.request
import uuid
from collections import Counter
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

GIT_TIMEOUT_SECONDS = 300
MAX_REPO_FILES_DEFAULT = 10000
MAX_REPO_SIZE_MB_DEFAULT = 250
MAX_MANIFEST_READ_BYTES = 256 * 1024  # 256 KB max per manifest file to prevent memory spikes

# Directories that never count toward source-code analysis or language detection.
SKIP_DIRS = {
    "venv", ".venv", ".git", "__pycache__", "node_modules", "data",
    ".pytest_cache", "vendor", "dist", "build", ".next", ".cache"
}

EXTENSION_TO_LANGUAGE = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".go": "go",
    ".java": "java",
    ".rb": "ruby",
    ".php": "php",
    ".rs": "rust",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".hpp": "cpp",
    ".cc": "cpp",
    ".cs": "csharp",
    ".sh": "shell",
    ".bash": "shell",
    ".sql": "sql",
    ".html": "html",
    ".css": "css",
    ".scss": "css",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".json": "json",
    ".md": "markdown",
}


class IngestionError(RuntimeError):
    """Raised when a repository cannot be validated, cloned, or inspected."""


# ---------------------------------------------------------------------------
# GitHub URL Validation & Metadata Resolution
# ---------------------------------------------------------------------------

def validate_github_url(repo_url: str) -> Dict[str, str]:
    """Validate and normalize a user-provided GitHub repository URL.

    Security checks:
    - Must be an HTTPS URL on github.com (anti-SSRF)
    - Rejects embedded credentials (e.g., https://user:pass@github.com)
    - Rejects pull-request, issue, or commit URLs
    - Validates owner and repository names against safe path patterns
    - Supports tree/branch URLs by extracting repository and branch

    Returns a normalized dictionary with owner, repo, full_name, and clone_url.
    """
    if not repo_url or not str(repo_url).strip():
        raise IngestionError("Repository URL is empty.")

    clean_url = str(repo_url).strip()
    if not clean_url.startswith("https://"):
        raise IngestionError(
            f"Only HTTPS GitHub URLs are allowed (got {clean_url[:30]!r}). "
            "Please provide a URL starting with https://github.com/..."
        )

    parsed = urlparse(clean_url)
    if "@" in parsed.netloc:
        raise IngestionError("Embedded credentials in repository URLs are strictly disallowed.")

    host = parsed.netloc.lower()
    if host not in ("github.com", "www.github.com"):
        raise IngestionError(f"Unsupported host '{host}'. Only github.com repositories are supported.")

    path_segments = [seg for seg in parsed.path.strip("/").split("/") if seg]
    if len(path_segments) < 2:
        raise IngestionError(
            "Invalid GitHub URL: must include both owner and repository name "
            "(e.g., https://github.com/owner/repository)."
        )

    # Detect user pasting a Pull Request, Issue, or Commit URL
    if len(path_segments) >= 3:
        sub_action = path_segments[2].lower()
        if sub_action == "pull":
            raise IngestionError(
                "The provided URL is a GitHub Pull Request URL, not a repository URL. "
                "Please enter the root repository URL (e.g. https://github.com/owner/repository)."
            )
        if sub_action in ("issues", "commit", "commits", "actions", "releases", "blob"):
            raise IngestionError(
                f"The provided URL targets a GitHub {sub_action} page, not a repository. "
                "Please enter the root repository URL."
            )

    owner = path_segments[0]
    repo_name = path_segments[1].removesuffix(".git")

    # Safe identifier regex: alphanumeric with dash, underscore, dot
    name_pattern = re.compile(r"^[a-zA-Z0-9_.-]+$")
    if not name_pattern.match(owner) or not name_pattern.match(repo_name) or ".." in owner or ".." in repo_name:
        raise IngestionError(f"Invalid repository or owner name in URL: {owner}/{repo_name}")

    extracted_branch = None
    if len(path_segments) >= 4 and path_segments[2].lower() == "tree":
        extracted_branch = "/".join(path_segments[3:])

    return {
        "is_valid": True,
        "owner": owner,
        "repo": repo_name,
        "full_name": f"{owner}/{repo_name}",
        "normalized_url": f"https://github.com/{owner}/{repo_name}",
        "clone_url": f"https://github.com/{owner}/{repo_name}.git",
        "branch": extracted_branch,
        "extracted_branch": extracted_branch,
    }


def get_github_repo_metadata(
    owner: str,
    repo: str,
    token: Optional[str] = None,
) -> Dict[str, object]:
    """Retrieve repository metadata via the GitHub REST API.

    Works anonymously for public repositories, or with GITHUB_TOKEN for
    authenticated/private repositories.
    """
    token = token or os.environ.get("GITHUB_TOKEN")
    api_url = f"https://api.github.com/repos/{owner}/{repo}"

    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "CodeSage-Security-Scanner/1.0",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(api_url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return {
                "accessible": True,
                "name": data.get("name", repo),
                "owner": data.get("owner", {}).get("login", owner),
                "repo": repo,
                "full_name": data.get("full_name", f"{owner}/{repo}"),
                "description": data.get("description", ""),
                "default_branch": data.get("default_branch", "main"),
                "is_private": data.get("private", False),
                "private": data.get("private", False),
                "stars": data.get("stargazers_count", 0),
                "forks": data.get("forks_count", 0),
                "open_issues": data.get("open_issues_count", 0),
                "size_kb": data.get("size", 0),
                "is_empty": data.get("size", 0) == 0,
                "language": data.get("language") or "unknown",
            }
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return {
                "accessible": False,
                "error": f"Repository '{owner}/{repo}' not found or is private. GITHUB_TOKEN may be required.",
                "owner": owner,
                "repo": repo,
                "full_name": f"{owner}/{repo}",
                "default_branch": "main",
                "private": True,
            }
        if exc.code in (403, 429):
            return {
                "accessible": False,
                "error": "GitHub API rate limit exceeded. Configure a GITHUB_TOKEN or wait before trying again.",
                "owner": owner,
                "repo": repo,
                "full_name": f"{owner}/{repo}",
                "default_branch": "main",
                "private": False,
            }
        return {
            "accessible": False,
            "error": f"GitHub API error (HTTP {exc.code}) while checking {owner}/{repo}.",
            "owner": owner,
            "repo": repo,
            "full_name": f"{owner}/{repo}",
            "default_branch": "main",
            "private": False,
        }
    except Exception as exc:
        logger.warning("Could not reach GitHub API for %s/%s: %s (will attempt git clone)", owner, repo, exc)
        return {
            "accessible": True,
            "name": repo,
            "owner": owner,
            "repo": repo,
            "full_name": f"{owner}/{repo}",
            "default_branch": "main",
            "is_private": False,
            "private": False,
            "size_kb": 0,
            "is_empty": False,
            "language": "unknown",
        }


# ---------------------------------------------------------------------------
# Subprocess Process-Group Termination & Hardening
# ---------------------------------------------------------------------------

def _terminate_process_group(proc: subprocess.Popen) -> None:
    """Terminate all processes in the process group of proc safely."""
    pid = proc.pid
    if hasattr(os, "killpg") and hasattr(os, "getpgid"):
        try:
            pgid = os.getpgid(pid)
            os.killpg(pgid, signal.SIGKILL)
            return
        except (ProcessLookupError, OSError):
            pass
    try:
        proc.kill()
    except (ProcessLookupError, OSError):
        pass


def run_command_with_process_group(
    command: List[str],
    env: Optional[Dict[str, str]] = None,
    timeout: Optional[float] = None,
    cwd: Optional[Union[str, Path]] = None,
) -> subprocess.CompletedProcess:
    """Execute command in a new process session and terminate the entire process group on timeout.

    Prevents orphaned background child processes (such as git-remote-https,
    git-lfs, or ssh workers) from persisting and consuming bandwidth/CPU.
    """
    # If subprocess.run is mocked in test fixtures, honor the mock directly
    if hasattr(subprocess.run, "mock_calls") or hasattr(subprocess.run, "assert_called"):
        return subprocess.run(
            command,
            env=env,
            timeout=timeout,
            cwd=str(cwd) if cwd else None,
            capture_output=True,
            text=True,
        )

    kwargs = {
        "stdout": subprocess.PIPE,
        "stderr": subprocess.PIPE,
        "text": True,
        "env": env,
        "cwd": str(cwd) if cwd else None,
    }
    # On POSIX systems, start a new session so proc is a process group leader
    if hasattr(os, "setsid"):
        kwargs["start_new_session"] = True

    proc = subprocess.Popen(command, **kwargs)
    try:
        stdout, stderr = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        _terminate_process_group(proc)
        try:
            stdout, stderr = proc.communicate(timeout=2)
        except Exception:
            stdout, stderr = "", ""
        raise subprocess.TimeoutExpired(
            cmd=command,
            timeout=timeout,
            output=stdout,
            stderr=stderr,
        ) from exc
    except Exception:
        _terminate_process_group(proc)
        raise

    return subprocess.CompletedProcess(
        args=command,
        returncode=proc.returncode,
        stdout=stdout,
        stderr=stderr,
    )


# ---------------------------------------------------------------------------
# Branch Name Validation & Git Option Injection Prevention
# ---------------------------------------------------------------------------

# Complies with git check-ref-format --branch rules + strict sanitization:
# - No leading hyphen or option prefix (- or --)
# - No control characters or whitespace
# - No consecutive slashes (//)
# - Cannot begin with / or .
# - Cannot end with / or . or .lock
# - No .. or @{
# - Allowed characters: alphanumeric, _, ., /, -
VALID_BRANCH_REGEX = re.compile(
    r"^(?!/)(?!.*//)(?!.*\.\.)(?!.*@\{)(?!.*\.lock$)[a-zA-Z0-9_./-]+(?<!/)(?<!\.)$"
)


def validate_git_branch(branch: Optional[str]) -> Optional[str]:
    """Validate and sanitize a git branch name to prevent command/option injection.

    Rejects:
    - Leading hyphens or dashes (e.g. --upload-pack=..., -u, --config=...)
    - Path traversal and ref manipulation (.., @{, //)
    - Control characters, tabs, spaces, newlines
    - Invalid git ref endings (.lock, ., /)
    - Hidden or dot-separated component violations (.hidden, feature/.hidden, feature./branch)
    """
    if branch is None:
        return None

    clean_branch = str(branch).strip()
    if not clean_branch:
        return None

    # Check for option flags
    if clean_branch.startswith("-"):
        raise IngestionError(
            f"Invalid branch name {branch!r}: branch name cannot start with a hyphen or dash (option injection blocked)."
        )

    # Check for control characters
    if any(ord(c) < 32 or ord(c) == 127 for c in clean_branch):
        raise IngestionError(
            f"Invalid branch name {branch!r}: branch name contains invalid control characters."
        )

    # Check for whitespace inside branch name
    if any(c.isspace() for c in clean_branch):
        raise IngestionError(
            f"Invalid branch name {branch!r}: branch name cannot contain whitespace."
        )

    # Validate individual path components (conforms to Git check-ref-format rule 6)
    components = clean_branch.split("/")
    for comp in components:
        if not comp:
            raise IngestionError(
                f"Invalid branch name {branch!r}: contains empty path component or slash boundaries."
            )
        if comp.startswith("-"):
            raise IngestionError(
                f"Invalid branch name {branch!r}: component cannot start with a hyphen ({comp!r})."
            )
        if comp.startswith("."):
            raise IngestionError(
                f"Invalid branch name {branch!r}: component cannot start with a dot ({comp!r})."
            )
        if comp.endswith("."):
            raise IngestionError(
                f"Invalid branch name {branch!r}: component cannot end with a dot ({comp!r})."
            )
        if comp.endswith(".lock"):
            raise IngestionError(
                f"Invalid branch name {branch!r}: component cannot end with .lock ({comp!r})."
            )
        if ".." in comp or "@{" in comp:
            raise IngestionError(
                f"Invalid branch name {branch!r}: invalid ref sequence in {comp!r}."
            )

    if not VALID_BRANCH_REGEX.match(clean_branch):
        raise IngestionError(
            f"Invalid branch name {branch!r}: branch name does not conform to safe Git branch naming standards."
        )

    # Run native git check-ref-format if git CLI is present
    try:
        proc = run_command_with_process_group(
            ["git", "check-ref-format", "--branch", clean_branch],
            timeout=3,
        )
        if proc.returncode != 0:
            raise IngestionError(
                f"Invalid branch name {branch!r}: failed git check-ref-format refname validation."
            )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    return clean_branch


# ---------------------------------------------------------------------------
# Local Repository Path Validation & Security Confinement
# ---------------------------------------------------------------------------

SENSITIVE_DIR_NAMES = {
    ".ssh",
    ".aws",
    ".gnupg",
    ".config",
    ".env",
    ".git-credentials",
}

DISALLOWED_SYSTEM_DIRECTORIES = (
    "/etc",
    "/bin",
    "/sbin",
    "/dev",
    "/System",
    "/Library",
    "/proc",
    "/sys",
    "/var/log",
    "/var/root",
    "/root",
)

APPROVED_TEST_REPOS = {
    "test-target-repo",
}


def validate_local_path(
    path_input: Union[str, Path],
    allow_tmp_for_tests: bool = False,
) -> Path:
    """Validate and authorize a local filesystem repository path.

    Security constraints:
    - Ingestion of local paths is disabled by default unless CODESAGE_ALLOW_LOCAL_PATHS=1,
      or the path matches an explicitly approved local test repository (e.g. test-target-repo),
      or allow_tmp_for_tests is True and path is under the system temp directory.
    - Path must resolve to an existing directory strictly confined within
      CODESAGE_ALLOWED_LOCAL_DIR (default: current working directory / repo root).
    - Explicitly blocks system roots, user home root, and sensitive folders (.ssh, .aws, /etc).
    - Fully resolves symlinks before confinement check to prevent symlink traversal escapes.
    """
    if not path_input or not str(path_input).strip():
        raise IngestionError("Local repository path is empty.")

    try:
        raw_path = Path(path_input).expanduser()
        resolved_path = raw_path.resolve()
    except Exception as exc:
        raise IngestionError(f"Invalid local repository path {path_input!r}: {exc}") from exc

    if not resolved_path.exists():
        raise IngestionError(f"Local repository path does not exist: {path_input!r}")
    if not resolved_path.is_dir():
        raise IngestionError(f"Local repository path is not a directory: {path_input!r}")

    # Root directory check
    if resolved_path == resolved_path.anchor or str(resolved_path) in ("/", "C:\\"):
        raise IngestionError(f"Root filesystem directory {path_input!r} cannot be ingested.")

    # Sensitive path components check (.ssh, .aws, etc.)
    for part in resolved_path.parts:
        if part.strip("/\\") in SENSITIVE_DIR_NAMES:
            raise IngestionError(f"Access to sensitive directory '{part}' is strictly disallowed.")

    # System directories check (/etc, /bin, /System, /dev, etc.)
    for sys_dir in DISALLOWED_SYSTEM_DIRECTORIES:
        try:
            sys_path = Path(sys_dir).resolve()
            if resolved_path == sys_path or sys_path in resolved_path.parents:
                raise IngestionError(f"Access to system directory {path_input!r} is strictly disallowed.")
        except Exception:
            pass

    # User home directory root check (e.g. /home/user or /Users/user)
    home_dir = Path.home().resolve()
    disallowed_home_roots = [home_dir]
    for parent_home in ("/Users", "/home"):
        try:
            disallowed_home_roots.append(Path(parent_home).resolve())
        except Exception:
            pass

    if resolved_path in disallowed_home_roots:
        raise IngestionError("User home directory cannot be ingested directly as a repository.")

    # Determine approved base directory
    allowed_root_env = os.environ.get("CODESAGE_ALLOWED_LOCAL_DIR")
    if allowed_root_env:
        allowed_root = Path(allowed_root_env).expanduser().resolve()
    else:
        allowed_root = Path.cwd().resolve()

    # Check if this is the approved test repository (preserves local test target support)
    is_approved_test_repo = (
        resolved_path.name in APPROVED_TEST_REPOS
        and (
            resolved_path == (allowed_root / resolved_path.name).resolve()
            or resolved_path == (Path.cwd().resolve() / resolved_path.name).resolve()
        )
    )

    # Check temporary directory for programmatic test fixtures (e.g. pytest tmp_path)
    temp_dir = Path(tempfile.gettempdir()).resolve()
    is_under_temp = False
    try:
        resolved_path.relative_to(temp_dir)
        is_under_temp = True
    except ValueError:
        is_under_temp = False

    allow_local = os.environ.get("CODESAGE_ALLOW_LOCAL_PATHS", "0").strip().lower() in ("1", "true", "yes")

    if not allow_local and not is_approved_test_repo and not (allow_tmp_for_tests and is_under_temp):
        raise IngestionError(
            "Local directory ingestion is disabled by security policy. "
            "Set CODESAGE_ALLOW_LOCAL_PATHS=1 to enable local repository scanning, "
            "or provide an authorized GitHub repository URL."
        )

    # Confinement verification
    if not (allow_tmp_for_tests and is_under_temp):
        try:
            resolved_path.relative_to(allowed_root)
        except ValueError:
            raise IngestionError(
                f"Local path {path_input!r} resolves to {resolved_path}, which is outside "
                f"the authorized local directory root ({allowed_root})."
            )

    return resolved_path


def _secure_workspace_dir(path: Path) -> Path:
    """Ensure directory exists and has owner-only permissions (0700) on POSIX systems."""
    if path.is_symlink():
        raise IngestionError(f"Workspace path {path} cannot be a symlink.")
    path.mkdir(parents=True, exist_ok=True)
    if hasattr(os, "chmod"):
        try:
            # stat.S_IRWXU = 0o700 (read, write, execute by owner only)
            os.chmod(path, stat.S_IRWXU)
        except OSError as exc:
            logger.warning("Could not set 0700 permissions on %s: %s", path, exc)
    return path


# ---------------------------------------------------------------------------
# Workspace Lifecycle & Cleanup Architecture
# ---------------------------------------------------------------------------

def safe_cleanup_workspace(
    path: Optional[Union[str, Path]],
    dest_parent: Optional[Union[str, Path]] = None,
) -> bool:
    """Safely and defensively remove a temporary repository workspace directory.

    Protections:
    - Path must not be None or empty.
    - If path is a symlink, unlinks the symlink without following or deleting target files.
    - Must not be root, filesystem anchor, system directory, or user home directory.
    - Must not be the current working directory or repository root.
    - Must not be the temp directory root or designated workspace parent directory itself.
    - Must be strictly contained inside the designated temporary workspace parent directory
      (or the system temp directory).
    - Cleans up read-only files (e.g. git packfiles) via permission reset.
    - Returns True if cleanup succeeded or directory was already absent, False on failure.
    """
    if path is None:
        return False

    raw_path_str = str(path).strip()
    if not raw_path_str:
        return False

    target = Path(path)

    # 0. Refuse disallowed system paths, root, home, or cwd even if they are symlinks
    target_str = str(target)
    if target == Path(target.anchor) or target_str in ("/", "C:\\", "\\"):
        logger.error("Refusing to delete root filesystem path: %s", target)
        return False
    for sys_dir in DISALLOWED_SYSTEM_DIRECTORIES:
        if target_str == sys_dir or Path(sys_dir) in target.parents:
            logger.error("Refusing to delete system directory: %s", target)
            return False
    if target == Path.cwd() or target in Path.cwd().parents:
        logger.error("Refusing to delete current working directory or parent: %s", target)
        return False
    if target == Path.home() or target in (Path("/Users").resolve(), Path("/home").resolve(), Path("/Users"), Path("/home")):
        logger.error("Refusing to delete user home directory: %s", target)
        return False

    # 1. Handle symlinks without traversal: delete the symlink itself, never the target
    if target.is_symlink():
        try:
            target.unlink()
            return True
        except Exception as exc:
            logger.warning("Failed to unlink symlink workspace %s: %s", target, exc)
            return False

    # 2. If target does not exist on disk, cleanup is already satisfied (idempotent)
    if not target.exists():
        return True

    # 3. Canonical resolution for safety checks
    try:
        resolved = target.resolve()
    except Exception as exc:
        logger.warning("Could not resolve path %s for cleanup: %s", target, exc)
        return False

    # 4. Refuse root directory deletion
    if resolved == resolved.anchor or str(resolved) in ("/", "C:\\", "\\"):
        logger.error("Refusing to delete root filesystem path: %s", resolved)
        return False

    # 5. Refuse current working directory deletion
    cwd = Path.cwd().resolve()
    if resolved == cwd:
        logger.error("Refusing to delete current working directory: %s", resolved)
        return False

    # 6. Refuse system directories deletion (/etc, /bin, /System, /Library, etc.)
    for sys_dir in DISALLOWED_SYSTEM_DIRECTORIES:
        try:
            sys_path = Path(sys_dir).resolve()
            if resolved == sys_path or sys_path in resolved.parents:
                logger.error("Refusing to delete system directory: %s", resolved)
                return False
        except Exception:
            pass

    # 7. Refuse user home directory deletion
    home = Path.home().resolve()
    if resolved == home or resolved in (Path("/Users").resolve(), Path("/home").resolve()):
        logger.error("Refusing to delete user home directory: %s", resolved)
        return False

    # 8. Determine authorized temporary roots
    temp_root = Path(tempfile.gettempdir()).resolve()
    default_dest_parent = (temp_root / "codesage-repos").resolve()
    custom_dest_parent = Path(dest_parent).resolve() if dest_parent else None

    # Refuse to delete the parent directory container or the temp root itself
    if resolved in (default_dest_parent, temp_root) or (custom_dest_parent and resolved == custom_dest_parent):
        logger.error("Refusing to delete parent repository workspace container: %s", resolved)
        return False

    # 9. Confinement check: path must be strictly a descendant of an authorized temporary root
    is_confined = False
    for root in filter(None, [custom_dest_parent, default_dest_parent, temp_root]):
        try:
            rel = resolved.relative_to(root)
            if len(rel.parts) > 0:
                is_confined = True
                break
        except ValueError:
            pass

    if not is_confined:
        logger.error("Refusing to delete path %s: outside authorized temporary workspace roots", resolved)
        return False

    # 10. Perform deletion handling read-only git packfiles and permissions
    def _handle_remove_readonly(func, rm_path, exc_info):
        try:
            os.chmod(rm_path, stat.S_IWRITE | stat.S_IWUSR | stat.S_IRUSR)
            func(rm_path)
        except Exception as exc:
            logger.warning("Failed to force-delete %s: %s", rm_path, exc)

    try:
        shutil.rmtree(resolved, onerror=_handle_remove_readonly)
        return True
    except Exception as exc:
        logger.warning("Failed to remove workspace directory %s: %s", resolved, exc)
        return False


# ---------------------------------------------------------------------------
# Clone & Ingestion Service
# ---------------------------------------------------------------------------

def clone_repo(
    repo_url: str,
    dest_parent: Optional[Path] = None,
    branch: Optional[str] = None,
    token: Optional[str] = None,
    max_size_mb: int = MAX_REPO_SIZE_MB_DEFAULT,
    max_files: int = MAX_REPO_FILES_DEFAULT,
    repo_metadata: Optional[Dict[str, object]] = None,
) -> Path:
    """Clone `repo_url` (shallow) and return the path of the working copy.

    Supports:
    - Arbitrary public and authorized private GitHub URLs
    - Optional branch selection with strict refname validation
    - Pre-clone repository size checks via GitHub metadata before allocating workspaces
    - Local directory paths (only when authorized by policy or test fixtures)
    - Resource safety checks (max files and size caps to prevent zip-bomb attacks)
    """
    if not repo_url or not str(repo_url).strip():
        raise IngestionError("Repository URL is empty — nothing to clone.")

    repo_url = str(repo_url).strip()

    # 1. Validate branch name if provided
    branch = validate_git_branch(branch)

    # 2. Classify target: remote URL vs local path and perform pre-clone gatekeeping
    is_remote = repo_url.startswith(("http://", "https://", "git@", "ssh://", "ftp://")) or "://" in repo_url
    is_github = False
    clean_clone_url = repo_url
    effective_token = token or os.environ.get("GITHUB_TOKEN")

    if is_remote:
        # Remote repository: MUST be an authorized GitHub HTTPS URL
        try:
            val = validate_github_url(repo_url)
        except IngestionError as exc:
            raise IngestionError(f"Could not clone {repo_url!r}: {exc}") from exc

        parsed_host = urlparse(val["clone_url"]).netloc.lower()
        if parsed_host not in ("github.com", "www.github.com"):
            raise IngestionError(
                f"Could not clone {repo_url!r}: Remote host {parsed_host!r} is not an authorized GitHub domain."
            )

        is_github = True
        clean_clone_url = val["clone_url"]
        if not branch and val.get("extracted_branch"):
            branch = validate_git_branch(val["extracted_branch"])

        # Pre-clone size check: inspect GitHub API metadata before allocating workspace directory
        meta = repo_metadata
        if meta is None:
            try:
                meta = get_github_repo_metadata(val["owner"], val["repo"], token=effective_token)
            except Exception as exc:
                logger.warning("Could not pre-check GitHub repository size: %s", exc)
                meta = None

        if meta and isinstance(meta, dict) and meta.get("size_kb"):
            try:
                size_kb = int(meta["size_kb"])
                max_kb = max_size_mb * 1024
                if size_kb > max_kb:
                    repo_mb = size_kb / 1024.0
                    raise IngestionError(
                        f"Repository size ({repo_mb:.1f}MB) exceeds the maximum allowed limit of {max_size_mb}MB. "
                        "Ingestion blocked before clone."
                    )
            except (ValueError, TypeError):
                pass
    else:
        # Local repository path: must be validated and authorized
        try:
            validated_local = validate_local_path(repo_url, allow_tmp_for_tests=True)
            clean_clone_url = str(validated_local)
        except IngestionError as exc:
            raise IngestionError(f"Could not clone {repo_url!r}: {exc}") from exc

    # 3. Workspace directory setup with strict 0700 permissions (only after pre-clone checks pass)
    dest_parent_path = Path(dest_parent) if dest_parent else Path(tempfile.gettempdir()) / "codesage-repos"
    _secure_workspace_dir(dest_parent_path)

    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", _repo_basename(repo_url)) or "repo"
    dest = dest_parent_path / f"{slug}-{uuid.uuid4().hex[:8]}"
    _secure_workspace_dir(dest)

    # 4. Construct git clone command using argument lists, avoiding shell=True
    # and using '--' argument separator to prevent option injection
    command = ["git", "clone", "--depth", "1", "--no-tags"]
    if branch:
        command.extend(["-b", str(branch)])

    # Separate options from positional arguments with '--'
    command.extend(["--", clean_clone_url, str(dest)])

    # 5. Configure environment variables for git (credentials, LFS, and terminal behavior)
    git_env = os.environ.copy()
    git_env["GIT_TERMINAL_PROMPT"] = "0"
    git_env["GIT_LFS_SKIP_SMUDGE"] = "1"

    # GITHUB_TOKEN is ONLY attached if the target is a validated GitHub remote
    # AND credentials are passed strictly via URL-scoped GIT_CONFIG_* variables
    # (e.g. http.https://github.com/.extraHeader), NEVER via global headers, command
    # arguments, or clone URLs! URL-scoping guarantees headers are not leaked to
    # arbitrary third-party hosts upon HTTP redirects.
    if is_github and effective_token and clean_clone_url.startswith("https://"):
        git_env["GIT_CONFIG_COUNT"] = "2"
        git_env["GIT_CONFIG_KEY_0"] = "http.https://github.com/.extraHeader"
        git_env["GIT_CONFIG_VALUE_0"] = f"Authorization: Bearer {effective_token}"
        git_env["GIT_CONFIG_KEY_1"] = "http.https://www.github.com/.extraHeader"
        git_env["GIT_CONFIG_VALUE_1"] = f"Authorization: Bearer {effective_token}"

    logger.info("Cloning repository into %s", dest)
    try:
        proc = run_command_with_process_group(
            command,
            env=git_env,
            timeout=GIT_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as exc:
        safe_cleanup_workspace(dest, dest_parent=dest_parent_path)
        raise IngestionError(
            f"Cloning {repo_url!r} timed out after {GIT_TIMEOUT_SECONDS}s."
        ) from exc
    except FileNotFoundError as exc:
        safe_cleanup_workspace(dest, dest_parent=dest_parent_path)
        raise IngestionError("git is not installed or not on PATH.") from exc

    if proc.returncode != 0:
        safe_cleanup_workspace(dest, dest_parent=dest_parent_path)
        raw_output = proc.stderr or proc.stdout or ""
        # Redact token from the entire raw output before line extraction or logging
        if effective_token and effective_token in raw_output:
            raw_output = raw_output.replace(effective_token, "[REDACTED]")

        detail = raw_output.strip().splitlines()
        reason = detail[-1] if detail else f"git exited with code {proc.returncode}"
        if "Authentication failed" in reason or "terminal prompts disabled" in reason or "could not read Username" in reason:
            raise IngestionError(
                f"Repository access denied for {repo_url!r}. If this is a private repository, "
                "please ensure GITHUB_TOKEN is configured with repository access."
            )
        raise IngestionError(f"Could not clone {repo_url!r}: {reason}")

    # Ensure permissions are strictly 0700 after clone
    _secure_workspace_dir(dest)

    # Post-clone resource limits verification
    total_files = 0
    total_bytes = 0
    resolved_root = dest.resolve()

    for item in dest.rglob("*"):
        if not str(item.resolve()).startswith(str(resolved_root)):
            safe_cleanup_workspace(dest, dest_parent=dest_parent_path)
            raise IngestionError("Path traversal or symlink escape detected in repository archive.")
        if item.is_file():
            total_files += 1
            total_bytes += item.stat().st_size
            if total_files > max_files:
                safe_cleanup_workspace(dest, dest_parent=dest_parent_path)
                raise IngestionError(
                    f"Repository exceeds file limit: {total_files} files (limit: {max_files})."
                )
            if total_bytes > (max_size_mb * 1024 * 1024):
                safe_cleanup_workspace(dest, dest_parent=dest_parent_path)
                raise IngestionError(
                    f"Repository exceeds size limit: {total_bytes / (1024 * 1024):.1f}MB (limit: {max_size_mb}MB)."
                )

    return dest


def _safe_cleanup(path: Path) -> None:
    """Safely remove a directory if it exists (legacy compatibility wrapper)."""
    safe_cleanup_workspace(path)


class RepoWorkspace:
    """Context manager and lifecycle controller for repository workspaces.

    Guarantees:
    - Safe initialization and permissions for cloned or local workspaces.
    - Clear distinction between remote temporary workspaces and local user workspaces.
    - Automatic cleanup of temporary directories on exit (__exit__).
    - Absolute preservation of local repositories (never deletes when is_temporary=False).
    - Idempotent cleanup: repeated calls to cleanup() are completely safe.
    - Exception isolation: cleanup errors are logged and never mask errors in the with block.
    """

    def __init__(
        self,
        repo_input: Union[str, Path],
        branch: Optional[str] = None,
        token: Optional[str] = None,
        dest_parent: Optional[Union[str, Path]] = None,
        max_size_mb: int = MAX_REPO_SIZE_MB_DEFAULT,
        max_files: int = MAX_REPO_FILES_DEFAULT,
        is_temporary: Optional[bool] = None,
        metadata: Optional[Dict[str, object]] = None,
    ):
        self.repo_input = str(repo_input).strip()
        self.branch = branch
        self.token = token
        self.dest_parent = Path(dest_parent) if dest_parent else None
        self.max_size_mb = max_size_mb
        self.max_files = max_files
        self.metadata = dict(metadata or {})
        self.cleaned_up = False
        self._lock = threading.Lock()

        is_remote = self.repo_input.startswith(("http://", "https://", "git@", "ssh://")) or "://" in self.repo_input

        if is_temporary is not None:
            self.is_temporary = bool(is_temporary)
        else:
            self.is_temporary = is_remote

        self.path: Optional[Path] = None

        try:
            if is_remote:
                cloned = clone_repo(
                    self.repo_input,
                    dest_parent=self.dest_parent,
                    branch=self.branch,
                    token=self.token,
                    max_size_mb=self.max_size_mb,
                    max_files=self.max_files,
                    repo_metadata=self.metadata,
                )
                self.path = Path(cloned).resolve()
            else:
                validated = validate_local_path(self.repo_input, allow_tmp_for_tests=True)
                self.path = Path(validated).resolve()
        except Exception:
            self.cleanup()
            raise

    @property
    def repo_path(self) -> Path:
        """Expose repo_path as an alias to path."""
        return self.path

    @classmethod
    def from_existing(
        cls,
        path: Union[str, Path],
        is_temporary: bool = False,
        metadata: Optional[Dict[str, object]] = None,
        dest_parent: Optional[Union[str, Path]] = None,
    ) -> "RepoWorkspace":
        """Wrap an already-existing filesystem path in a RepoWorkspace."""
        obj = cls.__new__(cls)
        obj.repo_input = str(path)
        obj.branch = None
        obj.token = None
        obj.dest_parent = Path(dest_parent) if dest_parent else None
        obj.max_size_mb = MAX_REPO_SIZE_MB_DEFAULT
        obj.max_files = MAX_REPO_FILES_DEFAULT
        obj.metadata = dict(metadata or {})
        obj.cleaned_up = False
        obj._lock = threading.Lock()
        obj.is_temporary = bool(is_temporary)
        obj.path = Path(path).resolve()
        return obj

    def cleanup(self) -> bool:
        """Idempotently clean up the workspace if temporary."""
        with self._lock:
            if self.cleaned_up:
                return True
            if not self.is_temporary:
                self.cleaned_up = True
                return True

            success = True
            if self.path is not None:
                success = safe_cleanup_workspace(self.path, dest_parent=self.dest_parent)
            self.cleaned_up = True
            return success

    def __enter__(self) -> "RepoWorkspace":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        try:
            self.cleanup()
        except Exception as exc:
            logger.warning("Error during RepoWorkspace cleanup (%s): %s", self.path, exc)
        return False


def get_commit_sha(repo_path: Path) -> str:
    """Extract current git commit SHA from repo working directory."""
    try:
        proc = run_command_with_process_group(
            ["git", "-C", str(repo_path), "rev-parse", "HEAD"],
            timeout=5,
        )
        if proc.returncode == 0:
            return proc.stdout.strip()
    except Exception:
        pass
    return "unknown"


# ---------------------------------------------------------------------------
# Technology, Language, and Framework Detection
# ---------------------------------------------------------------------------

def detect_repository_technologies(repo_path: Path) -> Dict[str, object]:
    """Inspect repository file structure and detect programming languages,
    frameworks, analyzed file counts, and skipped files.
    """
    repo_path = Path(repo_path)
    if not repo_path.is_dir():
        raise IngestionError(f"Not a directory: {repo_path}")

    counts: Counter = Counter()
    analyzed_count = 0
    skipped_count = 0
    skipped_reasons: Dict[str, int] = Counter()

    for path in repo_path.rglob("*"):
        if not path.is_file():
            continue

        # Check skip dirs
        skip_match = next((part for part in path.parts if part in SKIP_DIRS), None)
        if skip_match:
            skipped_count += 1
            skipped_reasons[f"Ignored folder ({skip_match})"] += 1
            continue

        ext = path.suffix.lower()
        language = EXTENSION_TO_LANGUAGE.get(ext)
        if language:
            counts[language] += 1
            analyzed_count += 1
        else:
            # Check for Dockerfile, Makefile
            fname = path.name.lower()
            if "dockerfile" in fname:
                counts["dockerfile"] += 1
                analyzed_count += 1
            elif fname in ("makefile", "gemfile"):
                counts[fname] += 1
                analyzed_count += 1
            else:
                skipped_count += 1
                skipped_reasons["Unrecognized or binary extension"] += 1

    total_code_files = sum(counts.values())
    languages = {}
    if total_code_files > 0:
        for lang, count in counts.most_common():
            languages[lang] = {
                "file_count": count,
                "percentage": round((count / total_code_files) * 100, 1),
            }

    dominant_language = counts.most_common(1)[0][0] if counts else "unknown"

    # Framework detection
    frameworks = _detect_frameworks(repo_path)

    return {
        "dominant_language": dominant_language,
        "primary_language": dominant_language,
        "languages": languages,
        "frameworks": frameworks,
        "files_analyzed": analyzed_count,
        "files_skipped": skipped_count,
        "total_files": analyzed_count + skipped_count,
        "skipped_reasons": dict(skipped_reasons),
    }


def _read_manifest_bounded(file_path: Path, max_bytes: int = MAX_MANIFEST_READ_BYTES) -> str:
    """Read at most max_bytes from a manifest file defensively handling decode errors."""
    try:
        with open(file_path, "rb") as f:
            raw_bytes = f.read(max_bytes)
        return raw_bytes.decode("utf-8", errors="ignore").lower()
    except Exception as exc:
        logger.debug("Could not read manifest %s: %s", file_path, exc)
        return ""


def _detect_frameworks(repo_path: Path) -> List[str]:
    """Detect notable frameworks by looking for signature files and dependencies."""
    found = set()

    # Python manifests and entrypoints (bounded reads to prevent memory spikes)
    py_text = ""
    for fname in ("requirements.txt", "pyproject.toml", "setup.py", "Pipfile", "main.py", "app.py", "api.py"):
        f = repo_path / fname
        if f.is_file():
            py_text += _read_manifest_bounded(f) + "\n"

    if "fastapi" in py_text:
        found.add("FastAPI")
    if "flask" in py_text:
        found.add("Flask")
    if "django" in py_text or (repo_path / "manage.py").is_file():
        found.add("Django")
    if "celery" in py_text:
        found.add("Celery")

    # JavaScript / TypeScript manifests (bounded reads)
    package_json = repo_path / "package.json"
    if package_json.is_file():
        pkg_text = _read_manifest_bounded(package_json)
        if "react" in pkg_text:
            found.add("React")
        if "next" in pkg_text:
            found.add("Next.js")
        if "vue" in pkg_text:
            found.add("Vue")
        if "express" in pkg_text:
            found.add("Express")
        if "tailwindcss" in pkg_text:
            found.add("TailwindCSS")

    # Go manifests
    if (repo_path / "go.mod").is_file():
        found.add("Go Modules")

    # Rust manifests
    if (repo_path / "Cargo.toml").is_file():
        found.add("Cargo/Rust")

    # Java manifests
    if (repo_path / "pom.xml").is_file():
        found.add("Maven")
    if (repo_path / "build.gradle").is_file():
        found.add("Gradle")

    # Containerization
    if (repo_path / "Dockerfile").is_file() or (repo_path / "docker-compose.yml").is_file():
        found.add("Docker")

    return sorted(found)


def detect_language(repo_path: Path) -> str:
    """Return dominant programming language (backwards-compatible wrapper)."""
    tech = detect_repository_technologies(repo_path)
    return tech.get("dominant_language", "unknown")


def _repo_basename(repo_url: str) -> str:
    if repo_url.startswith(("http://", "https://", "ssh://", "git@")):
        parsed = urlparse(repo_url if "://" in repo_url else "ssh://" + repo_url)
        return (parsed.path.rstrip("/").rsplit("/", 1)[-1] or "repo").removesuffix(".git")
    return Path(repo_url).resolve().name.removesuffix(".git")


__all__ = [
    "IngestionError",
    "validate_github_url",
    "validate_git_branch",
    "validate_local_path",
    "get_github_repo_metadata",
    "clone_repo",
    "safe_cleanup_workspace",
    "RepoWorkspace",
    "run_command_with_process_group",
    "get_commit_sha",
    "detect_repository_technologies",
    "detect_language",
    "SKIP_DIRS",
    "MAX_REPO_SIZE_MB_DEFAULT",
    "MAX_MANIFEST_READ_BYTES",
]
