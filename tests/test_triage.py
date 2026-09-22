"""Unit tests for Module 4: triage agent + evaluation harness.

Uses MockLLM so everything runs offline and deterministically. The real-LLM
evaluation is exercised via `python -m codesage.evaluate test-target-repo`
once an API key (or Ollama) is configured.
"""

import json
from pathlib import Path

import pytest

from codesage.evaluate import evaluate, match_finding_to_vuln
from codesage.ground_truth import PLANTED_VULNERABILITIES
from codesage.llm import MockLLM
from codesage.schemas import CodeContext, Finding, TriageResult
from codesage.triage import (
    MAX_ATTEMPTS,
    RETRY_REMINDER,
    TriageError,
    build_triage_prompt,
    extract_json,
    parse_triage_response,
    triage_finding,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
TEST_TARGET = REPO_ROOT / "test-target-repo"


def make_finding(file_path="tasks.py", line_number=21, cwe="CWE-502", finding_id=None):
    return Finding(
        id=finding_id or f"semgrep:{file_path}:{line_number}:rule",
        file_path=file_path,
        line_number=line_number,
        cwe_id=cwe,
        severity="high",
        tool_source="semgrep",
        raw_message="pickle.loads on user input",
        code_snippet="task = pickle.loads(raw)",
    )


def make_context(finding):
    return CodeContext(
        finding_id=finding.id,
        enclosing_function="def import_tasks(body):\n    task = pickle.loads(raw)\n    return task",
        imports=["import pickle"],
        related_chunks=[],
    )


def triage_json(finding, real=True, confidence=0.9, exploitability="high"):
    return json.dumps(
        {
            "finding_id": finding.id,
            "is_real_vulnerability": real,
            "confidence": confidence,
            "reasoning": "User input reaches a dangerous sink without validation.",
            "cwe_confirmed": finding.cwe_id or "CWE-unknown",
            "exploitability": exploitability,
        }
    )


# ---------------------------------------------------------------------------
# Prompt construction (design.md 3.1)
# ---------------------------------------------------------------------------

def test_prompt_follows_design_structure():
    finding = make_finding()
    system, user = build_triage_prompt(finding, make_context(finding))

    assert system.startswith("You are a security engineer reviewing static analysis findings.")
    assert "Respond ONLY in valid JSON" in system
    assert '"is_real_vulnerability"' in system  # schema embedded

    assert user.startswith("Finding: semgrep flagged CWE-502 at tasks.py:21")
    assert f"Message: {finding.raw_message}" in user
    assert "Code context:" in user
    assert "pickle.loads" in user  # enclosing function included


def test_prompt_includes_related_chunks_when_present():
    finding = make_finding()
    context = make_context(finding).model_copy(
        update={"related_chunks": ["def other():\n    pass"]}
    )
    _, user = build_triage_prompt(finding, context)
    assert "Similar code elsewhere in this repo" in user
    assert "def other():" in user


# ---------------------------------------------------------------------------
# Response parsing
# ---------------------------------------------------------------------------

def test_parse_plain_json():
    finding = make_finding(finding_id="f1")
    result = parse_triage_response(triage_json(finding), "f1")
    assert isinstance(result, TriageResult)
    assert result.is_real_vulnerability is True
    assert result.finding_id == "f1"


def test_parse_json_in_markdown_fence():
    finding = make_finding(finding_id="f2")
    wrapped = f"Here is my analysis:\n```json\n{triage_json(finding)}\n```\nDone."
    result = parse_triage_response(wrapped, "f2")
    assert result.finding_id == "f2"


def test_parse_forces_pipeline_finding_id():
    finding = make_finding(finding_id="real-id")
    response = triage_json(finding).replace('"real-id"', '"hallucinated-id"')
    result = parse_triage_response(response, "real-id")
    assert result.finding_id == "real-id"  # pipeline owns ids, not the LLM


def test_parse_rejects_invalid_json():
    with pytest.raises(ValueError):
        parse_triage_response("I think this is a real vulnerability.", "f3")


def test_parse_rejects_out_of_range_confidence():
    finding = make_finding(finding_id="f4")
    bad = triage_json(finding, confidence=1.5)
    with pytest.raises(Exception):  # pydantic ValidationError via model_validate
        parse_triage_response(bad, "f4")


def test_parse_rejects_bad_exploitability():
    finding = make_finding(finding_id="f5")
    bad = triage_json(finding, exploitability="certain")
    with pytest.raises(Exception):
        parse_triage_response(bad, "f5")


def test_extract_json_variants():
    assert extract_json('{"a": 1}') == {"a": 1}
    assert extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert extract_json('noise {"a": {"b": 2}} noise') == {"a": {"b": 2}}
    with pytest.raises(ValueError):
        extract_json("no json here")


# ---------------------------------------------------------------------------
# triage_finding: happy path, retry-once, exhaust (design.md section 6)
# ---------------------------------------------------------------------------

def test_triage_finding_happy_path():
    finding = make_finding(finding_id="f6")
    llm = MockLLM(responder=lambda s, u: triage_json(finding))
    result = triage_finding(finding, make_context(finding), llm)
    assert result.is_real_vulnerability is True
    assert result.confidence == 0.9
    assert len(llm.calls) == 1


def test_triage_finding_retries_once_with_stricter_reminder():
    finding = make_finding(finding_id="f7")
    responses = iter(["not json at all", triage_json(finding)])
    llm = MockLLM(responder=lambda s, u: next(responses))

    result = triage_finding(finding, make_context(finding), llm)
    assert result.is_real_vulnerability is True
    assert len(llm.calls) == 2
    first_user, second_user = llm.calls[0][1], llm.calls[1][1]
    assert RETRY_REMINDER not in first_user
    assert RETRY_REMINDER in second_user  # stricter reminder on the retry


def test_triage_finding_fails_after_max_attempts():
    finding = make_finding(finding_id="f8")
    llm = MockLLM(responder=lambda s, u: "still not json")
    with pytest.raises(TriageError, match="f8"):
        triage_finding(finding, make_context(finding), llm)
    assert len(llm.calls) == MAX_ATTEMPTS  # exactly one retry, then give up


# ---------------------------------------------------------------------------
# Evaluation math against the real scan of test-target-repo
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def scanned_findings():
    from codesage.scanning import scan_repo

    return scan_repo(TEST_TARGET)


def perfect_triage_mock(findings):
    """MockLLM that says REAL exactly for findings matching a planted vuln."""
    def responder(system, user):
        matched = any(
            f"at {v.file_path}" in user for v in PLANTED_VULNERABILITIES
        ) and any(v.cwe_id in user or "unknown CWE" in user for v in PLANTED_VULNERABILITIES)
        fid = "unknown"
        body = json.dumps(
            {
                "finding_id": fid,
                "is_real_vulnerability": matched,
                "confidence": 0.95 if matched else 0.7,
                "reasoning": "mock",
                "cwe_confirmed": "CWE-0",
                "exploitability": "high" if matched else "low",
            }
        )
        return body

    return MockLLM(responder=responder)


def test_match_finding_to_vuln_rules():
    v1_finding = make_finding("shop.py", 18, "CWE-89")
    assert match_finding_to_vuln(v1_finding) == "V1"

    gitleaks_finding = make_finding("payments.py", 10, cwe=None, finding_id="g:1")
    gitleaks_finding = gitleaks_finding.model_copy(update={"tool_source": "gitleaks"})
    assert match_finding_to_vuln(gitleaks_finding) == "V2"  # file-only match for gitleaks

    noise = make_finding("tests/test_functional.py", 21, "CWE-703")
    assert match_finding_to_vuln(noise) is None

    wrong_cwe = make_finding("shop.py", 18, "CWE-79")
    assert match_finding_to_vuln(wrong_cwe) is None


def test_evaluate_perfect_triage_precision_and_recall(scanned_findings):
    # A perfect triage over the real scanner output: every finding matching a
    # planted vuln is confirmed REAL, all scanner noise is dismissed.
    # Expected: precision 1.00 (no noise confirmed), recall 0.75 (V3 and V8
    # are never surfaced by the scanners, so they are unreachable).
    results, failed = {}, []
    for finding in scanned_findings:
        llm = perfect_triage_mock([finding])
        ctx = make_context(finding)
        results[finding.id] = triage_finding(finding, ctx, llm)

    metrics = evaluate(scanned_findings, results, failed)
    assert metrics["precision"] == 1.0
    assert metrics["recall"] == 0.75
    assert sorted(metrics["covered_vulns"]) == ["V1", "V2", "V4", "V5", "V6", "V7"]
    assert metrics["missed_vulns"] == ["V3", "V8"]
    assert metrics["tp"] == 11  # all scanner findings that match V1,V2,V4,V5,V6,V7
    assert metrics["fp"] == 0
    assert metrics["tn"] == len(scanned_findings) - metrics["tp"]
    assert metrics["triage_failed"] == []


def test_evaluate_with_triage_failures_treated_as_not_real(scanned_findings):
    results = {}
    for finding in scanned_findings:
        llm = perfect_triage_mock([finding])
        results[finding.id] = triage_finding(finding, make_context(finding), llm)
    some_id = scanned_findings[0].id
    metrics = evaluate(scanned_findings, results, failed_ids=[some_id])
    # the failed finding was matched (admin/shop/etc.) or noise; either way it
    # must not count as TP, and recall must not exceed the perfect baseline
    assert metrics["recall"] <= 0.75
    assert some_id in metrics["triage_failed"]


def test_triage_result_schema_matches_design():
    assert set(TriageResult.model_fields) == {
        "finding_id", "is_real_vulnerability", "confidence",
        "reasoning", "cwe_confirmed", "exploitability",
    }
