"""LLM provider layer for CodeSage (architecture.md 2.6).

Supports OpenRouter, Anthropic, OpenAI, and a local Ollama fallback, selected via
CODESAGE_LLM_PROVIDER or auto-detected from environment keys. All providers
implement `complete(system, user) -> str`; structured-output validation
happens in the calling agent (triage/patch), not here.

A MockLLM is provided for deterministic unit tests.
"""

import json
import logging
import os
import re
import time
import urllib.request
from pathlib import Path
from typing import Callable, Optional

try:
    from dotenv import load_dotenv

    _root_env = Path(__file__).resolve().parent.parent / ".env"
    if _root_env.is_file():
        load_dotenv(_root_env)
    else:
        load_dotenv()
except ImportError:
    pass


logger = logging.getLogger(__name__)

DEFAULT_MODELS = {
    "openrouter": "openrouter/free",
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


class OpenRouterLLM(BaseLLM):
    """OpenRouter provider with free-model auto-routing and OpenAI SDK compatibility.

    Uses OPENROUTER_API_KEY and OPENROUTER_MODEL (defaults to 'openrouter/free').
    Supports both openai SDK client and direct httpx client fallback.
    Implements bounded retries with exponential backoff on HTTP 429 and 5xx errors,
    immediate clear errors on HTTP 401/403 (invalid key) and HTTP 402 (quota exhausted),
    and strictly redacts the API key from all logs and error messages.
    """

    name = "openrouter"

    def __init__(
        self,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 60.0,
        max_retries: int = 3,
        backoff_base: float = 1.0,
        _force_httpx: bool = False,
    ):
        self.api_key = (
            api_key or os.environ.get("OPENROUTER_API_KEY") or ""
        ).strip()
        if not self.api_key or self.api_key == "put_your_existing_key_here":
            raise LLMError(
                "OPENROUTER_API_KEY is not configured or contains placeholder. "
                "Please set your OpenRouter API key in the root .env file or environment variable."
            )

        self.model = (
            model
            or os.environ.get("OPENROUTER_MODEL")
            or os.environ.get("CODESAGE_LLM_MODEL")
            or DEFAULT_MODELS["openrouter"]
        ).strip()

        self.base_url = (
            base_url
            or os.environ.get("OPENROUTER_BASE_URL")
            or "https://openrouter.ai/api/v1"
        ).rstrip("/")

        self.timeout = timeout
        self.max_retries = max_retries
        self.backoff_base = backoff_base
        self._force_httpx = _force_httpx

        self._init_client()

    def _init_client(self) -> None:
        if not self._force_httpx:
            try:
                import openai
                self._use_openai = True
                self.client = openai.OpenAI(
                    base_url=self.base_url,
                    api_key=self.api_key,
                    timeout=self.timeout,
                    default_headers={
                        "HTTP-Referer": "https://github.com/codesage/codesage",
                        "X-Title": "CodeSage Security Agent",
                    },
                )
                return
            except ImportError:
                pass

        self._use_openai = False
        try:
            import httpx
            self.client = httpx.Client(
                base_url=self.base_url,
                timeout=self.timeout,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://github.com/codesage/codesage",
                    "X-Title": "CodeSage Security Agent",
                },
            )
        except ImportError as exc:
            raise LLMError("Neither openai nor httpx is installed for OpenRouter client.") from exc

    def _redact(self, text: str) -> str:
        if self.api_key and self.api_key in text:
            return text.replace(self.api_key, "[REDACTED_OPENROUTER_API_KEY]")
        return text

    def complete(self, system: str, user: str) -> str:
        if self._use_openai:
            return self._complete_openai(system, user)
        return self._complete_httpx(system, user)

    def _complete_openai(self, system: str, user: str) -> str:
        import openai

        last_error = None
        for attempt in range(1, self.max_retries + 1):
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                )
                if not response.choices or not response.choices[0].message:
                    raise LLMError("OpenRouter returned empty choices in completion response.")
                content = response.choices[0].message.content or ""
                return content
            except openai.AuthenticationError:
                raise LLMError(
                    "OpenRouter authentication failed (HTTP 401). "
                    "Please verify your OPENROUTER_API_KEY in .env."
                ) from None
            except openai.PermissionDeniedError:
                raise LLMError(
                    "OpenRouter permission denied (HTTP 403). "
                    "Your API key does not have permission to access the requested model or endpoint."
                ) from None
            except openai.RateLimitError as exc:
                last_error = exc
                if attempt < self.max_retries:
                    wait_time = self.backoff_base * (2 ** (attempt - 1))
                    logger.warning(
                        "OpenRouter rate limit (429) on attempt %d/%d. Waiting %.1fs...",
                        attempt, self.max_retries, wait_time,
                    )
                    time.sleep(wait_time)
                else:
                    raise LLMError(
                        f"OpenRouter rate limit exceeded (HTTP 429) after {self.max_retries} attempts. "
                        f"The free model '{self.model}' is currently rate-limited. Please wait or choose another model."
                    ) from None
            except openai.APITimeoutError as exc:
                last_error = exc
                if attempt < self.max_retries:
                    wait_time = self.backoff_base * (2 ** (attempt - 1))
                    logger.warning(
                        "OpenRouter timeout on attempt %d/%d. Waiting %.1fs...",
                        attempt, self.max_retries, wait_time,
                    )
                    time.sleep(wait_time)
                else:
                    raise LLMError(
                        f"OpenRouter request timed out after {self.max_retries} attempts."
                    ) from None
            except openai.APIStatusError as exc:
                if exc.status_code == 402:
                    raise LLMError(
                        "OpenRouter quota exhausted (HTTP 402). "
                        "Your account has no credits remaining or the free model has reached quota limits. "
                        "CodeSage will not silently switch to paid models."
                    ) from None
                last_error = exc
                if exc.status_code and exc.status_code >= 500 and attempt < self.max_retries:
                    wait_time = self.backoff_base * (2 ** (attempt - 1))
                    logger.warning(
                        "OpenRouter server error (HTTP %d) on attempt %d/%d. Waiting %.1fs...",
                        exc.status_code, attempt, self.max_retries, wait_time,
                    )
                    time.sleep(wait_time)
                else:
                    safe_msg = self._redact(str(exc))
                    raise LLMError(f"OpenRouter API error (HTTP {exc.status_code}): {safe_msg}") from None
            except LLMError:
                raise
            except Exception as exc:
                safe_msg = self._redact(str(exc))
                raise LLMError(f"OpenRouter completion failed: {safe_msg}") from None

        safe_msg = self._redact(str(last_error)) if last_error else "unknown error"
        raise LLMError(f"OpenRouter completion failed after {self.max_retries} retries: {safe_msg}")

    def _complete_httpx(self, system: str, user: str) -> str:
        import httpx

        url = f"{self.base_url}/chat/completions"
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }

        last_error = None
        for attempt in range(1, self.max_retries + 1):
            try:
                resp = self.client.post(
                    url,
                    json=payload,
                )
                if resp.status_code == 401:
                    raise LLMError(
                        "OpenRouter authentication failed (HTTP 401). "
                        "Please verify your OPENROUTER_API_KEY in .env."
                    )
                if resp.status_code == 403:
                    raise LLMError(
                        "OpenRouter permission denied (HTTP 403). "
                        "Your API key does not have permission to access the requested model or endpoint."
                    )
                if resp.status_code == 402:
                    raise LLMError(
                        "OpenRouter quota exhausted (HTTP 402). "
                        "Your account has no credits remaining or the free model has reached quota limits. "
                        "CodeSage will not silently switch to paid models."
                    )
                if resp.status_code == 429:
                    if attempt < self.max_retries:
                        wait_time = self.backoff_base * (2 ** (attempt - 1))
                        logger.warning(
                            "OpenRouter rate limit (429) on attempt %d/%d. Waiting %.1fs...",
                            attempt, self.max_retries, wait_time,
                        )
                        time.sleep(wait_time)
                        continue
                    else:
                        raise LLMError(
                            f"OpenRouter rate limit exceeded (HTTP 429) after {self.max_retries} attempts. "
                            f"The free model '{self.model}' is currently rate-limited. Please wait or choose another model."
                        )
                if resp.status_code >= 500:
                    if attempt < self.max_retries:
                        wait_time = self.backoff_base * (2 ** (attempt - 1))
                        logger.warning(
                            "OpenRouter server error (%d) on attempt %d/%d. Waiting %.1fs...",
                            resp.status_code, attempt, self.max_retries, wait_time,
                        )
                        time.sleep(wait_time)
                        continue
                    else:
                        raise LLMError(
                            f"OpenRouter server error (HTTP {resp.status_code}) after {self.max_retries} attempts."
                        )

                resp.raise_for_status()
                data = resp.json()
                choices = data.get("choices", [])
                if not choices:
                    raise LLMError(f"OpenRouter response contained no choices: {data}")
                content = choices[0].get("message", {}).get("content", "")
                return content
            except httpx.TimeoutException as exc:
                last_error = exc
                if attempt < self.max_retries:
                    wait_time = self.backoff_base * (2 ** (attempt - 1))
                    logger.warning(
                        "OpenRouter timeout on attempt %d/%d. Waiting %.1fs...",
                        attempt, self.max_retries, wait_time,
                    )
                    time.sleep(wait_time)
                else:
                    raise LLMError(
                        f"OpenRouter request timed out after {self.max_retries} attempts."
                    ) from None
            except LLMError:
                raise
            except Exception as exc:
                safe_msg = self._redact(str(exc))
                raise LLMError(f"OpenRouter completion failed: {safe_msg}") from None

        safe_msg = self._redact(str(last_error)) if last_error else "unknown error"
        raise LLMError(f"OpenRouter completion failed after {self.max_retries} retries: {safe_msg}")


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
    if provider == "openrouter" or (
        not provider
        and os.environ.get("OPENROUTER_API_KEY")
        and os.environ.get("OPENROUTER_API_KEY") != "put_your_existing_key_here"
    ):
        return OpenRouterLLM()
    if provider == "anthropic" or (not provider and os.environ.get("ANTHROPIC_API_KEY")):
        return AnthropicLLM()
    if provider == "openai" or (not provider and os.environ.get("OPENAI_API_KEY")):
        return OpenAILLM()
    if provider == "ollama" or (not provider and os.environ.get("OLLAMA_BASE_URL")):
        return OllamaLLM()

    raise LLMError(
        "No LLM provider configured. Set one of:\n"
        "  OPENROUTER_API_KEY=<key>            (OpenRouter, supports free/custom models)\n"
        "  ANTHROPIC_API_KEY=<key>            (Claude, recommended)\n"
        "  OPENAI_API_KEY=<key>               (GPT-4)\n"
        "  OLLAMA_BASE_URL=http://localhost:11434  (local DeepSeek-Coder fallback)\n"
        "Optionally CODESAGE_LLM_PROVIDER=openrouter|anthropic|openai|ollama and "
        "OPENROUTER_MODEL=<model> or CODESAGE_LLM_MODEL=<model>."
    )


__all__ = [
    "BaseLLM",
    "OpenRouterLLM",
    "AnthropicLLM",
    "OpenAILLM",
    "OllamaLLM",
    "MockLLM",
    "create_llm",
    "extract_json",
    "LLMError",
    "DEFAULT_MODELS",
]
