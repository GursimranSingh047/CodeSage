"""Module 7 — GitHub PR agent (architecture.md 2.8).

Commits a verified patch to a new branch via the GitHub API (PyGithub) and
opens a pull request whose description follows the architecture template:
CWE, diff, triage confidence, verification status.

Failure policy (design.md section 6): auth failures and rate limits surface
a clear, actionable error and allow manual retry — nothing is silently
swallowed, and no orphan branch is left behind when an API call fails after
branch creation.
"""

import difflib
import hashlib
import logging
import re
from pathlib import Path
from typing import Optional

from codesage.verification import target_file_from_finding_id
from codesage.schemas import Patch, VerificationResult

logger = logging.getLogger(__name__)

BRANCH_PREFIX = "codesage/fix-"


class PRError(RuntimeError):
    """A GitHub API failure with a human-actionable message (design.md 6)."""


def _explain_github_exception(exc) -> str:
    status = getattr(exc, "status", None)
    data = getattr(exc, "data", None)
    detail = ""
    if isinstance(data, dict):
        detail = str(data.get("message", ""))
    if status == 401:
        return f"GitHub authentication failed ({detail or '401'}). Check that GITHUB_TOKEN is valid."
    if status in (403, 429):
        return (
            "GitHub API rate limit or permission failure "
            f"({status}: {detail}). Pause PR creation and retry manually later."
        )
    if status == 404:
        return f"GitHub resource not found (404: {detail}). Check the repo name and token access."
    if status == 422:
        return f"GitHub validation failed (422: {detail}). The branch may already exist."
    return f"GitHub API error ({status or 'unknown'}): {detail or exc}"


def _api(call, action: str):
    """Run a PyGithub call, mapping failures onto PRError."""
    try:
        return call()
    except Exception as exc:  # noqa: BLE001 - normalized below
        mapped = _explain_github_exception(exc)
        logger.error("GitHub call failed (%s): %s", action, mapped)
        raise PRError(f"{action}: {mapped}") from exc


def get_repo(token: str, full_name: str):
    """Authenticated PyGithub repo handle; token comes from GITHUB_TOKEN."""
    try:
        from github import Auth, Github  # lazy import
    except ImportError as exc:  # pragma: no cover
        raise PRError("PyGithub is not installed: pip install PyGithub") from exc
    if not token:
        raise PRError(
            "GITHUB_TOKEN is not set. Export a token with repo scope, "
            "pointed at a throwaway fork of the test target."
        )
    client = Github(auth=Auth.Token(token))
    return _api(lambda: client.get_repo(full_name), f"loading repository {full_name!r}")


# ---------------------------------------------------------------------------
# Naming, titles, diff and PR body (architecture.md 2.8 template)
# ---------------------------------------------------------------------------

def branch_name_for(patch: Patch, display_id: Optional[str] = None) -> str:
    if display_id and str(display_id).strip():
        clean_id = re.sub(r"[^a-zA-Z0-9_-]+", "", str(display_id).strip())
        return f"codesage/fix/{clean_id}"
    file_path = target_file_from_finding_id(patch.finding_id)
    slug = re.sub(r"[^a-z0-9]+", "-", Path(file_path).name.lower()).strip("-")
    digest = hashlib.sha1(patch.finding_id.encode()).hexdigest()[:8]
    return f"{BRANCH_PREFIX}{slug}-{digest}"


def title_for(patch: Patch, triage, vuln_title: Optional[str] = None) -> str:
    if vuln_title and str(vuln_title).strip() and "unclassified" not in str(vuln_title).lower():
        clean_title = re.sub(r"^fix\(security\):\s*", "", str(vuln_title).strip(), flags=re.I)
        return f"fix(security): remediate {clean_title.lower()}"
    file_path = target_file_from_finding_id(patch.finding_id)
    cwe = getattr(triage, "cwe_confirmed", None) or "vulnerability"
    return f"Fix {cwe} in {file_path} (CodeSage)"


def commit_message_for(patch: Patch, triage, vuln_title: Optional[str] = None) -> str:
    file_path = target_file_from_finding_id(patch.finding_id)
    title = vuln_title or getattr(triage, "cwe_confirmed", "security finding")
    return f"CodeSage: fix {title} in {file_path}\n\n{patch.explanation}"


def render_diff(patch: Patch) -> str:
    file_path = target_file_from_finding_id(patch.finding_id)
    diff = difflib.unified_diff(
        patch.original_code.splitlines(),
        patch.patched_code.splitlines(),
        fromfile=f"a/{file_path}",
        tofile=f"b/{file_path}",
        lineterm="",
    )
    return "\n".join(diff)


def _test_result_line(verification: Optional[VerificationResult]) -> str:
    if verification is None:
        return "Not available"
    if not getattr(verification, "tests_available", True) or getattr(verification, "tests_status", None) == "not_available":
        return "Not available in repository"
    if verification.tests_passed:
        return "Passed (test suite green)"
    return f"Failed ({verification.failure_reason or 'test failures'})"


def _verification_line(verification: Optional[VerificationResult]) -> str:
    if verification is None:
        return "Not verified"
    if verification.passed:
        if not getattr(verification, "tests_available", True) or getattr(verification, "tests_status", None) == "not_available":
            return "PASSED (scanner re-run clean; tests not available in repository)"
        return "PASSED (scanner re-run clean, test suite green)"
    parts = []
    if not verification.scan_clean:
        parts.append("scanner still flags the rule")
    if not verification.tests_passed:
        if not getattr(verification, "tests_available", True) or getattr(verification, "tests_status", None) == "not_available":
            parts.append("tests: not available in repository")
        else:
            parts.append("test suite failed")
    reason = f" — {verification.failure_reason}" if verification.failure_reason else ""
    return "FAILED (" + "; ".join(parts) + f"){reason}"


def generate_pr_body(
    patch: Patch,
    triage,
    verification: Optional[VerificationResult],
    vuln_title: Optional[str] = None,
    severity: Optional[str] = None,
    finding_display_id: Optional[str] = None,
) -> str:
    """PR description with architecture & security report fields."""
    file_path = target_file_from_finding_id(patch.finding_id)
    try:
        line = patch.finding_id.split(":")[-2]
    except IndexError:  # pragma: no cover
        line = "?"
    diff = render_diff(patch)
    confidence_pct = f"{getattr(triage, 'confidence', 0.9):.0%}"
    cwe = getattr(triage, "cwe_confirmed", None) or "CWE-Security"
    fid_display = finding_display_id or patch.finding_id
    sev_display = (severity or "MEDIUM").upper()
    title_display = vuln_title or cwe
    test_result_display = _test_result_line(verification)
    verification_display = _verification_line(verification)

    return f"""## CodeSage: automated security fix

| Field | Value |
|---|---|
| Finding | `{fid_display}` |
| Title | **{title_display}** |
| Severity | **{sev_display}** |
| CWE | **{cwe}** |
| Location | `{file_path}:{line}` |
| Triage confidence | {confidence_pct} |
| Verification | {verification_display} |
| Tests | {test_result_display} |

### Vulnerability Explanation
{getattr(triage, 'reasoning', 'Identified security flaw requiring remediation.')}

### Fix Summary
{patch.explanation}

### Diff
```diff
{diff}
```

---
:rotating_light: Patch generated autonomously by CodeSage. Please review before merging.
"""


# ---------------------------------------------------------------------------
# The API flow: branch -> commit -> PR
# ---------------------------------------------------------------------------

def create_pull_request(
    repo,
    patch: Patch,
    triage,
    verification: Optional[VerificationResult],
    base_branch: Optional[str] = None,
    head_branch: Optional[str] = None,
    vuln_title: Optional[str] = None,
    severity: Optional[str] = None,
    display_id: Optional[str] = None,
) -> dict:
    """Branch, commit and open a PR for one verified patch.

    The remote file content is validated *before* any branch is created; if an
    API call fails after branch creation, the branch is deleted best-effort.
    """
    base = base_branch or repo.default_branch
    file_path = target_file_from_finding_id(patch.finding_id)

    base_sha = _api(lambda: repo.get_branch(base).commit.sha, f"reading base branch {base!r}")
    contents = _api(lambda: repo.get_contents(file_path, ref=base), f"reading {file_path!r}")
    remote_content = contents.decoded_content.decode("utf-8", errors="replace")
    occurrences = remote_content.count(patch.original_code)
    if occurrences != 1:
        raise PRError(
            f"patch does not apply to remote {file_path!r}: original_code matched "
            f"{occurrences} times (expected exactly 1)"
        )
    new_content = remote_content.replace(patch.original_code, patch.patched_code, 1)

    branch = head_branch or branch_name_for(patch, display_id=display_id)
    _api(
        lambda: repo.create_git_ref(ref=f"refs/heads/{branch}", sha=base_sha),
        f"creating branch {branch!r}",
    )
    commit_sha = None
    try:
        commit_res = _api(
            lambda: repo.update_file(
                contents.path,
                commit_message_for(patch, triage, vuln_title=vuln_title),
                new_content,
                contents.sha,
                branch=branch,
            ),
            f"committing fix to {branch!r}",
        )
        if isinstance(commit_res, dict) and commit_res.get("commit"):
            commit_sha = commit_res["commit"].sha if hasattr(commit_res["commit"], "sha") else str(commit_res["commit"])
        elif hasattr(commit_res, "commit"):
            commit_sha = getattr(commit_res.commit, "sha", None)

        title = title_for(patch, triage, vuln_title=vuln_title)
        body = generate_pr_body(
            patch,
            triage,
            verification,
            vuln_title=vuln_title,
            severity=severity,
            finding_display_id=display_id,
        )
        pr = _api(
            lambda: repo.create_pull(
                title=title,
                body=body,
                base=base,
                head=branch,
            ),
            "opening pull request",
        )
    except PRError:
        _delete_branch_best_effort(repo, branch)
        raise

    logger.info("Opened PR #%s (%s -> %s) on %s", pr.number, branch, base, pr.html_url)
    return {
        "pr_url": pr.html_url,
        "pr_number": pr.number,
        "branch": branch,
        "base_branch": base,
        "commit_sha": commit_sha,
        "title": title,
    }


def _delete_branch_best_effort(repo, branch: str) -> None:
    try:
        repo.get_git_ref(f"heads/{branch}").delete()
        logger.info("Cleaned up orphan branch %r", branch)
    except Exception:  # noqa: BLE001 - cleanup must never mask the real error
        logger.warning("Could not clean up branch %r", branch)


if __name__ == "__main__":  # manual: python -m codesage.pr_agent <local_repo> --github-repo owner/name
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(
        description="Scan -> triage -> patch -> verify -> open a GitHub PR"
    )
    parser.add_argument("repo_path", help="Local path to the repository to scan")
    parser.add_argument("--github-repo", required=True, help="owner/name on GitHub")
    parser.add_argument("--base", default=None, help="Base branch (default: repo default)")
    parser.add_argument("--file", default=None, help="Only process findings in this file")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print branch name + PR body instead of calling GitHub")
    args = parser.parse_args()

    import os

    from codesage.context import extract_code_context
    from codesage.llm import create_llm
    from codesage.scanning import scan_repo
    from codesage.triage import triage_finding
    from codesage.verification import Verifier, run_verification_loop

    repo_path = Path(args.repo_path)
    llm = create_llm()
    verifier = Verifier(repo_path)

    for finding in scan_repo(repo_path):
        if args.file and finding.file_path != args.file:
            continue
        context = extract_code_context(finding, repo_path)
        try:
            triage = triage_finding(finding, context, llm)
        except Exception:
            continue
        if not triage.is_real_vulnerability:
            continue
        outcome = run_verification_loop(finding, context, triage, llm, verifier)
        if outcome.status != "verified":
            print(f"[skip] {finding.id}: {outcome.status}")
            continue
        branch = branch_name_for(outcome.patch)
        body = generate_pr_body(outcome.patch, triage, outcome.result)
        if args.dry_run:
            print(f"[dry-run] branch: {branch}")
            print(body)
        else:
            import os as _os

            repo = get_repo(_os.environ.get("GITHUB_TOKEN", ""), args.github_repo)
            info = create_pull_request(repo, outcome.patch, triage, outcome.result,
                                       base_branch=args.base)
            print(f"Opened {info['pr_url']} (branch {info['branch']})")
        break  # CLI demo: one PR per invocation
