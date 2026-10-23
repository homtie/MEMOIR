from fastapi.testclient import TestClient
import pytest

from app.main import app
from app.services.summarizer import (
    MockSummarizerProvider,
    SummarizerProvider,
    get_summarizer_provider,
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_dependency_overrides():
    """Ensure dependency overrides are cleaned up after each test."""
    yield
    app.dependency_overrides.clear()


def test_summarize_success_with_default_mock_provider() -> None:
    response = client.post(
        "/api/v1/summarize",
        json={"text": "Antigravity helps developers build robust software systems."},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "mock"
    assert body["model"] == "mock-deterministic"
    assert body["summary"].startswith("[Mock Summary]")
    assert "Antigravity helps developers build robust software systems." in body["summary"]


def test_summarize_trims_surrounding_whitespace() -> None:
    response = client.post(
        "/api/v1/summarize",
        json={"text": "   Surrounding whitespace should be trimmed cleanly.   "},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["summary"] == "[Mock Summary] Surrounding whitespace should be trimmed cleanly."


def test_summarize_rejects_missing_text() -> None:
    response = client.post("/api/v1/summarize", json={})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_summarize_rejects_blank_text() -> None:
    response = client.post("/api/v1/summarize", json={"text": " \n\t "})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_summarize_rejects_empty_string() -> None:
    response = client.post("/api/v1/summarize", json={"text": ""})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_summarize_rejects_extra_fields() -> None:
    response = client.post(
        "/api/v1/summarize",
        json={"text": "Valid text payload", "unexpected_field": "disallowed"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_summarize_rejects_text_over_maximum_length() -> None:
    response = client.post(
        "/api/v1/summarize",
        json={"text": "x" * 100_001},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_summarize_handles_provider_error_with_generic_502() -> None:
    app.dependency_overrides[get_summarizer_provider] = lambda: MockSummarizerProvider(
        should_fail=True
    )

    response = client.post(
        "/api/v1/summarize",
        json={"text": "Text that will trigger simulated provider failure."},
    )

    assert response.status_code == 502
    assert response.json() == {
        "error": {
            "code": "provider_error",
            "message": "Summarization provider failed.",
        }
    }
    # Ensure private error details are never leaked to client
    assert "Simulated upstream provider failure" not in response.text


def test_summarize_handles_invalid_empty_provider_output_with_502() -> None:
    app.dependency_overrides[get_summarizer_provider] = lambda: MockSummarizerProvider(
        return_invalid=True
    )

    response = client.post(
        "/api/v1/summarize",
        json={"text": "Valid input text for invalid provider output testing."},
    )

    assert response.status_code == 502
    assert response.json() == {
        "error": {
            "code": "provider_error",
            "message": "Summarization provider failed.",
        }
    }


def test_summarize_handles_unexpected_exception_in_provider_with_502() -> None:
    class CrashingProvider(SummarizerProvider):
        @property
        def provider_name(self) -> str:
            return "crashing-provider"

        @property
        def model_name(self) -> str:
            return "crash-v1"

        def summarize(self, text: str) -> str:
            raise RuntimeError("Database connection timed out or socket broken.")

    app.dependency_overrides[get_summarizer_provider] = lambda: CrashingProvider()

    response = client.post(
        "/api/v1/summarize",
        json={"text": "Testing crash resilience."},
    )

    assert response.status_code == 502
    assert response.json() == {
        "error": {
            "code": "provider_error",
            "message": "Summarization provider failed.",
        }
    }
    assert "Database connection timed out" not in response.text


def test_provider_injection_via_dependency_overrides() -> None:
    class CustomTestProvider(SummarizerProvider):
        @property
        def provider_name(self) -> str:
            return "custom-injected"

        @property
        def model_name(self) -> str:
            return "injected-model-v2"

        def summarize(self, text: str) -> str:
            return f"Injected summary: {text[:20]}"

    app.dependency_overrides[get_summarizer_provider] = lambda: CustomTestProvider()

    response = client.post(
        "/api/v1/summarize",
        json={"text": "Testing dependency injection works smoothly."},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "custom-injected"
    assert body["model"] == "injected-model-v2"
    assert body["summary"] == "Injected summary: Testing dependency i"

    # Resetting overrides restores the default mock provider
    app.dependency_overrides.clear()
    default_response = client.post(
        "/api/v1/summarize",
        json={"text": "Back to default mock."},
    )
    assert default_response.status_code == 200
    assert default_response.json()["provider"] == "mock"
