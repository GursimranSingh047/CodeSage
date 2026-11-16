import os
import sys

# Ensure the app package root is importable when pytest is invoked from here.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
