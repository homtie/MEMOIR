from collections.abc import Generator
from pathlib import Path

import pytest

from app.core.config import get_settings
from app.core.database import init_db


@pytest.fixture(autouse=True)
def isolated_db(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Generator[Path, None, None]:
    """Isolate every test run with its own temporary SQLite database.

    Guarantees tests never modify real user databases and isolates test state.
    """
    test_db_path = tmp_path / "test_memoir.db"
    monkeypatch.setenv("DATABASE_PATH", str(test_db_path))
    monkeypatch.setenv("SUMMARIZER_PROVIDER", "mock")
    get_settings.cache_clear()
    init_db(str(test_db_path))
    yield test_db_path
    get_settings.cache_clear()
