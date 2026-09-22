# CodeSage Metrics Report — Scan against `test-target-repo`

- **Mode:** DEMO — scripted LLM, local (non-sandboxed) verifier
- **Generated:** 2026-09-06 21:42:07
- **Total pipeline duration:** 26.2s
- **Findings processed:** 49

## Triage quality (vs. VULNERABILITIES.md ground truth)

| Metric | Value |
|---|---|
| Precision | 1.00 |
| Recall | 0.75 |
| F1 | 0.86 |
| Ground-truth vulns surfaced by scanners | 6 / 8 |
| Ground-truth vulns never surfaced | V3, V8 |

## Verification outcomes

| Outcome | Count |
|---|---|
| Verified (PR ready) | 0 |
| Needs human review | 11 |
| False positives filtered | 38 |
| Stage failures | 0 |
| Average patch attempts | 2.0 |

## Per-finding results

| Finding | CWE | Scanner(s) | Triage outcome | Confidence | Attempts | Final outcome | PR |
|---|---|---|---|---|---|---|---|
| gitleaks:VULNERABILITIES.md:50:stripe-access-token | — | gitleaks | False positive | 60% | — | false_positive | — |
| bandit:admin.py:14:B605 | CWE-78 | bandit+semgrep | REAL | 90% | 2 | needs_human_review | — |
| semgrep:admin.py:14:python-command-injection | CWE-78 | bandit+semgrep | REAL | 90% | 2 | needs_human_review | — |
| semgrep:files.py:19:python-path-traversal | CWE-22 | semgrep | REAL | 90% | 2 | needs_human_review | — |
| semgrep:main.py:32:python-wildcard-cors | CWE-942 | semgrep | REAL | 90% | 2 | needs_human_review | — |
| gitleaks:payments.py:10:stripe-access-token | — | gitleaks | REAL | 90% | 2 | needs_human_review | — |
| semgrep:payments.py:10:python-hardcoded-api-key | CWE-798 | semgrep | REAL | 90% | 2 | needs_human_review | — |
| bandit:shop.py:17:B608 | CWE-89 | bandit+semgrep | REAL | 90% | 2 | needs_human_review | — |
| semgrep:shop.py:18:python-sql-injection | CWE-89 | bandit+semgrep | REAL | 90% | 2 | needs_human_review | — |
| bandit:tasks.py:4:B403 | CWE-502 | bandit+semgrep | REAL | 90% | 2 | needs_human_review | — |
| bandit:tasks.py:21:B301 | CWE-502 | bandit+semgrep | REAL | 90% | 2 | needs_human_review | — |
| semgrep:tasks.py:21:python-insecure-deserialization | CWE-502 | bandit+semgrep | REAL | 90% | 2 | needs_human_review | — |
| bandit:tests/test_functional.py:21:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_functional.py:22:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_functional.py:29:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_functional.py:34:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_functional.py:36:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_functional.py:37:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_functional.py:44:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_functional.py:49:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_functional.py:50:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_functional.py:55:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_functional.py:56:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_functional.py:61:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_functional.py:66:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_planted_vulnerabilities.py:10:B403 | CWE-502 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_planted_vulnerabilities.py:30:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_planted_vulnerabilities.py:35:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_planted_vulnerabilities.py:36:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_planted_vulnerabilities.py:41:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| gitleaks:tests/test_planted_vulnerabilities.py:41:stripe-access-token | — | gitleaks | False positive | 60% | — | false_positive | — |
| bandit:tests/test_planted_vulnerabilities.py:48:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_planted_vulnerabilities.py:51:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_planted_vulnerabilities.py:59:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_planted_vulnerabilities.py:60:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_planted_vulnerabilities.py:66:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_planted_vulnerabilities.py:67:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_planted_vulnerabilities.py:71:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_planted_vulnerabilities.py:72:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_planted_vulnerabilities.py:78:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_planted_vulnerabilities.py:81:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_planted_vulnerabilities.py:82:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_planted_vulnerabilities.py:90:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_planted_vulnerabilities.py:91:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_planted_vulnerabilities.py:97:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_planted_vulnerabilities.py:101:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_planted_vulnerabilities.py:110:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_planted_vulnerabilities.py:118:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |
| bandit:tests/test_planted_vulnerabilities.py:119:B101 | CWE-703 | bandit | False positive | 60% | — | false_positive | — |

## Notes

- Scanners surface only V1, V2, V4, V5, V6, V7 of the 8 planted vulnerabilities — V3 (plaintext auth) and V8 (dependency pins) are never flagged by Semgrep/Bandit/Gitleaks.
- test-target-repo's own tests assert the vulnerable behavior, so verified fixes fail its suite and route to human review by design.
