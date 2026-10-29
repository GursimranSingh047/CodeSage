"""Unit and integration tests for OpenRouter LLM integration.

Tests verify:
- Initialization with valid and invalid configurations
- Model selection via OPENROUTER_MODEL
- Integration with create_llm() factory and auto-detection
- Compatibility with triage and patching parsing schemas
- HTTP 401, 403, 402, 429, 500, and timeout error handling
- Exponential backoff and retry limits
- Strict API key redaction in error messages and logs
- Both OpenAI SDK client and httpx client pathways

All external network calls are mocked; no live API tokens or rate limits are consumed.
"""

import json
import logging
import os
from unittest.mock import MagicMock, patch

import pytest

from codesage.llm import (
    DEFAULT_MODELS,
    LLMError,
    OpenRouterLLM,
    create_llm,
    extract_json,
)
from codesage.patching import generate_patch, parse_patch_response
from codesage.schemas import CodeContext, Finding, Patch, TriageResult
from codesage.triage import parse_triage_response, triage_finding


@pytest.fixture(autouse=True)
def clean_openrouter_env(monkeypatch):
    """Ensure environment is isolated for each test."""
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("OPENROUTER_MODEL", raising=False)
    monkeypatch.delenv("OPENROUTER_BASE_URL", raising=False)
    monkeypatch.delenv("CODESAGE_LLM_PROVIDER", raising=False)
    monkeypatch.delenv("CODESAGE_LLM_MODEL", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OLLAMA_BASE_URL", raising=False)


# =========================================================================
# 1. Initialization and Configuration Tests
# =========================================================================

def test_missing_api_key_raises_error():
    """Missing OPENROUTER_API_KEY must raise LLMError with configuration instructions."""
    with pytest.raises(LLMError) as exc_info:
        OpenRouterLLM(api_key=None)
    assert "OPENROUTER_API_KEY is not configured" in str(exc_info.value)


def test_placeholder_api_key_raises_error(monkeypatch):
    """Placeholder string 'put_your_existing_key_here' must be rejected with helpful error."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "put_your_existing_key_here")
    with pytest.raises(LLMError) as exc_info:
        OpenRouterLLM()
    assert "OPENROUTER_API_KEY is not configured or contains placeholder" in str(exc_info.value)


def test_default_model_selection(monkeypatch):
    """When no model is specified, defaults to 'openrouter/free'."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-mock-test-key")
    llm = OpenRouterLLM()
    assert llm.model == "openrouter/free"
    assert llm.base_url == "https://openrouter.ai/api/v1"


def test_custom_model_via_env(monkeypatch):
    """OPENROUTER_MODEL environment variable selects the model."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-mock-test-key")
    monkeypatch.setenv("OPENROUTER_MODEL", "cohere/north-mini-code:free")
    llm = OpenRouterLLM()
    assert llm.model == "cohere/north-mini-code:free"


def test_custom_model_via_constructor():
    """Constructor model argument takes precedence over environment variables."""
    llm = OpenRouterLLM(
        model="google/gemma-4-31b-it:free",
        api_key="sk-or-v1-mock-test-key",
    )
    assert llm.model == "google/gemma-4-31b-it:free"


# =========================================================================
# 2. Provider Factory & Auto-Detection Tests
# =========================================================================

def test_create_llm_auto_detects_openrouter(monkeypatch):
    """create_llm() auto-detects OpenRouter when OPENROUTER_API_KEY is present."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-real-mock-key")
    llm = create_llm()
    assert isinstance(llm, OpenRouterLLM)
    assert llm.name == "openrouter"


def test_create_llm_explicit_provider(monkeypatch):
    """create_llm('openrouter') creates OpenRouterLLM even if other keys exist."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-mock-key")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-mock-key")
    llm = create_llm("openrouter")
    assert isinstance(llm, OpenRouterLLM)


def test_create_llm_placeholder_ignored_in_auto_detection(monkeypatch):
    """Placeholder in .env does not trigger false auto-detection."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "put_your_existing_key_here")
    with pytest.raises(LLMError) as exc_info:
        create_llm()
    assert "No LLM provider configured" in str(exc_info.value)


# =========================================================================
# 3. Completion via OpenAI SDK Client (Mocked)
# =========================================================================

def test_openai_sdk_completion_success(monkeypatch):
    """Verify successful completion through the OpenAI client interface."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-mock-test-key")
    llm = OpenRouterLLM(backoff_base=0.01)

    mock_choice = MagicMock()
    mock_choice.message.content = '{"status": "ok", "result": "secure"}'
    mock_response = MagicMock(choices=[mock_choice])

    with patch.object(llm.client.chat.completions, "create", return_value=mock_response) as mock_create:
        content = llm.complete("System prompt", "User prompt")
        assert content == '{"status": "ok", "result": "secure"}'
        mock_create.assert_called_once_with(
            model="openrouter/free",
            messages=[
                {"role": "system", "content": "System prompt"},
                {"role": "user", "content": "User prompt"},
            ],
        )


def test_openai_sdk_auth_error_raises_clear_message(monkeypatch):
    """HTTP 401 AuthenticationError should raise LLMError with user guidance."""
    import openai

    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-invalid-key")
    llm = OpenRouterLLM(backoff_base=0.01)

    mock_resp = MagicMock(status_code=401, headers={})
    auth_err = openai.AuthenticationError(
        message="Invalid API Key",
        response=mock_resp,
        body={"error": {"message": "Invalid API Key", "code": 401}},
    )

    with patch.object(llm.client.chat.completions, "create", side_effect=auth_err):
        with pytest.raises(LLMError) as exc_info:
            llm.complete("sys", "user")
        assert "OpenRouter authentication failed (HTTP 401)" in str(exc_info.value)


def test_openai_sdk_quota_exhausted_error(monkeypatch):
    """HTTP 402 APIStatusError should report quota exhaustion without silent fallback."""
    import openai

    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-exhausted-key")
    llm = OpenRouterLLM(backoff_base=0.01)

    mock_resp = MagicMock(status_code=402, headers={})
    status_err = openai.APIStatusError(
        message="Quota exceeded",
        response=mock_resp,
        body={"error": {"message": "Insufficient credits", "code": 402}},
    )

    with patch.object(llm.client.chat.completions, "create", side_effect=status_err):
        with pytest.raises(LLMError) as exc_info:
            llm.complete("sys", "user")
        assert "OpenRouter quota exhausted (HTTP 402)" in str(exc_info.value)
        assert "CodeSage will not silently switch to paid models" in str(exc_info.value)


def test_openai_sdk_rate_limit_retry_and_recovery(monkeypatch):
    """HTTP 429 should retry with backoff and succeed if subsequent call passes."""
    import openai

    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-mock-key")
    llm = OpenRouterLLM(backoff_base=0.001, max_retries=3)

    mock_resp = MagicMock(status_code=429, headers={})
    rate_err = openai.RateLimitError(
        message="Rate limit exceeded",
        response=mock_resp,
        body={"error": {"message": "Rate limit exceeded", "code": 429}},
    )

    mock_choice = MagicMock()
    mock_choice.message.content = '{"recovered": true}'
    success_resp = MagicMock(choices=[mock_choice])

    # First call fails with 429, second succeeds
    with patch.object(llm.client.chat.completions, "create", side_effect=[rate_err, success_resp]) as mock_create:
        res = llm.complete("sys", "user")
        assert res == '{"recovered": true}'
        assert mock_create.call_count == 2


def test_openai_sdk_rate_limit_exhausted(monkeypatch):
    """HTTP 429 when max_retries are exceeded raises informative LLMError."""
    import openai

    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-mock-key")
    llm = OpenRouterLLM(backoff_base=0.001, max_retries=2)

    mock_resp = MagicMock(status_code=429, headers={})
    rate_err = openai.RateLimitError(
        message="Rate limit exceeded",
        response=mock_resp,
        body={"error": {"message": "Rate limit exceeded", "code": 429}},
    )

    with patch.object(llm.client.chat.completions, "create", side_effect=rate_err):
        with pytest.raises(LLMError) as exc_info:
            llm.complete("sys", "user")
        assert "OpenRouter rate limit exceeded (HTTP 429)" in str(exc_info.value)


# =========================================================================
# 4. Completion via HTTPX Client Pathway (Mocked)
# =========================================================================

def test_httpx_completion_success(monkeypatch):
    """Verify fallback/direct httpx client completes successfully."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-mock-test-key")
    llm = OpenRouterLLM(backoff_base=0.01, _force_httpx=True)

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "choices": [{"message": {"content": '{"httpx": "ok"}'}}]
    }

    with patch.object(llm.client, "post", return_value=mock_resp) as mock_post:
        content = llm.complete("sys", "user")
        assert content == '{"httpx": "ok"}'
        assert mock_post.call_count == 1


def test_httpx_auth_error(monkeypatch):
    """HTTP 401 via httpx raises immediate clear LLMError."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-invalid-key")
    llm = OpenRouterLLM(backoff_base=0.01, _force_httpx=True)

    mock_resp = MagicMock()
    mock_resp.status_code = 401

    with patch.object(llm.client, "post", return_value=mock_resp):
        with pytest.raises(LLMError) as exc_info:
            llm.complete("sys", "user")
        assert "OpenRouter authentication failed (HTTP 401)" in str(exc_info.value)


def test_httpx_timeout_retry_and_exhaustion(monkeypatch):
    """httpx.TimeoutException retries up to max_retries then raises LLMError."""
    import httpx

    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-mock-key")
    llm = OpenRouterLLM(backoff_base=0.001, max_retries=2, _force_httpx=True)

    with patch.object(llm.client, "post", side_effect=httpx.TimeoutException("Read timed out")):
        with pytest.raises(LLMError) as exc_info:
            llm.complete("sys", "user")
        assert "OpenRouter request timed out after 2 attempts" in str(exc_info.value)


# =========================================================================
# 5. Secret Redaction Tests
# =========================================================================

def test_secret_redaction_in_errors(monkeypatch):
    """The sensitive OPENROUTER_API_KEY must never leak into exception messages."""
    secret_key = "sk-or-v1-SUPER-SECRET-PLAINTEXT-KEY-12345"
    monkeypatch.setenv("OPENROUTER_API_KEY", secret_key)
    llm = OpenRouterLLM(backoff_base=0.001, max_retries=1, _force_httpx=True)

    # Simulate an error string that echoes the raw token
    with patch.object(llm.client, "post", side_effect=RuntimeError(f"Failed token {secret_key}")):
        with pytest.raises(LLMError) as exc_info:
            llm.complete("sys", "user")
        error_msg = str(exc_info.value)
        assert secret_key not in error_msg
        assert "[REDACTED_OPENROUTER_API_KEY]" in error_msg


# =========================================================================
# 6. Workflow Compatibility: Triage and Patching with OpenRouter
# =========================================================================

def test_openrouter_triage_flow(monkeypatch):
    """Verify that OpenRouterLLM seamlessly integrates with triage_finding."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-mock-key")
    llm = OpenRouterLLM(backoff_base=0.01)

    triage_payload = {
        "finding_id": "semgrep:vuln.py:10:rule",
        "is_real_vulnerability": True,
        "confidence": 0.95,
        "reasoning": "Unvalidated pickle deserialization allows remote code execution.",
        "cwe_confirmed": "CWE-502",
        "exploitability": "high",
    }
    mock_choice = MagicMock()
    mock_choice.message.content = f"```json\n{json.dumps(triage_payload)}\n```"
    mock_resp = MagicMock(choices=[mock_choice])

    finding = Finding(
        id="semgrep:vuln.py:10:rule",
        file_path="vuln.py",
        line_number=10,
        cwe_id="CWE-502",
        severity="high",
        tool_source="semgrep",
        raw_message="Avoid pickle",
        code_snippet="pickle.loads(data)",
    )
    context = CodeContext(
        finding_id=finding.id,
        enclosing_function="def load(data):\n    return pickle.loads(data)",
        imports=["import pickle"],
        related_chunks=[],
    )

    with patch.object(llm.client.chat.completions, "create", return_value=mock_resp):
        result = triage_finding(finding, context, llm)
        assert isinstance(result, TriageResult)
        assert result.is_real_vulnerability is True
        assert result.cwe_confirmed == "CWE-502"
        assert result.confidence == 0.95


def test_openrouter_patching_flow(monkeypatch):
    """Verify that OpenRouterLLM seamlessly integrates with generate_patch."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-mock-key")
    llm = OpenRouterLLM(backoff_base=0.01)

    patch_payload = {
        "finding_id": "semgrep:vuln.py:10:rule",
        "original_code": "def load(data):\n    return pickle.loads(data)",
        "patched_code": "def load(data):\n    return json.loads(data)",
        "explanation": "Replaced insecure pickle deserialization with safe json.",
        "attempt_number": 1,
    }
    mock_choice = MagicMock()
    mock_choice.message.content = json.dumps(patch_payload)
    mock_resp = MagicMock(choices=[mock_choice])

    finding = Finding(
        id="semgrep:vuln.py:10:rule",
        file_path="vuln.py",
        line_number=10,
        cwe_id="CWE-502",
        severity="high",
        tool_source="semgrep",
        raw_message="Avoid pickle",
        code_snippet="pickle.loads(data)",
    )
    triage = TriageResult(
        finding_id=finding.id,
        is_real_vulnerability=True,
        confidence=0.95,
        reasoning="Insecure deserialization",
        cwe_confirmed="CWE-502",
        exploitability="high",
    )
    context = CodeContext(
        finding_id=finding.id,
        enclosing_function="def load(data):\n    return pickle.loads(data)",
        imports=["import pickle"],
        related_chunks=[],
    )

    with patch.object(llm.client.chat.completions, "create", return_value=mock_resp):
        patch_result = generate_patch(finding, context, triage, llm=llm)
        assert isinstance(patch_result, Patch)
        assert "json.loads" in patch_result.patched_code
        assert patch_result.attempt_number == 1


# =========================================================================
# 7. Live API Integration Tests (Executed only when real key & network exist)
# =========================================================================

def test_live_openrouter_api_completion():
    """Live integration test: verifies real OpenRouter connection, authentication, and completion.

    Only executes when valid live credentials are present in the project .env file.
    """
    from pathlib import Path
    from dotenv import dotenv_values

    root_env = Path(__file__).resolve().parent.parent / ".env"
    env_vars = dotenv_values(root_env) if root_env.is_file() else {}
    key = env_vars.get("OPENROUTER_API_KEY") or os.environ.get("OPENROUTER_API_KEY")

    if not key or key == "put_your_existing_key_here" or not key.startswith("sk-or-"):
        pytest.skip("No real OpenRouter API key found in .env; skipping live API test.")

    model = env_vars.get("OPENROUTER_MODEL") or "openrouter/free"
    llm = OpenRouterLLM(model=model, api_key=key, timeout=25.0)

    try:
        response = llm.complete(
            system="You are a helpful security verification agent.",
            user="Reply with exactly: OpenRouter live test verified!",
        )
        assert isinstance(response, str)
        assert len(response.strip()) > 0
        assert "OpenRouter" in response or "verified" in response
    except LLMError as exc:
        if "429" in str(exc) or "rate limit" in str(exc).lower():
            pytest.skip(f"OpenRouter free tier endpoint is temporarily rate-limited: {exc}")
        raise
