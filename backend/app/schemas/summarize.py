from pydantic import BaseModel, ConfigDict, Field

from app.schemas.text import TextPayload


class SummarizeRequest(TextPayload):
    """Request payload for text summarization.

    Inherits text validation constraints (min length 1, max length 100,000,
    non-blank validation, whitespace stripping, and forbidden extra fields).
    """

    pass


class SummarizeResponse(BaseModel):
    """Response payload returned after text summarization."""

    model_config = ConfigDict(extra="forbid")

    summary: str = Field(min_length=1)
    provider: str = Field(min_length=1)
    model: str = Field(min_length=1)
