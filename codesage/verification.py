"""Module 6 — verification agent (design.md 2.5 + 4.2, architecture.md 2.7).

For each generated patch:
1. Copy the repo to a temp workspace and apply the patch as a verbatim
   original_code -> patched_code replacement.
2. Re-run the scanner rule that flagged the finding (scan_clean).
3. Run the repo's own test suite if present (tests_passed).
4. passed = scan_clean AND tests_passed; otherwise the failure_reason feeds
   the design.md 3.3 retry prompt.

Backends:
- DockerBackend (default, architecture.md 2.7): runs scan + tests inside the
  prebuilt codesage-verifier image — the sandboxed production path.
- LocalBackend: subprocess fallback for machines without Docker. It is NOT
  sandboxed; select it explicitly with CODESAGE_VERIFY_BACKEND=local.

run_verification_loop implements design.md 4.2: at most 2 patch attempts,
each failure reason fed back into the 3.3 retry prompt, then escalation to
human review.
"""

import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

from codesage.schemas import Finding, Patch, VerificationResult
from codesage.scanning import (
    normalize_bandit,
    normalize_gitleaks,
    normalize_semgrep,
    run_bandit,
    run_gitleaks,
    run_semgrep,
)

logger = logging.getLogger(__name__)

SCAN_TIMEOUT_SECONDS = 600
TESTS_TIMEOUT_SECONDS = 900
# Directories excluded when copying a repo into a verification workspace.
COPY_IGNORE_NAMES = {"venv", ".venv", "__pycache__", ".git", ".pytest_cache", "data", "codesage_data"}

_SCAN_RUNNERS = {"semgrep": run_semgrep, "bandit": run_bandit, "gitleaks": run_gitleaks}
_SCAN_NORMALIZERS = {
    "semgrep": normalize_semgrep, "bandit": normalize_bandit, "gitleaks": normalize_gitleaks,
}


class VerificationError(RuntimeError):
    """The verification infrastructure itself failed (design.md section 6)."""


class PatchNotApplicable(RuntimeError):
    """original_code was not found (exactly once) in the target file."""


def target_file_from_finding_id(finding_id: str) -> str:
    """Finding ids are '{tool}:{file}:{line}:{rule}' — recover the file part."""
    parts = finding_id.split(":")
    if len(parts) < 4:
        raise ValueError(f"cannot parse target file from id {finding_id!r}")
    return ":".join(parts[1:-2])


def _rule_from_finding(finding: Finding) -> str:
    """Finding ids are '{tool}:{file}:{line}:{rule}' — recover the rule part."""
    return finding.id.rsplit(":", 1)[-1]


# ---------------------------------------------------------------------------
# Patch application
# ---------------------------------------------------------------------------

def apply_patch_to_copy(repo_path: Path, patch: Patch) -> Path:
    """Copy the repo to a temp dir and apply the patch verbatim.

    Returns the patched workspace root. Raises PatchNotApplicable when
    original_code does not occur exactly once in the target file.
    """
    logger.info("[verify:apply] enter repo=%s finding=%s original_len=%d patched_len=%d",
                repo_path, patch.finding_id, len(patch.original_code), len(patch.patched_code))
    repo_path = Path(repo_path).resolve()
    workspace = Path(tempfile.mkdtemp(prefix="codesage-verify-"))
    workdir = workspace / "repo"
    shutil.copytree(
        repo_path,
        workdir,
        ignore=shutil.ignore_patterns(*COPY_IGNORE_NAMES),
    )

    # Recover the target file from the finding id (tool:file:line:rule).
    relative_file = target_file_from_finding_id(patch.finding_id)
    target = workdir / relative_file
    if not target.is_file():
        raise PatchNotApplicable(f"target file not found in workspace: {relative_file}")

    content = target.read_text(encoding="utf-8", errors="replace")
    occurrences = content.count(patch.original_code)
    if occurrences == 0:
        raise PatchNotApplicable(
            f"original_code not found in {relative_file} — function may have drifted"
        )
    if occurrences > 1:
        raise PatchNotApplicable(
            f"original_code matches {occurrences} times in {relative_file}; refusing an ambiguous patch"
        )
    target.write_text(content.replace(patch.original_code, patch.patched_code, 1), encoding="utf-8")
    logger.info("[verify:apply] exit wrote patched file to disk: %s (workspace=%s)",
                target, workdir)
    return workdir


def _clean_scan(scan_results, finding: Finding) -> Tuple[bool, Optional[str]]:
    """scan_clean := the flagging rule no longer fires on the flagged file."""
    rule = _rule_from_finding(finding)
    offenders = [
        f for f in scan_results
        if f.tool_source == finding.tool_source
        and f.file_path == finding.file_path
        and f.id.rsplit(":", 1)[-1] == rule
    ]
    if offenders:
        first = offenders[0]
        return False, (
            f"re-scan still flags {first.tool_source} rule '{rule}' at "
            f"{first.file_path}:{first.line_number}"
        )
    return True, None


# ---------------------------------------------------------------------------
# Backends
# ---------------------------------------------------------------------------

class LocalBackend:
    """Non-sandboxed subprocess fallback (CODESAGE_VERIFY_BACKEND=local).

    Scans reuse the Module 2 runner subprocesses against the workspace copy.
    Tests run with the original repo's venv interpreter when one exists (the
    workspace copy excludes venv/), otherwise the current interpreter.
    """

    name = "local"

    def run_scan(self, workdir: Path, finding: Finding) -> Tuple[bool, Optional[str]]:
        logger.info("[verify:scan] enter backend=local tool=%s rule=%s workspace=%s",
                    finding.tool_source, _rule_from_finding(finding), workdir)
        tool = finding.tool_source
        runner = _SCAN_RUNNERS.get(tool)
        normalizer = _SCAN_NORMALIZERS.get(tool)
        if runner is None or normalizer is None:
            raise VerificationError(f"unknown scanner tool: {tool!r}")
        try:
            raw = runner(workdir)
        except Exception as exc:  # ScannerError or missing binary
            raise VerificationError(f"{tool} re-scan failed: {exc}") from exc
        findings = [normalizer(r, workdir) for r in raw]
        return _clean_scan(findings, finding)

    def run_tests(self, workdir: Path, repo_path: Path) -> Tuple[bool, Optional[str]]:
        logger.info("[verify:tests] enter backend=local workspace=%s", workdir)
        interpreter = Path(repo_path) / "venv" / "bin" / "python"
        if not interpreter.is_file():
            interpreter = Path(sys.executable)
        command = [str(interpreter), "-m", "pytest", "-q"]
        try:
            proc = subprocess.run(
                command, cwd=str(workdir), capture_output=True, text=True,
                timeout=TESTS_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired:
            return False, f"test suite timed out after {TESTS_TIMEOUT_SECONDS}s"
        except FileNotFoundError as exc:
            raise VerificationError(f"interpreter missing: {exc}") from exc
        if proc.returncode == 0:
            return True, None
        tail = (proc.stdout or proc.stderr or "").strip().splitlines()
        return False, f"test suite failed: {tail[-1] if tail else f'exit {proc.returncode}'}"


class DockerBackend:
    """Sandboxed backend (architecture.md 2.7): scan + tests in a container.

    Uses the prebuilt codesage-verifier image (see verification/Dockerfile)
    which ships bandit, semgrep, pytest and gitleaks. The patched workspace
    is mounted at /workspace; nothing executes on the host.
    """

    name = "docker"

    def __init__(self, image: str = "codesage-verifier:latest"):
        try:
            import docker  # lazy: Docker SDK for Python
        except ImportError as exc:
            raise VerificationError("pip install docker") from exc
        try:
            self.client = docker.from_env()
            self.client.ping()
        except Exception as exc:
            raise VerificationError(
                f"Docker daemon unavailable ({exc}). Start Docker Desktop, or "
                "set CODESAGE_VERIFY_BACKEND=local for the non-sandboxed fallback."
            ) from exc
        self.image = image

    def ensure_image(self) -> None:
        try:
            self.client.images.get(self.image)
            return
        except Exception:
            logger.info("Building verifier image %s (one-time, several minutes)...", self.image)
            dockerfile_dir = Path(__file__).parent / "verification"
            _, build_logs = self.client.images.build(
                path=str(dockerfile_dir), tag=self.image, rm=True
            )
            for entry in build_logs:
                if "error" in entry:
                    raise VerificationError(f"image build failed: {entry['error']}")

    def _run(self, command: List[str], workdir: Path, writable: bool) -> str:
        self.ensure_image()
        container = self.client.containers.run(
            self.image,
            command,
            volumes={str(workdir): {"bind": "/workspace", "mode": "rw" if writable else "ro"}},
            working_dir="/workspace",
            network_disabled=False,  # pip install needs network in the test run
            detach=True,
        )
        try:
            result = container.wait(timeout=SCAN_TIMEOUT_SECONDS + TESTS_TIMEOUT_SECONDS)
            logs = container.logs(stdout=True, stderr=True).decode("utf-8", errors="replace")
        finally:
            container.remove(force=True)
        exit_code = result.get("StatusCode", 1)
        return f"exit={exit_code}\n{logs}" if exit_code else logs

    def run_scan(self, workdir: Path, finding: Finding) -> Tuple[bool, Optional[str]]:
        tool = finding.tool_source
        rules_dir = "/rules"
        if tool == "bandit":
            command = ["bandit", "-q", "-r", ".", "-x", "./venv/**", "-f", "json"]
        elif tool == "semgrep":
            command = ["semgrep", "scan", "--config", f"{rules_dir}/semgrep_rules.yaml",
                       "--json", "--quiet", "--no-rewrite-rule-ids", "."]
        elif tool == "gitleaks":
            command = ["gitleaks", "detect", "--no-git", "--source", ".",
                       "--config", f"{rules_dir}/gitleaks.toml",
                       "--report-format", "json", "--report-path", "/tmp/leaks.json",
                       "--exit-code", "0", "--log-level", "error",
                       ";", "cat", "/tmp/leaks.json"]
        else:
            raise VerificationError(f"unknown scanner tool: {tool!r}")

        output = self._run(command, workdir, writable=False)
        try:
            start = output.index("{")
            payload = json.loads(output[start:output.rindex("}") + 1])
        except ValueError as exc:
            raise VerificationError(f"unparseable scan output: {output[:200]}") from exc
        raw = payload.get("results", payload if isinstance(payload, list) else [])
        normalizer = _SCAN_NORMALIZERS[tool]
        findings = [normalizer(r, workdir) for r in raw]
        return _clean_scan(findings, finding)

    def run_tests(self, workdir: Path, repo_path: Path) -> Tuple[bool, Optional[str]]:
        output = self._run(
            ["sh", "-c",
             "pip install -q -r requirements.txt 2>/dev/null; python -m pytest -q"],
            workdir, writable=True,
        )
        exit_line = output.splitlines()[0] if output else "exit=1"
        if exit_line == "exit=0":
            return True, None
        tail = [l for l in output.splitlines() if l.strip()][-3:]
        return False, "test suite failed in sandbox: " + " | ".join(tail)


def get_backend() -> LocalBackend:
    """Resolve the verification backend from CODESAGE_VERIFY_BACKEND."""
    chosen = os.environ.get("CODESAGE_VERIFY_BACKEND", "").strip().lower()
    if chosen == "local":
        return LocalBackend()
    if chosen == "docker":
        return DockerBackend()  # raises VerificationError if daemon is down
    # Auto-detect: prefer Docker (the sandboxed path), fall back with a warning.
    try:
        return DockerBackend()
    except VerificationError as exc:
        logger.warning("Docker unavailable, using the NON-SANDBOXED local backend: %s", exc)
        return LocalBackend()


class Verifier:
    """Applies a patch to a temp copy and verifies it via the chosen backend."""

    def __init__(self, repo_path: Path, backend=None):
        self.repo_path = Path(repo_path).resolve()  # absolute: backends may shift cwd
        self.backend = backend if backend is not None else get_backend()

    def verify(self, finding: Finding, patch: Patch) -> VerificationResult:
        logger.info("[verify] enter finding=%r backend=%s", finding.id, self.backend.name)

        def result(scan_clean=False, tests_passed=False, reason=None):
            logger.info("[verify] exit finding=%r scan_clean=%s tests_passed=%s passed=%s reason=%r",
                        finding.id, scan_clean, tests_passed, scan_clean and tests_passed,
                        (reason or "")[:120])
            return VerificationResult(
                finding_id=finding.id,
                scan_clean=scan_clean,
                tests_passed=tests_passed,
                passed=scan_clean and tests_passed,
                failure_reason=reason,
            )

        try:
            workdir = apply_patch_to_copy(self.repo_path, patch)
        except PatchNotApplicable as exc:
            return result(reason=f"patch does not apply: {exc}")

        try:
            scan_clean, scan_reason = self.backend.run_scan(workdir, finding)
        except VerificationError as exc:
            shutil.rmtree(workdir.parent, ignore_errors=True)
            return result(reason=f"verification infrastructure error (re-scan): {exc}")

        try:
            tests_passed, tests_reason = self.backend.run_tests(workdir, self.repo_path)
        except VerificationError as exc:
            # design.md section 6: infrastructure failure -> failed verification,
            # which routes to human review rather than crashing the pipeline.
            shutil.rmtree(workdir.parent, ignore_errors=True)
            return result(
                scan_clean=scan_clean,
                reason=f"verification infrastructure error (tests): {exc}",
            )
        shutil.rmtree(workdir.parent, ignore_errors=True)

        if scan_clean and tests_passed:
            return result(scan_clean=True, tests_passed=True)
        reasons = [r for r in (scan_reason, tests_reason) if r]
        return result(
            scan_clean=scan_clean,
            tests_passed=tests_passed,
            reason="; ".join(reasons) or "verification failed",
        )


# ---------------------------------------------------------------------------
# design.md 4.2 — verification retry loop
# ---------------------------------------------------------------------------

@dataclass
class LoopOutcome:
    """Result of the 4.2 loop. status: verified | needs_human_review | patch_generation_failed."""

    status: str
    patch: Optional[Patch]
    result: Optional[VerificationResult]
    attempts: int


def run_verification_loop(
    finding: Finding,
    context,          # CodeContext
    triage,           # TriageResult
    llm,              # codesage.llm.BaseLLM
    verifier: Verifier,
    max_attempts: int = 2,
) -> LoopOutcome:
    """design.md 4.2: generate -> verify -> retry with failure reason -> escalate."""
    from codesage.patching import PatchError, generate_patch  # local import: no cycle

    last_failure: Optional[str] = None
    last_patch: Optional[Patch] = None
    last_result: Optional[VerificationResult] = None

    for attempt in range(1, max_attempts + 1):
        try:
            patch = generate_patch(
                finding, context, triage, llm,
                attempt_number=attempt, failure_reason=last_failure,
            )
        except PatchError as exc:
            logger.error("patch generation failed for %s: %s", finding.id, exc)
            return LoopOutcome("patch_generation_failed", None, None, attempt - 1)

        result = verifier.verify(finding, patch)
        logger.info(
            "verification attempt %d for %s: passed=%s", attempt, finding.id, result.passed
        )
        if result.passed:
            return LoopOutcome("verified", patch, result, attempt)
        last_failure, last_patch, last_result = result.failure_reason, patch, result

    return LoopOutcome("needs_human_review", last_patch, last_result, max_attempts)
