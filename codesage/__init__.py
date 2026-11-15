"""CodeSage — AI agent for automated security vulnerability detection and fix."""

try:
    from pathlib import Path
    from dotenv import load_dotenv

    _root_env = Path(__file__).resolve().parent.parent / ".env"
    if _root_env.is_file():
        load_dotenv(_root_env, override=True)
    else:
        load_dotenv(override=True)
except ImportError:
    pass


from codesage.schemas import Finding

__version__ = "0.2.0"

__all__ = ["Finding"]

