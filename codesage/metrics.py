"""Module 10 — testing & metrics (design.md section 7).

Formal measurement layer over the pipeline:

- triage_metrics(): precision / recall / F1 for the triage stage against the
  seeded ground truth (reuses the Module 4 evaluator and adds F1 and
  per-severity recall).
- verification_stats(): outcome counts, attempt distribution and pass rate
  from a finished pipeline run.
- markdown_report(): renders the per-finding results table (finding ID, CWE,
  scanners, triage outcome, verification outcome, attempts, PR link, time)
  in the live_run_results.md format.
- run_and_report(): executes the full pipeline (mock or live) and writes the
  report to disk.
"""

import time
from collections import Counter
from pathlib import Path
from typing import Dict, List, Optional

from codesage.evaluate import evaluate
from codesage.ground_truth import PLANTED_VULNERABILITIES
from codesage.schemas import Finding, TriageResult

SEVERITY_OF = {v.id: v.severity for v in PLANTED_VULNERABILITIES}


# ---------------------------------------------------------------------------
# Triage metrics
# ---------------------------------------------------------------------------

def triage_metrics(
    findings: List[Finding],
    triage_results: Dict[str, TriageResult],
    failed_ids: Optional[List[str]] = None,
) -> dict:
    """Precision / recall / F1 for the triage stage (adds F1 and per-vuln
    severity recall on top of the Module 4 evaluator)."""
    base = evaluate(findings, triage_results, failed_ids)
    tp, fp, fn_findings = base["tp"], base["fp"], base["fn_findings"]
    precision = base["precision"]
    recall = base["recall"]
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0

    covered = set(base["covered_vulns"])
    severity_recall: Dict[str, dict] = {}
    for vuln in PLANTED_VULNERABILITIES:
        bucket = severity_recall.setdefault(vuln.severity, {"total": 0, "covered": 0})
        bucket["total"] += 1
        if vuln.id in covered:
            bucket["covered"] += 1

    return {
        **base,
        "f1": f1,
        "severity_recall": severity_recall,
    }


# ---------------------------------------------------------------------------
# Verification / pipeline stats
# ---------------------------------------------------------------------------

def verification_stats(completed: List[dict]) -> dict:
    """Outcome counts, attempt distribution and verification pass rate."""
    by_status = Counter(entry["status"] for entry in completed)
    verified = by_status.get("verified_pr_opened", 0) + by_status.get("verified_pr_skipped", 0)
    attempted = [entry for entry in completed if "attempts" in entry]
    attempts_hist = Counter(entry.get("attempts", 1) for entry in attempted)
    total = len(completed)
    return {
        "total_processed": total,
        "by_status": dict(by_status),
        "verified": verified,
        "needs_human_review": by_status.get("needs_human_review", 0),
        "false_positives": by_status.get("false_positive", 0),
        "failures": by_status.get("patch_generation_failed", 0) + by_status.get("triage_failed", 0),
        "avg_attempts": (
            round(sum(k * v for k, v in attempts_hist.items()) / len(attempted), 2)
            if attempted else 0.0
        ),
        "attempts_histogram": dict(sorted(attempts_hist.items())),
        # share of findings that reached a verified (or human-review) terminal state
        "verification_pass_rate": round(verified / total, 3) if total else 0.0,
    }


def scan_coverage(findings: List[Finding]) -> dict:
    """Which of the planted vulnerabilities the scanners surfaced at all."""
    from codesage.evaluate import match_finding_to_vuln

    surfaced = sorted({match_finding_to_vuln(f) for f in findings if match_finding_to_vuln(f)})
    all_ids = {v.id for v in PLANTED_VULNERABILITIES}
    return {"surfaced": surfaced, "not_surfaced": sorted(all_ids - set(surfaced))}


# ---------------------------------------------------------------------------
# Markdown report (live_run_results.md format)
# ---------------------------------------------------------------------------

def _esc(text: Optional[str]) -> str:
    return (text or "—").replace("|", "\\|")


def markdown_report(
    findings: List[Finding],
    triage_results: Dict[str, TriageResult],
    completed: List[dict],
    failed_ids: List[str],
    total_seconds: float,
    repo: str,
    mode: str = "DEMO",
    notes: Optional[List[str]] = None,
) -> str:
    """Render the full per-finding metrics report as markdown."""
    metrics = triage_metrics(findings, triage_results, failed_ids)
    vstats = verification_stats(completed)
    coverage = scan_coverage(findings)
    generated = time.strftime("%Y-%m-%d %H:%M:%S")

    by_id = {f.id: f for f in findings}
    lines = [
        f"# CodeSage Metrics Report — Scan against `{repo}`",
        "",
        f"- **Mode:** {mode}",
        f"- **Generated:** {generated}",
        f"- **Total pipeline duration:** {total_seconds:.1f}s",
        f"- **Findings processed:** {vstats['total_processed']}",
        "",
        "## Triage quality (vs. VULNERABILITIES.md ground truth)",
        "",
        "| Metric | Value |",
        "|---|---|",
        f"| Precision | {metrics['precision']:.2f} |",
        f"| Recall | {metrics['recall']:.2f} |",
        f"| F1 | {metrics['f1']:.2f} |",
        f"| Ground-truth vulns surfaced by scanners | {len(coverage['surfaced'])} / {len(PLANTED_VULNERABILITIES)} |",
        f"| Ground-truth vulns never surfaced | {', '.join(coverage['not_surfaced']) or '—'} |",
        "",
        "## Verification outcomes",
        "",
        "| Outcome | Count |",
        "|---|---|",
        f"| Verified (PR ready) | {vstats['verified']} |",
        f"| Needs human review | {vstats['needs_human_review']} |",
        f"| False positives filtered | {vstats['false_positives']} |",
        f"| Stage failures | {vstats['failures']} |",
        f"| Average patch attempts | {vstats['avg_attempts']} |",
        "",
        "## Per-finding results",
        "",
        "| Finding | CWE | Scanner(s) | Triage outcome | Confidence | Attempts | Final outcome | PR |",
        "|---|---|---|---|---|---|---|---|",
    ]

    rows = []
    for entry in sorted(completed, key=lambda e: (e["file_path"], e.get("completed_at", 0))):
        fid = entry["finding_id"]
        finding = by_id.get(fid)
        scanners = entry["tool_source"]
        if finding:
            peers = sorted({f.tool_source for f in findings if f.file_path == finding.file_path and f.cwe_id == finding.cwe_id})
            scanners = "+".join(peers) or scanners
        result = triage_results.get(fid)
        if entry["status"] == "false_positive":
            triage = "False positive"
        elif result:
            triage = "REAL"
        else:
            triage = "n/a (failed)"
        conf = result.confidence if result else entry.get("confidence")
        conf_s = f"{conf:.0%}" if isinstance(conf, (int, float)) else "—"
        pr = entry.get("pr_url") or "—"
        attempts = entry.get("attempts", "—")
        lines.append(
            f"| {_esc(fid)} | {_esc(entry.get('cwe_id'))} | {_esc(scanners)} | {triage} "
            f"| {conf_s} | {attempts} | {_esc(entry['status'])} | {_esc(pr)} |"
        )
        rows.append(entry["status"])

    lines += ["", "## Notes", ""]
    for note in notes or []:
        lines.append(f"- {note}")
    lines.append("")
    return "\n".join(lines)


def write_report(content: str, path: Path) -> Path:
    Path(path).write_text(content, encoding="utf-8")
    return Path(path)


# ---------------------------------------------------------------------------
# CLI: python -m codesage.metrics <repo> [--output FILE] [--mock]
# ---------------------------------------------------------------------------

def run_and_collect(config):
    """Run the pipeline graph and collect (findings, triage_results, completed,
    failed_ids, total_seconds) — the raw material for the metrics report."""
    from codesage.pipeline import build_pipeline

    app = build_pipeline(config)
    initial = {"repo_url": str(config.repo_input), "findings": [], "completed_findings": [], "retry_count": 0}
    findings: List[Finding] = []
    completed: List[dict] = []
    triage_results: Dict[str, TriageResult] = {}
    started = time.time()

    for chunk in app.stream(initial, stream_mode="updates", config={"recursion_limit": 2000}):
        for node, delta in chunk.items():
            # only the Scanning node's delta carries the full findings list —
            # every next_finding delta also carries a shrunk "findings" queue
            if node == "scanning" and "findings" in delta:
                findings = list(delta["findings"])
            if "completed_findings" in delta:
                completed = list(delta["completed_findings"])
            if delta.get("triage_result") is not None:
                tr = delta["triage_result"]
                triage_results[tr.finding_id] = tr

    failed_ids = [e["finding_id"] for e in completed if e["status"] in ("triage_failed", "patch_generation_failed")]
    return findings, triage_results, completed, failed_ids, round(time.time() - started, 1)


def _demo_responder():
    """Scripted LLM verdicts used when --mock is passed (no credentials needed)."""
    from codesage.ground_truth import PLANTED_VULNERABILITIES

    confirm = tuple(v.file_path for v in PLANTED_VULNERABILITIES)
    fixes = [
        ('exit_status = os.system(f"ping -c 1 {host}")',
         'import subprocess\n    exit_status = subprocess.run(["ping", "-c", "1", host], check=False).returncode'),
        ('task = pickle.loads(raw)',
         'import json\n        task = json.loads(raw.decode("utf-8"))'),
    ]

    def responder(system: str, user: str) -> str:
        import json as _json

        if "reviewing static analysis findings" in system:
            confirmed = any(f"at {name}" in user for name in confirm)
            return _json.dumps({
                "finding_id": "x", "is_real_vulnerability": confirmed,
                "confidence": 0.9 if confirmed else 0.6,
                "reasoning": "demo-mode scripted verdict", "cwe_confirmed": "CWE-0",
                "exploitability": "high" if confirmed else "low",
            })
        span = user.split("Original function:\n", 1)[1]
        span = span.split("\n\nYour previous patch attempt failed verification", 1)[0].rstrip()
        body = span
        for orig, fixed in fixes:
            if orig in span:
                body = span.replace(orig, fixed)
                break
        return _json.dumps({
            "finding_id": "x", "original_code": "ignored", "patched_code": body,
            "explanation": "demo-mode scripted fix", "attempt_number": 1,
        })

    return responder


def main(argv=None) -> int:
    import argparse
    import logging
    import os

    from codesage.llm import LLMError, MockLLM
    from codesage.pipeline import PipelineConfig
    from codesage.scanning import scan_repo
    from codesage.verification import get_backend

    logging.basicConfig(level=logging.WARNING)
    parser = argparse.ArgumentParser(
        prog="codesage.metrics",
        description="Run the full pipeline against a repo and write the metrics report.",
    )
    parser.add_argument("repo", help="Path or URL of the repository to audit")
    parser.add_argument("--output", default="metrics_report.md", help="Report destination (.md)")
    parser.add_argument("--mock", action="store_true",
                        help="Scripted LLM + local (non-sandboxed) verifier — labeled DEMO in the report")
    parser.add_argument("--scanners", default="semgrep,bandit,gitleaks")
    parser.add_argument("--max-retries", type=int, default=2)
    args = parser.parse_args(argv)

    if args.mock:
        from codesage.verification import LocalBackend

        config = PipelineConfig(
            repo_input=args.repo, llm=MockLLM(responder=_demo_responder()),
            backend=LocalBackend(), scanners=tuple(args.scanners.split(",")),
            max_retries=args.max_retries,
        )
        mode = "DEMO — scripted LLM, local (non-sandboxed) verifier"
    else:
        from codesage.llm import create_llm

        config = PipelineConfig(
            repo_input=args.repo, llm=create_llm(), backend=get_backend(),
            scanners=tuple(args.scanners.split(",")), max_retries=args.max_retries,
        )
        mode = "LIVE — real LLM, sandboxed verification"

    findings, triage_results, completed, failed_ids, total_seconds = run_and_collect(config)
    notes = [
        "Scanners surface only V1, V2, V4, V5, V6, V7 of the 8 planted vulnerabilities — "
        "V3 (plaintext auth) and V8 (dependency pins) are never flagged by Semgrep/Bandit/Gitleaks.",
        "test-target-repo's own tests assert the vulnerable behavior, so verified fixes "
        "fail its suite and route to human review by design.",
    ]
    report = markdown_report(
        findings, triage_results, completed, failed_ids,
        total_seconds=total_seconds, repo=args.repo, mode=mode, notes=notes,
    )
    Path(args.output).write_text(report, encoding="utf-8")
    print(f"report written to {args.output}")
    print(f"findings processed: {len(completed)} · duration: {total_seconds}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
