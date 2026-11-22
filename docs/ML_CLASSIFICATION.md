# ML-Based Vulnerability Classification & Risk Scoring (PyTorch)

## Overview & Motivation

CodeSage integrates a lightweight, CPU-optimized **PyTorch Machine Learning (ML) Component** designed to bridge static security scanners (Semgrep, Bandit, Gitleaks) and the LLM-based triage agent.

### Why PyTorch?
1. **Assistive Cross-Scanner Normalization:** Different static analysis tools report issues with varying rule names, message formats, and confidence semantics. A lightweight neural classifier maps heterogeneous findings into standardized vulnerability categories without fragile rule-by-rule regex cascades.
2. **Deterministic Risk Prioritization:** When scanning large repositories that produce tens or hundreds of static findings, executing LLM triage and patch generation sequentially on all findings can be slow and expensive. The PyTorch risk scoring model computes a continuous prioritization metric to rank critical, high-confidence vulnerabilities first.
3. **Contextual Enrichment for LLM Triage:** Rather than giving the LLM only raw static analysis messages, the pipeline provides the model's predicted category, confidence score, and calculated risk score as supporting context.
4. **Local CPU Efficiency:** The neural network is designed to run with sub-millisecond inference latency on a standard laptop CPU (macOS/Linux) with zero GPU dependencies.

---

## Architectural Placement

The PyTorch component sits directly between static analysis and context extraction / LLM triage:

```
[ Repository Source Code ]
           ↓
[ Static Scanners: Semgrep, Bandit, Gitleaks ]
           ↓
[ Normalized Findings (Finding schema) ]
           ↓
┌──────────────────────────────────────────────────────────┐
│  PyTorch ML Component (codesage.ml / backend.ml)        │
│  1. Deterministic Feature Extraction (64-dim vector)    │
│  2. VulnerabilityClassifierNet Forward Pass (CPU)        │
│  3. Predicted Category, Confidence, & Risk Score        │
│  4. Finding Prioritization (Risk Tier Sorting)           │
└──────────────────────────────────────────────────────────┘
           ↓
[ AST Context Extraction (tree-sitter + ChromaDB) ]
           ↓
[ LLM Vulnerability Triage (LangGraph triage_node) ]
   - Receives PyTorch category, confidence, & risk
   - Independently verifies code & overrides if uncertain
           ↓
[ Patch Generation Agent ]
           ↓
[ Verification Sandbox (Docker / Local) ]
           ↓
[ GitHub Pull Request Agent ]
```

---

## Feature Extraction (`codesage/ml/features.py`)

The ML pipeline does **not** feed raw unparsed source code into the neural model (which would require heavy transformer models and slow CPU inference). Instead, it extracts a deterministic **64-dimensional numerical feature vector** (`FEATURE_DIM = 64`) from the finding metadata and syntax context:

| Index Range | Dimension | Feature Category | Description |
|---|---|---|---|
| `[0:4]` | 4 | **Scanner Source** | One-hot encoding of tool source: `[semgrep, bandit, gitleaks, other]` |
| `[4:8]` | 4 | **Severity One-Hot** | One-hot encoding of scanner severity: `[low, medium, high, critical]` |
| `[8]` | 1 | **Severity Weight** | Normalized scalar severity weight (`low=0.25`, `medium=0.50`, `high=0.75`, `critical=1.00`) |
| `[9:17]` | 8 | **CWE Family Buckets** | One-hot indicators for primary CWE clusters (CWE-89, CWE-78, CWE-22, CWE-798, CWE-502, CWE-327, CWE-942, and Unknown/None) |
| `[17:21]` | 4 | **File Extension** | Extension one-hot: Python (`.py`), Config/secrets (`.env`, `.toml`, `.yaml`, `.json`), Docs (`.txt`, `.md`), or Other |
| `[21:25]` | 4 | **Code & Finding Metrics** | Log-normalized numerical values: line number, snippet line count, snippet character length, and message character length |
| `[25:32]` | 7 | **Domain Keywords** | Normalized frequency counts for dangerous functions and tokens across 7 vulnerability families (SQL, OS Command, Path Traversal, Secrets, Crypto, Deserialization, Web Config) |
| `[32:64]` | 32 | **Token Feature Hashing** | 32-bucket deterministic Murmur/MD5 feature hashing with L2 normalization across message, snippet, and identifier tokens |

---

## Model Architecture (`codesage/ml/model.py`)

The classifier uses a multi-layer perceptron (MLP) architecture:

```
Input Feature Vector (64)
  │
  ▼
Linear Layer (64 → 32)
  │
  ▼
ReLU Activation
  │
  ▼
Dropout (p = 0.2, training only)
  │
  ├──► Linear Classification Head (32 → 7 classes) ──► Softmax ──► Predicted Category & Confidence
  │
  └──► Linear Auxiliary Risk Head (32 → 1) ──────────► Sigmoid ──► Neural Risk Factor
```

### Supported Categories
1. **SQL Injection** (CWE-89)
2. **Command Injection** (CWE-78, CWE-77)
3. **Path Traversal** (CWE-22, CWE-23, CWE-36)
4. **Hardcoded Secret** (CWE-798, CWE-259, Gitleaks secrets)
5. **Weak Cryptography** (CWE-327, CWE-328, CWE-326)
6. **Insecure Deserialization** (CWE-502)
7. **Other / Unknown** (CORS, dependency alerts, unclassified)

### Risk Score Calculation
The risk score ($0.0$ to $1.0$) is a deterministic engineering prioritization score calculated via:
$$\text{Risk Score} = 0.35 \times \text{Scanner Severity} + 0.35 \times \text{Category Base Impact} + 0.30 \times (\text{Confidence} \times \text{Neural Risk Factor})$$

> [!NOTE]
> This score is designed specifically for finding ranking and prioritization within the CodeSage pipeline. It is not an actuarial or formally calibrated CVSS base metric.

---

## Training Pipeline (`codesage/ml/training.py` / `backend/ml/training.py`)

CodeSage includes a transparent training mechanism:
- **Seed Ground-Truth Data:** Uses the 8 planted vulnerabilities (`V1` to `V8`) from `test-target-repo/VULNERABILITIES.md` (`codesage/ground_truth.py`).
- **Documented Synthetic Samples:** Generates balanced, deterministic variations across Semgrep, Bandit, and Gitleaks rules for all 7 vulnerability categories.
- **Optimization:** Adam optimizer ($\text{lr} = 0.005$, weight decay $= 10^{-4}$), joint CrossEntropyLoss + MSELoss.
- **Checkpoint:** Checkpoint saved to `backend/ml/models/vulnerability_classifier.pt` (mirrored to `codesage/ml/models/vulnerability_classifier.pt`).

### How to Train
Run either entrypoint:
```bash
# Using Python module syntax
python -m codesage.ml.training --epochs 25

# Or directly through backend/ml
python backend/ml/training.py --epochs 25
```

---

## Inference & Pipeline Integration (`codesage/ml/classifier.py`)

Inference is invoked via the `VulnerabilityClassifier`:
```python
from codesage.ml import VulnerabilityClassifier

clf = VulnerabilityClassifier()
prediction = clf.predict(finding)
# Returns:
# MLPrediction(
#     category="SQL Injection",
#     confidence=0.94,
#     risk_score=0.91,
#     uncertain=False,
#     details={...}
# )
```

### Safety and CPU Execution
- Default device is strictly `torch.device("cpu")`.
- `model.eval()` and `torch.no_grad()` are enforced during all evaluations.
- Checkpoints are loaded using `torch.load(..., weights_only=True)` to prevent arbitrary code execution vulnerabilities from untrusted pickles.
- **Low Confidence Handling:** If `confidence < 0.50` or the predicted category is `Other / Unknown`, `prediction.uncertain` is marked `True`.

### Effect on LangGraph LLM Triage
The LLM triage agent in `codesage/triage.py` receives the PyTorch assessment inside the prompt:
```text
Static Scanner Severity: high
PyTorch ML Assessment:
- Predicted Category: SQL Injection
- Confidence: 0.94
- Prioritization Risk Score: 0.91
Note: Use the PyTorch ML prediction as assistive supporting context only.
Do not blindly trust this prediction; perform independent code reasoning.
```
- If the prediction is marked uncertain, the prompt explicitly notes `(marked UNCERTAIN - low confidence)`.
- The LLM does **not** blindly trust the ML prediction; it performs its full AST and code context verification.

---

## Configuration & Disabling

Configuration is managed through standard environment variables or `PipelineConfig`:

| Environment Variable | Default | Purpose |
|---|---|---|
| `PYTORCH_ML_ENABLED` | `true` | Set to `false` or `0` to disable the ML component entirely. |
| `PYTORCH_MODEL_PATH` | Auto-detected | Optional absolute or relative path to a custom `.pt` model checkpoint. |

When `PYTORCH_ML_ENABLED=false`:
- The pipeline seamlessly routes findings from static scanners directly to `next_finding` without ML classification.
- Findings retain `ml_prediction = None` and the LLM receives the baseline prompt format.
- If the model checkpoint file is missing or corrupted, CodeSage automatically activates a safe deterministic heuristic fallback mode without failing the scan.

---

## Limitations

1. **Assistive, Not Definitive:** The PyTorch model is an assistive classifier trained to prioritize findings and guide prompt context; it cannot prove or disprove the existence of a vulnerability on its own.
2. **Feature-Level Abstraction:** Because the model evaluates 64 extracted features rather than raw full AST trees, complex multi-file taint propagation remains the responsibility of the static analysis engines (Semgrep/Bandit) and LLM triage.
3. **Synthetic Demonstration Baseline:** The base checkpoint is trained on ground-truth fixtures and synthetic rule distributions. For production enterprise deployments, retraining on an expanded historical corpus is recommended.
