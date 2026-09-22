"""Functional sanity tests: the app behaves like a real (broken) shop."""

import os

import pytest
from fastapi.testclient import TestClient

from main import app

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_config_loaded_from_yaml(client):
    # config.py loads SETTINGS via yaml.safe_load at import time.
    import config

    assert config.SETTINGS["app_name"] == "ShopFast"


def test_search_exact_match(client):
    resp = client.get("/products/search", params={"q": "phone"})
    assert resp.status_code == 200
    results = resp.json()["results"]
    assert len(results) == 1
    assert results[0]["name"] == "Smartphone X"


def test_login_success_and_failure(client):
    bad = client.post(
        "/login", json={"username": "alice", "password": "wrong-password"}
    )
    assert bad.status_code == 401

    good = client.post(
        "/login", json={"username": "alice", "password": "wonderland123"}
    )
    assert good.status_code == 200
    assert good.json()["token_type"] == "bearer"


def test_read_doc_file(client):
    resp = client.get("/files/read", params={"path": "handbook.md"})
    assert resp.status_code == 200
    assert "ShopFast Handbook" in resp.json()["content"]


def test_missing_file_is_404(client):
    resp = client.get("/files/read", params={"path": "nope.md"})
    assert resp.status_code == 404


def test_invalid_task_payload_rejected(client):
    resp = client.post("/tasks/import", json={"data": "not!valid@base64!!"})
    assert resp.status_code == 400
