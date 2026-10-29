# CodeSage Engineering Roadmap

**Project:** CodeSage — AI Agent for Automated Security Vulnerability Detection & Auto-Fix  
**Current Version:** 1.0.0-beta  
**Last Updated:** 2026-10-28  

---

## 1. Completed and Verified Capabilities

### Core Pipeline & Orchestration
- [x] **Seeded Benchmark Target (Module 1):** Realistic vulnerable FastAPI test app (`test-target-repo/`) with 8 planted vulnerabilities (SQLi, hardcoded credentials, command injection, path traversal, insecure deserialization, weak CORS, plaintext auth, vulnerable dependency pins).
- [x] **Ingestion & Detection (Module 2):** Shallow Git cloning, local repository resolution, and automated language detection.
- [x] **Multi-Scanner Layer (Module 2):** Isolated subprocess runners for Semgrep, Bandit, and Gitleaks with custom security rule packs. Auto-discovery of local binaries in `bin/` and PATH.
- [x] **Finding Normalization (Module 2):** Unified `Finding` Pydantic schema mapping tool outputs into standard severity, CWE, file, line, and code snippet representations.
- [x] **AST Context Extraction (Module 3):** Tree-sitter Python AST traversal to extract exact function/class definitions (including decorators) and module-level imports, with sliding window fallbacks for global constants.
- [x] **Semantic Code Retrieval (Module 3):** ChromaDB vector store indexing repository functions with cosine similarity search for cross-file pattern context.
- [x] **AI Vulnerability Triage (Module 4):** Structured LLM classification into real vs. false-positive findings, exploitability rating, and reasoning, backed by self-healing JSON retry logic.
- [x] **Prompt Injection Hardening (Module 4 & 5):** `<untrusted_code_context>` tagging and explicit system directives forbidding the LLM from obeying instructions embedded in repository code or comments.
- [x] **Patch Generation (Module 5):** Automated generation of secure function rewrites preserving non-vulnerable paths, function signatures, and structured explanations. Verbatim original code alignment via AST.
- [x] **Verification Gate (Module 6):** Sandboxed verification re-running the specific flagged scanner rule and executing existing pytest test suites on temporary workspace clones.
- [x] **Failure Feedback Loop (Module 6):** Bounded 2-attempt retry loop that feeds scanner or test failure output back into the patch generation prompt.
- [x] **GitHub Pull Request Automation (Module 7):** Automated Git branching (`codesage/fix-...`), unified diff rendering, commit creation, and descriptive PR generation via PyGithub.
- [x] **LangGraph Orchestration (Module 8):** State machine managing the finding queue, false-positive branching, verification loops, and human-review routing.
- [x] **FastAPI REST & WebSocket Backend (Module 9):** Endpoints for scan submission, live status, finding artifacts, and real-time WebSocket stage streaming.
- [x] **React Dashboard (Module 9):** Interactive web UI with severity filtering, live status badges, side-by-side diff comparison, and PR summary links.
- [x] **Evaluation Framework (Module 10):** Ground-truth evaluation computing triage precision, recall, F1 score, and raw scanner detection recall.
- [x] **Incremental Scanning (Module 11):** SHA-256 file-hash tracking to bypass unchanged files and rescan only modified or added code.
- [x] **Durable Persistence (Module 9):** Atomic, file-backed scan records (`ScanStorage`) persisting runs, findings, artifacts, and event logs to disk with automatic server hydration.
- [x] **Continuous Integration (Module 14):** GitHub Actions workflow executing backend suites, security scans, and frontend build.

---

## 2. Partially Implemented Capabilities

- [ ] **Docker Sandbox Execution (Module 6):**
  - *Current Status:* Dockerfile and `DockerBackend` are hardened with non-root user execution, memory limits, CPU quotas, and dropped capabilities.
  - *Gap:* The current macOS development environment lacks a running Docker daemon (`command not found: docker`). When Docker is installed and running, `DockerBackend` functions as designed. `LocalBackend` acts as the verified fallback in environments without Docker.
- [ ] **Human Review UI Component (Module 9 & 13):**
  - *Current Status:* Backend REST endpoints (`GET /scan/{id}/human-review` and `POST /scan/{id}/findings/{fid}/review`) are fully implemented, tested, and persisted.
  - *Gap:* The React frontend needs a dedicated `/human-review` modal/page to let developers click "Approve" or "Reject" directly from the browser instead of calling the API.

---

## 3. Remaining Essential Work (Pre-Demonstration)

1. **Host Docker Setup:** Install Docker Desktop on the presentation machine to enable true containerized verification during live evaluation.
2. **Frontend Review Modal:** Integrate the new review API into `dashboard/src/pages/FindingsPage.jsx` so unverified/escalated findings display an "Action Required: Human Review" drawer.
3. **Dedicated SCA Scanner:** Integrate an explicit Software Composition Analysis (SCA) tool such as `pip-audit` into Module 2 to automatically detect and patch vulnerable dependency pins (e.g., V8 in `requirements.txt`).

---

## 4. Optional Advanced Features

### Advanced Module 12: Advanced Context Retrieval
- Multi-query hybrid search combining tree-sitter call-graph traversal with ChromaDB dense vector embeddings.
- Automatic inclusion of caller/callee function definitions when security context spans multiple modules.

### Advanced Module 15: Full Multi-Language Support
- Extend tree-sitter AST parsing, scanner rules, and patch verification beyond Python to JavaScript/TypeScript (Jest/npm) and Go (`go test`).
- Multi-runtime Docker verification container with pre-installed Node.js and Go toolchains.

### Advanced Module 16: Automated PR Review Bot
- Webhook listener for incoming GitHub pull requests (`pull_request.opened`) to trigger lightweight incremental security scans automatically.
- Automatic inline PR comments pointing directly to security flaws in pull request diffs.
