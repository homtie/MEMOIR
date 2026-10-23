# MEMOIR API — Milestone 1 and 2

Small FastAPI foundation plus the first text-capture endpoint.

## Requirements

- Python 3.11 or newer (Python 3.12 is recommended)

## Setup

From this `backend/` directory:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e "[dev]"
```

## Run

```bash
python -m uvicorn app.main:app --reload
```

- Health check: `GET http://127.0.0.1:8000/health`
- API docs: `http://127.0.0.1:8000/docs`
- Capture text: `POST http://127.0.0.1:8000/api/v1/capture`

Example request body:

```json
{
  "text": "A useful thing I want MEMOIR to remember."
}
```

A successful request returns HTTP `201 Created` and a JSON object containing a unique `id`, the trimmed `text`, an ISO-8601 `created_at` timestamp, and `status: "captured"`.

## Storage limitation

Milestone 2 stores captures in the running Python process's memory only. Captures disappear when the server restarts, and the store is not shared between multiple server workers. This is intentionally a development step, not durable or production-ready storage. A later milestone will choose persistent storage and add a retrieval API.

## Tests

```bash
python -m pytest
```

## Current scope

Included: FastAPI setup, `/health`, request validation, safe validation errors, and `POST /api/v1/capture`.

Not included: database, durable storage, AI provider, browser extension integration, authentication, rate limiting, or deployment.
