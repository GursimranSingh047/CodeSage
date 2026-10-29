"""Durable persistence for CodeSage scan runs and human reviews.

Provides atomic JSON persistence for scan records, findings, artifacts, and
event logs, replacing the purely in-memory server state.
"""

import json
import logging
import os
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

DEFAULT_STORAGE_DIR = Path(
    os.environ.get("CODESAGE_STORAGE_DIR", "codesage_data/scans")
)


class ScanStorage:
    """Atomic, file-based persistence for scan runs."""

    def __init__(self, storage_dir: Optional[Path] = None):
        self.storage_dir = Path(storage_dir or DEFAULT_STORAGE_DIR)
        self.storage_dir.mkdir(parents=True, exist_ok=True)

    def save_run(self, run_data: dict) -> Path:
        """Atomically persist a scan record to disk."""
        scan_id = run_data["id"]
        file_path = self.storage_dir / f"{scan_id}.json"
        temp_path = self.storage_dir / f"{scan_id}.json.tmp"
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(run_data, f, indent=2, default=str)
        temp_path.replace(file_path)
        logger.debug("Persisted scan %s to %s", scan_id, file_path)
        return file_path

    def load_run(self, scan_id: str) -> Optional[dict]:
        """Load a single scan run by ID."""
        file_path = self.storage_dir / f"{scan_id}.json"
        if not file_path.is_file():
            return None
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as exc:
            logger.warning("Failed to load persisted scan %s: %s", scan_id, exc)
            return None

    def list_runs(self) -> List[dict]:
        """List all persisted runs, newest first."""
        runs = []
        for file_path in self.storage_dir.glob("*.json"):
            if file_path.name.endswith(".tmp"):
                continue
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    runs.append(json.load(f))
            except Exception as exc:
                logger.warning("Skipping corrupted scan file %s: %s", file_path, exc)
        return sorted(runs, key=lambda r: r.get("started", 0), reverse=True)
