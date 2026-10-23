from fastapi.testclient import TestClient

from app.main import app
from app.services.capture import clear_captures, list_captures

client = TestClient(app)


def setup_function() -> None:
    clear_captures()


def test_capture_returns_created_response_and_stores_text() -> None:
    response = client.post("/api/v1/capture", json={"text": "Understandable AI notes"})

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "captured"
    assert body["text"] == "Understandable AI notes"
    assert body["id"]
    assert body["created_at"]
    assert len(list_captures()) == 1
    assert list_captures()[0].text == "Understandable AI notes"


def test_capture_trims_surrounding_whitespace() -> None:
    response = client.post("/api/v1/capture", json={"text": "  useful note  "})

    assert response.status_code == 201
    assert response.json()["text"] == "useful note"


def test_each_capture_gets_a_unique_id() -> None:
    first = client.post("/api/v1/capture", json={"text": "first"})
    second = client.post("/api/v1/capture", json={"text": "second"})

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] != second.json()["id"]
    assert len(list_captures()) == 2


def test_capture_rejects_missing_text() -> None:
    response = client.post("/api/v1/capture", json={})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_capture_rejects_blank_text() -> None:
    response = client.post("/api/v1/capture", json={"text": " \n\t "})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_capture_rejects_extra_fields() -> None:
    response = client.post(
        "/api/v1/capture", json={"text": "valid text", "unexpected": "value"}
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_capture_rejects_text_over_maximum_length() -> None:
    response = client.post("/api/v1/capture", json={"text": "x" * 100_001})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_invalid_capture_is_not_stored() -> None:
    response = client.post("/api/v1/capture", json={"text": "   "})

    assert response.status_code == 422
    assert list_captures() == []
