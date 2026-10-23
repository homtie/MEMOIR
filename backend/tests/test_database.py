import sqlite3
from pathlib import Path

from app.core.database import get_connection, init_db


def test_init_db_is_safe_and_repeatable(tmp_path: Path) -> None:
    db_file = tmp_path / "repeatable.db"

    # First initialization
    init_db(db_file)

    # Insert a record
    with get_connection(db_file) as conn:
        conn.execute(
            """
            INSERT INTO captures (id, text, created_at, status)
            VALUES (?, ?, ?, ?);
            """,
            ("id-1", "test data", "2026-10-19T10:00:00+00:00", "captured"),
        )

    # Second initialization should not raise or erase existing data
    init_db(db_file)

    with get_connection(db_file) as conn:
        row = conn.execute("SELECT * FROM captures WHERE id = ?", ("id-1",)).fetchone()
        assert row is not None
        assert row["text"] == "test data"


def test_init_db_creates_parent_directories_if_needed(tmp_path: Path) -> None:
    nested_db = tmp_path / "deep" / "nested" / "dir" / "test.db"
    assert not nested_db.parent.exists()

    init_db(nested_db)

    assert nested_db.parent.exists()
    assert nested_db.exists()


def test_get_connection_closes_connection_on_exit(tmp_path: Path) -> None:
    db_file = tmp_path / "close_test.db"
    init_db(db_file)

    captured_conn = None
    with get_connection(db_file) as conn:
        captured_conn = conn
        conn.execute("SELECT 1;")

    # After leaving the context, the connection must be closed
    assert captured_conn is not None
    try:
        captured_conn.execute("SELECT 1;")
        assert False, "Expected sqlite3.ProgrammingError because connection should be closed"
    except sqlite3.ProgrammingError:
        pass


def test_get_connection_enables_row_factory(tmp_path: Path) -> None:
    db_file = tmp_path / "row_factory.db"
    init_db(db_file)

    with get_connection(db_file) as conn:
        conn.execute(
            """
            INSERT INTO captures (id, text, created_at, status)
            VALUES (?, ?, ?, ?);
            """,
            ("row-id", "sample text", "2026-10-19T12:00:00+00:00", "captured"),
        )
        row = conn.execute("SELECT * FROM captures WHERE id = ?", ("row-id",)).fetchone()
        assert row["id"] == "row-id"
        assert row["text"] == "sample text"
        assert row["created_at"] == "2026-10-19T12:00:00+00:00"
        assert row["status"] == "captured"
