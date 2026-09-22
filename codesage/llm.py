"""LLM provider layer for CodeSage (architecture.md 2.6).

Supports Anthropic, OpenAI and a local Ollama fallback, selected via
CODESAGE_LLM_PROVIDER or auto-detected from environment keys. All providers
implement `complete(system, user) -> str`; structured-output validation
happens in the calling agent (triage/patch), not here.

A MockLLM is provided for deterministic unit tests.
"""

import json
import logging
import os
import re
import urllib.request
from pathlib import Path
from typing import Callable, Optional

logger = logging.getLogger(__name__)

DEFAULT_MODELS = {
    "anthropic": "claude-3-5-haiku-latest",
    "openai": "gpt-4o-mini",
    "ollama": "deepseek-coder",  # design.md 2.6 local fallback
}


class LLMError(RuntimeError):
    """Raised when no provider is configured or a completion fails."""


def extract_json(text: str) -> dict:
    """Pull the first JSON object out of an LLM response (fences tolerated)."""
    text = text.strip()
    candidates = [text]
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fenced:
        candidates.insert(0, fenced.group(1).strip())
    braces = re.search(r"\{.*\}", text, re.DOTALL)
    if braces:
        candidates.append(braces.group(0))
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    raise ValueError(f"no JSON object found in response: {text[:200]!r}")


class BaseLLM:
    name = "base"

    def complete(self, system: str, user: str) -> str:  # pragma: no cover
        raise NotImplementedError


class AnthropicLLM(BaseLLM):
    name = "anthropic"

    def __init__(self, model: Optional[str] = None):
        try:
            import anthropic  # lazy: only needed when a key is configured
        except ImportError as exc:
            raise LLMError("pip install anthropic") from exc
        self.model = model or os.environ.get("CODESAGE_LLM_MODEL", DEFAULT_MODELS["anthropic"])
        self.client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY

    def complete(self, system: str, user: str) -> str:
        response = self.client.messages.create(
            model=self.model,
            max_tokens=1024,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return "".join(block.text for block in response.content if block.type == "text")


class OpenAILLM(BaseLLM):
    name = "openai"

    def __init__(self, model: Optional[str] = None):
        try:
            import openai  # lazy
        except ImportError as exc:
            raise LLMError("pip install openai") from exc
        self.model = model or os.environ.get("CODESAGE_LLM_MODEL", DEFAULT_MODELS["openai"])
        self.client = openai.OpenAI()  # reads OPENAI_API_KEY

    def complete(self, system: str, user: str) -> str:
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        return response.choices[0].message.content or ""


class OllamaLLM(BaseLLM):
    """Local fallback (design.md 2.6): Ollama + DeepSeek-Coder."""

    name = "ollama"

    def __init__(self, model: Optional[str] = None, base_url: Optional[str] = None):
        self.model = model or os.environ.get("CODESAGE_LLM_MODEL", DEFAULT_MODELS["ollama"])
        self.base_url = (
            base_url or os.environ.get("OLLAMA_BASE_URL") or "http://localhost:11434"
        ).rstrip("/")

    def complete(self, system: str, user: str) -> str:
        payload = json.dumps(
            {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "format": "json",  # ollama's constrained JSON mode
                "stream": False,
            }
        ).encode()
        request = urllib.request.Request(
            f"{self.base_url}/api/chat",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                body = json.loads(response.read())
        except Exception as exc:
            raise LLMError(f"Ollama call failed: {exc}") from exc
        return body.get("message", {}).get("content", "")


class MockLLM(BaseLLM):
    """Deterministic offline provider for unit tests.

    `responder` receives (system, user) and returns the raw completion text;
    every call is recorded in `calls` so tests can assert retry behaviour.
    """

    name = "mock"

    def __init__(self, responder: Callable[[str, str], str]):
        self.responder = responder
        self.calls: list[tuple[str, str]] = []

    def complete(self, system: str, user: str) -> str:
        self.calls.append((system, user))
        return self.responder(system, user)


def create_llm(provider: Optional[str] = None) -> BaseLLM:
    """Build the configured provider, or raise LLMError with setup guidance."""
    provider = (provider or os.environ.get("CODESAGE_LLM_PROVIDER") or "").strip().lower()

    if provider == "mock":
        return MockLLM(responder=lambda s, u: "{}")
    if provider == "anthropic" or (not provider and os.environ.get("ANTHROPIC_API_KEY")):
        return AnthropicLLM()
    if provider == "openai" or (not provider and os.environ.get("OPENAI_API_KEY")):
        return OpenAILLM()
    if provider == "ollama" or (not provider and os.environ.get("OLLAMA_BASE_URL")):
        return OllamaLLM()

    raise LLMError(
        "No LLM provider configured. Set one of:\n"
        "  ANTHROPIC_API_KEY=<key>            (Claude, recommended)\n"
        "  OPENAI_API_KEY=<key>               (GPT-4)\n"
        "  OLLAMA_BASE_URL=http://localhost:11434  (local DeepSeek-Coder fallback)\n"
        "Optionally CODESAGE_LLM_PROVIDER=anthropic|openai|ollama and "
        "CODESAGE_LLM_MODEL=<model>."
    )
