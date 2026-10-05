# CodeSage

**An autonomous AI agent that audits, explains, and fixes security vulnerabilities in your codebase.**

CodeSage clones a repository, runs static analysis (Semgrep, Bandit, Gitleaks), uses an LLM to triage findings into real vulnerabilities vs. false positives, generates code patches, verifies those patches in an isolated Docker sandbox, and opens GitHub pull requests — with minimal human intervention.

---

## Problem

Most small and mid-sized engineering teams skip proper security audits because:
- Commercial tools (Snyk, SonarQube) are expensive at scale
- Static analysis generates high false-positive rates, causing alert fatigue
- Even correctly flagged issues still require a human to manually write and verify the fix

CodeSage addresses all three: cheap open-source scanning, LLM-based triage to cut noise, and automated, **verified** patch generation.

---

## Architecture Overview

```
Repo URL → Ingestion → Scanning (Semgrep/Bandit/Gitleaks) → Context Extraction (tree-sitter)
  → Triage Agent (LLM) → Patch Generation (LLM) → Verification (Docker sandbox + re-scan + tests)
  → GitHub PR Agent → Dashboard (React)
```

Full details in [`architecture.md`](./architecture.md) and [`design.md`](./design.md).

---

## Tech Stack

| Layer | Tool |
|---|---|
| Agent orchestration | LangGraph |
| LLM | Claude / GPT-4 API |
| Static analysis | Semgrep, Bandit, Gitleaks |
| Code parsing | tree-sitter |
| Vector store | ChromaDB |
| Sandboxing | Docker SDK for Python |
| Version control automation | PyGithub |
| Backend | FastAPI |
| Frontend | React (JS, CSS, HTML) |
| Database | PostgreSQL |

---

## Project Status

Final year engineering project — in active development. See [`requirements.md`](./requirements.md) for functional/non-functional requirements and success criteria.

## Modules

| # | Module | Status |
|---|---|---|
| 1 | Seeded vulnerable test app | ✅ |
| 2 | Ingestion + scanning layer | ✅ |
| 3 | Context extraction (tree-sitter + ChromaDB) | ✅ |
| 4 | Triage agent | ✅ |
| 5 | Patch generation agent | ✅ |
| 6 | Verification agent (Docker sandbox) | ✅ |
| 7 | GitHub PR agent | ✅ |
| 8 | LangGraph orchestration | ✅ |
| 9 | React dashboard | ✅ |
| 10 | Testing & metrics | ✅ |

---

## Testing & metrics

```bash
./scripts/verify_all.sh                                  # every module suite + frontend build
source venv/bin/activate
pytest -v                                                # backend suites (modules 2–10)
cd test-target-repo && ./venv/bin/pytest -v              # seeded app suite (module 1)

# full pipeline run + per-finding metrics report (markdown):
python -m codesage.metrics test-target-repo --mock --output metrics_report.md
# live mode (requires ANTHROPIC_API_KEY; Docker + GITHUB_TOKEN for full fidelity):
python -m codesage.metrics test-target-repo --output live_run_results.md
```

`metrics_report.md` contains triage precision/recall/F1 vs. the seeded ground
truth, verification outcome counts, and a per-finding results table.

## Setup

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Environment variables required:
```
ANTHROPIC_API_KEY=
GITHUB_TOKEN=
DATABASE_URL=
```

---

## License

Academic project — final year engineering coursework.

## Latest Update
- Improved project documentation and developer setup.
