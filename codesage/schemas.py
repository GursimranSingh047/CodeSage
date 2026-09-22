"""Shared data schemas (design.md section 2).

Every module communicates through these Pydantic models so agent-to-agent
data stays reliable. Field names follow design.md exactly.
"""

from typing import Optional

from pydantic import BaseModel, Field, field_validator


class Finding(BaseModel):
    """A normalized static-analysis result, independent of the source tool."""

    id: str
    file_path: str
    line_number: int
    cwe_id: Optional[str]  # e.g. "CWE-89"; None when the tool doesn't report one
    severity: str  # low / medium / high / critical
    tool_source: str  # semgrep / bandit / gitleaks
    raw_message: str
    code_snippet: str


class CodeContext(BaseModel):
    """AST-derived context around a finding, plus similar chunks (design.md 2.2)."""

    finding_id: str
    enclosing_function: str
    imports: list[str]
    related_chunks: list[str]  # retrieved from ChromaDB


class TriageResult(BaseModel):
    """LLM verdict on whether a finding is a real vulnerability (design.md 2.3)."""

    finding_id: str
    is_real_vulnerability: bool
    confidence: float = Field(ge=0.0, le=1.0)  # 0.0 - 1.0
    reasoning: str
    cwe_confirmed: str
    exploitability: str  # low / medium / high

    @field_validator("exploitability")
    @classmethod
    def _check_exploitability(cls, value: str) -> str:
        allowed = {"low", "medium", "high"}
        if value.strip().lower() not in allowed:
            raise ValueError(f"exploitability must be one of {sorted(allowed)}")
        return value.strip().lower()


class Patch(BaseModel):
    """A proposed code fix for one finding (design.md 2.4).

    original_code is the exact span being replaced (pipeline-owned: taken
    from CodeContext.enclosing_function); patched_code replaces it verbatim.
    attempt_number is 1-based: 1 = first patch, 2+ = verification retries.
    """

    finding_id: str
    original_code: str = Field(min_length=1)
    patched_code: str = Field(min_length=1)
    explanation: str = Field(min_length=1)
    attempt_number: int = Field(ge=1)


class VerificationResult(BaseModel):
    """Outcome of sandboxed verification of one patch (design.md 2.5)."""

    finding_id: str
    scan_clean: bool
    tests_passed: bool
    passed: bool  # overall pass/fail
    failure_reason: Optional[str] = None
