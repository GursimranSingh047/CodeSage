"""Inference interface for ML-based vulnerability classification and risk scoring.

Provides the `VulnerabilityClassifier` class with CPU execution, safe model loading,
confidence thresholding, and graceful fallbacks.
"""

import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import torch
import torch.nn.functional as F

from codesage.ml.features import FEATURE_DIM, extract_features
from codesage.ml.model import (
    CATEGORIES,
    IDX_TO_CATEGORY,
    VulnerabilityClassifierNet,
    compute_composite_risk,
)
from codesage.schemas import Finding, MLPrediction

logger = logging.getLogger(__name__)

DEFAULT_MODEL_FILENAME = "vulnerability_classifier.pt"
CONFIDENCE_THRESHOLD = 0.50


def _find_default_model_path() -> Optional[Path]:
    """Look up default model path from environment or standard repository locations."""
    env_path = os.environ.get("PYTORCH_MODEL_PATH")
    if env_path:
        p = Path(env_path)
        if p.is_file():
            return p.resolve()

    # Search standard project paths
    root = Path(__file__).resolve().parent.parent.parent
    candidates = [
        root / "backend" / "ml" / "models" / DEFAULT_MODEL_FILENAME,
        root / "codesage" / "ml" / "models" / DEFAULT_MODEL_FILENAME,
        Path(__file__).resolve().parent / "models" / DEFAULT_MODEL_FILENAME,
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    return None


class VulnerabilityClassifier:
    """Production-grade ML vulnerability classifier and risk scorer for CodeSage.

    Loads a PyTorch checkpoint, extracts features from findings, runs inference on CPU,
    and returns an MLPrediction. Falls back gracefully if the checkpoint is absent.
    """

    def __init__(
        self,
        model_path: Optional[Union[str, Path]] = None,
        device: str = "cpu",
        confidence_threshold: float = CONFIDENCE_THRESHOLD,
    ):
        self.device = torch.device(device)
        self.confidence_threshold = confidence_threshold
        self.model = VulnerabilityClassifierNet(input_dim=FEATURE_DIM, num_classes=len(CATEGORIES))
        self.model.to(self.device)
        self.model.eval()

        self.model_loaded = False
        self.model_path: Optional[Path] = None

        target_path = Path(model_path) if model_path else _find_default_model_path()
        if target_path and target_path.is_file():
            self._load_checkpoint(target_path)
        else:
            logger.info("VulnerabilityClassifier initialized in fallback mode (model checkpoint not found at %s)", target_path)

    def _load_checkpoint(self, path: Path) -> None:
        """Safely load model weights using weights_only=True."""
        try:
            checkpoint = torch.load(path, map_location=self.device, weights_only=True)
            if isinstance(checkpoint, dict) and "state_dict" in checkpoint:
                state_dict = checkpoint["state_dict"]
            elif isinstance(checkpoint, dict):
                state_dict = checkpoint
            else:
                logger.warning("Unexpected checkpoint format in %s, using fallback", path)
                return

            self.model.load_state_dict(state_dict)
            self.model.eval()
            self.model_loaded = True
            self.model_path = path
            logger.info("Loaded PyTorch vulnerability classifier from %s", path)
        except Exception as exc:
            logger.warning("Failed to load PyTorch model from %s: %s; falling back to heuristic classification", path, exc)
            self.model_loaded = False

    def predict(self, finding: Union[Finding, Dict[str, Any]]) -> MLPrediction:
        """Classify a vulnerability finding and calculate its risk score.

        Args:
            finding: A Finding schema instance or finding dictionary.

        Returns:
            MLPrediction with predicted category, confidence, risk score, and uncertainty flag.
        """
        # Extract deterministic numerical features
        try:
            features = extract_features(finding)
        except Exception as exc:
            logger.warning("Feature extraction failed for finding: %s. Using zero vector fallback.", exc)
            features = [0.0] * FEATURE_DIM

        # Resolve severity for composite risk calculation
        severity = "medium"
        if isinstance(finding, dict):
            severity = str(finding.get("severity") or "medium")
        elif hasattr(finding, "severity"):
            severity = str(getattr(finding, "severity", "medium") or "medium")

        if self.model_loaded:
            return self._predict_neural(features, severity)
        else:
            return self._predict_fallback(finding, severity)

    def _predict_neural(self, features: List[float], severity: str) -> MLPrediction:
        """Run inference using the PyTorch neural network."""
        with torch.no_grad():
            x = torch.tensor([features], dtype=torch.float32, device=self.device)
            logits, raw_risk = self.model(x)
            probabilities = F.softmax(logits, dim=-1).squeeze(0)
            raw_risk_val = float(raw_risk.item())

            pred_idx = int(torch.argmax(probabilities).item())
            confidence = float(probabilities[pred_idx].item())
            category = IDX_TO_CATEGORY.get(pred_idx, "Other / Unknown")

        uncertain = (confidence < self.confidence_threshold) or (category == "Other / Unknown")
        risk_score = compute_composite_risk(
            predicted_category=category,
            confidence=confidence,
            model_risk_factor=raw_risk_val,
            scanner_severity=severity,
        )

        all_probs = {
            cat: round(float(probabilities[i].item()), 3)
            for i, cat in enumerate(CATEGORIES)
        }

        return MLPrediction(
            category=category,
            confidence=round(confidence, 2),
            risk_score=risk_score,
            uncertain=uncertain,
            details={
                "probabilities": all_probs,
                "raw_risk": round(raw_risk_val, 3),
                "device": str(self.device),
                "model_loaded": True,
            },
        )

    def _predict_fallback(self, finding: Union[Finding, Dict[str, Any]], severity: str) -> MLPrediction:
        """Deterministic heuristic fallback when no PyTorch checkpoint is available."""
        cwe = ""
        msg = ""
        tool = ""
        if isinstance(finding, dict):
            cwe = str(finding.get("cwe_id") or "")
            msg = str(finding.get("raw_message") or "") + " " + str(finding.get("code_snippet") or "")
            tool = str(finding.get("tool_source") or "")
        elif finding is not None:
            cwe = str(getattr(finding, "cwe_id", "") or "")
            msg = str(getattr(finding, "raw_message", "") or "") + " " + str(getattr(finding, "code_snippet", "") or "")
            tool = str(getattr(finding, "tool_source", "") or "")

        cwe_upper = cwe.upper()
        msg_lower = msg.lower()

        # Heuristic mapping
        if "CWE-89" in cwe_upper or "sql" in msg_lower or "select" in msg_lower:
            category = "SQL Injection"
            confidence = 0.85
        elif "CWE-78" in cwe_upper or "CWE-77" in cwe_upper or "system" in msg_lower or "subprocess" in msg_lower:
            category = "Command Injection"
            confidence = 0.85
        elif "CWE-22" in cwe_upper or "path" in msg_lower or "traversal" in msg_lower:
            category = "Path Traversal"
            confidence = 0.85
        elif "CWE-798" in cwe_upper or "CWE-259" in cwe_upper or tool == "gitleaks" or "api_key" in msg_lower:
            category = "Hardcoded Secret"
            confidence = 0.85
        elif "CWE-502" in cwe_upper or "pickle" in msg_lower or "deserial" in msg_lower:
            category = "Insecure Deserialization"
            confidence = 0.85
        elif "CWE-327" in cwe_upper or "md5" in msg_lower or "crypto" in msg_lower:
            category = "Weak Cryptography"
            confidence = 0.80
        else:
            category = "Other / Unknown"
            confidence = 0.40

        uncertain = (confidence < self.confidence_threshold) or (category == "Other / Unknown")
        risk_score = compute_composite_risk(
            predicted_category=category,
            confidence=confidence,
            model_risk_factor=0.5,
            scanner_severity=severity,
        )

        return MLPrediction(
            category=category,
            confidence=round(confidence, 2),
            risk_score=risk_score,
            uncertain=uncertain,
            details={
                "model_loaded": False,
                "fallback_mode": True,
            },
        )
