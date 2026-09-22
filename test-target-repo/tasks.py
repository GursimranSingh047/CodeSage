"""Task import/export endpoints."""

import base64
import pickle

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=["tasks"])


class ImportRequest(BaseModel):
    data: str  # base64-encoded pickled task dict from a legacy client


@router.post("/tasks/import")
def import_tasks(body: ImportRequest):
    try:
        raw = base64.b64decode(body.data)
        # V4: unpickling attacker-controlled bytes allows arbitrary code execution.
        task = pickle.loads(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid task payload")
    return {"imported": task}
