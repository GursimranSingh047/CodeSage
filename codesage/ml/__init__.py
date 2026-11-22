"""CodeSage ML module for vulnerability classification and risk scoring."""

from codesage.ml.classifier import VulnerabilityClassifier
from codesage.ml.features import FEATURE_DIM, extract_features
from codesage.ml.model import (
    CATEGORIES,
    CATEGORY_TO_IDX,
    IDX_TO_CATEGORY,
    VulnerabilityClassifierNet,
    compute_composite_risk,
)

__all__ = [
    "VulnerabilityClassifier",
    "extract_features",
    "FEATURE_DIM",
    "VulnerabilityClassifierNet",
    "CATEGORIES",
    "CATEGORY_TO_IDX",
    "IDX_TO_CATEGORY",
    "compute_composite_risk",
]
