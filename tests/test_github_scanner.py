"""Comprehensive tests for the GitHub Repository Scanner feature.

Covers:
- URL validation and security boundary checks (anti-SSRF, credential stripping, PR URL rejection)
- GitHub repository metadata retrieval and error handling (404, rate limits)
- Multi-language technology stack and framework detection
- Ingestion safeguards (max file and size constraints)
- FastAPI endpoints (/api/repositories/validate, /api/repositories/scan, /scan/{id}/report)
"""

import json
import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch
import urllib.error

import pytest
from starlette.testclient import TestClient

from codesage.ingestion import (
    IngestionError,
    clone_repo,
    detect_repository_technologies,
    get_github_repo_metadata,
    validate_github_url,
)
from codesage.server import create_app


# ---------------------------------------------------------------------------
# 1. URL Validation Tests
# ---------------------------------------------------------------------------

def test_validate_github_url_success():
    res = validate_github_url("https://github.com/pallets/flask")
    assert res["is_valid"] is True
    assert res["owner"] == "pallets"
    assert res["repo"] == "flask"
    assert res["full_name"] == "pallets/flask"
    assert res["normalized_url"] == "https://github.com/pallets/flask"
    assert res["clone_url"] == "https://github.com/pallets/flask.git"
    assert res["branch"] is None


def test_validate_github_url_with_git_suffix():
    res = validate_github_url("https://github.com/expressjs/express.git")
    assert res["is_valid"] is True
    assert res["owner"] == "expressjs"
    assert res["repo"] == "express"
    assert res["full_name"] == "expressjs/express"


def test_validate_github_url_with_tree_branch():
    res = validate_github_url("https://github.com/gin-gonic/gin/tree/develop")
    assert res["is_valid"] is True
    assert res["owner"] == "gin-gonic"
    assert res["repo"] == "gin"
    assert res["branch"] == "develop"


@pytest.mark.parametrize(
    "invalid_url, expected_err",
    [
        ("http://github.com/owner/repo", "Only HTTPS GitHub URLs are allowed"),
        ("https://gitlab.com/owner/repo", "Unsupported host 'gitlab.com'"),
        ("https://bitbucket.org/owner/repo", "Unsupported host 'bitbucket.org'"),
        ("https://user:password@github.com/owner/repo", "Embedded credentials"),
        ("https://github.com/owner/repo/pull/123", "GitHub Pull Request URL"),
        ("https://github.com/owner/repo/issues/45", "targets a GitHub issues page"),
        ("https://github.com/owner/repo/blob/main/main.py", "targets a GitHub blob page"),
        ("https://github.com/owner/repo/commit/abcdef123", "targets a GitHub commit page"),
        ("https://github.com/owner", "must include both owner and repository name"),
        ("https://github.com/owner/../malicious", "Invalid repository or owner name"),
        ("   ", "Repository URL is empty"),
        ("", "Repository URL is empty"),
    ],
)
def test_validate_github_url_rejections(invalid_url, expected_err):
    with pytest.raises(IngestionError, match=expected_err):
        validate_github_url(invalid_url)


# ---------------------------------------------------------------------------
# 2. Metadata Retrieval Tests
# ---------------------------------------------------------------------------

@patch("codesage.ingestion.urllib.request.urlopen")
def test_get_github_repo_metadata_success(mock_urlopen):
    fake_body = json.dumps({
        "full_name": "pallets/flask",
        "description": "The Python micro framework for building web applications.",
        "default_branch": "main",
        "stargazers_count": 68000,
        "forks_count": 16000,
        "open_issues_count": 12,
        "private": False,
        "html_url": "https://github.com/pallets/flask",
        "language": "Python",
    }).encode("utf-8")

    mock_resp = MagicMock()
    mock_resp.read.return_value = fake_body
    mock_resp.status = 200
    mock_urlopen.return_value.__enter__.return_value = mock_resp

    meta = get_github_repo_metadata("pallets", "flask", token="dummy-token")
    assert meta["accessible"] is True
    assert meta["full_name"] == "pallets/flask"
    assert meta["default_branch"] == "main"
    assert meta["stars"] == 68000
    assert meta["private"] is False


@patch("codesage.ingestion.urllib.request.urlopen")
def test_get_github_repo_metadata_not_found(mock_urlopen):
    err = urllib.error.HTTPError(
        url="https://api.github.com/repos/unknown/nonexistent",
        code=404,
        msg="Not Found",
        hdrs={},
        fp=None,
    )
    mock_urlopen.side_effect = err

    meta = get_github_repo_metadata("unknown", "nonexistent")
    assert meta["accessible"] is False
    assert "not found or is private" in meta["error"].lower()


@patch("codesage.ingestion.urllib.request.urlopen")
def test_get_github_repo_metadata_rate_limit(mock_urlopen):
    err = urllib.error.HTTPError(
        url="https://api.github.com/repos/pallets/flask",
        code=403,
        msg="Forbidden",
        hdrs={},
        fp=None,
    )
    mock_urlopen.side_effect = err

    meta = get_github_repo_metadata("pallets", "flask")
    assert meta["accessible"] is False
    assert "rate limit exceeded" in meta["error"].lower()


# ---------------------------------------------------------------------------
# 3. Technology & Framework Detection Tests
# ---------------------------------------------------------------------------

def test_detect_repository_technologies(tmp_path):
    # Setup mixed-language repository structure
    repo_dir = tmp_path / "sample_project"
    repo_dir.mkdir()

    # Python files with FastAPI framework signature
    (repo_dir / "main.py").write_text("from fastapi import FastAPI\napp = FastAPI()\n", encoding="utf-8")
    (repo_dir / "service.py").write_text("def run(): pass\n", encoding="utf-8")

    # JavaScript file with React signature
    (repo_dir / "package.json").write_text(json.dumps({"dependencies": {"react": "^18.2.0"}}), encoding="utf-8")
    (repo_dir / "Component.jsx").write_text("import React from 'react'; export default () => <div/>;", encoding="utf-8")

    # Dockerfile
    (repo_dir / "Dockerfile").write_text("FROM python:3.9-slim\n", encoding="utf-8")

    # Ignored directory with dummy files (must not skew counts)
    git_dir = repo_dir / ".git"
    git_dir.mkdir()
    (git_dir / "HEAD").write_text("ref: refs/heads/main\n", encoding="utf-8")
    nm_dir = repo_dir / "node_modules"
    nm_dir.mkdir()
    (nm_dir / "huge.js").write_text("var x = 1;\n", encoding="utf-8")

    tech = detect_repository_technologies(repo_dir)
    assert tech["files_analyzed"] == 5  # main.py, service.py, package.json, Component.jsx, Dockerfile
    assert tech["files_skipped"] == 2   # .git/HEAD, node_modules/huge.js (skipped dirs)
    assert "python" in tech["languages"]
    assert "javascript" in tech["languages"]
    assert "FastAPI" in tech["frameworks"]
    assert "React" in tech["frameworks"]
    assert "Docker" in tech["frameworks"]


# ---------------------------------------------------------------------------
# 4. Ingestion Limits Tests
# ---------------------------------------------------------------------------

def test_clone_repo_exceeds_max_files(tmp_path):
    repo_dir = tmp_path / "big_repo"
    repo_dir.mkdir()
    for i in range(15):
        (repo_dir / f"file_{i}.py").write_text(f"x = {i}\n", encoding="utf-8")

    # Init local git repo
    subprocess.run(["git", "-C", str(repo_dir), "init", "-q"], check=True)
    subprocess.run(["git", "-C", str(repo_dir), "-c", "user.name=test", "-c", "user.email=t@t", "add", "."], check=True)
    subprocess.run(["git", "-C", str(repo_dir), "-c", "user.name=test", "-c", "user.email=t@t", "commit", "-q", "-m", "init"], check=True)

    dest_parent = tmp_path / "dest"
    dest_parent.mkdir()

    with pytest.raises(IngestionError, match="exceeds file limit"):
        clone_repo(str(repo_dir), dest_parent=dest_parent, max_files=10)


# ---------------------------------------------------------------------------
# 5. FastAPI Endpoints Tests
# ---------------------------------------------------------------------------

@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)


def test_api_repositories_validate_endpoint_valid(client):
    with patch("codesage.server.get_github_repo_metadata") as mock_meta:
        mock_meta.return_value = {
            "accessible": True,
            "owner": "pallets",
            "repo": "flask",
            "full_name": "pallets/flask",
            "default_branch": "main",
            "stars": 65000,
            "private": False,
        }
        resp = client.get("/api/repositories/validate", params={"url": "https://github.com/pallets/flask"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is True
        assert data["owner"] == "pallets"
        assert data["repo"] == "flask"
        assert data["default_branch"] == "main"


def test_api_repositories_validate_endpoint_pull_request_rejected(client):
    resp = client.get(
        "/api/repositories/validate",
        params={"url": "https://github.com/pallets/flask/pull/42"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is False
    assert "Pull Request" in data["error"]


def test_api_repositories_validate_endpoint_invalid_scheme(client):
    resp = client.get(
        "/api/repositories/validate",
        params={"url": "ftp://github.com/pallets/flask"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is False
    assert "Only HTTPS" in data["error"]


def test_api_repositories_scan_endpoint_validation_error(client):
    resp = client.post(
        "/api/repositories/scan",
        json={"repository_url": "https://invalid-host.com/bad/repo"},
    )
    assert resp.status_code == 400
    assert "Only github.com" in resp.json()["detail"]


def test_api_repositories_scan_endpoint_success(client):
    with patch("codesage.server.build_pipeline") as mock_build, \
         patch("codesage.server.validate_github_url") as mock_val:
        mock_val.return_value = {
            "owner": "pallets",
            "repo": "flask",
            "full_name": "pallets/flask",
            "normalized_url": "https://github.com/pallets/flask",
            "clone_url": "https://github.com/pallets/flask.git",
            "branch": "main",
        }
        mock_build.return_value = MagicMock()

        resp = client.post(
            "/api/repositories/scan",
            json={
                "repository_url": "https://github.com/pallets/flask",
                "branch": "main",
                "scanners": ["semgrep", "gitleaks"],
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "scan_id" in data
        assert data["status"] == "running"


def test_scan_report_markdown_endpoint(client):
    # Verify report endpoint returns valid Markdown structure
    with patch("codesage.server.build_pipeline") as mock_build:
        mock_build.return_value = MagicMock()
        # Start a local scan
        start_resp = client.post(
            "/scan",
            json={"repo_url": "./test-target-repo"},
        )
        scan_id = start_resp.json()["scan_id"]

        # Fetch report
        report_resp = client.get(f"/scan/{scan_id}/report")
        assert report_resp.status_code == 200
        assert "text/markdown" in report_resp.headers["content-type"]
        body = report_resp.text
        assert "# CodeSage — Engineering & Security Audit Report" in body
        assert "## 1. Executive Summary" in body
        assert "## 3. Findings Breakdown" in body
