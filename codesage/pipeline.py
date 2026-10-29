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
from typing import Optional, TypedDict

from codesage.context import ChunkStore, extract_code_context
from codesage.ingestion import (
    clone_repo,
    detect_language,
    detect_repository_technologies,
    get_commit_sha,
    get_github_repo_metadata,
    validate_github_url,
)
from codesage.llm import BaseLLM
from codesage.patching import PatchError, generate_patch
from codesage.schemas import CodeContext, Finding, Patch, TriageResult, VerificationResult

from codesage.scanning import scan_repo
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

    def __post_init__(self):
        if self.backend is None:
            self.backend = get_backend()


class PipelineError(RuntimeError):
    """The pipeline cannot even start (e.g. repository ingestion failed)."""


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

    # ------------------------------------------------------------------
    # Node functions (each returns a partial state update)
    # ------------------------------------------------------------------

    def ingestion_node(state: PipelineState) -> dict:
        logger.info("[node:ingestion] enter repo_url=%r", state["repo_url"])
        repo_input = state["repo_url"]
        branch = config.base_branch
        repo_meta = None
        technologies = None

        if Path(repo_input).expanduser().is_dir():
            repo_path = str(Path(repo_input).expanduser().resolve())
            logger.info("Using local repository at %s", repo_path)
            technologies = detect_repository_technologies(Path(repo_path))
            commit_sha = get_commit_sha(Path(repo_path))
            repo_meta = {
                "name": Path(repo_path).name,
                "owner": "local",
                "full_name": Path(repo_path).name,
                "default_branch": branch or "main",
                "is_private": False,
                "commit_sha": commit_sha,
            }
        else:
            if "github.com" in repo_input:
                github_val = validate_github_url(repo_input)
                owner, repo_name = github_val["owner"], github_val["repo"]
                if not branch and github_val.get("extracted_branch"):
                    branch = github_val["extracted_branch"]
                try:
                    repo_meta = get_github_repo_metadata(owner, repo_name, token=config.github_token)
                    if not branch:
                        branch = str(repo_meta.get("default_branch") or "main")
                except Exception as exc:
                    logger.warning("Could not fetch GitHub metadata: %s", exc)
                    repo_meta = {
                        "name": repo_name,
                        "owner": owner,
                        "full_name": f"{owner}/{repo_name}",
                        "default_branch": branch or "main",
                        "is_private": False,
                    }
            cloned_path = clone_repo(repo_input, branch=branch, token=config.github_token)
            repo_path = str(cloned_path)
            commit_sha = get_commit_sha(cloned_path)
            if repo_meta:
                repo_meta["commit_sha"] = commit_sha
            technologies = detect_repository_technologies(cloned_path)

        language = technologies.get("dominant_language", "unknown") if technologies else "unknown"
        logger.info("[node:ingestion] exit repo_path=%r language=%s branch=%s", repo_path, language, branch)
        return {
            "repo_path": repo_path,
            "repo_metadata": repo_meta,
            "technologies": technologies,
            "branch": branch,
        }


    def scanning_node(state: PipelineState) -> dict:
        logger.info("[node:scanning] enter repo_path=%r scanners=%s", state["repo_path"], config.scanners)
        findings = scan_repo(Path(state["repo_path"]), scanners=config.scanners)
        logger.info("[node:scanning] exit findings=%d ids=%s", len(findings),
                    [f.id for f in findings][:6])
        return {"findings": findings, "current_finding": None}

    def next_finding_node(state: PipelineState) -> dict:
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
        finding = state["current_finding"]
        logger.info("[node:context] enter finding=%r", finding.id)
        context = extract_code_context(finding, Path(state["repo_path"]), store=config.store)
        logger.info("[node:context] exit enclosing_function=%d chars imports=%d related=%d",
                    len(context.enclosing_function), len(context.imports), len(context.related_chunks))
        return {"context": context}

    def triage_node(state: PipelineState) -> dict:
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
