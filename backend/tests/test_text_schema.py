import pytest
from pydantic import ValidationError

from app.schemas.text import TextPayload


def test_accepts_and_trims_valid_text() -> None:
    payload = TextPayload(text="  useful notes  ")

    assert payload.text == "useful notes"


@pytest.mark.parametrize("text", ["", "   ", "\n\t"])
def test_rejects_blank_text(text: str) -> None:
    with pytest.raises(ValidationError):
        TextPayload(text=text)


def test_rejects_text_over_maximum_length() -> None:
    with pytest.raises(ValidationError):
        TextPayload(text="x" * 100_001)


def test_rejects_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        TextPayload(text="hello", unexpected="not allowed")
