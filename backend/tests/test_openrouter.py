import json
from fastapi.testclient import TestClient
import httpx
import pytest

from app.core.config import get_settings
from app.core.errors import SummarizationError
from app.main import app
from app.services.summarizer import (
    OpenRouterSummarizerProvider,
    get_summarizer_provider,
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_overrides_and_cache():
    yield
    app.dependency_overrides.clear()
    get_settings.cache_clear()


def make_mock_client(
    status_code: int = 200,
    json_data: dict | None = None,
    raw_text: str | None = None,
    exception: Exception | None = None,
) -> httpx.Client:
    def handler(request: httpx.Request) -> httpx.Response:
        if exception is not None:
            raise exception
        if raw_text is not None:
            return httpx.Response(status_code=status_code, text=raw_text)
        data = json_data if json_data is not None else {
            "choices": [{"message": {"content": "This is a concise summary."}}]
        }
        return httpx.Response(status_code=status_code, json=data)

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_openrouter_provider_success() -> None:
    mock_client = make_mock_client(
        status_code=200,
        json_data={"choices": [{"message": {"content": "Concise summary generated."}}]},
    )
    provider = OpenRouterSummarizerProvider(
        api_key="test-key",
        model="minimax/minimax-m3.1-flash:free",
        client=mock_client,
    )

    result = provider.summarize("Original long note content.")
    assert result == "Concise summary generated."
    assert provider.provider_name == "openrouter"
    assert provider.model_name == "minimax/minimax-m3.1-flash:free"


def test_openrouter_provider_missing_key() -> None:
    provider = OpenRouterSummarizerProvider(api_key="", client=make_mock_client())
    with pytest.raises(SummarizationError, match="OpenRouter API key is not configured"):
        provider.summarize("Some text")


def test_openrouter_provider_http_401() -> None:
    mock_client = make_mock_client(
        status_code=401,
        json_data={"error": {"message": "Invalid API key"}},
    )
    provider = OpenRouterSummarizerProvider(api_key="invalid-key", client=mock_client)
    with pytest.raises(SummarizationError, match="OpenRouter returned an error status"):
        provider.summarize("Some text")


def test_openrouter_provider_http_429_rate_limit() -> None:
    mock_client = make_mock_client(
        status_code=429,
        json_data={"error": {"message": "Rate limit exceeded"}},
    )
    provider = OpenRouterSummarizerProvider(api_key="valid-key", client=mock_client)
    with pytest.raises(SummarizationError, match="OpenRouter returned an error status"):
        provider.summarize("Some text")


def test_openrouter_provider_http_500() -> None:
    mock_client = make_mock_client(
        status_code=500,
        json_data={"error": {"message": "Internal server error"}},
    )
    provider = OpenRouterSummarizerProvider(api_key="valid-key", client=mock_client)
    with pytest.raises(SummarizationError, match="OpenRouter returned an error status"):
        provider.summarize("Some text")


def test_openrouter_provider_timeout() -> None:
    mock_client = make_mock_client(exception=httpx.ReadTimeout("Connection timed out"))
    provider = OpenRouterSummarizerProvider(api_key="valid-key", client=mock_client)
    with pytest.raises(SummarizationError, match="OpenRouter request timed out"):
        provider.summarize("Some text")


def test_openrouter_provider_network_error() -> None:
    mock_client = make_mock_client(exception=httpx.ConnectError("Network unreachable"))
    provider = OpenRouterSummarizerProvider(api_key="valid-key", client=mock_client)
    with pytest.raises(SummarizationError, match="OpenRouter request failed"):
        provider.summarize("Some text")


def test_openrouter_provider_malformed_json() -> None:
    mock_client = make_mock_client(status_code=200, raw_text="not-valid-json")
    provider = OpenRouterSummarizerProvider(api_key="valid-key", client=mock_client)
    with pytest.raises(SummarizationError, match="Invalid response from OpenRouter"):
        provider.summarize("Some text")


def test_openrouter_provider_missing_choices() -> None:
    mock_client = make_mock_client(status_code=200, json_data={"choices": []})
    provider = OpenRouterSummarizerProvider(api_key="valid-key", client=mock_client)
    with pytest.raises(SummarizationError, match="Invalid response structure"):
        provider.summarize("Some text")


def test_openrouter_provider_empty_content() -> None:
    mock_client = make_mock_client(
        status_code=200,
        json_data={"choices": [{"message": {"content": "   "}}]},
    )
    provider = OpenRouterSummarizerProvider(api_key="valid-key", client=mock_client)
    with pytest.raises(SummarizationError, match="Empty summary received"):
        provider.summarize("Some text")


def test_openrouter_integration_via_api_route() -> None:
    mock_client = make_mock_client(
        status_code=200,
        json_data={"choices": [{"message": {"content": "Integration summary test."}}]},
    )
    provider = OpenRouterSummarizerProvider(
        api_key="test-key",
        model="minimax/minimax-m3.1-flash:free",
        client=mock_client,
    )
    app.dependency_overrides[get_summarizer_provider] = lambda: provider

    response = client.post(
        "/api/v1/summarize",
        json={"text": "Text to summarize via OpenRouter provider."},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "openrouter"
    assert body["model"] == "minimax/minimax-m3.1-flash:free"
    assert body["summary"] == "Integration summary test."


def test_openrouter_integration_api_route_failure_maps_to_502() -> None:
    mock_client = make_mock_client(status_code=429)
    provider = OpenRouterSummarizerProvider(api_key="test-key", client=mock_client)
    app.dependency_overrides[get_summarizer_provider] = lambda: provider

    response = client.post(
        "/api/v1/summarize",
        json={"text": "Text triggering failure."},
    )

    assert response.status_code == 502
    assert response.json() == {
        "error": {
            "code": "provider_error",
            "message": "Summarization provider failed.",
        }
    }


def test_get_summarizer_provider_factory(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUMMARIZER_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "dummy-key")
    monkeypatch.setenv("OPENROUTER_MODEL", "minimax/minimax-m3.1-flash:free")
    get_settings.cache_clear()

    active_provider = get_summarizer_provider()
    assert isinstance(active_provider, OpenRouterSummarizerProvider)
    assert active_provider.provider_name == "openrouter"
    assert active_provider.model_name == "minimax/minimax-m3.1-flash:free"
