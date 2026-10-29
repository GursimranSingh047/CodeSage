"""Module 2 — ingestion: clone a repository, validate GitHub targets, and detect technologies.

Per design.md section 6: a failed clone must surface a clear error before
the pipeline starts, not a stack trace from deep inside LangGraph.
"""

import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.request
import uuid
from collections import Counter
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

GIT_TIMEOUT_SECONDS = 300
MAX_REPO_FILES_DEFAULT = 10000
MAX_REPO_SIZE_MB_DEFAULT = 250

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
# Clone & Ingestion Service
# ---------------------------------------------------------------------------

def clone_repo(
    repo_url: str,
    dest_parent: Optional[Path] = None,
    branch: Optional[str] = None,
    token: Optional[str] = None,
    max_size_mb: int = MAX_REPO_SIZE_MB_DEFAULT,
    max_files: int = MAX_REPO_FILES_DEFAULT,
) -> Path:
    """Clone `repo_url` (shallow) and return the path of the working copy.

    Supports:
    - Arbitrary public and authorized private GitHub URLs
    - Optional branch selection
    - Local directory paths (for tests and offline benchmarks)
    - Resource safety checks (max files and size caps to prevent zip-bomb attacks)
    """
    if not repo_url or not str(repo_url).strip():
        raise IngestionError("Repository URL is empty — nothing to clone.")

    repo_url = str(repo_url).strip()
    dest_parent = Path(dest_parent) if dest_parent else Path(tempfile.gettempdir()) / "codesage-repos"
    dest_parent.mkdir(parents=True, exist_ok=True)

    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", _repo_basename(repo_url)) or "repo"
    dest = dest_parent / f"{slug}-{uuid.uuid4().hex[:8]}"

    # Validate if it looks like a remote URL
    clean_clone_url = repo_url
    if repo_url.startswith(("http://", "https://", "git@")) and "github.com" in repo_url:
        val = validate_github_url(repo_url)
        clean_clone_url = val["clone_url"]
        if not branch and val.get("extracted_branch"):
            branch = val["extracted_branch"]

    command = ["git", "clone", "--depth", "1"]
    if branch:
        command.extend(["-b", str(branch)])

    # Use secure extraHeader for private repos so token is never logged in URL
    token = token or os.environ.get("GITHUB_TOKEN")
    if token and clean_clone_url.startswith("https://"):
        command.extend(["-c", f"http.extraHeader=Authorization: token {token}"])

    command.extend([clean_clone_url, str(dest)])

    logger.info("Cloning %s (branch: %s) into %s", repo_url, branch or "default", dest)
    try:
        proc = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=GIT_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as exc:
        _safe_cleanup(dest)
        raise IngestionError(
            f"Cloning {repo_url!r} timed out after {GIT_TIMEOUT_SECONDS}s."
        ) from exc
    except FileNotFoundError as exc:
        raise IngestionError("git is not installed or not on PATH.") from exc

    if proc.returncode != 0:
        _safe_cleanup(dest)
        detail = (proc.stderr or proc.stdout or "").strip().splitlines()
        reason = detail[-1] if detail else f"git exited with code {proc.returncode}"
        # Redact token if it ever appeared in git output
        if token and token in reason:
            reason = reason.replace(token, "[REDACTED]")
        if "Authentication failed" in reason or "terminal prompts disabled" in reason or "could not read Username" in reason:
            raise IngestionError(
                f"Repository access denied for {repo_url!r}. If this is a private repository, "
                "please ensure GITHUB_TOKEN is configured with repository access."
            )
        raise IngestionError(f"Could not clone {repo_url!r}: {reason}")

    # Post-clone resource limits verification
    total_files = 0
    total_bytes = 0
    resolved_root = dest.resolve()

    for item in dest.rglob("*"):
        if not str(item.resolve()).startswith(str(resolved_root)):
            _safe_cleanup(dest)
            raise IngestionError("Path traversal or symlink escape detected in repository archive.")
        if item.is_file():
            total_files += 1
            total_bytes += item.stat().st_size
            if total_files > max_files:
                _safe_cleanup(dest)
                raise IngestionError(
                    f"Repository exceeds file limit: {total_files} files (limit: {max_files})."
                )
            if total_bytes > (max_size_mb * 1024 * 1024):
                _safe_cleanup(dest)
                raise IngestionError(
                    f"Repository exceeds size limit: {total_bytes / (1024 * 1024):.1f}MB (limit: {max_size_mb}MB)."
                )

    return dest


def _safe_cleanup(path: Path) -> None:
    """Safely remove a directory if it exists."""
    if path and path.exists():
        try:
            shutil.rmtree(path, ignore_errors=True)
        except Exception:
            pass


def get_commit_sha(repo_path: Path) -> str:
    """Extract current git commit SHA from repo working directory."""
    try:
        proc = subprocess.run(
            ["git", "-C", str(repo_path), "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
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


def _detect_frameworks(repo_path: Path) -> List[str]:
    """Detect notable frameworks by looking for signature files and dependencies."""
    found = set()

    # Python manifests and entrypoints
    py_text = ""
    for fname in ("requirements.txt", "pyproject.toml", "setup.py", "Pipfile", "main.py", "app.py", "api.py"):
        f = repo_path / fname
        if f.is_file():
            try:
                py_text += f.read_text(encoding="utf-8", errors="ignore").lower() + "\n"
            except Exception:
                pass

    if "fastapi" in py_text:
        found.add("FastAPI")
    if "flask" in py_text:
        found.add("Flask")
    if "django" in py_text or (repo_path / "manage.py").is_file():
        found.add("Django")
    if "celery" in py_text:
        found.add("Celery")

    # JavaScript / TypeScript manifests
    package_json = repo_path / "package.json"
    if package_json.is_file():
        try:
            pkg_text = package_json.read_text(encoding="utf-8", errors="ignore").lower()
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
        except Exception:
            pass

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
    "get_github_repo_metadata",
    "clone_repo",
    "get_commit_sha",
    "detect_repository_technologies",
    "detect_language",
    "SKIP_DIRS",
]
