import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s %(name)s: %(message)s",
)
from codesage.metrics import main

sys.exit(main([
    "test-target-repo",
    "--mock",
    "--output", "diagnostics/diag_report.md",
]))
