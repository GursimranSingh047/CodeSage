"""Triage evaluation: precision/recall of the triage stage against ground truth.

A finding "matches" a planted vulnerability when it points at the same file
and reports the same CWE (gitleaks reports no CWE, so a file-only match is
accepted for it). Metrics:

- TP: finding triaged REAL and matched to a planted vulnerability
- FP: finding triaged REAL but matched to nothing (scanner noise)
- TN: finding triaged false-positive and matched to nothing
- FN (finding-level): matched finding triaged false-positive
- Recall is computed per planted vulnerability: covered if at least one
  matching finding was triaged REAL. Missed vulns (e.g. V3/V8, which the
  scanners never surface) count against recall.
"""

import logging
from pathlib import Path
from typing import Dict, List, Optional

from codesage.ground_truth import PLANTED_VULNERABILITIES
from codesage.schemas import Finding, TriageResult

logger = logging.getLogger(__name__)


def match_finding_to_vuln(finding: Finding) -> Optional[str]:
    """Return the id of the planted vulnerability this finding corresponds to."""
    for vuln in PLANTED_VULNERABILITIES:
        same_file = finding.file_path == vuln.file_path
        same_cwe = finding.cwe_id == vuln.cwe_id
        no_cwe = finding.cwe_id is None  # gitleaks reports no CWE
        if same_file and (same_cwe or no_cwe):
            return vuln.id
    return None


def evaluate(
    findings: List[Finding],
    triage_results: Dict[str, TriageResult],
    failed_ids: Optional[List[str]] = None,
) -> dict:
    """Compute precision/recall for a triage run.

    Findings whose triage failed (design.md section 6) are treated as
    not-marked-real: they can only contribute TN or FN, never TP/FP.
    """
    failed = set(failed_ids or [])
    tp = fp = tn = fn_findings = 0
    covered = set()

    for finding in findings:
        vuln_id = match_finding_to_vuln(finding)
        result = triage_results.get(finding.id)
        marked_real = bool(result and result.is_real_vulnerability)

        if vuln_id is not None:
            if marked_real:
                tp += 1
                covered.add(vuln_id)
            else:
                fn_findings += 1
        else:
            if marked_real:
                fp += 1
            else:
                tn += 1

    all_ids = {v.id for v in PLANTED_VULNERABILITIES}
    missed = sorted(all_ids - covered)
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = len(covered) / len(all_ids) if all_ids else 0.0

    return {
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn_findings": fn_findings,
        "precision": precision,
        "recall": recall,
        "covered_vulns": sorted(covered),
        "missed_vulns": missed,
        "triage_failed": sorted(failed),
    }


def print_report(metrics: dict) -> None:
    print("=" * 62)
    print("CodeSage triage evaluation (ground truth: VULNERABILITIES.md)")
    print("=" * 62)
    print(f"True positives  (real + matches planted vuln): {metrics['tp']}")
    print(f"False positives (real + scanner noise)       : {metrics['fp']}")
    print(f"True negatives (correctly dismissed noise)   : {metrics['tn']}")
    print(f"Matched findings triaged false-positive      : {metrics['fn_findings']}")
    print(f"Covered vulns : {', '.join(metrics['covered_vulns']) or '-'}")
    print(f"Missed vulns  : {', '.join(metrics['missed_vulns']) or '-'}")
    if metrics["triage_failed"]:
        print(f"Triage failed : {', '.join(metrics['triage_failed'])}")
    print("-" * 62)
    print(f"Precision : {metrics['precision']:.2f}")
    print(f"Recall    : {metrics['recall']:.2f}")
    print("=" * 62)


if __name__ == "__main__":  # manual: python -m codesage.evaluate <repo>
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(
        description="Scan + triage a repo and report precision/recall vs ground truth"
    )
    parser.add_argument("repo", help="Path to the repository (default: test-target-repo)")
    parser.add_argument("--no-chroma", action="store_true", help="skip related-chunk retrieval")
    args = parser.parse_args()

    from codesage.llm import create_llm
    from codesage.scanning import scan_repo
    from codesage.triage import triage_findings

    repo = Path(args.repo)
    store = None
    if not args.no_chroma:
        from codesage.context import ChunkStore

        store = ChunkStore()
        store.index_repo(repo)
    findings = scan_repo(repo)
    print(f"{len(findings)} findings from scanners; triaging with LLM...\n")
    results, failed = triage_findings(findings, repo, create_llm(), store=store)
    print_report(evaluate(findings, results, failed))
