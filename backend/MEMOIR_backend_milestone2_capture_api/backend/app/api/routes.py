from fastapi import APIRouter, status

from app.schemas.capture import CaptureResponse
from app.schemas.health import HealthResponse
from app.schemas.text import TextPayload
from app.services.capture import create_capture
from app.services.health import get_health_status

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["system"])
def health_check() -> HealthResponse:
    """Report whether the API process is responding."""
    return HealthResponse(**get_health_status())


@router.post(
    "/api/v1/capture",
    response_model=CaptureResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["captures"],
)
def capture_text(payload: TextPayload) -> CaptureResponse:
    """Accept validated text and retain it in memory until restart."""
    return create_capture(payload)
