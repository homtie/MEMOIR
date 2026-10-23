from fastapi import APIRouter, Depends, status

from app.schemas.capture import CaptureResponse
from app.schemas.health import HealthResponse
from app.schemas.summarize import SummarizeRequest, SummarizeResponse
from app.schemas.text import TextPayload
from app.services.capture import create_capture, list_captures
from app.services.health import get_health_status
from app.services.summarizer import (
    SummarizerProvider,
    generate_summary,
    get_summarizer_provider,
)

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
    """Accept validated text and persist it in SQLite."""
    return create_capture(payload)


@router.get(
    "/api/v1/captures",
    response_model=list[CaptureResponse],
    tags=["captures"],
)
def get_captures() -> list[CaptureResponse]:
    """Retrieve stored captures ordered by creation time descending."""
    return list_captures()


@router.post(
    "/api/v1/summarize",
    response_model=SummarizeResponse,
    status_code=status.HTTP_200_OK,
    tags=["summarization"],
)
def summarize_text(
    payload: SummarizeRequest,
    provider: SummarizerProvider = Depends(get_summarizer_provider),
) -> SummarizeResponse:
    """Accept validated text and generate a summary using the injected provider."""
    return generate_summary(payload, provider)
