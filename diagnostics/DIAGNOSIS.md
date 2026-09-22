# Pipeline Diagnosis — instrumented run (demo mode)

Trace: diagnostics/pipeline_trace.log (669 lines, 481 node/edge entries)

## Edge decisions
- triage: {'False -> next_finding': 38, 'True -> patch': 11}
- verify: {'passed=False retry_count=1 max_retries=2': 11, 'passed=False retry_count=2 max_retries=2': 11}

## Patch population
- real diffs (NOOP=False): 8
- no-op patches (NOOP=True): 14

## Verification outcomes
- bandit:admin.py:14:B605: scan_clean=True tests_passed=False -> test suite failed: 1 failed, 15 passed in 0.28s
- bandit:admin.py:14:B605: scan_clean=True tests_passed=False -> test suite failed: 1 failed, 15 passed in 0.24s
- semgrep:admin.py:14:python-command-injection: scan_clean=True tests_passed=False -> test suite failed: 1 failed, 15 passed in 0.24s
- semgrep:admin.py:14:python-command-injection: scan_clean=True tests_passed=False -> test suite failed: 1 failed, 15 passed in 0.24s
- bandit:tasks.py:21:B301: scan_clean=True tests_passed=False -> test suite failed: 1 failed, 15 passed in 0.24s
- bandit:tasks.py:21:B301: scan_clean=True tests_passed=False -> test suite failed: 1 failed, 15 passed in 0.24s
- semgrep:tasks.py:21:python-insecure-deserialization: scan_clean=True tests_passed=False -> test suite failed: 1 failed, 15 passed in 0.24s
- semgrep:tasks.py:21:python-insecure-deserialization: scan_clean=True tests_passed=False -> test suite failed: 1 failed, 15 passed in 0.25s

## Try/except inventory (pipeline.py, verification.py)
pipeline.py:159 TriageError -> completed entry 'triage_failed' (surfaced, run continues — design.md §6)
pipeline.py:196 PatchError -> completed entry 'patch_generation_failed' (surfaced)
pipeline.py:248 PRError -> completed entry 'pr_failed' (surfaced)
verification.py:178 TimeoutExpired (tests) -> tests_passed=False + reason (surfaced)
verification.py:180 FileNotFoundError (interpreter) -> VerificationError (surfaced)
verification.py:201 ImportError (docker sdk) -> VerificationError (surfaced)
verification.py:206 Exception (daemon ping) -> VerificationError (surfaced)  <-- where Docker absence surfaces
verification.py:217 Exception (branch cleanup) -> swallow BY DESIGN (best-effort, logged)
verification.py:266 ValueError (scan output) -> VerificationError (surfaced)
verification.py:296 VerificationError (re-scan) -> failed result + reason (surfaced)
verification.py:330 PatchNotApplicable -> failed result + reason (surfaced)
verification.py:336/339 VerificationError (re-scan/tests) -> failed result + reason (surfaced)
verification.py:391 PatchError (loop) -> status patch_generation_failed (surfaced)

## Observability gap (not a swallow, but invisible in the UI)
- get_backend() auto-detect falls back Docker -> Local with only a log WARNING.
- VerificationResult / completed entries do not record WHICH backend ran.
