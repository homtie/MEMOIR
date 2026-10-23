# MEMOIR API — Phase 4: Summarization & Persistence

FastAPI backend with local SQLite persistence, capture retrieval, and provider-independent text summarization for MEMOIR.

## Requirements

- Python 3.11 or newer (Python 3.12 is recommended)

## Setup

From this `backend/` directory:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
```

Copy the example environment configuration:

```bash
cp .env.example .env
```

## Configuration

Settings are loaded from environment variables or the local `.env` file:

| Variable | Default | Description |
|---|---|---|
| `APP_NAME` | `MEMOIR API` | Service title displayed in docs |
| `APP_ENV` | `development` | Environment (`development`, `test`, or `production`) |
| `LOG_LEVEL` | `INFO` | Standard Python logging level |
| `DATABASE_PATH` | `memoir.db` | File path for the local SQLite database |
| `SUMMARIZER_PROVIDER` | `mock` | Active provider: `mock` (deterministic local mock) or `openrouter` |
| `OPENROUTER_API_KEY` | *(empty)* | OpenRouter API authentication key (also supports legacy `ai_key`) |
| `OPENROUTER_MODEL` | `minimax/minimax-m3.1-flash:free` | Configurable model identifier for OpenRouter |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Base URL for OpenRouter API |
| `OPENROUTER_TIMEOUT_SECONDS` | `30.0` | Request timeout in seconds |

## Database Design

Captures are durably stored in a local SQLite database file using Python's standard library `sqlite3` (no ORM required).

### Schema (`captures` table)

- `id` (`TEXT PRIMARY KEY NOT NULL`): Standard UUID4 string.
- `text` (`TEXT NOT NULL`): Cleaned and validated capture text.
- `created_at` (`TEXT NOT NULL`): ISO-8601 UTC timestamp string.
- `status` (`TEXT NOT NULL`): Processing status (defaults to `"captured"`).

An index `idx_captures_created_at` on `(created_at DESC, id DESC)` optimizes chronological retrieval. Database initialization is idempotent and automatically runs on startup.

## Run

Start the development server with live reload:

```bash
python -m uvicorn app.main:app --reload
```

Interactive documentation is available at:
- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`

## API Endpoints

### 1. Health Check
`GET /health`

Checks if the service is alive and responding.

```bash
curl -X GET http://127.0.0.1:8000/health
```

**Response (200 OK):**
```json
{
  "status": "ok"
}
```

### 2. Capture Text
`POST /api/v1/capture`

Accepts text, trims whitespace, validates input (1 to 100,000 characters), and durably persists it in SQLite.

```bash
curl -X POST http://127.0.0.1:8000/api/v1/capture \
  -H "Content-Type: application/json" \
  -d '{"text": "A useful thing I want MEMOIR to remember."}'
```

**Response (201 Created):**
```json
{
  "id": "e4b2d5a1-7c98-4682-9f37-1832049e7b25",
  "text": "A useful thing I want MEMOIR to remember.",
  "created_at": "2026-10-19T14:20:00.123456+00:00",
  "status": "captured"
}
```

### 3. List Captures
`GET /api/v1/captures`

Retrieves all stored captures ordered by creation time descending (newest captures first).

```bash
curl -X GET http://127.0.0.1:8000/api/v1/captures
```

**Response (200 OK):**
```json
[
  {
    "id": "e4b2d5a1-7c98-4682-9f37-1832049e7b25",
    "text": "A useful thing I want MEMOIR to remember.",
    "created_at": "2026-10-19T14:20:00.123456+00:00",
    "status": "captured"
  }
]
```

### 4. Summarize Text
`POST /api/v1/summarize`

Validates input text (1 to 100,000 characters) and generates a summary using the configured provider (`mock` or `openrouter`).

```bash
curl -X POST http://127.0.0.1:8000/api/v1/summarize \
  -H "Content-Type: application/json" \
  -d '{"text": "FastAPI is a modern web framework for building APIs with Python."}'
```

**Response (200 OK):**
```json
{
  "summary": "[Mock Summary] FastAPI is a modern web framework for building APIs with Python.",
  "provider": "mock",
  "model": "mock-deterministic"
}
```

## Tests

Run the automated test suite with pytest:

```bash
python -m pytest
```

### Test Isolation
All automated tests run against temporary, isolated SQLite databases generated per test using pytest's `tmp_path` fixture. Production and local development database files (`memoir.db`) are never modified during test runs. All provider tests run network-free using deterministic mocks and `httpx.MockTransport`.

## Current Scope Boundaries

Included:
- FastAPI setup, `/health`, input validation, and safe error handling.
- `POST /api/v1/capture` and `GET /api/v1/captures` with durable SQLite persistence.
- `POST /api/v1/summarize` with provider abstraction:
  - Deterministic `MockSummarizerProvider` for tests and offline environments.
  - Hosted `OpenRouterSummarizerProvider` defaulting to `minimax/minimax-m3.1-flash:free`.
- Generic, safe HTTP 502 error handling preventing internal leaks.

Excluded:
- Chrome extension modifications.
- Local model execution or Ollama.
- Vector embeddings or RAG.
- Cloud deployment and user authentication.
