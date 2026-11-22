"""Feature extraction for ML vulnerability classification and risk scoring.

Transforms normalized Finding objects into fixed-size, deterministic numerical
feature vectors suitable for CPU inference in PyTorch.
"""

import hashlib
import math
import re
from typing import Any, Dict, List, Optional, Union

from codesage.schemas import Finding

FEATURE_DIM = 64

# Canonical scanner identifiers
SCANNERS = ["semgrep", "bandit", "gitleaks", "other"]
SCANNER_TO_IDX = {s: i for i, s in enumerate(SCANNERS)}

# Severity levels
SEVERITIES = ["low", "medium", "high", "critical"]
SEVERITY_TO_IDX = {s: i for i, s in enumerate(SEVERITIES)}
SEVERITY_WEIGHTS = {
    "low": 0.25,
    "medium": 0.50,
    "high": 0.75,
    "critical": 1.00,
}

# Key CWE clusters corresponding to common CodeSage vulnerability families
CWE_CLUSTERS = [
    "CWE-89",   # SQL Injection
    "CWE-78",   # OS Command Injection (also 77)
    "CWE-22",   # Path Traversal (also 23, 36)
    "CWE-798",  # Hardcoded Credentials / Secrets (also 259)
    "CWE-502",  # Insecure Deserialization
    "CWE-327",  # Broken/Weak Cryptography (also 328, 326)
    "CWE-942",  # Permissive CORS / Web Config (also 1104, etc.)
]

# Domain-specific dangerous keyword patterns per vulnerability category
CATEGORY_KEYWORDS = {
    "sql": [
        "select", "insert", "update", "delete", "execute", "cursor",
        "query", "where", "from", "like", "table", "sql", "b608",
    ],
    "command": [
        "system", "subprocess", "popen", "shell", "exec", "spawn",
        "b605", "b602", "b607", "command", "sh", "bash",
    ],
    "traversal": [
        "open", "path", "filename", "filepath", "read", "write",
        "directory", "join", "abspath", "traversal",
    ],
    "secret": [
        "api_key", "secret", "token", "password", "passwd", "auth",
        "bearer", "sk_live", "private_key", "credential", "gitleaks",
    ],
    "crypto": [
        "md5", "sha1", "des", "rc4", "cipher", "crypto",
        "hashlib", "insecure", "b303", "b324", "b304", "salt",
    ],
    "deserialization": [
        "pickle", "loads", "unpickle", "yaml.load", "marshal",
        "b301", "b403", "deserialize", "shelve",
    ],
    "web_config": [
        "cors", "allow_origins", "dependency", "vulnerable",
        "wildcard", "policy", "header",
    ],
}

TOKEN_RE = re.compile(r"[A-Za-z0-9_]{2,}")


def _normalize_string(val: Any) -> str:
    return str(val or "").strip().lower()


def _get_field(finding: Union[Finding, Dict[str, Any]], field_name: str, default: Any = "") -> Any:
    if isinstance(finding, dict):
        return finding.get(field_name, default)
    return getattr(finding, field_name, default)


def _token_hash_vector(text: str, num_buckets: int = 32) -> List[float]:
    """Lightweight, deterministic feature hashing (the 'hashing trick')."""
    buckets = [0.0] * num_buckets
    if not text:
        return buckets

    tokens = TOKEN_RE.findall(text.lower())
    if not tokens:
        return buckets

    for token in tokens:
        digest = hashlib.md5(token.encode("utf-8")).hexdigest()
        bucket = int(digest, 16) % num_buckets
        buckets[bucket] += 1.0

    # L2 normalize the bucket counts
    norm = math.sqrt(sum(b * b for b in buckets))
    if norm > 0.0:
        buckets = [round(b / norm, 4) for b in buckets]

    return buckets


def extract_features(finding: Union[Finding, Dict[str, Any]]) -> List[float]:
    """Extract a 64-dimensional numerical feature vector from a finding.

    Feature vector layout:
      [0:4]   - Scanner source one-hot (semgrep, bandit, gitleaks, other)
      [4:8]   - Severity one-hot (low, medium, high, critical)
      [8]     - Numeric severity weight (0.25 to 1.0)
      [9:17]  - CWE cluster one-hot (8 features: 7 common CWEs + no/unknown CWE)
      [17:21] - File extension one-hot (.py, config/yaml/toml, doc/txt, other)
      [21:25] - Numeric lengths/metrics (normalized line, snippet lines, snippet len, msg len)
      [25:32] - Category domain keyword indicators (7 normalized counts)
      [32:64] - Token hash representation (32-dim normalized feature hashing)
    Total: 64 features.
    """
    if finding is None:
        return [0.0] * FEATURE_DIM

    # 1. Scanner type (4 dims)
    tool_source = _normalize_string(_get_field(finding, "tool_source", "other"))
    scanner_vec = [0.0] * len(SCANNERS)
    scanner_idx = SCANNER_TO_IDX.get(tool_source, SCANNER_TO_IDX["other"])
    scanner_vec[scanner_idx] = 1.0

    # 2. Severity (4 dims one-hot + 1 dim weight)
    severity_raw = _normalize_string(_get_field(finding, "severity", "medium"))
    severity_vec = [0.0] * len(SEVERITIES)
    sev_idx = SEVERITY_TO_IDX.get(severity_raw, SEVERITY_TO_IDX["medium"])
    severity_vec[sev_idx] = 1.0
    severity_weight = [SEVERITY_WEIGHTS.get(severity_raw, 0.50)]

    # 3. CWE Clusters (8 dims)
    cwe_id = str(_get_field(finding, "cwe_id") or "").upper().strip()
    cwe_vec = [0.0] * (len(CWE_CLUSTERS) + 1)
    matched_cwe = False
    for i, cluster in enumerate(CWE_CLUSTERS):
        if cluster in cwe_id:
            cwe_vec[i] = 1.0
            matched_cwe = True
            break
        # Also check aliases
        if cluster == "CWE-78" and "CWE-77" in cwe_id:
            cwe_vec[i] = 1.0
            matched_cwe = True
            break
        if cluster == "CWE-22" and any(a in cwe_id for a in ("CWE-23", "CWE-36")):
            cwe_vec[i] = 1.0
            matched_cwe = True
            break
        if cluster == "CWE-798" and "CWE-259" in cwe_id:
            cwe_vec[i] = 1.0
            matched_cwe = True
            break
        if cluster == "CWE-327" and any(a in cwe_id for a in ("CWE-328", "CWE-326")):
            cwe_vec[i] = 1.0
            matched_cwe = True
            break
    if not matched_cwe:
        cwe_vec[-1] = 1.0  # unknown / absent CWE

    # 4. File extension (4 dims)
    file_path = _normalize_string(_get_field(finding, "file_path", ""))
    ext_vec = [0.0, 0.0, 0.0, 0.0]
    if file_path.endswith(".py"):
        ext_vec[0] = 1.0
    elif any(file_path.endswith(e) for e in (".yaml", ".yml", ".toml", ".json", ".ini", ".env")):
        ext_vec[1] = 1.0
    elif any(file_path.endswith(e) for e in (".txt", ".md", ".rst")):
        ext_vec[2] = 1.0
    else:
        ext_vec[3] = 1.0

    # 5. Lengths and numeric metrics (4 dims)
    try:
        line_num = max(0, int(_get_field(finding, "line_number", 1)))
    except (ValueError, TypeError):
        line_num = 1
    norm_line = min(math.log1p(line_num) / 10.0, 1.0)

    snippet = str(_get_field(finding, "code_snippet", "") or "")
    snippet_lines = len(snippet.splitlines())
    norm_snippet_lines = min(math.log1p(snippet_lines) / 5.0, 1.0)
    norm_snippet_len = min(math.log1p(len(snippet)) / 10.0, 1.0)

    raw_msg = str(_get_field(finding, "raw_message", "") or "")
    norm_msg_len = min(math.log1p(len(raw_msg)) / 8.0, 1.0)
    metrics_vec = [round(norm_line, 4), round(norm_snippet_lines, 4), round(norm_snippet_len, 4), round(norm_msg_len, 4)]

    # 6. Category domain keyword counts (7 dims)
    finding_id = str(_get_field(finding, "id", "") or "").lower()
    combined_text = f"{finding_id} {raw_msg} {snippet}".lower()

    kw_vec = []
    for cat_key in ["sql", "command", "traversal", "secret", "crypto", "deserialization", "web_config"]:
        keywords = CATEGORY_KEYWORDS[cat_key]
        hits = sum(1 for kw in keywords if kw in combined_text)
        kw_vec.append(round(min(hits / 5.0, 1.0), 4))

    # 7. Token hash vector (32 dims)
    token_vec = _token_hash_vector(f"{raw_msg} {snippet} {cwe_id} {finding_id}", num_buckets=32)

    features = (
        scanner_vec +          # 4
        severity_vec +         # 4
        severity_weight +      # 1
        cwe_vec +              # 8
        ext_vec +              # 4
        metrics_vec +          # 4
        kw_vec +               # 7
        token_vec              # 32
    )

    if len(features) != FEATURE_DIM:
        # Fallback safeguard: pad or truncate
        if len(features) < FEATURE_DIM:
            features = features + [0.0] * (FEATURE_DIM - len(features))
        else:
            features = features[:FEATURE_DIM]

    return features
