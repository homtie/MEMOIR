from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

from app.core.database import get_connection
from app.schemas.capture import CaptureResponse
from app.schemas.text import TextPayload


def create_capture(
    payload: TextPayload, db_path: str | Path | None = None
) -> CaptureResponse:
    """Create and persist one validated text capture in SQLite."""
    capture = CaptureResponse(
        id=uuid4(),
        text=payload.text,
        created_at=datetime.now(timezone.utc),
        status="captured",
    )
    with get_connection(db_path) as conn:
        conn.execute(
            """
            INSERT INTO captures (id, text, created_at, status)
            VALUES (?, ?, ?, ?);
            """,
            (
                str(capture.id),
                capture.text,
                capture.created_at.isoformat(),
                capture.status,
            ),
        )
    return capture


def list_captures(db_path: str | Path | None = None) -> list[CaptureResponse]:
    """Return all stored captures ordered by created_at descending."""
    with get_connection(db_path) as conn:
        rows = conn.execute(
            """
            SELECT id, text, created_at, status
            FROM captures
            ORDER BY created_at DESC, id DESC;
            """
        ).fetchall()

    return [
        CaptureResponse(
            id=UUID(row["id"]),
            text=row["text"],
            created_at=datetime.fromisoformat(row["created_at"]),
            status=row["status"],
        )
        for row in rows
    ]


def clear_captures(db_path: str | Path | None = None) -> None:
    """Clear all stored captures; intended for automated test isolation."""
    with get_connection(db_path) as conn:
        conn.execute("DELETE FROM captures;")
