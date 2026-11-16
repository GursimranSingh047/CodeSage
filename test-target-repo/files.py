"""Endpoints for reading the user handbook files."""

import os

from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["files"])

DOCS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docs")


@router.get("/files/read")
def read_file(path: str):
    # V5: `path` is joined to DOCS_DIR with no validation, so "../" sequences
    # escape the docs folder and an absolute path replaces it entirely.
    full_path = os.path.join(DOCS_DIR, path)
    if not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="file not found")
    with open(full_path, "r", encoding="utf-8", errors="replace") as handle:
        content = handle.read()
    return {"path": path, "content": content}
