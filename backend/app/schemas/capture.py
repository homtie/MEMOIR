from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class CaptureResponse(BaseModel):
    """Public representation returned after a text capture is accepted."""

    model_config = ConfigDict(extra="forbid")

    id: UUID
    text: str
    created_at: datetime
    status: Literal["captured"] = "captured"
