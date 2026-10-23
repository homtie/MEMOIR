from pydantic import BaseModel, ConfigDict, Field, field_validator


class TextPayload(BaseModel):
    """Reusable validated text input for a later summarization milestone."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    text: str = Field(min_length=1, max_length=100_000)

    @field_validator("text")
    @classmethod
    def text_must_not_be_blank(cls, value: str) -> str:
        if not value:
            raise ValueError("Text must contain non-whitespace characters.")
        return value
