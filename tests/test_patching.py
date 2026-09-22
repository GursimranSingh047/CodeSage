"""Unit tests for Module 5: patch generation agent.

All tests run offline via MockLLM. The real-LLM flow is exercised through
`python -m codesage.patching test-target-repo` once a provider is configured.
"""

import json
from pathlib import Path

import pytest

from codesage.llm import MockLLM
from codesage.schemas import CodeContext, Finding, Patch, TriageResult
from codesage.patching import (
    MAX_JSON_ATTEMPTS,
    RETRY_FAILURE_SECTION,
    RETRY_REMINDER,
    PatchError,
    build_patch_prompt,
    generate_patch,
    parse_patch_response,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
TEST_TARGET = REPO_ROOT / "test-target-repo"


def make_finding(finding_id="semgrep:tasks.py:21:rule"):
    return Finding(
        id=finding_id,
        file_path="tasks.py",
        line_number=21,
        cwe_id="CWE-502",
        severity="critical",
        tool_source="semgrep",
        raw_message="pickle.loads on user input",
        code_snippet="task = pickle.loads(raw)",
    )


def make_triage(finding):
    return TriageResult(
        finding_id=finding.id,
        is_real_vulnerability=True,
        confidence=0.95,
        reasoning="User-controlled bytes reach pickle.loads, enabling code execution.",
        cwe_confirmed="CWE-502",
        exploitability="high",
    )


def make_context(finding):
    return CodeContext(
        finding_id=finding.id,
        enclosing_function='def import_tasks(body):\n    return {"imported": pickle.loads(base64.b64decode(body.data))}',
        imports=["import pickle"],
        related_chunks=[],
    )


def patch_json(finding, patched="def import_tasks(body):\n    return {'imported': safe_load(body.data)}", attempt=1):
    return json.dumps(
        {
            "finding_id": finding.id,
            "original_code": "whatever the LLM echoed",
            "patched_code": patched,
            "explanation": "Replaced pickle with a restricted loader.",
            "attempt_number": attempt,
        }
    )


# ---------------------------------------------------------------------------
# Prompt construction (design.md 3.2 / 3.3)
# ---------------------------------------------------------------------------

def test_prompt_follows_design_3_2():
    finding = make_finding()
    system, user = build_patch_prompt(finding, make_triage(finding), make_context(finding))

    assert system.startswith("You are a security engineer fixing a confirmed vulnerability.")
    assert "Rewrite ONLY the affected function" in system
    assert "Preserve the function signature and existing behavior" in system
    assert "Respond ONLY in valid JSON" in system
    assert '"patched_code"' in system  # schema embedded

    assert user.startswith("Vulnerability: CWE-502 — User-controlled bytes reach pickle.loads")
    assert "Original function:" in user
    assert "def import_tasks(body):" in user  # enclosing function included


def test_retry_prompt_appends_3_3_failure_section():
    finding = make_finding()
    _, user = build_patch_prompt(
        finding, make_triage(finding), make_context(finding),
        failure_reason="re-scan still flags pickle.loads",
    )
    assert (
        "Your previous patch attempt failed verification for this reason:"
        "\nre-scan still flags pickle.loads\n"
        "Please correct the issue in a new patch."
    ) in user


def test_plain_prompt_has_no_failure_section():
    finding = make_finding()
    _, user = build_patch_prompt(finding, make_triage(finding), make_context(finding))
    assert "failed verification" not in user


# ---------------------------------------------------------------------------
# Response parsing
# ---------------------------------------------------------------------------

def test_parse_plain_json():
    finding = make_finding(finding_id="p1")
    patch = parse_patch_response(patch_json(finding), "p1", attempt_number=1)
    assert isinstance(patch, Patch)
    assert patch.finding_id == "p1"
    assert patch.attempt_number == 1


def test_parse_json_in_markdown_fence():
    finding = make_finding(finding_id="p2")
    wrapped = f"```json\n{patch_json(finding)}\n```"
    patch = parse_patch_response(wrapped, "p2", attempt_number=2)
    assert patch.finding_id == "p2"
    assert patch.attempt_number == 2


def test_parse_forces_pipeline_fields():
    finding = make_finding(finding_id="p3")
    response = patch_json(finding, attempt=99).replace('"p3"', '"hallucinated"')
    patch = parse_patch_response(response, "p3", attempt_number=2)
    assert patch.finding_id == "p3"
    assert patch.attempt_number == 2  # pipeline owns both fields


def test_parse_rejects_invalid_json_and_empty_fields():
    with pytest.raises(ValueError):
        parse_patch_response("no json", "p4", 1)
    finding = make_finding(finding_id="p5")
    empty = patch_json(finding).replace(
        '"Replaced pickle with a restricted loader."', '""'
    )
    with pytest.raises(Exception):  # pydantic min_length violation
        parse_patch_response(empty, "p5", 1)


# ---------------------------------------------------------------------------
# generate_patch: happy path, JSON-retry layer, exhaustion
# ---------------------------------------------------------------------------

def test_generate_patch_happy_path_injects_original_code():
    finding = make_finding()
    llm = MockLLM(responder=lambda s, u: patch_json(finding))
    patch = generate_patch(finding, make_context(finding), make_triage(finding), llm)
    assert patch.original_code == make_context(finding).enclosing_function  # AST context, not LLM echo
    assert patch.patched_code.startswith("def import_tasks")
    assert patch.attempt_number == 1
    assert len(llm.calls) == 1


def test_generate_patch_retries_invalid_json_with_reminder():
    finding = make_finding()
    responses = iter(["garbage", "still garbage but {'a':1}}", patch_json(finding)])
    # two invalid responses would exceed the budget; use exactly one
    responses = iter(["garbage", patch_json(finding)])
    llm = MockLLM(responder=lambda s, u: next(responses))

    patch = generate_patch(finding, make_context(finding), make_triage(finding), llm)
    assert patch.attempt_number == 1  # JSON retry does NOT consume an attempt
    assert len(llm.calls) == 2
    assert RETRY_REMINDER not in llm.calls[0][1]
    assert RETRY_REMINDER in llm.calls[1][1]


def test_generate_patch_verification_retry_carries_failure_reason():
    finding = make_finding()
    llm = MockLLM(responder=lambda s, u: patch_json(finding))
    patch = generate_patch(
        finding, make_context(finding), make_triage(finding), llm,
        attempt_number=2, failure_reason="bandit B301 still reports the finding",
    )
    assert patch.attempt_number == 2
    user = llm.calls[0][1]
    assert "bandit B301 still reports the finding" in user
    assert "Please correct the issue in a new patch." in user


def test_generate_patch_fails_after_json_budget():
    finding = make_finding()
    llm = MockLLM(responder=lambda s, u: "not json")
    with pytest.raises(PatchError, match="p?"):
        generate_patch(finding, make_context(finding), make_triage(finding), llm)
    assert len(llm.calls) == MAX_JSON_ATTEMPTS


# ---------------------------------------------------------------------------
# Schema shape
# ---------------------------------------------------------------------------

def test_patch_schema_matches_design():
    assert set(Patch.model_fields) == {
        "finding_id", "original_code", "patched_code", "explanation", "attempt_number",
    }


def test_end_to_end_patches_for_confirmed_findings():
    """Scan test-target-repo, triage with a confirming mock, patch each REAL."""
    from codesage.context import extract_code_context
    from codesage.scanning import scan_repo
    from codesage.triage import triage_finding

    findings = scan_repo(TEST_TARGET)

    def triage_responder(system, user):
        confirmed = any(f"at {v}" in user for v in [
            "shop.py", "payments.py", "tasks.py", "files.py", "admin.py", "main.py",
        ])
        return json.dumps(
            {"finding_id": "x", "is_real_vulnerability": confirmed, "confidence": 0.9,
             "reasoning": "mock", "cwe_confirmed": "CWE-0",
             "exploitability": "high" if confirmed else "low"}
        )

    def patch_responder(system, user):
        first_line = user.splitlines()[-1][:60] if user else "n/a"
        return json.dumps(
            {"finding_id": "x", "original_code": "ignored", "patched_code": f"# SECURE FIX\n{first_line}",
             "explanation": "mock fix", "attempt_number": 1}
        )

    confirmed = []
    for finding in findings:
        context = extract_code_context(finding, TEST_TARGET)
        triage = triage_finding(finding, context, MockLLM(responder=triage_responder))
        if triage.is_real_vulnerability:
            confirmed.append((finding, context, triage))

    assert len(confirmed) == 11  # scanner findings matching V1,V2,V4,V5,V6,V7

    patches = []
    for finding, context, triage in confirmed:
        patches.append(
            generate_patch(finding, context, triage, MockLLM(responder=patch_responder))
        )
    assert len(patches) == 11
    for patch in patches:
        assert patch.original_code  # from AST context
        assert patch.patched_code.startswith("# SECURE FIX")
        assert patch.attempt_number >= 1
    ids = {p.finding_id for p in patches}
    assert len(ids) == 11  # one patch per confirmed finding
