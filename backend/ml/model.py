"""Backend ML model module mirroring codesage.ml.model."""

from codesage.ml.model import (
    CATEGORIES,
    CATEGORY_BASE_IMPACT,
    CATEGORY_TO_IDX,
    IDX_TO_CATEGORY,
    SEVERITY_SCALE,
    VulnerabilityClassifierNet,
    compute_composite_risk,
)

__all__ = [
    "CATEGORIES",
    "CATEGORY_TO_IDX",
    "IDX_TO_CATEGORY",
    "CATEGORY_BASE_IMPACT",
    "SEVERITY_SCALE",
    "VulnerabilityClassifierNet",
    "compute_composite_risk",
]
