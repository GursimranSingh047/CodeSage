"""Unit tests for Module 2 ingestion: repo cloning and language detection."""

import subprocess
from pathlib import Path

import pytest

from codesage.ingestion import IngestionError, _repo_basename, clone_repo, detect_language


def test_repo_basename_handles_git_urls():
    # regression: https/git@ URLs take the urlparse branch, local paths do not
    assert _repo_basename("https://github.com/owner/repo.git") == "repo"
    assert _repo_basename("https://github.com/owner/repo") == "repo"
    assert _repo_basename("git@github.com:owner/repo.git") == "repo"
    assert _repo_basename("/some/local/path/my-project") == "my-project"


def test_clone_repo_https_url_failure_raises_clean_error(tmp_path):
    # a nonexistent https remote must produce IngestionError — not a crash
    # inside URL parsing (this was a real bug found via the dashboard)
    with pytest.raises(IngestionError, match="Could not clone"):
        clone_repo("https://invalid.invalid/owner/repo.git", dest_parent=tmp_path)


@pytest.fixture
def local_git_repo(tmp_path):
    """A tiny real git repo to clone from — no network needed."""
    src = tmp_path / "source-repo"
    src.mkdir()
    (src / "app.py").write_text("print('hello')\n", encoding="utf-8")
    (src / "util.py").write_text("def f():\n    return 1\n", encoding="utf-8")
    for command in (
        ["init", "-q"],
        ["-c", "user.email=test@test", "-c", "user.name=test", "add", "."],
        ["-c", "user.email=test@test", "-c", "user.name=test",
         "commit", "-q", "-m", "init"],
    ):
        subprocess.run(["git", "-C", str(src)] + command, check=True)
    return src


def test_clone_repo_from_local_path(local_git_repo, tmp_path):
    dest = clone_repo(str(local_git_repo), dest_parent=tmp_path)
    assert (dest / "app.py").is_file()
    assert (dest / ".git").is_dir()
    assert dest.parent == tmp_path


def test_clone_repo_rejects_empty_url(tmp_path):
    with pytest.raises(IngestionError, match="empty"):
        clone_repo("   ", dest_parent=tmp_path)


def test_clone_repo_failure_raises_clear_error(tmp_path, local_git_repo):
    missing = tmp_path / "does-not-exist"
    with pytest.raises(IngestionError, match="Could not clone"):
        clone_repo(str(missing), dest_parent=tmp_path)


def test_clone_repo_failure_message_includes_git_detail(tmp_path):
    with pytest.raises(IngestionError) as exc_info:
        clone_repo("definitely-not-a-real-remote", dest_parent=tmp_path)
    assert "definitely-not-a-real-remote" in str(exc_info.value)


def test_detect_language_python(tmp_path):
    (tmp_path / "a.py").write_text("x = 1\n", encoding="utf-8")
    (tmp_path / "b.py").write_text("y = 2\n", encoding="utf-8")
    (tmp_path / "c.js").write_text("let x;\n", encoding="utf-8")
    # venv must be ignored, not counted
    noise = tmp_path / "venv" / "lib"
    noise.mkdir(parents=True)
    (noise / "noise.py").write_text("noise\n", encoding="utf-8")
    assert detect_language(tmp_path) == "python"


def test_detect_language_unknown_and_missing_dir(tmp_path):
    empty = tmp_path / "empty"
    empty.mkdir()
    assert detect_language(empty) == "unknown"
    with pytest.raises(IngestionError):
        detect_language(tmp_path / "nope")
