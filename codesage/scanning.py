"""Module 2 — scanning layer.

Runs Semgrep, Bandit and Gitleaks as isolated subprocesses and normalizes
every tool's output into the unified `Finding` schema (design.md 2.1 /
4.3), keeping the rest of the pipeline scanner-agnostic.

Failure policy (design.md section 6): if one scanner crashes or its binary
is missing, log the error and skip that scanner's findings — the others
still run.
"""

import json
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional, Tuple

from codesage.schemas import Finding

logger = logging.getLogger(__name__)

SCAN_TIMEOUT_SECONDS = 900
# Exit codes that mean "scan completed, findings (or no findings) reported".
_OK_EXIT_CODES = {0, 1}

_SEMGREP_RULES = Path(__file__).parent / "rules" / "semgrep_rules.yaml"
_GITLEAKS_CONFIG = Path(__file__).parent / "rules" / "gitleaks.toml"

SCAN_SKIP_DIRS = ("venv", ".venv", "__pycache__", ".git", "data", "node_modules")


class ScannerError(RuntimeError):
    """A scanner subprocess failed to run or produced unusable output."""


# ---------------------------------------------------------------------------
# Binary discovery
# ---------------------------------------------------------------------------

def find_binary(name: str, env_var: str) -> Optional[str]:
    """Resolve a scanner binary: env var override, PATH, active venv, or repo bin."""
    override = os.environ.get(env_var)
    if override and Path(override).exists():
        return override
    located = shutil.which(name)
    if located:
        return located
    in_venv = Path(sys.prefix) / "bin" / name
    if in_venv.exists():
        return str(in_venv)
    repo_bin = Path(__file__).resolve().parent.parent / "bin" / name
    if repo_bin.exists():
        return str(repo_bin)
    return None


# ---------------------------------------------------------------------------
# Subprocess runners (one per tool, each returns raw native dicts)
# ---------------------------------------------------------------------------

def _run(command: List[str], cwd: Path, timeout: int) -> subprocess.CompletedProcess:
    try:
        proc = subprocess.run(
            command,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except FileNotFoundError as exc:
        raise ScannerError(f"Binary not found: {command[0]}") from exc
    except subprocess.TimeoutExpired as exc:
        raise ScannerError(
            f"{' '.join(command[:2])} timed out after {timeout}s"
        ) from exc
    return proc


def run_semgrep(repo_path: Path) -> List[dict]:
    binary = find_binary("semgrep", "SEMGREP_BIN")
    if not binary:
        raise ScannerError("semgrep binary not found (set SEMGREP_BIN or pip install semgrep)")
    proc = _run(
        [
            binary, "scan",
            "--config", str(_SEMGREP_RULES),
            "--json", "--quiet", "--no-rewrite-rule-ids",
            "--no-git-ignore",
            "--exclude", "venv", "--exclude", "data", "--exclude", "__pycache__",
            "--exclude", "node_modules",
            ".",
        ],
        cwd=repo_path,
        timeout=SCAN_TIMEOUT_SECONDS,
    )
    if proc.returncode not in _OK_EXIT_CODES:
        raise ScannerError(f"semgrep exited {proc.returncode}: {proc.stderr[-400:]}")
    payload = json.loads(proc.stdout or "{}")
    if payload.get("errors"):
        logger.warning("semgrep reported internal errors: %s", payload["errors"])
    return payload.get("results", [])


def run_bandit(repo_path: Path) -> List[dict]:
    binary = find_binary("bandit", "BANDIT_BIN")
    if not binary:
        raise ScannerError("bandit binary not found (set BANDIT_BIN or pip install bandit)")
    excludes = ",".join(f"./{d}/**" for d in SCAN_SKIP_DIRS)
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as handle:
        out_path = handle.name
    proc = _run(
        [
            binary, "-q", "-r", ".",
            "-x", excludes,
            "-f", "json", "-o", out_path,
        ],
        cwd=repo_path,
        timeout=SCAN_TIMEOUT_SECONDS,
    )
    # bandit: 0 = clean, 1 = issues found; anything else is a crash.
    if proc.returncode not in _OK_EXIT_CODES:
        raise ScannerError(f"bandit exited {proc.returncode}: {proc.stderr[-400:]}")
    payload = json.loads(Path(out_path).read_text(encoding="utf-8") or "{}")
    Path(out_path).unlink(missing_ok=True)
    if payload.get("errors"):
        logger.warning("bandit reported internal errors: %s", payload["errors"])
    return payload.get("results", [])


def run_gitleaks(repo_path: Path) -> List[dict]:
    binary = find_binary("gitleaks", "GITLEAKS_BIN")
    if not binary:
        raise ScannerError("gitleaks binary not found (set GITLEAKS_BIN, or brew install gitleaks)")
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as handle:
        out_path = handle.name
    proc = _run(
        [
            binary, "detect",
            "--no-git", "--source", ".",
            "--config", str(_GITLEAKS_CONFIG),
            "--report-format", "json", "--report-path", out_path,
            "--exit-code", "0", "--log-level", "error",
        ],
        cwd=repo_path,
        timeout=SCAN_TIMEOUT_SECONDS,
    )
    if proc.returncode not in _OK_EXIT_CODES:
        raise ScannerError(f"gitleaks exited {proc.returncode}: {proc.stderr[-400:]}")
    text = Path(out_path).read_text(encoding="utf-8").strip()
    Path(out_path).unlink(missing_ok=True)
    return json.loads(text) if text else []


# ---------------------------------------------------------------------------
# Normalizers: native output -> Finding (design.md 4.3)
# ---------------------------------------------------------------------------

_SEVERITY_MAP = {
    "info": "low",
    "low": "low",
    "warning": "medium",
    "medium": "medium",
    "error": "high",
    "high": "high",
    "critical": "critical",
}

_CWE_RE = re.compile(r"CWE-(\d+)")


def _normalize_severity(raw: str, default: str) -> str:
    return _SEVERITY_MAP.get((raw or "").strip().lower(), default)


def _extract_cwe(value) -> Optional[str]:
    """Pull 'CWE-<n>' out of whatever shape the tool reports cwe metadata in."""
    if value is None:
        return None
    if isinstance(value, dict):
        value = value.get("id")
    if isinstance(value, (list, tuple)):
        value = value[0] if value else None
    if value is None:
        return None
    if isinstance(value, int):  # bandit: {"id": 89, ...}
        return f"CWE-{value}"
    match = _CWE_RE.search(str(value))
    return f"CWE-{match.group(1)}" if match else None


def _relative_path(raw: str, repo_root: Path) -> str:
    path = Path(raw)
    if not path.is_absolute():
        path = Path(os.path.abspath(Path(repo_root) / raw))
    try:
        rel = path.resolve().relative_to(Path(repo_root).resolve())
    except ValueError:
        rel = path
    return rel.as_posix()


def _make_id(tool: str, file_path: str, line: int, rule: str) -> str:
    return f"{tool}:{file_path}:{line}:{rule}"


def _clean_bandit_snippet(code: str) -> str:
    lines = []
    for line in (code or "").splitlines():
        lines.append(re.sub(r"^\s*\d+\s", "", line))
    return "\n".join(lines).strip()


def normalize_semgrep(raw: dict, repo_root: Path) -> Finding:
    check_id = raw.get("check_id") or "unknown"
    path = raw.get("path")
    start = raw.get("start") or {}
    if not path or "line" not in start:
        raise ValueError(f"semgrep result missing path/line: {raw!r:.120}")
    file_path = _relative_path(path, repo_root)
    line = int(start["line"])
    extra = raw.get("extra", {})
    snippet = (extra.get("lines") or "").strip()
    if snippet in ("", "requires login"):
        # newer semgrep gates extra.lines behind an account — read the span
        # from source instead (deterministic and version-proof)
        try:
            end_line = int(raw.get("end", {}).get("line", line))
            source = (Path(repo_root) / path).read_text(encoding="utf-8", errors="replace")
            snippet = "\n".join(source.splitlines()[line - 1 : end_line]).strip()
        except OSError:
            pass
    return Finding(
        id=_make_id("semgrep", file_path, line, check_id),
        file_path=file_path,
        line_number=line,
        cwe_id=_extract_cwe(extra.get("metadata", {}).get("cwe")),
        severity=_normalize_severity(extra.get("severity"), default="medium"),
        tool_source="semgrep",
        raw_message=str(extra.get("message", "")).strip(),
        code_snippet=snippet,
    )


def normalize_bandit(raw: dict, repo_root: Path) -> Finding:
    test_id = raw.get("test_id") or "unknown"
    filename = raw.get("filename")
    if not filename or "line_number" not in raw:
        raise ValueError(f"bandit result missing filename/line_number: {raw!r:.120}")
    file_path = _relative_path(filename, repo_root)
    line = int(raw["line_number"])
    cwe = raw.get("issue_cwe")
    return Finding(
        id=_make_id("bandit", file_path, line, test_id),
        file_path=file_path,
        line_number=line,
        cwe_id=_extract_cwe(cwe),
        severity=_normalize_severity(raw.get("issue_severity"), default="medium"),
        tool_source="bandit",
        raw_message=str(raw.get("issue_text", "")).strip(),
        code_snippet=_clean_bandit_snippet(raw.get("code", "")),
    )


def normalize_gitleaks(raw: dict, repo_root: Path) -> Finding:
    # gitleaks >= 8.19 renamed JSON keys to camelCase; accept both spellings.
    def field(*names: str):
        for name in names:
            if name in raw:
                return raw[name]
        return None

    rule_id = field("RuleID", "ruleID") or "unknown"
    file_raw = field("File", "file")
    start_line = field("StartLine", "startLine")
    if not file_raw or start_line is None:
        raise ValueError(f"gitleaks result missing file/startLine: {raw!r:.120}")
    file_path = _relative_path(file_raw, repo_root)
    line = int(start_line)
    match = (field("Match", "match") or "").strip()
    return Finding(
        id=_make_id("gitleaks", file_path, line, rule_id),
        file_path=file_path,
        line_number=line,
        cwe_id=_extract_cwe(field("CWE", "cwe")),
        severity="high",  # secrets are high by default; gitleaks has no severity field
        tool_source="gitleaks",
        raw_message=f"Potential hardcoded secret matched rule '{rule_id}'",
        code_snippet=match,
    )


_NORMALIZERS: Dict[str, Callable[[dict, Path], Finding]] = {
    "semgrep": normalize_semgrep,
    "bandit": normalize_bandit,
    "gitleaks": normalize_gitleaks,
}

_RUNNERS: Dict[str, Callable[[Path], List[dict]]] = {
    "semgrep": run_semgrep,
    "bandit": run_bandit,
    "gitleaks": run_gitleaks,
}


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def scan_repo(
    repo_path: Path,
    scanners: Iterable[str] = ("semgrep", "bandit", "gitleaks"),
) -> List[Finding]:
    """Run every requested scanner against `repo_path`, normalize, and merge.

    A scanner that crashes or is missing is logged and skipped (design.md 6);
    it never aborts the scan.
    """
    repo_path = Path(repo_path).resolve()
    if not repo_path.is_dir():
        raise FileNotFoundError(f"Not a directory: {repo_path}")

    findings: List[Finding] = []
    for name in scanners:
        runner = _RUNNERS.get(name)
        normalizer = _NORMALIZERS.get(name)
        if runner is None:
            logger.warning("Unknown scanner %r — skipping", name)
            continue
        try:
            raw_results = runner(repo_path)
        except ScannerError as exc:
            logger.warning("Scanner %s failed, skipping its findings: %s", name, exc)
            continue
        for raw in raw_results:
            try:
                findings.append(normalizer(raw, repo_path))
            except Exception:  # a malformed result must not sink the scan
                logger.exception("Failed to normalize %s result: %r", name, raw)
    findings.sort(key=lambda f: (f.file_path, f.line_number, f.tool_source))
    return findings


# ---------------------------------------------------------------------------
# Module 11 — Incremental Scanning (file hash change detection)
# ---------------------------------------------------------------------------

def compute_file_hashes(repo_path: Path) -> Dict[str, str]:
    """Compute sha256 hashes for all non-ignored source files in the repository."""
    import hashlib

    repo_path = Path(repo_path).resolve()
    hashes = {}
    for p in repo_path.rglob("*"):
        if not p.is_file():
            continue
        if any(part in SCAN_SKIP_DIRS for part in p.parts):
            continue
        rel = p.relative_to(repo_path).as_posix()
        try:
            hashes[rel] = hashlib.sha256(p.read_bytes()).hexdigest()
        except OSError:
            continue
    return hashes


def scan_repo_incremental(
    repo_path: Path,
    previous_findings: List[Finding],
    previous_hashes: Dict[str, str],
    scanners: Iterable[str] = ("semgrep", "bandit", "gitleaks"),
) -> Tuple[List[Finding], Dict[str, str]]:
    """Incremental scan reusing unchanged file findings.

    1. Computes current file hashes.
    2. Identifies added, modified, and deleted files.
    3. Retains cached findings for completely unchanged files.
    4. Updates findings for modified/added files and removes deleted ones.
    """
    repo_path = Path(repo_path).resolve()
    current_hashes = compute_file_hashes(repo_path)

    changed_or_added = {
        path for path, h in current_hashes.items()
        if path not in previous_hashes or previous_hashes[path] != h
    }
    deleted = set(previous_hashes.keys()) - set(current_hashes.keys())

    if not changed_or_added and not deleted:
        logger.info("Incremental scan: zero files changed, reusing all %d findings", len(previous_findings))
        return list(previous_findings), current_hashes

    # Keep findings from files that did not change
    retained_findings = [
        f for f in previous_findings
        if f.file_path in current_hashes and f.file_path not in changed_or_added
    ]

    # Rescan repository
    fresh_findings = scan_repo(repo_path, scanners=scanners)
    new_targeted = [f for f in fresh_findings if f.file_path in changed_or_added]

    merged = retained_findings + new_targeted
    merged.sort(key=lambda f: (f.file_path, f.line_number, f.tool_source))
    return merged, current_hashes


if __name__ == "__main__":  # manual: python -m codesage.scanning <repo>
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(description="Scan a repo with Semgrep/Bandit/Gitleaks")
    parser.add_argument("repo", help="Path to the repository to scan")
    args = parser.parse_args()
    for finding in scan_repo(Path(args.repo)):
        print(finding.model_dump_json())
