"""Backend ML training module mirroring codesage.ml.training."""

import sys
from pathlib import Path

# Ensure repository root is on sys.path
_root = Path(__file__).resolve().parent.parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from codesage.ml.training import build_training_dataset, main, train_model

__all__ = ["build_training_dataset", "train_model", "main"]

if __name__ == "__main__":
    main()
