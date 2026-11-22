"""PyTorch neural network architecture for vulnerability classification and risk scoring.

Implements a lightweight multi-layer perceptron (MLP) suitable for fast CPU inference.
"""

from typing import Dict, List, Tuple
import torch
import torch.nn as nn
import torch.nn.functional as F

CATEGORIES: List[str] = [
    "SQL Injection",
    "Command Injection",
    "Path Traversal",
    "Hardcoded Secret",
    "Weak Cryptography",
    "Insecure Deserialization",
    "Other / Unknown",
]

CATEGORY_TO_IDX: Dict[str, int] = {cat: i for i, cat in enumerate(CATEGORIES)}
IDX_TO_CATEGORY: Dict[int, str] = {i: cat for i, cat in enumerate(CATEGORIES)}

# Heuristic category impact weight (0.0 to 1.0) reflecting typical vulnerability criticality
CATEGORY_BASE_IMPACT: Dict[str, float] = {
    "SQL Injection": 0.90,
    "Command Injection": 0.95,
    "Path Traversal": 0.85,
    "Hardcoded Secret": 0.85,
    "Insecure Deserialization": 0.95,
    "Weak Cryptography": 0.70,
    "Other / Unknown": 0.45,
}

# Scanner severity scale weights
SEVERITY_SCALE: Dict[str, float] = {
    "critical": 1.00,
    "high": 0.80,
    "medium": 0.50,
    "low": 0.25,
}


class VulnerabilityClassifierNet(nn.Module):
    """Feedforward neural network for classifying vulnerabilities and estimating risk.

    Architecture:
        Input features (64)
        → Linear (64 -> 32)
        → ReLU
        → Dropout (0.2)
        → Linear (32 -> 7 classes)
        + Auxiliary Risk Head: Linear (32 -> 1) -> Sigmoid
    """

    def __init__(
        self,
        input_dim: int = 64,
        hidden_dim: int = 32,
        num_classes: int = len(CATEGORIES),
        dropout: float = 0.2,
    ):
        super().__init__()
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.num_classes = num_classes

        # Main representation layers
        self.fc1 = nn.Linear(input_dim, hidden_dim)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(p=dropout)

        # Classification head
        self.fc2 = nn.Linear(hidden_dim, num_classes)

        # Auxiliary risk scoring head (continuous 0.0 - 1.0 representation)
        self.risk_head = nn.Linear(hidden_dim, 1)

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """Forward pass.

        Args:
            x: Tensor of shape (batch_size, input_dim)

        Returns:
            logits: Tensor of shape (batch_size, num_classes)
            raw_risk: Tensor of shape (batch_size,) with values in [0.0, 1.0]
        """
        h = self.fc1(x)
        h_act = self.relu(h)
        h_drop = self.dropout(h_act)
        logits = self.fc2(h_drop)

        # Auxiliary risk estimate from latent activations (not dropped out during eval)
        risk_latent = self.relu(h)
        raw_risk = torch.sigmoid(self.risk_head(risk_latent)).squeeze(-1)

        return logits, raw_risk


def compute_composite_risk(
    predicted_category: str,
    confidence: float,
    model_risk_factor: float,
    scanner_severity: str = "medium",
) -> float:
    """Calculate an assistive composite risk score (0.0 - 1.0).

    IMPORTANT: This risk score is a deterministic assistive heuristic designed
    for pipeline finding prioritization. It is NOT a formally calibrated or
    actuarial CVSS security score.

    Formula:
        risk = 0.35 * severity_weight
             + 0.35 * category_impact
             + 0.30 * (confidence * model_risk_factor)
    """
    sev_weight = SEVERITY_SCALE.get(scanner_severity.lower(), 0.50)
    cat_impact = CATEGORY_BASE_IMPACT.get(predicted_category, 0.50)
    confidence_clamped = max(0.0, min(1.0, confidence))
    model_risk_clamped = max(0.0, min(1.0, model_risk_factor))

    composite = (
        0.35 * sev_weight
        + 0.35 * cat_impact
        + 0.30 * (confidence_clamped * model_risk_clamped)
    )
    return round(float(max(0.0, min(1.0, composite))), 2)
