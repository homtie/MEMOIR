import sqlite3
import time
from fastapi.testclient import TestClient

from app.core.config import get_settings
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


def test_get_captures_returns_empty_list_when_no_captures_exist() -> None:
    response = client.get("/api/v1/captures")

    assert response.status_code == 200
    assert response.json() == []


def test_get_captures_returns_all_stored_captures() -> None:
    post_res = client.post("/api/v1/capture", json={"text": "Note to remember"})
    assert post_res.status_code == 201
    posted = post_res.json()

    get_res = client.get("/api/v1/captures")
    assert get_res.status_code == 200
    items = get_res.json()
    assert len(items) == 1
    assert items[0]["id"] == posted["id"]
    assert items[0]["text"] == "Note to remember"
    assert items[0]["created_at"] == posted["created_at"]
    assert items[0]["status"] == "captured"


def test_get_captures_orders_by_newest_first() -> None:
    res1 = client.post("/api/v1/capture", json={"text": "First capture"})
    assert res1.status_code == 201
    # Brief sleep to ensure distinct timestamps
    time.sleep(0.005)

    res2 = client.post("/api/v1/capture", json={"text": "Second capture"})
    assert res2.status_code == 201
    time.sleep(0.005)

    res3 = client.post("/api/v1/capture", json={"text": "Third capture"})
    assert res3.status_code == 201

    get_res = client.get("/api/v1/captures")
    assert get_res.status_code == 200
    captures = get_res.json()

    assert len(captures) == 3
    assert [c["text"] for c in captures] == [
        "Third capture",
        "Second capture",
        "First capture",
    ]


def test_capture_persists_across_separate_database_connections() -> None:
    create_res = client.post("/api/v1/capture", json={"text": "Persisted note across connections"})
    assert create_res.status_code == 201
    created_id = create_res.json()["id"]

    # Open a completely distinct, raw SQLite connection to the same file on disk
    db_path = get_settings().database_path
    raw_conn = sqlite3.connect(db_path)
    raw_conn.row_factory = sqlite3.Row
    try:
        cursor = raw_conn.cursor()
        cursor.execute(
            "SELECT id, text, created_at, status FROM captures WHERE id = ?",
            (created_id,),
        )
        row = cursor.fetchone()

        assert row is not None
        assert row["id"] == created_id
        assert row["text"] == "Persisted note across connections"
        assert row["status"] == "captured"
    finally:
        raw_conn.close()
