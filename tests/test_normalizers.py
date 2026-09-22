"""Unit tests for the three normalizers with mock scanner JSON (design.md 7).

Fixtures below mimic the real native output shapes of bandit 1.8, semgrep 1.x
and gitleaks 8.x (both the pre-8.19 PascalCase keys and the newer camelCase).
"""

from pathlib import Path

import pytest

from codesage.scanning import (
    normalize_bandit,
    normalize_gitleaks,
    normalize_semgrep,
)

REPO_ROOT = Path("/tmp/fake-repo")

BANDIT_RESULT = {
    "code": '17         query = f"SELECT * FROM products WHERE name LIKE \'%{q}%\'"\n',
    "col_offset": 15,
    "end_col_offset": 60,
    "filename": "/tmp/fake-repo/shop.py",
    "issue_confidence": "HIGH",
    "issue_cwe": {"id": 89, "link": "https://cwe.mitre.org/data/definitions/89.html"},
    "issue_severity": "MEDIUM",
    "issue_text": "Possible SQL injection vector through string-based query construction.",
    "line_number": 17,
    "line_range": [17],
    "more_info": "https://bandit.readthedocs.io/en/latest/plugins/b608.html",
    "test_id": "B608",
    "test_name": "hardcoded_sql_expressions",
}

SEMGREP_RESULT = {
    "check_id": "rules.python-command-injection",
    "path": "/tmp/fake-repo/admin.py",
    "start": {"line": 14, "col": 9},
    "end": {"line": 14, "col": 55},
    "extra": {
        "message": "os.system runs its argument through a shell (CWE-78).",
        "lines": '    exit_status = os.system(f"ping -c 1 {host}")',
        "severity": "ERROR",
        "metadata": {"cwe": "CWE-78: Improper Neutralization of Special Elements used in an OS Command"},
    },
}

GITLEAKS_RESULT_LEGACY = {
    "RuleID": "generic-api-key",
    "Description": "Generic API Key",
    "StartLine": 10,
    "EndLine": 10,
    "StartColumn": 17,
    "EndColumn": 58,
    "Match": 'STRIPE_API_KEY = "TEST_STRIPE_API_KEY"',
    "Secret": "TEST_STRIPE_API_KEY",
    "File": "payments.py",
    "Entropy": 3.5,
    "Fingerprint": "payments.py:generic-api-key:10",
}

GITLEAKS_RESULT_CAMEL = {
    "ruleID": "generic-api-key",
    "startLine": 10,
    "endLine": 10,
    "match": 'STRIPE_API_KEY = "TEST_STRIPE_API_KEY"',
    "file": "payments.py",
    "fingerprint": "payments.py:generic-api-key:10",
}


def test_normalize_bandit_full_mapping():
    finding = normalize_bandit(BANDIT_RESULT, REPO_ROOT)
    assert finding.tool_source == "bandit"
    assert finding.file_path == "shop.py"  # absolute -> repo-relative
    assert finding.line_number == 17
    assert finding.cwe_id == "CWE-89"
    assert finding.severity == "medium"
    assert finding.id == "bandit:shop.py:17:B608"
    assert "SQL injection" in finding.raw_message
    assert "SELECT * FROM products" in finding.code_snippet
    # bandit prefixes snippet lines with "NN " — must be stripped
    assert not finding.code_snippet.lstrip().startswith("17")


def test_normalize_bandit_without_cwe_field():
    raw = {k: v for k, v in BANDIT_RESULT.items() if k != "issue_cwe"}
    finding = normalize_bandit(raw, REPO_ROOT)
    assert finding.cwe_id is None  # optional per design.md 2.1


def test_normalize_semgrep_full_mapping():
    finding = normalize_semgrep(SEMGREP_RESULT, REPO_ROOT)
    assert finding.tool_source == "semgrep"
    assert finding.file_path == "admin.py"
    assert finding.line_number == 14
    assert finding.cwe_id == "CWE-78"
    assert finding.severity == "high"  # ERROR -> high
    assert finding.id == "semgrep:admin.py:14:rules.python-command-injection"
    assert finding.code_snippet.startswith("exit_status")


def test_normalize_semgrep_severity_and_cwe_variants():
    base = {**SEMGREP_RESULT, "extra": {**SEMGREP_RESULT["extra"]}}

    warning = normalize_semgrep(
        {**base, "extra": {**base["extra"], "severity": "WARNING",
                           "metadata": {"cwe": ["CWE-798: Use of Hard-coded Credentials"]}}},
        REPO_ROOT,
    )
    assert warning.severity == "medium"
    assert warning.cwe_id == "CWE-798"

    info = normalize_semgrep(
        {**base, "extra": {**base["extra"], "severity": "INFO", "metadata": {}}},
        REPO_ROOT,
    )
    assert info.severity == "low"
    assert info.cwe_id is None

    unknown = normalize_semgrep(
        {**base, "extra": {**base["extra"], "severity": "EXPERIMENT", "metadata": {}}},
        REPO_ROOT,
    )
    assert unknown.severity == "medium"  # documented fallback


def test_normalize_gitleaks_legacy_keys():
    finding = normalize_gitleaks(GITLEAKS_RESULT_LEGACY, REPO_ROOT)
    assert finding.tool_source == "gitleaks"
    assert finding.file_path == "payments.py"
    assert finding.line_number == 10
    assert finding.severity == "high"  # gitleaks has no severity; secrets default high
    assert finding.cwe_id is None
    assert "generic-api-key" in finding.raw_message
    assert "sk_live_" in finding.code_snippet


def test_normalize_gitleaks_camelcase_keys_gte_8_19():
    finding = normalize_gitleaks(GITLEAKS_RESULT_CAMEL, REPO_ROOT)
    assert finding.id == "gitleaks:payments.py:10:generic-api-key"
    assert finding.file_path == "payments.py"
    assert finding.line_number == 10


def test_all_normalizers_produce_valid_findings():
    for normalizer, raw in [
        (normalize_bandit, BANDIT_RESULT),
        (normalize_semgrep, SEMGREP_RESULT),
        (normalize_gitleaks, GITLEAKS_RESULT_LEGACY),
        (normalize_gitleaks, GITLEAKS_RESULT_CAMEL),
    ]:
        finding = normalizer(raw, REPO_ROOT)
        # Pydantic re-validation: field names/types match design.md exactly.
        assert set(finding.model_dump()) == {
            "id", "file_path", "line_number", "cwe_id",
            "severity", "tool_source", "raw_message", "code_snippet",
        }
        assert finding.severity in {"low", "medium", "high", "critical"}
        assert finding.line_number >= 0
        assert not finding.file_path.startswith("/")
