"""Backend ML namespace mirroring codesage.ml."""

from codesage.ml import (
    CATEGORIES,
    CATEGORY_TO_IDX,
    FEATURE_DIM,
    IDX_TO_CATEGORY,
    VulnerabilityClassifier,
    VulnerabilityClassifierNet,
    compute_composite_risk,
    extract_features,
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
