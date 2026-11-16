"""Ground-truth tests for the eight planted vulnerabilities (V1-V8).

Each test asserts that the planted vulnerability is actually present and
reachable, matching VULNERABILITIES.md. If any of these fail, the app is no
longer a valid scoring target for CodeSage.
"""

import base64
import json
import os
import pickle
import uuid

import pytest
from fastapi.testclient import TestClient

from main import app

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_v1_sql_injection_returns_all_rows(client):
    # Normal search matches exactly one seeded product...
    normal = client.get("/products/search", params={"q": "phone"})
    assert len(normal.json()["results"]) == 1

    # ...but the tautology payload bypasses the WHERE clause entirely.
    payload = "' OR 1=1 --"
    injected = client.get("/products/search", params={"q": payload})
    assert injected.status_code == 200
    assert len(injected.json()["results"]) == 5  # every seeded row


def test_v2_hardcoded_api_key_present_in_source():
    source = open(os.path.join(REPO_ROOT, "payments.py"), encoding="utf-8").read()
    assert 'STRIPE_API_KEY = "STRIPE_TEST_KEY_PLACEHOLDER"' in source


def test_v3_plaintext_password_leaks_into_token(client):
    resp = client.post(
        "/login", json={"username": "alice", "password": "wonderland123"}
    )
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    # The session token is just base64("username:password") — no hashing anywhere.
    assert base64.b64decode(token).decode() == "alice:wonderland123"


XFAIL_REASON = (
    "Security requirement not yet met by the current implementation — "
    "passes once tasks.py parses JSON instead of executing pickle"
)


@pytest.mark.xfail(reason=XFAIL_REASON, strict=False)
def test_v4_imports_legitimate_json_task(client):
    """A legitimate task submitted as base64 JSON must import successfully."""
    task = {"title": "write report", "priority": 3}
    blob = base64.b64encode(json.dumps(task).encode()).decode()
    resp = client.post("/tasks/import", json={"data": blob})
    assert resp.status_code == 200
    assert resp.json() == {"imported": task}


@pytest.mark.xfail(reason=XFAIL_REASON, strict=False)
def test_v4_rejects_untrusted_pickle_payload(client):
    """An untrusted pickle payload must be safely rejected — never executed."""
    blob = base64.b64encode(pickle.dumps({"title": "pwned"})).decode()
    resp = client.post("/tasks/import", json={"data": blob})
    assert resp.status_code == 400


def test_v5_path_traversal_escapes_docs_dir(client):
    # ../..-style traversal must reach files outside docs/ — here, app source.
    resp = client.get("/files/read", params={"path": "../payments.py"})
    assert resp.status_code == 200
    assert "STRIPE_API_KEY" in resp.json()["content"]

    # An absolute path must fully override the docs directory.
    resp = client.get("/files/read", params={"path": "/etc/hosts"})
    assert resp.status_code == 200
    assert "localhost" in resp.json()["content"]


XFAIL_V6_REASON = (
    "Security requirement not yet met by the current implementation — "
    "passes once admin.py runs diagnostics without a shell"
)


@pytest.mark.xfail(reason=XFAIL_V6_REASON, strict=False)
def test_v6_diagnostics_accepts_legitimate_host(client):
    """A legitimate host must diagnose successfully."""
    resp = client.get("/admin/diagnostics", params={"host": "127.0.0.1"})
    assert resp.status_code == 200
    assert "exit_status" in resp.json()


@pytest.mark.xfail(reason=XFAIL_V6_REASON, strict=False)
def test_v6_injection_payload_is_not_executed(client, tmp_path):
    """Shell metacharacters in the host must never execute a second command."""
    marker = tmp_path / "injection-marker.txt"
    resp = client.get("/admin/diagnostics", params={"host": f"127.0.0.1; touch {marker}"})
    assert resp.status_code == 200
    assert not marker.exists(), "injected command executed — command injection still present"


def test_v6_normal_diagnostics_still_works(client):
    resp = client.get("/admin/diagnostics", params={"host": "127.0.0.1"})
    assert resp.status_code == 200
    assert resp.json()["host"] == "127.0.0.1"


def test_v7_cors_allows_arbitrary_origin(client):
    origin = "https://evil.example"
    resp = client.get("/health", headers={"Origin": origin})
    assert resp.status_code == 200
    allow_origin = resp.headers.get("access-control-allow-origin")
    # Starlette echoes the origin (instead of "*") when credentials are allowed;
    # both variants mean "any site may read responses".
    assert allow_origin in ("*", origin), f"CORS header was {allow_origin!r}"

    preflight = client.options(
        "/health",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
        },
    )
    assert preflight.headers.get("access-control-allow-origin") in ("*", origin)


def test_v8_vulnerable_dependency_pins_present():
    requirements = open(
        os.path.join(REPO_ROOT, "requirements.txt"), encoding="utf-8"
    ).read()
    lines = [line.strip() for line in requirements.splitlines()]
    assert "requests==2.25.1" in lines, "requests vulnerable pin missing"
    assert "PyYAML==5.3.1" in lines, "PyYAML CVE-2020-14343 pin missing"
