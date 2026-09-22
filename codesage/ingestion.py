"""Module 2 — ingestion: clone a repository and detect its language.

Per design.md section 6: a failed clone must surface a clear error before
the pipeline starts, not a stack trace from deep inside LangGraph.
"""

import logging
import re
import subprocess
import tempfile
import uuid
from collections import Counter
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

GIT_TIMEOUT_SECONDS = 300

# Directories that never count toward language detection.
SKIP_DIRS = {"venv", ".venv", ".git", "__pycache__", "node_modules", "data", ".pytest_cache"}

EXTENSION_TO_LANGUAGE = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "javascript",
    ".tsx": "javascript",
    ".go": "go",
    ".java": "java",
    ".rb": "ruby",
    ".php": "php",
}


class IngestionError(RuntimeError):
    """Raised when a repository cannot be cloned or inspected."""


def clone_repo(repo_url: str, dest_parent: Optional[Path] = None) -> Path:
    """Clone `repo_url` (shallow) and return the path of the working copy.

    Accepts https/ssh git URLs as well as local paths (handy for demos and
    tests). Raises IngestionError with the relevant git stderr on failure.
    """
    if not repo_url or not str(repo_url).strip():
        raise IngestionError("Repository URL is empty — nothing to clone.")

    repo_url = str(repo_url).strip()
    dest_parent = Path(dest_parent) if dest_parent else Path(tempfile.gettempdir()) / "codesage-repos"
    dest_parent.mkdir(parents=True, exist_ok=True)

    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", _repo_basename(repo_url)) or "repo"
    dest = dest_parent / f"{slug}-{uuid.uuid4().hex[:8]}"

    command = ["git", "clone", "--depth", "1", repo_url, str(dest)]
    logger.info("Cloning %s into %s", repo_url, dest)
    try:
        proc = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=GIT_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as exc:
        raise IngestionError(
            f"Cloning {repo_url!r} timed out after {GIT_TIMEOUT_SECONDS}s."
        ) from exc
    except FileNotFoundError as exc:  # git not installed
        raise IngestionError("git is not installed or not on PATH.") from exc

    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip().splitlines()
        reason = detail[-1] if detail else f"git exited with code {proc.returncode}"
        raise IngestionError(f"Could not clone {repo_url!r}: {reason}")

    return dest


def detect_language(repo_path: Path) -> str:
    """Return the dominant programming language by source-file extension."""
    repo_path = Path(repo_path)
    if not repo_path.is_dir():
        raise IngestionError(f"Not a directory: {repo_path}")

    counts: Counter = Counter()
    for path in repo_path.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        language = EXTENSION_TO_LANGUAGE.get(path.suffix.lower())
        if language:
            counts[language] += 1

    if not counts:
        return "unknown"
    return counts.most_common(1)[0][0]


def _repo_basename(repo_url: str) -> str:
    if repo_url.startswith(("http://", "https://", "ssh://", "git@")):
        parsed = urlparse(repo_url if "://" in repo_url else "ssh://" + repo_url)
        return (parsed.path.rstrip("/").rsplit("/", 1)[-1] or "repo").removesuffix(".git")
    return Path(repo_url).resolve().name.removesuffix(".git")
