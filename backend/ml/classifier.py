"""Backend ML classifier module mirroring codesage.ml.classifier."""

from codesage.ml.classifier import (
    CONFIDENCE_THRESHOLD,
    DEFAULT_MODEL_FILENAME,
    VulnerabilityClassifier,
)

__all__ = [
    "VulnerabilityClassifier",
    "CONFIDENCE_THRESHOLD",
    "DEFAULT_MODEL_FILENAME",
]
