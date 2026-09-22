"""Unit tests for Module 10: metrics math and markdown report generation.

Pure functions over synthetic data — no pipeline execution, fully deterministic.
"""

from codesage.evaluate import match_finding_to_vuln
from codesage.ground_truth import PLANTED_VULNERABILITIES
from codesage.metrics import (
    markdown_report,
    scan_coverage,
    triage_metrics,
    verification_stats,
)
from codesage.schemas import Finding, TriageResult


def make_finding(fid, file_path, cwe, tool="semgrep"):
    return Finding(
        id=fid, file_path=file_path, line_number=1, cwe_id=cwe,
        severity="high", tool_source=tool, raw_message="m", code_snippet="",
    )


def make_triage(fid, real=True, confidence=0.9):
    return TriageResult(
        finding_id=fid, is_real_vulnerability=real, confidence=confidence,
        reasoning="r", cwe_confirmed="CWE-0", exploitability="high",
    )


# 4 flagged findings matching V1/V4 (real) + 2 noise findings, both triaged REAL
SCENARIO_FINDINGS = [
    make_finding("semgrep:shop.py:18:rule", "shop.py", "CWE-89"),
    make_finding("bandit:tasks.py:21:B301", "tasks.py", "CWE-502"),
    make_finding("bandit:tests/x.py:3:B101", "tests/x.py", "CWE-703"),
    make_finding("gitleaks:docs.md:5:key", "docs.md", None, tool="gitleaks"),
]

SCENARIO_TRIAGE = {
    "semgrep:shop.py:18:rule": make_triage("a", real=True),
    "bandit:tasks.py:21:B301": make_triage("b", real=True),
    "bandit:tests/x.py:3:B101": make_triage("c", real=False),
    "gitleaks:docs.md:5:key": make_triage("d", real=False),
}


def test_match_rules_file_and_cwe():
    assert match_finding_to_vuln(SCENARIO_FINDINGS[0]) == "V1"
    assert match_finding_to_vuln(SCENARIO_FINDINGS[1]) == "V4"
    assert match_finding_to_vuln(SCENARIO_FINDINGS[2]) is None
    assert match_finding_to_vuln(SCENARIO_FINDINGS[3]) is None  # docs file matches no vuln


def test_triage_metrics_counts():
    real = {k: v for k, v in SCENARIO_TRIAGE.items()}
    metrics = triage_metrics(SCENARIO_FINDINGS, real)
    assert metrics["tp"] == 2
    assert metrics["fp"] == 0
    assert metrics["tn"] == 2
    assert metrics["precision"] == 1.0
    # 2 of the 8 planted vulns surfaced and covered
    assert metrics["recall"] == 0.25
    # F1 = 2PR/(P+R)
    assert abs(metrics["f1"] - 2 * 1.0 * 0.25 / 1.25) < 1e-9


def test_triage_metrics_f1_zero_when_no_recall():
    metrics = triage_metrics(SCENARIO_FINDINGS, {})  # nothing triaged real
    assert metrics["precision"] == 0.0
    assert metrics["recall"] == 0.0
    assert metrics["f1"] == 0.0


def test_severity_recall_buckets():
    metrics = triage_metrics(SCENARIO_FINDINGS, SCENARIO_TRIAGE)
    buckets = metrics["severity_recall"]
    assert buckets["critical"]["total"] >= 1
    covered_total = sum(b["covered"] for b in buckets.values())
    assert covered_total == len(metrics["covered_vulns"])


def test_verification_stats_counts_and_attempts():
    completed = [
        {"finding_id": "a", "status": "verified_pr_skipped", "attempts": 1},
        {"finding_id": "b", "status": "verified_pr_opened", "attempts": 2},
        {"finding_id": "c", "status": "needs_human_review", "attempts": 2},
        {"finding_id": "d", "status": "false_positive"},
    ]
    stats = verification_stats(completed)
    assert stats["total_processed"] == 4
    assert stats["verified"] == 2
    assert stats["needs_human_review"] == 1
    assert stats["false_positives"] == 1
    # averaged over the three entries that recorded patch attempts, rounded to 2dp
    assert stats["avg_attempts"] == round(5 / 3, 2)
    # only patch-pipeline entries carry attempts; the triaged-only one does not
    assert stats["attempts_histogram"] == {1: 1, 2: 2}
    assert stats["verification_pass_rate"] == 0.5


def test_scan_coverage_reports_gaps():
    coverage = scan_coverage(SCENARIO_FINDINGS)
    assert coverage["surfaced"] == ["V1", "V4"]
    assert "V3" in coverage["not_surfaced"] and "V8" in coverage["not_surfaced"]


def test_markdown_report_contains_required_sections():
    metrics = triage_metrics(SCENARIO_FINDINGS, SCENARIO_TRIAGE)
    report = markdown_report(
        SCENARIO_FINDINGS, SCENARIO_TRIAGE,
        completed=[
            {"finding_id": "semgrep:shop.py:18:rule", "file_path": "shop.py",
             "cwe_id": "CWE-89", "tool_source": "semgrep", "status": "verified_pr_skipped",
             "pr_url": "https://github.com/x/y/pull/1", "attempts": 1},
        ],
        failed_ids=[],
        total_seconds=42.5,
        repo="test-target-repo",
        mode="DEMO",
        notes=["note one", "note two"],
    )
    assert "# CodeSage Metrics Report" in report
    assert "| Precision | 1.00 |" in report
    assert "| Recall | 0.25 |" in report
    assert "| F1 | 0.40 |" in report  # P=1.0, R=0.25
    assert "| Finding | CWE | Scanner(s) | Triage outcome" in report
    assert "semgrep:shop.py:18:rule" in report
    assert "https://github.com/x/y/pull/1" in report
    assert "- note one" in report
    assert "42.5s" in report


def test_all_planted_vulns_present_in_ground_truth():
    ids = [v.id for v in PLANTED_VULNERABILITIES]
    assert ids == [f"V{i}" for i in range(1, 9)]
