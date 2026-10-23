from abc import ABC, abstractmethod
import logging

import httpx

from app.core.config import get_settings
from app.core.errors import SummarizationError
from app.schemas.summarize import SummarizeRequest, SummarizeResponse

logger = logging.getLogger(__name__)


class SummarizerProvider(ABC):
    """Abstract interface for text summarization providers."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Name of the provider (e.g., 'mock', 'openrouter')."""
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Name of the model (e.g., 'mock-deterministic', 'minimax/minimax-m3.1-flash:free')."""
        pass

    @abstractmethod
    def summarize(self, text: str) -> str:
        """Produce a summary of the input text.

        Raises:
            SummarizationError: When provider execution fails.
        """
        pass


class MockSummarizerProvider(SummarizerProvider):
    """Deterministic test mock for the summarization interface.

    NOTE: This is a deterministic mock provider designed solely for testing
    API contracts, schema validation, and pipeline mechanics. It generates
    a deterministic excerpt from the input text and does not claim to perform
    genuine artificial intelligence summarization.
    """

    def __init__(
        self,
        should_fail: bool = False,
        return_invalid: bool = False,
    ) -> None:
        self._should_fail = should_fail
        self._return_invalid = return_invalid

    @property
    def provider_name(self) -> str:
        return "mock"

    @property
    def model_name(self) -> str:
        return "mock-deterministic"

    def summarize(self, text: str) -> str:
        if self._should_fail:
            raise SummarizationError("Simulated upstream provider failure.")
        if self._return_invalid:
            return "   "

        # Deterministic excerpt: take the first sentence or up to 120 characters
        first_line = text.split("\n", 1)[0].strip()
        period_idx = first_line.find(". ")
        if period_idx != -1:
            excerpt = first_line[: period_idx + 1]
        else:
            excerpt = first_line[:120].strip()

        return f"[Mock Summary] {excerpt}"


class OpenRouterSummarizerProvider(SummarizerProvider):
    """Summarization provider using OpenRouter's hosted REST API."""

    def __init__(
        self,
        api_key: str,
        model: str = "minimax/minimax-m3.1-flash:free",
        base_url: str = "https://openrouter.ai/api/v1",
        timeout: float = 30.0,
        client: httpx.Client | None = None,
    ) -> None:
        self._api_key = api_key
        self._model = model
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._client = client

    @property
    def provider_name(self) -> str:
        return "openrouter"

    @property
    def model_name(self) -> str:
        return self._model

    def summarize(self, text: str) -> str:
        if not self._api_key:
            logger.error("OpenRouter summarization requested without an API key configured.")
            raise SummarizationError("OpenRouter API key is not configured.")

        endpoint = f"{self._base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/MEMOIR",
            "X-Title": "MEMOIR Note Summarizer",
        }
        payload = {
            "model": self._model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a concise summarizer for personal notes and captures. "
                        "Provide a clear, accurate, and concise summary of the text provided. "
                        "Return only the summary text without commentary or preamble."
                    ),
                },
                {"role": "user", "content": text},
            ],
        }

        try:
            if self._client is not None:
                resp = self._client.post(
                    endpoint, json=payload, headers=headers, timeout=self._timeout
                )
            else:
                with httpx.Client(timeout=self._timeout) as client:
                    resp = client.post(endpoint, json=payload, headers=headers)
        except httpx.TimeoutException:
            logger.error("OpenRouter request timed out.")
            raise SummarizationError("OpenRouter request timed out.")
        except httpx.RequestError:
            logger.error("OpenRouter network request failed.")
            raise SummarizationError("OpenRouter request failed.")

        if resp.status_code != 200:
            logger.error("OpenRouter request failed with HTTP status %s.", resp.status_code)
            raise SummarizationError("OpenRouter returned an error status.")

        try:
            data = resp.json()
        except Exception:
            logger.error("OpenRouter response was not valid JSON.")
            raise SummarizationError("Invalid response from OpenRouter.")

        choices = data.get("choices")
        if not choices or not isinstance(choices, list):
            logger.error("OpenRouter response missing valid choices list.")
            raise SummarizationError("Invalid response structure from OpenRouter.")

        message = choices[0].get("message")
        if not message or not isinstance(message, dict):
            logger.error("OpenRouter response missing valid message object.")
            raise SummarizationError("Invalid response structure from OpenRouter.")

        content = message.get("content")
        if not content or not isinstance(content, str) or not content.strip():
            logger.error("OpenRouter response contains empty content.")
            raise SummarizationError("Empty summary received from OpenRouter.")

        return content.strip()


def get_summarizer_provider() -> SummarizerProvider:
    """FastAPI dependency for obtaining the active summarization provider.

    In tests, override this dependency via `app.dependency_overrides[get_summarizer_provider]`.
    """
    settings = get_settings()
    if settings.summarizer_provider == "openrouter":
        return OpenRouterSummarizerProvider(
            api_key=settings.openrouter_api_key,
            model=settings.openrouter_model,
            base_url=settings.openrouter_base_url,
            timeout=settings.openrouter_timeout_seconds,
        )
    return MockSummarizerProvider()


def generate_summary(
    payload: SummarizeRequest, provider: SummarizerProvider
) -> SummarizeResponse:
    """Generate and validate a summary using the given provider.

    Validates provider output and treats empty or invalid output as a
    provider failure, raising `SummarizationError`.
    """
    try:
        raw_summary = provider.summarize(payload.text)
    except SummarizationError:
        raise
    except Exception as exc:
        raise SummarizationError("Provider execution failed unexpectedly.") from exc

    if not isinstance(raw_summary, str) or not raw_summary.strip():
        raise SummarizationError("Provider returned empty or invalid summary output.")

    return SummarizeResponse(
        summary=raw_summary.strip(),
        provider=provider.provider_name,
        model=provider.model_name,
    )
