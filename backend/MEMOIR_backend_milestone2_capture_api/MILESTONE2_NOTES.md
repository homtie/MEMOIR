# MEMOIR Milestone 2 — Capture API

## Apply these files

Copy/merge the `backend/` folder in this ZIP into the existing MEMOIR repository root. Allow these existing files to be replaced:

- `backend/app/api/routes.py`
- `backend/README.md`

These files are new:

- `backend/app/schemas/capture.py`
- `backend/app/services/capture.py`
- `backend/tests/test_capture.py`

No extension files, dependency declarations, environment files, or Git metadata are changed by this patch.

## Verify on macOS

From the repository's `backend/` directory, activate the existing Python 3.12 virtual environment and run:

```bash
source .venv/bin/activate
python -m pytest
```

Expected: 24 tests pass (the 16 Milestone 1 tests plus 8 capture tests).

Start the server:

```bash
python -m uvicorn app.main:app --reload
```

Then open `http://127.0.0.1:8000/docs` and try `POST /api/v1/capture` with:

```json
{
  "text": "A useful thing I want MEMOIR to remember."
}
```

Expected: HTTP `201 Created` with `id`, `text`, `created_at`, and `status` fields.

## Scope and limitations

This endpoint stores accepted captures in process memory only. They are lost when the server restarts and are not shared across multiple workers. No database, AI, authentication, or extension integration was added. No Git operations were performed.
