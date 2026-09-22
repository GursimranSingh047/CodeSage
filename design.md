# Design Document
## AI Agent for Automated Security Vulnerability Detection & Auto-Fix

---

## 1. Purpose

This document details the low-level design of each module: data schemas, LLM prompt design, algorithms, and UI/UX design — building on the high-level structure defined in `architecture.md`.

---

## 2. Data Schemas

### 2.1 Finding (normalized scanner output)
```python
class Finding(BaseModel):
    id: str
    file_path: str
    line_number: int
    cwe_id: str | None
    severity: str  # low / medium / high / critical
    tool_source: str  # semgrep / bandit / gitleaks
    raw_message: str
    code_snippet: str
```

### 2.2 CodeContext
```python
class CodeContext(BaseModel):
    finding_id: str
    enclosing_function: str
    imports: list[str]
    related_chunks: list[str]  # retrieved from ChromaDB
```

### 2.3 TriageResult
```python
class TriageResult(BaseModel):
    finding_id: str
    is_real_vulnerability: bool
    confidence: float  # 0.0 - 1.0
    reasoning: str
    cwe_confirmed: str
    exploitability: str  # low / medium / high
```

### 2.4 Patch
```python
class Patch(BaseModel):
    finding_id: str
    original_code: str
    patched_code: str
    explanation: str
    attempt_number: int
```

### 2.5 VerificationResult
```python
class VerificationResult(BaseModel):
    finding_id: str
    scan_clean: bool
    tests_passed: bool
    passed: bool  # overall pass/fail
    failure_reason: str | None
```

---

## 3. LLM Prompt Design

### 3.1 Triage Prompt (structure)
```
System: You are a security engineer reviewing static analysis findings.
Given the finding and surrounding code context, determine if this is a
real, exploitable vulnerability or a false positive. Respond ONLY in
valid JSON matching this schema: {TriageResult schema}

User:
Finding: {tool_source} flagged {cwe_id} at {file_path}:{line_number}
Message: {raw_message}
Code context:
{enclosing_function}
```

### 3.2 Patch Generation Prompt (structure)
```
System: You are a security engineer fixing a confirmed vulnerability.
Rewrite ONLY the affected function with a secure implementation.
Preserve the function signature and existing behavior for all
non-vulnerable code paths. Respond ONLY in valid JSON matching: {Patch schema}

User:
Vulnerability: {cwe_confirmed} — {reasoning}
Original function:
{enclosing_function}
```

### 3.3 Retry Prompt (on verification failure)
Same as 3.2, with an appended section:
```
Your previous patch attempt failed verification for this reason:
{failure_reason}
Please correct the issue in a new patch.
```

---

## 4. Algorithm Design

### 4.1 Context Extraction (tree-sitter walk)
1. Parse file into AST
2. Locate the smallest node containing the flagged line number
3. Walk up parent nodes until a `function_definition` or `class_definition` node is found
4. Extract that node's full source span as `enclosing_function`
5. Query ChromaDB for top-3 semantically similar code chunks (for related-pattern awareness)

### 4.2 Verification Retry Logic
```
attempt = 0
while attempt < 2:
    patch = generate_patch(finding, context, failure_reason=last_failure)
    result = verify(patch)
    if result.passed:
        return open_pr(patch)
    last_failure = result.failure_reason
    attempt += 1
route_to_human_review(finding)
```

### 4.3 Scanner Output Normalization
Each scanner's native JSON is mapped to the unified `Finding` schema via a per-tool adapter function (`normalize_semgrep()`, `normalize_bandit()`, `normalize_gitleaks()`), all converging into one list before the pipeline proceeds — this keeps the rest of the system scanner-agnostic.

---

## 5. UI/UX Design (React Frontend)

### 5.1 Screens
1. **Home / Repo Input** — single input field + "Start Scan" button, minimal
2. **Live Scan View** — shows pipeline progress per finding as it moves through stages
3. **Findings Detail View** — expandable rows showing triage reasoning, diff viewer, verification status
4. **PR Summary View** — list of all opened PRs with links and explanations

### 5.2 Component Design
| Component | Responsibility |
|---|---|
| `RepoInput.jsx` | Captures repo URL, triggers `POST /scan` |
| `FindingsTable.jsx` | Renders findings list with live-updating status badges |
| `StatusBadge.jsx` | Color-coded pill: Scanning / Triaged / Patched / Verified / PR Opened / Needs Review |
| `DiffViewer.jsx` | Side-by-side before/after code using `react-diff-viewer-continued` |
| `PRLinkCard.jsx` | Displays PR link, CWE, confidence, explanation |

### 5.3 Visual Style
- Dark-mode developer-tool aesthetic (inspired by GitHub/VS Code)
- Severity color coding: critical = red, high = orange, medium = yellow, low = gray
- CSS variables for theme consistency:
```css
:root {
  --bg-primary: #0d1117;
  --bg-secondary: #161b22;
  --text-primary: #c9d1d9;
  --severity-critical: #f85149;
  --severity-high: #ff8c42;
  --severity-medium: #d4a72c;
  --severity-low: #8b949e;
}
```

### 5.4 State Updates
- WebSocket connection opened on scan start
- Backend pushes a message per pipeline stage transition: `{finding_id, stage, timestamp}`
- Frontend updates the relevant `FindingsTable` row's `StatusBadge` in real time without polling

---

## 6. Error Handling Design

| Failure Case | Handling |
|---|---|
| Scanner subprocess crashes | Log error, skip that scanner's findings, continue with others |
| LLM returns invalid JSON | Retry the call once with a stricter format reminder; if still invalid, mark finding as "triage failed" |
| Docker sandbox fails to start | Mark verification as failed, route to human review |
| GitHub API rate limit / auth failure | Surface a clear error to the dashboard, pause PR creation, allow manual retry |
| Repo clone fails (invalid URL/private repo) | Return a clear error to the frontend before starting the pipeline |

---

## 7. Testing & Validation Design

- **Unit level:** test each normalizer, the AST context extractor, and the retry-loop logic independently with mock data
- **Integration level:** run the full LangGraph pipeline against the seeded vulnerable test repo (see `requirements.md` §7) and measure triage precision/recall
- **System level:** run against 2-3 real open-source repos with known CVEs to validate generalization beyond the seeded test set
