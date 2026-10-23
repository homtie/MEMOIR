from datetime import datetime, timezone
from uuid import UUID, uuid4

from app.schemas.capture import CaptureResponse
from app.schemas.text import TextPayload

# Deliberately process-local for Milestone 2. This is not durable storage.
_captures: dict[UUID, CaptureResponse] = {}


def create_capture(payload: TextPayload) -> CaptureResponse:
    """Create and temporarily retain one validated text capture."""
    capture = CaptureResponse(
        id=uuid4(),
        text=payload.text,
        created_at=datetime.now(timezone.utc),
        status="captured",
    )
    _captures[capture.id] = capture
    return capture


def list_captures() -> list[CaptureResponse]:
    """Return captures held in this process (for future retrieval work/tests)."""
    return list(_captures.values())


def clear_captures() -> None:
    """Clear the process-local store; intended for automated test isolation."""
    _captures.clear()
