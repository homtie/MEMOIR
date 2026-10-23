import sqlite3
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path

from app.core.config import get_settings


def get_db_path(db_path: str | Path | None = None) -> Path:
    """Resolve the SQLite database path from parameter or application settings."""
    if db_path is not None:
        return Path(db_path)
    return Path(get_settings().database_path)


def init_db(db_path: str | Path | None = None) -> None:
    """Initialize the SQLite database schema in a safe, repeatable manner.

    Creates parent directories if necessary and sets up tables and indexes
    using idempotent DDL statements (`IF NOT EXISTS`).
    """
    path = get_db_path(db_path)
    if path.parent and str(path.parent) != ".":
        path.parent.mkdir(parents=True, exist_ok=True)

    with get_connection(path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS captures (
                id TEXT PRIMARY KEY NOT NULL,
                text TEXT NOT NULL,
                created_at TEXT NOT NULL,
                status TEXT NOT NULL
            );
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_captures_created_at
            ON captures(created_at DESC, id DESC);
            """
        )


@contextmanager
def get_connection(
    db_path: str | Path | None = None,
) -> Generator[sqlite3.Connection, None, None]:
    """Provide a managed SQLite connection with dictionary row access.

    Ensures transactions are committed on success or rolled back on failure,
    and guarantees the connection is closed when exiting the context.
    """
    path = get_db_path(db_path)
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        with conn:
            yield conn
    finally:
        conn.close()
