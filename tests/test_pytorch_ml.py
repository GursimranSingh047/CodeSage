"""Tests for PyTorch ML vulnerability classification and risk scoring integration."""

import json
import os
from pathlib import Path
from unittest import mock

import pytest
import torch

from codesage.llm import BaseLLM
from codesage.ml.classifier import VulnerabilityClassifier
from codesage.ml.features import FEATURE_DIM, extract_features
from codesage.ml.model import (
    CATEGORIES,
    CATEGORY_TO_IDX,
    VulnerabilityClassifierNet,
    compute_composite_risk,
)
from codesage.ml.training import build_training_dataset, train_model
from codesage.pipeline import PipelineConfig, build_pipeline
from codesage.schemas import Finding, MLPrediction
from codesage.triage import build_triage_prompt
from codesage.verification import LocalBackend


# ---------------------------------------------------------------------------
# Test Helpers
# ---------------------------------------------------------------------------

class MockTriageLLM(BaseLLM):
    """Mock LLM that captures triage prompts and returns valid JSON."""

    def __init__(self, is_real: bool = True):
        self.is_real = is_real
        self.captured_prompts = []

    def complete(self, system: str, user: str) -> str:
        self.captured_prompts.append((system, user))
        return json.dumps({
            "finding_id": "test:finding",
            "is_real_vulnerability": self.is_real,
            "confidence": 0.85,
            "reasoning": "Mock verification complete.",
            "cwe_confirmed": "CWE-89",
            "exploitability": "high",
        })


def make_sample_finding(
    cwe: str = "CWE-89",
    tool: str = "semgrep",
    severity: str = "critical",
    msg: str = "User input reaches SQL execute",
    snippet: str = "cursor.execute(f'SELECT * FROM users WHERE name={name}')",
    fpath: str = "database.py",
    line: int = 42,
) -> Finding:
    return Finding(
        id=f"{tool}:{fpath}:{line}:test",
        file_path=fpath,
        line_number=line,
        cwe_id=cwe,
        severity=severity,
        tool_source=tool,
        raw_message=msg,
        code_snippet=snippet,
    )


# ---------------------------------------------------------------------------
# 1. Feature Extraction Tests
# ---------------------------------------------------------------------------

def test_feature_extraction_dimension_and_determinism():
    finding = make_sample_finding()
    vec1 = extract_features(finding)
    vec2 = extract_features(finding)

    assert len(vec1) == FEATURE_DIM
    assert vec1 == vec2, "Feature extraction must be completely deterministic"
    assert all(isinstance(v, (float, int)) for v in vec1)


def test_feature_extraction_handles_all_scanners_and_severities():
    scanners = ["semgrep", "bandit", "gitleaks", "unknown_tool"]
    severities = ["low", "medium", "high", "critical"]

    for sc in scanners:
        for sev in severities:
            f = make_sample_finding(tool=sc, severity=sev)
            vec = extract_features(f)
            assert len(vec) == FEATURE_DIM


def test_feature_extraction_handles_none_and_malformed():
    # Pass None
    vec_none = extract_features(None)
    assert len(vec_none) == FEATURE_DIM
    assert all(v == 0.0 for v in vec_none)

    # Pass empty dictionary
    vec_empty = extract_features({})
    assert len(vec_empty) == FEATURE_DIM

    # Pass dictionary with non-standard types
    malformed = {
        "tool_source": 12345,
        "severity": None,
        "line_number": "not_a_number",
        "cwe_id": ["weird_list"],
        "raw_message": None,
        "code_snippet": None,
    }
    vec_malformed = extract_features(malformed)
    assert len(vec_malformed) == FEATURE_DIM


# ---------------------------------------------------------------------------
# 2. Model Initialization and Forward Pass
# ---------------------------------------------------------------------------

def test_model_initialization_and_forward_shapes():
    model = VulnerabilityClassifierNet(input_dim=FEATURE_DIM, num_classes=len(CATEGORIES))
    model.eval()

    batch_size = 4
    dummy_input = torch.randn(batch_size, FEATURE_DIM)

    with torch.no_grad():
        logits, raw_risk = model(dummy_input)

    assert logits.shape == (batch_size, len(CATEGORIES))
    assert raw_risk.shape == (batch_size,)
    assert torch.all(raw_risk >= 0.0) and torch.all(raw_risk <= 1.0)


def test_compute_composite_risk_bounds():
    # Test boundary conditions
    min_risk = compute_composite_risk("Other / Unknown", 0.0, 0.0, "low")
    max_risk = compute_composite_risk("Command Injection", 1.0, 1.0, "critical")

    assert 0.0 <= min_risk <= 1.0
    assert 0.0 <= max_risk <= 1.0
    assert max_risk > min_risk


# ---------------------------------------------------------------------------
# 3. Model Inference and CPU Execution
# ---------------------------------------------------------------------------

def test_classifier_cpu_inference():
    clf = VulnerabilityClassifier(device="cpu")
    assert clf.device == torch.device("cpu")

    finding = make_sample_finding()
    pred = clf.predict(finding)

    assert isinstance(pred, MLPrediction)
    assert pred.category in CATEGORIES
    assert 0.0 <= pred.confidence <= 1.0
    assert 0.0 <= pred.risk_score <= 1.0
    assert isinstance(pred.uncertain, bool)


def test_classifier_predict_supported_categories():
    clf = VulnerabilityClassifier()

    test_cases = [
        ("SQL Injection", make_sample_finding(
            cwe="CWE-89", msg="SQL injection detected", snippet="cursor.execute(f'SELECT * FROM {t}')"
        )),
        ("Command Injection", make_sample_finding(
            cwe="CWE-78", msg="os.system call with user input", snippet="os.system(f'ping {host}')"
        )),
        ("Path Traversal", make_sample_finding(
            cwe="CWE-22", msg="Arbitrary file read with open", snippet="open(user_path, 'r')"
        )),
        ("Hardcoded Secret", make_sample_finding(
            cwe="CWE-798", tool="gitleaks", msg="Stripe secret key placeholder", snippet="STRIPE_API_KEY = 'STRIPE_TEST_KEY_PLACEHOLDER'"
        )),
        ("Insecure Deserialization", make_sample_finding(
            cwe="CWE-502", msg="pickle.loads with untrusted data", snippet="pickle.loads(raw_bytes)"
        )),
    ]

    for expected_cat, finding in test_cases:
        pred = clf.predict(finding)
        assert pred.category == expected_cat, f"Expected {expected_cat}, got {pred.category}"
        assert pred.confidence >= 0.50


def test_low_confidence_and_unknown_findings_marked_uncertain():
    clf = VulnerabilityClassifier()

    unknown_finding = make_sample_finding(
        cwe="CWE-9999",
        tool="other",
        severity="low",
        msg="Informational note: variable unused",
        snippet="unused_var = 1",
    )
    pred = clf.predict(unknown_finding)

    assert pred.uncertain is True or pred.category == "Other / Unknown"
    assert pred.risk_score < 0.70


# ---------------------------------------------------------------------------
# 4. Safe Checkpoint Loading and Fallback Mode
# ---------------------------------------------------------------------------

def test_safe_checkpoint_loading(tmp_path):
    # Train and save a small checkpoint
    model_path = tmp_path / "test_model.pt"
    train_model(output_path=model_path, epochs=3)
    assert model_path.is_file()

    # Load with VulnerabilityClassifier
    clf = VulnerabilityClassifier(model_path=model_path)
    assert clf.model_loaded is True
    assert clf.model_path == model_path

    finding = make_sample_finding()
    pred = clf.predict(finding)
    assert pred.details.get("model_loaded") is True


def test_fallback_mode_when_model_checkpoint_missing(tmp_path):
    non_existent = tmp_path / "does_not_exist.pt"
    clf = VulnerabilityClassifier(model_path=non_existent)

    assert clf.model_loaded is False

    finding = make_sample_finding()
    pred = clf.predict(finding)

    assert isinstance(pred, MLPrediction)
    assert pred.category == "SQL Injection"
    assert pred.details.get("fallback_mode") is True


def test_fallback_mode_when_checkpoint_is_corrupted(tmp_path):
    corrupt_path = tmp_path / "corrupt.pt"
    corrupt_path.write_bytes(b"not a valid pytorch checkpoint data")

    clf = VulnerabilityClassifier(model_path=corrupt_path)
    assert clf.model_loaded is False

    # Inference should not crash
    pred = clf.predict(make_sample_finding())
    assert isinstance(pred, MLPrediction)


# ---------------------------------------------------------------------------
# 5. Risk Prioritization and Pipeline Integration
# ---------------------------------------------------------------------------

def test_ml_classification_prioritizes_critical_findings(tmp_path):
    # Create findings of different risk levels
    critical_sqli = make_sample_finding(
        cwe="CWE-89", severity="critical", msg="SQL injection", snippet="cursor.execute(sql)", fpath="app.py"
    )
    high_cmd = make_sample_finding(
        cwe="CWE-78", severity="high", msg="Command injection", snippet="os.system(cmd)", fpath="app.py"
    )
    low_unknown = make_sample_finding(
        cwe=None, severity="low", msg="Generic notice", snippet="pass", fpath="app.py"
    )

    findings = [low_unknown, critical_sqli, high_cmd]

    repo_dir = tmp_path / "repo"
    repo_dir.mkdir()
    (repo_dir / "app.py").write_text("def app():\n    pass\n")

    cfg = PipelineConfig(
        repo_input=str(repo_dir),
        llm=MockTriageLLM(is_real=False),
        backend=LocalBackend(),
        pytorch_ml_enabled=True,
    )

    with mock.patch("codesage.pipeline.scan_repo", return_value=findings):
        app = build_pipeline(cfg)
        initial = {
            "repo_url": str(repo_dir),
            "repo_path": str(repo_dir),
            "findings": [],
            "completed_findings": [],
            "retry_count": 0,
        }

        seen_in_ml = []
        for chunk in app.stream(initial, stream_mode="updates"):
            if "ml_classification" in chunk:
                seen_in_ml = chunk["ml_classification"]["findings"]

        # Ensure all 3 findings are preserved
        assert len(seen_in_ml) == 3
        # Ensure high/critical findings were prioritized before low unknown
        assert seen_in_ml[0].severity in ("critical", "high")
        assert seen_in_ml[-1].id == low_unknown.id


def test_triage_prompt_receives_ml_context():
    finding = make_sample_finding()
    clf = VulnerabilityClassifier()
    finding.ml_prediction = clf.predict(finding)

    mock_context = mock.MagicMock()
    mock_context.enclosing_function = "def vuln():\n    cursor.execute(q)"
    mock_context.related_chunks = []

    system, user = build_triage_prompt(finding, mock_context)

    assert "PyTorch ML Assessment" in user
    assert "Predicted Category: SQL Injection" in user
    assert "Confidence:" in user
    assert "Prioritization Risk Score:" in user
    assert "Do not blindly trust this prediction" in user


def test_pipeline_with_ml_disabled(tmp_path):
    repo_dir = tmp_path / "repo"
    repo_dir.mkdir()
    (repo_dir / "app.py").write_text("def app():\n    pass\n")

    findings = [make_sample_finding(fpath="app.py")]
    cfg = PipelineConfig(
        repo_input=str(repo_dir),
        llm=MockTriageLLM(is_real=False),
        backend=LocalBackend(),
        pytorch_ml_enabled=False,
    )

    with mock.patch("codesage.pipeline.scan_repo", return_value=findings):
        app = build_pipeline(cfg)
        initial = {
            "repo_url": str(repo_dir),
            "repo_path": str(repo_dir),
            "findings": [],
            "completed_findings": [],
            "retry_count": 0,
        }

        output_findings = []
        for chunk in app.stream(initial, stream_mode="updates"):
            if "ml_classification" in chunk:
                output_findings = chunk["ml_classification"]["findings"]

        assert len(output_findings) == 1
        # When disabled, ml_prediction is not added
        assert getattr(output_findings[0], "ml_prediction", None) is None


def test_pipeline_survives_classifier_exception(tmp_path):
    repo_dir = tmp_path / "repo"
    repo_dir.mkdir()
    (repo_dir / "app.py").write_text("def app():\n    pass\n")

    f = make_sample_finding(fpath="app.py")
    cfg = PipelineConfig(
        repo_input=str(repo_dir),
        llm=MockTriageLLM(is_real=False),
        backend=LocalBackend(),
        pytorch_ml_enabled=True,
    )

    broken_classifier = mock.MagicMock()
    broken_classifier.predict.side_effect = RuntimeError("Simulated ML inference failure")
    cfg.classifier = broken_classifier

    with mock.patch("codesage.pipeline.scan_repo", return_value=[f]):
        app = build_pipeline(cfg)
        initial = {
            "repo_url": str(repo_dir),
            "repo_path": str(repo_dir),
            "findings": [],
            "completed_findings": [],
            "retry_count": 0,
        }

        # Pipeline should complete gracefully without throwing RuntimeError
        chunks = list(app.stream(initial, stream_mode="updates"))
        assert any("ml_classification" in c for c in chunks)
