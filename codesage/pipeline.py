"""Module 8 — LangGraph orchestration (architecture.md 2.3 and section 3).

Wires Modules 2-7 into one StateGraph:

    START -> ingestion -> scanning -> next_finding -> context -> triage
    triage   -- real ─────────────> patch
             -- false positive ──> next_finding
             -- triage failed ──> next_finding
    patch    -- generated ─> verify
             -- generation failed ─> next_finding
    verify   -- passed ───────────> pr
             -- failed, retries remain ─> patch        (design.md 4.2 loop)
             -- failed, retries exhausted ─> human_review
    pr / human_review -> next_finding -> (context | END)

State follows architecture.md's PipelineState fields exactly, with one
documented addition: `context` (the Module 3 CodeContext). design.md 3.1
requires enclosing-function context in the triage prompt, so context is
extracted BEFORE triage (architecture.md section 3's data flow), and the
state needs somewhere to carry it.
"""

import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple, TypedDict, Union

from codesage.context import ChunkStore, extract_code_context
from codesage.ingestion import (
    RepoWorkspace,
    clone_repo,
    detect_language,
    detect_repository_technologies,
    get_commit_sha,
    get_github_repo_metadata,
    safe_cleanup_workspace,
    validate_git_branch,
    validate_github_url,
    validate_local_path,
)
from codesage.llm import BaseLLM
from codesage.patching import PatchError, generate_patch
from codesage.schemas import CodeContext, Finding, Patch, TriageResult, VerificationResult

from codesage.scanning import compute_file_hashes, scan_repo, scan_repo_incremental
from codesage.triage import TriageError, triage_finding
from codesage.verification import (
    LocalBackend,
    Verifier,
    get_backend,
    target_file_from_finding_id,
)

logger = logging.getLogger(__name__)

DEFAULT_RECURSION_LIMIT = 2000


class PipelineState(TypedDict, total=False):
    """architecture.md 2.3 — plus the documented `context` key (see module docstring)."""

    repo_url: str
    repo_path: str
    findings: list
    current_finding: Optional[Finding]
    context: Optional[CodeContext]
    triage_result: Optional[TriageResult]
    patch: Optional[Patch]
    verification_result: Optional[VerificationResult]
    retry_count: int
    completed_findings: list
    workspace: Optional[object]
    file_hashes: Optional[dict]
    previous_hashes: Optional[dict]
    previous_findings: Optional[list]


@dataclass
class PipelineConfig:
    """Runtime configuration for one pipeline run."""

    repo_input: str  # git URL or local path
    llm: BaseLLM
    backend: Optional[object] = None  # verification backend; None = auto-detect
    store: Optional[ChunkStore] = None
    github_repo: Optional[str] = None
    github_token: Optional[str] = None  # default: GITHUB_TOKEN env
    base_branch: Optional[str] = None
    max_retries: int = 2
    scanners: tuple = ("semgrep", "bandit", "gitleaks")
    is_cancelled: Optional[Callable[[], bool]] = None
    previous_hashes: Optional[Dict[str, str]] = None
    previous_findings: Optional[List[Union[Finding, dict]]] = None
    storage: Optional[object] = None

    def __post_init__(self):
        if self.backend is None:
            self.backend = get_backend()


class PipelineError(RuntimeError):
    """The pipeline cannot even start (e.g. repository ingestion failed)."""


class PipelineCancelled(Exception):
    """Raised when scan cancellation is requested during pipeline execution."""


def _validate_incremental_data(
    raw_hashes: Any,
    raw_findings: Any,
) -> Optional[Tuple[Dict[str, str], List[Finding]]]:
    """Validate and deserialize previous scan data for incremental scanning.

    Returns (hashes, parsed_findings) if valid, or None if invalid (requiring full scan).
    """
    if raw_hashes is None or not isinstance(raw_hashes, dict):
        return None
    if not raw_hashes:
        return None

    for k, v in raw_hashes.items():
        if not isinstance(k, str) or not k or not isinstance(v, str) or not v:
            logger.warning("Invalid file hash entry (%r: %r), falling back to full scan", k, v)
            return None

    if raw_findings is None or not isinstance(raw_findings, (list, tuple)):
        logger.warning("Invalid previous findings type (%r), falling back to full scan", type(raw_findings))
        return None

    parsed_findings: List[Finding] = []
    for item in raw_findings:
        if isinstance(item, Finding):
            parsed_findings.append(item)
        elif isinstance(item, dict):
            try:
                d = dict(item)
                if "id" not in d and "finding_id" in d:
                    d["id"] = d["finding_id"]
                parsed_findings.append(Finding.model_validate(d))
            except Exception as exc:
                logger.warning("Failed to deserialize previous finding (%r): %s", item, exc)
                return None
        else:
            logger.warning("Unknown finding object type in previous findings: %r", type(item))
            return None

    return raw_hashes, parsed_findings


def _completed_entry(finding: Finding, status: str, **extra) -> dict:
    entry = {
        "finding_id": finding.id,
        "file_path": finding.file_path,
        "line_number": finding.line_number,
        "cwe_id": finding.cwe_id,
        "severity": finding.severity,
        "tool_source": finding.tool_source,
        "raw_message": finding.raw_message,
        "code_snippet": finding.code_snippet,
        "status": status,
        "completed_at": round(time.time(), 3),
    }
    entry.update(extra)
    return entry


def build_pipeline(config: PipelineConfig):
    """Compile the LangGraph StateGraph for one configured run."""
    from langgraph.graph import END, START, StateGraph

    def _check_cancelled() -> bool:
        if config.is_cancelled is not None:
            try:
                return bool(config.is_cancelled())
            except Exception:
                return False
        return False

    # ------------------------------------------------------------------
    # Node functions (each returns a partial state update)
    # ------------------------------------------------------------------

    def ingestion_node(state: PipelineState) -> dict:
        if _check_cancelled():
            raise PipelineCancelled("Scan cancelled before ingestion")
        logger.info("[node:ingestion] enter repo_url=%r", state["repo_url"])
        repo_input = state["repo_url"]
        branch = validate_git_branch(config.base_branch)
        repo_meta = None
        technologies = None
        ws = None

        is_remote = repo_input.startswith(("http://", "https://", "git@", "ssh://")) or "://" in repo_input

        try:
            if not is_remote:
                ws = RepoWorkspace(repo_input, is_temporary=False)
                repo_path = str(ws.path)
                logger.info("Using local repository at %s", repo_path)
                technologies = detect_repository_technologies(ws.path)
                commit_sha = get_commit_sha(ws.path)
                repo_meta = {
                    "name": ws.path.name,
                    "owner": "local",
                    "full_name": ws.path.name,
                    "default_branch": branch or "main",
                    "is_private": False,
                    "commit_sha": commit_sha,
                }
            else:
                github_val = validate_github_url(repo_input)
                owner, repo_name = github_val["owner"], github_val["repo"]
                if not branch and github_val.get("extracted_branch"):
                    branch = validate_git_branch(github_val["extracted_branch"])
                try:
                    repo_meta = get_github_repo_metadata(owner, repo_name, token=config.github_token)
                    if not branch:
                        branch = validate_git_branch(str(repo_meta.get("default_branch") or "main"))
                except Exception as exc:
                    logger.warning("Could not fetch GitHub metadata: %s", exc)
                    repo_meta = {
                        "name": repo_name,
                        "owner": owner,
                        "full_name": f"{owner}/{repo_name}",
                        "default_branch": branch or "main",
                        "is_private": False,
                    }
                ws = RepoWorkspace(
                    repo_input,
                    branch=branch,
                    token=config.github_token,
                    is_temporary=True,
                    metadata=repo_meta,
                )
                repo_path = str(ws.path)
                commit_sha = get_commit_sha(ws.path)
                if repo_meta:
                    repo_meta["commit_sha"] = commit_sha
                technologies = detect_repository_technologies(ws.path)

            language = technologies.get("dominant_language", "unknown") if technologies else "unknown"
            logger.info("[node:ingestion] exit repo_path=%r language=%s branch=%s", repo_path, language, branch)
            return {
                "repo_path": repo_path,
                "repo_metadata": repo_meta,
                "technologies": technologies,
                "branch": branch,
                "workspace": ws,
            }
        except Exception:
            if ws is not None:
                try:
                    ws.cleanup()
                except Exception as exc:
                    logger.warning("Failed to clean up workspace after ingestion failure: %s", exc)
            raise


    def scanning_node(state: PipelineState) -> dict:
        if _check_cancelled():
            raise PipelineCancelled("Scan cancelled before scanning")
        logger.info("[node:scanning] enter repo_path=%r scanners=%s", state["repo_path"], config.scanners)

        repo_p = Path(state["repo_path"]).resolve()

        # Check for previous scan data:
        # Priority:
        # 1. state["previous_hashes"] and state["previous_findings"]
        # 2. config.previous_hashes and config.previous_findings
        # 3. config.storage (lookup latest completed run)
        raw_prev_hashes = state.get("previous_hashes")
        raw_prev_findings = state.get("previous_findings")

        if raw_prev_hashes is None:
            raw_prev_hashes = config.previous_hashes
        if raw_prev_findings is None:
            raw_prev_findings = config.previous_findings

        if raw_prev_hashes is None and config.storage is not None:
            try:
                target_url = state.get("repo_url") or config.repo_input
                target_branch = state.get("branch") or config.base_branch
                if hasattr(config.storage, "get_latest_completed_run"):
                    prev_run = config.storage.get_latest_completed_run(target_url, branch=target_branch)
                    if prev_run:
                        raw_prev_hashes = prev_run.get("file_hashes")
                        raw_prev_findings = prev_run.get("findings") or prev_run.get("completed")
            except Exception as exc:
                logger.warning("[node:scanning] Failed to query previous scan from storage: %s", exc)

        validated = _validate_incremental_data(raw_prev_hashes, raw_prev_findings)

        findings = None
        file_hashes = None

        if validated is not None:
            prev_hashes, prev_findings = validated
            logger.info(
                "[node:scanning] attempting incremental scan (previous_hashes=%d, previous_findings=%d)",
                len(prev_hashes),
                len(prev_findings),
            )
            try:
                if not repo_p.is_dir():
                    raise FileNotFoundError(f"Repository path is not a directory: {repo_p}")
                findings, file_hashes = scan_repo_incremental(
                    repo_p,
                    previous_findings=prev_findings,
                    previous_hashes=prev_hashes,
                    scanners=config.scanners,
                )
                logger.info("[node:scanning] incremental scan succeeded: %d findings", len(findings))
            except Exception as exc:
                logger.warning(
                    "[node:scanning] incremental scan failed, falling back to full scan: %s",
                    exc,
                )
                findings = None
                file_hashes = None

        # Fallback to full scan if incremental was not used or failed
        if findings is None:
            logger.info("[node:scanning] performing full scan")
            try:
                findings = scan_repo(repo_p, scanners=config.scanners)
            except Exception as exc:
                logger.error("[node:scanning] full scan failed: %s", exc)
                findings = []

            try:
                file_hashes = compute_file_hashes(repo_p)
            except Exception as exc:
                logger.warning("[node:scanning] Failed to compute file hashes: %s", exc)
                file_hashes = {}

        logger.info("[node:scanning] exit findings=%d ids=%s", len(findings),
                    [f.id for f in findings][:6])
        return {"findings": findings, "current_finding": None, "file_hashes": file_hashes}

    def next_finding_node(state: PipelineState) -> dict:
        if _check_cancelled():
            raise PipelineCancelled("Scan cancelled before processing next finding")
        queue = list(state.get("findings", []))
        logger.info("[node:next_finding] enter queue=%d", len(queue))
        if not queue:
            logger.info("[node:next_finding] exit queue empty -> run complete")
            return {"current_finding": None}
        current = queue.pop(0)
        logger.info("[node:next_finding] exit current=%r remaining=%d", current.id, len(queue))
        return {
            "findings": queue,
            "current_finding": current,
            "context": None,
            "triage_result": None,
            "patch": None,
            "verification_result": None,
            "retry_count": 0,
        }

    def context_node(state: PipelineState) -> dict:
        if _check_cancelled():
            raise PipelineCancelled("Scan cancelled before context extraction")
        finding = state["current_finding"]
        logger.info("[node:context] enter finding=%r", finding.id)
        context = extract_code_context(finding, Path(state["repo_path"]), store=config.store)
        logger.info("[node:context] exit enclosing_function=%d chars imports=%d related=%d",
                    len(context.enclosing_function), len(context.imports), len(context.related_chunks))
        return {"context": context}

    def triage_node(state: PipelineState) -> dict:
        if _check_cancelled():
            raise PipelineCancelled("Scan cancelled before triage")
        finding, context = state["current_finding"], state["context"]
        logger.info("[node:triage] enter finding=%r", finding.id)
        try:
            result = triage_finding(finding, context, config.llm)
        except TriageError as exc:
            logger.error("[node:triage] EXIT WITH FAILURE finding=%r error=%s", finding.id, exc)
            return {
                "triage_result": None,
                "completed_findings": state.get("completed_findings", [])
                + [_completed_entry(finding, "triage_failed", failure_reason=str(exc))],
            }
        logger.info("[node:triage] exit finding=%r is_real_vulnerability=%r confidence=%.2f cwe=%s",
                    finding.id, result.is_real_vulnerability, result.confidence, result.cwe_confirmed)
        if not result.is_real_vulnerability:
            logger.info("%s triaged as false positive", finding.id)
            return {
                "triage_result": result,
                "completed_findings": state.get("completed_findings", [])
                + [_completed_entry(
                    finding, "false_positive",
                    confidence=result.confidence, reasoning=result.reasoning,
                )],
            }
        return {"triage_result": result}

    def patch_node(state: PipelineState) -> dict:
        if _check_cancelled():
            raise PipelineCancelled("Scan cancelled before patch generation")
        finding, context = state["current_finding"], state["context"]
        triage = state["triage_result"]
        attempt = state.get("retry_count", 0) + 1
        failure_reason = (
            state["verification_result"].failure_reason
            if state.get("retry_count", 0) > 0 and state.get("verification_result")
            else None
        )
        logger.info("[node:patch] enter finding=%r attempt=%d failure_reason=%r",
                    finding.id, attempt, failure_reason)
        try:
            patch = generate_patch(
                finding, context, triage, config.llm,
                attempt_number=attempt, failure_reason=failure_reason,
            )
        except PatchError as exc:
            logger.error("[node:patch] EXIT WITH FAILURE finding=%r error=%s", finding.id, exc)
            return {
                "patch": None,
                "completed_findings": state.get("completed_findings", [])
                + [_completed_entry(finding, "patch_generation_failed", failure_reason=str(exc))],
            }
        noop = patch.patched_code.strip() == patch.original_code.strip()
        logger.info("[node:patch] exit finding=%r populated=True original_len=%d patched_len=%d "
                    "NOOP=%s explanation=%r",
                    finding.id, len(patch.original_code), len(patch.patched_code),
                    noop, patch.explanation[:80])
        return {"patch": patch}

    def verify_node(state: PipelineState) -> dict:
        if _check_cancelled():
            raise PipelineCancelled("Scan cancelled before verification")
        patch = state["patch"]
        active_repo_path = Path(state.get("repo_path") or config.repo_input)
        active_verifier = Verifier(active_repo_path, backend=config.backend)
        logger.info("[node:verify] enter finding=%r backend=%s patched_len=%d",
                    state["current_finding"].id, active_verifier.backend.name, len(patch.patched_code))
        result = active_verifier.verify(state["current_finding"], patch)
        update = {"verification_result": result}
        if not result.passed:
            update["retry_count"] = state.get("retry_count", 0) + 1
        logger.info("[node:verify] exit finding=%r passed=%s scan_clean=%s tests_passed=%s "
                    "retry_count=%d failure_reason=%r",
                    state["current_finding"].id, result.passed, result.scan_clean,
                    result.tests_passed, state.get("retry_count", 0),
                    (result.failure_reason or "")[:120])
        return update


    def pr_node(state: PipelineState) -> dict:
        if _check_cancelled():
            raise PipelineCancelled("Scan cancelled before PR creation")
        finding, patch, triage = state["current_finding"], state["patch"], state["triage_result"]
        attempts = state.get("retry_count", 0) + 1
        logger.info("[node:pr] enter finding=%r attempts=%d github_repo=%r",
                    finding.id, attempts, config.github_repo)
        if not config.github_repo:
            logger.info("[node:pr] exit no GitHub repo configured — %s verified, PR skipped", finding.id)
            return {"completed_findings": state.get("completed_findings", []) + [
                _completed_entry(finding, "verified_pr_skipped", attempts=attempts,
                                 confidence=triage.confidence)
            ]}
        from codesage.pr_agent import PRError, create_pull_request, get_repo

        token = config.github_token
        if token is None:
            import os

            token = os.environ.get("GITHUB_TOKEN", "")
        try:
            repo = get_repo(token, config.github_repo)
            info = create_pull_request(repo, patch, triage,
                                       state["verification_result"],
                                       base_branch=config.base_branch)
        except PRError as exc:
            logger.error("%s", exc)
            return {"completed_findings": state.get("completed_findings", []) + [
                _completed_entry(finding, "pr_failed", failure_reason=str(exc), attempts=attempts)
            ]}
        return {"completed_findings": state.get("completed_findings", []) + [
            _completed_entry(finding, "verified_pr_opened", pr_url=info["pr_url"],
                             branch=info["branch"], attempts=attempts,
                             confidence=triage.confidence)
        ]}

    def human_review_node(state: PipelineState) -> dict:
        if _check_cancelled():
            raise PipelineCancelled("Scan cancelled before human review")
        finding = state["current_finding"]
        result = state.get("verification_result")
        triage = state.get("triage_result")
        logger.info("Routing %s to human review", finding.id)
        return {"completed_findings": state.get("completed_findings", []) + [
            _completed_entry(
                finding, "needs_human_review",
                attempts=state.get("retry_count", 0),
                confidence=triage.confidence if triage else None,
                failure_reason=result.failure_reason if result else None,
            )
        ]}

    # ------------------------------------------------------------------
    # Conditional edge routers (read state only — no mutation)
    # ------------------------------------------------------------------

    def route_after_pop(state: PipelineState) -> str:
        return "context" if state.get("current_finding") is not None else END

    def route_after_triage(state: PipelineState) -> str:
        tr = state.get("triage_result")
        is_real = bool(tr and tr.is_real_vulnerability)
        decision = "patch" if is_real else "next_finding"
        logger.info("[edge:triage] condition=triage_result.is_real_vulnerability value=%r -> %s",
                    getattr(tr, "is_real_vulnerability", None), decision)
        return decision

    def route_after_patch(state: PipelineState) -> str:
        has_patch = state.get("patch") is not None
        logger.info("[edge:patch] condition=patch is not None value=%r -> %s",
                    has_patch, "verify" if has_patch else "next_finding")
        return "verify" if has_patch else "next_finding"

    def route_after_verify(state: PipelineState) -> str:
        result = state.get("verification_result")
        passed = bool(result and result.passed)
        retries = state.get("retry_count", 0)
        if passed:
            decision = "pr"
        elif retries < config.max_retries:
            decision = "patch"
        else:
            decision = "human_review"
        logger.info("[edge:verify] passed=%r retry_count=%d max_retries=%d -> %s",
                    passed, retries, config.max_retries, decision)
        return decision
        return decision

    # ------------------------------------------------------------------
    # Graph assembly
    # ------------------------------------------------------------------

    builder = StateGraph(PipelineState)
    builder.add_node("ingestion", ingestion_node)
    builder.add_node("scanning", scanning_node)
    builder.add_node("next_finding", next_finding_node)
    builder.add_node("context", context_node)
    builder.add_node("triage", triage_node)
    builder.add_node("patch", patch_node)
    builder.add_node("verify", verify_node)
    builder.add_node("pr", pr_node)
    builder.add_node("human_review", human_review_node)

    builder.add_edge(START, "ingestion")
    builder.add_edge("ingestion", "scanning")
    builder.add_edge("scanning", "next_finding")
    builder.add_conditional_edges("next_finding", route_after_pop,
                                  {"context": "context", END: END})
    builder.add_edge("context", "triage")
    builder.add_conditional_edges("triage", route_after_triage,
                                  {"patch": "patch", "next_finding": "next_finding"})
    builder.add_conditional_edges("patch", route_after_patch,
                                  {"verify": "verify", "next_finding": "next_finding"})
    builder.add_conditional_edges("verify", route_after_verify,
                                  {"pr": "pr", "patch": "patch", "human_review": "human_review"})
    builder.add_edge("pr", "next_finding")
    builder.add_edge("human_review", "next_finding")

    return builder.compile()


def run_pipeline(config: PipelineConfig) -> dict:
    """Run the graph to completion; returns the final state."""
    if not Path(config.repo_input).expanduser().is_dir() and "://" not in str(config.repo_input):
        # git URLs are cloned by the ingestion node; bare paths must exist up front
        raise PipelineError(
            f"Repository not found: {config.repo_input!r} — provide an existing local "
            "path or a git URL."
        )
    app = build_pipeline(config)
    initial: PipelineState = {
        "repo_url": str(config.repo_input),
        "findings": [],
        "completed_findings": [],
        "retry_count": 0,
    }
    return app.invoke(
        initial, config={"recursion_limit": DEFAULT_RECURSION_LIMIT}
    )


def print_report(final_state: dict) -> None:
    completed = final_state.get("completed_findings", [])
    print("=" * 70)
    print(f"CodeSage pipeline report — {len(completed)} findings processed")
    print("=" * 70)
    for entry in completed:
        line = f"{entry['status']:24} {entry['file_path']:20} {entry['cwe_id'] or '-'}"
        if entry.get("pr_url"):
            line += f"  {entry['pr_url']}"
        if entry.get("failure_reason"):
            line += f"\n{'':26} reason: {entry['failure_reason'][:90]}"
        print(line)
    print("=" * 70)


if __name__ == "__main__":  # manual: python -m codesage.pipeline <repo> [options]
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(description="Run the full CodeSage pipeline")
    parser.add_argument("repo", help="Local path or git URL")
    parser.add_argument("--github-repo", default=None, help="owner/name to open PRs on")
    parser.add_argument("--base", default=None, help="Base branch for PRs")
    parser.add_argument("--no-chroma", action="store_true", help="skip related-chunk retrieval")
    parser.add_argument("--max-retries", type=int, default=2)
    args = parser.parse_args()

    from codesage.llm import create_llm

    store = None
    if not args.no_chroma:
        store = ChunkStore()
        store.index_repo(Path(args.repo))
    config = PipelineConfig(
        repo_input=args.repo,
        llm=create_llm(),
        store=store,
        github_repo=args.github_repo,
        base_branch=args.base,
        max_retries=args.max_retries,
    )
    final_state = run_pipeline(config)
    print_report(final_state)
