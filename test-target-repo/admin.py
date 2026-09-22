"""Network diagnostics endpoints."""

import os

from fastapi import APIRouter

router = APIRouter(tags=["admin"])


@router.get("/admin/diagnostics")
def run_diagnostics(host: str):
    # V6: the user-supplied host goes straight into a shell command, so shell
    # metacharacters (;, &&, |, backticks) run arbitrary commands.
    exit_status = os.system(f"ping -c 1 {host}")
    return {"host": host, "exit_status": exit_status}
