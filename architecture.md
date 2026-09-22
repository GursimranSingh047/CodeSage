# Architecture Document
## AI Agent for Automated Security Vulnerability Detection & Auto-Fix

---

## 1. High-Level Architecture

```
┌─────────────┐      ┌──────────────────────────────────────────────────────┐      ┌─────────────┐
│   React     │◄────►│                  FastAPI Backend                       │◄────►│  PostgreSQL │
│  Frontend   │ HTTP/│         (REST API + WebSocket for live updates)         │      │  (scan history,
│  Dashboard  │  WS  │                                                        │      │   findings, │
└─────────────┘      │                    ┌───────────────────┐             │      │   PR log)   │
                      │                    │  LangGraph Agent   │             │      └─────────────┘
                      │                    │     Orchestrator   │             │
                      │                    └─────────┬─────────┘             │
                      └──────────────────────────────┼───────────────────────┘
                                                       │
        ┌───────────────────────┬──────────────────────┼──────────────────────┬───────────────────────┐
        ▼                       ▼                      ▼                      ▼                       ▼
 ┌─────────────┐        ┌──────────────┐      ┌──────────────┐      ┌────────────────┐      ┌─────────────┐
 │  Ingestion  │        │   Scanning   │      │    Triage    │      │     Patch       │      │Verification │
 │    Node     │───────►│    Node      │─────►│    Node      │─────►│  Generation     │─────►│    Node     │
 │(git clone)  │        │(Semgrep/     │      │ (LLM-based   │      │     Node        │      │ (Docker     │
 │             │        │ Bandit/      │      │  classifier) │      │  (LLM-based     │      │  sandbox +  │
 │             │        │ Gitleaks)    │      │              │      │  patch writer)  │      │  re-scan +  │
 │             │        │              │      │              │      │                 │      │  test run)  │
 └─────────────┘        └──────────────┘      └──────┬───────┘      └─────────────────┘      └──────┬──────┘
                                                       │                                              │
                                                       │ (false positive → skip)          fail, retry<2│
                                                       ▼                                              ▼
                                                  [Next Finding]                          [Loop → Patch Node]
                                                                                                       │
                                                                                       fail, retry>=2  │  pass
                                                                                                       ▼
                                                                              ┌────────────────┐  ┌──────────┐
                                                                              │ Human Review    │  │ PR Node  │
                                                                              │    Queue        │  │ (GitHub  │
                                                                              │                 │  │  API)    │
                                                                              └────────────────┘  └──────────┘
```

---

## 2. Component Breakdown

### 2.1 Frontend (React)
- **RepoInput** — submits scan requests
- **FindingsTable** — live status per finding
- **DiffViewer** — before/after code comparison
- **PRLinkCard** — links to opened PRs
- Communicates with backend via REST (submit scan) and WebSocket (live progress updates)

### 2.2 Backend (FastAPI)
- Exposes REST endpoints: `POST /scan`, `GET /scan/{id}/status`, `GET /scan/{id}/findings`
- Exposes a WebSocket channel for pushing live pipeline updates to the frontend
- Triggers and manages the LangGraph agent run
- Persists scan history, findings, and triage/patch decisions to PostgreSQL

### 2.3 Agent Orchestrator (LangGraph)
The core of the system — a `StateGraph` where each pipeline stage is a node, connected by conditional edges.

**Shared State Schema:**
```python
class PipelineState(TypedDict):
    repo_url: str
    repo_path: str
    findings: list[Finding]
    current_finding: Finding | None
    triage_result: TriageResult | None
    patch: Patch | None
    verification_result: VerificationResult | None
    retry_count: int
    completed_findings: list[dict]
```

**Nodes:**
| Node | Responsibility |
|---|---|
| `ingestion_node` | Clone repo, detect language |
| `scanning_node` | Run Semgrep/Bandit/Gitleaks, normalize findings |
| `context_node` | Extract AST-based function context via tree-sitter |
| `triage_node` | LLM classifies real vs. false positive |
| `patch_node` | LLM generates code fix |
| `verify_node` | Docker sandbox re-scan + test run |
| `pr_node` | Opens GitHub PR |
| `human_review_node` | Marks finding as needing manual review |

**Conditional Edges:**
- `triage_node` → if false positive: skip to next finding; if real: proceed to `context_node` → `patch_node`
- `verify_node` → if pass: `pr_node`; if fail and retries remain: loop back to `patch_node`; if fail and retries exhausted: `human_review_node`

### 2.4 Static Analysis Layer
- Semgrep, Bandit, Gitleaks run as isolated subprocesses
- Outputs normalized into a single `Finding` Pydantic schema regardless of source tool

### 2.5 Context Layer
- **tree-sitter** parses source into an AST to extract precise function/class boundaries around each finding
- **ChromaDB** stores embedded code chunks for retrieval of related/similar code patterns

### 2.6 LLM Layer
- Claude/GPT-4 API used for: triage classification, patch generation, PR description generation
- All LLM calls use structured JSON output (validated via Pydantic) to keep agent-to-agent data reliable
- Optional local fallback via Ollama + DeepSeek-Coder for offline demonstration

### 2.7 Verification Layer
- Docker SDK spins up an isolated container per patch attempt
- Re-runs the specific scanner rule that flagged the original issue
- Runs the repo's existing test suite (pytest/etc.) if present
- Enforces the retry-then-escalate policy (max 2 retries before human review)

### 2.8 GitHub Integration Layer
- PyGithub handles: branch creation, commit, push, PR creation
- Auto-generates PR description from templated fields (CWE, diff, confidence, verification status)

### 2.9 Persistence Layer (PostgreSQL)
Tables (minimum):
- `scans` (id, repo_url, status, started_at, completed_at)
- `findings` (id, scan_id, file_path, line, cwe_id, severity, tool_source)
- `triage_results` (finding_id, is_real, confidence, reasoning)
- `patches` (finding_id, diff, explanation, verification_status)
- `pull_requests` (finding_id, pr_url, created_at)

---

## 3. Data Flow (Single Finding Lifecycle)

1. Finding extracted from scanner output → normalized
2. Context node pulls full function body via tree-sitter
3. Triage node classifies it (real / false positive) → if false positive, lifecycle ends here
4. Patch node generates a code fix + explanation
5. Verify node applies patch in Docker sandbox, re-scans, runs tests
6. If verified → PR node opens a pull request
7. If not verified → loop to step 4 (up to 2 retries) → else routed to human review queue
8. All results persisted to PostgreSQL; frontend updated live via WebSocket

---

## 4. Deployment View (for demo purposes)

- Everything runs locally on a single development machine during evaluation
- Docker required only for the verification sandbox, not for hosting the whole app
- No cloud deployment required for the academic scope of this project (mentioned as future work)

---

## 5. Key Architectural Decisions & Rationale

| Decision | Rationale |
|---|---|
| LangGraph over CrewAI | Workflow has explicit conditional branches and retry loops — a graph/state-machine model fits better than a role-based crew |
| Verification sandbox before PR | Prevents the system from ever proposing a patch that isn't proven to work — the core trust mechanism of the whole project |
| Unified `Finding` schema across scanners | Keeps the rest of the pipeline scanner-agnostic; new scanners can be added without touching downstream logic |
| Structured JSON LLM outputs | Ensures reliable agent-to-agent data passing instead of parsing free-text LLM responses |
| Max 2 retries then human escalation | Avoids infinite loops and models responsible AI behavior — an important point to raise in your viva |
