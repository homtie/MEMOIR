import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv

# Load a local .env when present; deployment environments can set variables directly.
load_dotenv()


@dataclass(frozen=True)
class Settings:
    app_name: str = "MEMOIR API"
    app_env: str = "development"
    log_level: str = "INFO"
    database_path: str = "memoir.db"
    summarizer_provider: str = "mock"
    openrouter_api_key: str = ""
    openrouter_model: str = "minimax/minimax-m3.1-flash:free"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_timeout_seconds: float = 30.0

    @classmethod
    def from_env(cls) -> "Settings":
        app_name = os.getenv("APP_NAME", "MEMOIR API").strip()
        app_env = os.getenv("APP_ENV", "development").strip().lower()
        log_level = os.getenv("LOG_LEVEL", "INFO").strip().upper()
        database_path = os.getenv("DATABASE_PATH", "memoir.db").strip()
        summarizer_provider = os.getenv("SUMMARIZER_PROVIDER", "mock").strip().lower()
        openrouter_api_key = (
            os.getenv("OPENROUTER_API_KEY") or os.getenv("ai_key") or ""
        ).strip()
        openrouter_model = os.getenv(
            "OPENROUTER_MODEL", "minimax/minimax-m3.1-flash:free"
        ).strip()
        openrouter_base_url = os.getenv(
            "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
        ).strip().rstrip("/")
        timeout_raw = os.getenv("OPENROUTER_TIMEOUT_SECONDS", "30.0").strip()

        if not app_name:
            raise ValueError("APP_NAME must not be empty.")
        if app_env not in {"development", "test", "production"}:
            raise ValueError("APP_ENV must be development, test, or production.")
        if log_level not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
            raise ValueError("LOG_LEVEL must be a valid logging level.")
        if not database_path:
            raise ValueError("DATABASE_PATH must not be empty.")
        if summarizer_provider not in {"mock", "openrouter"}:
            raise ValueError("SUMMARIZER_PROVIDER must be 'mock' or 'openrouter'.")
        if not openrouter_model:
            raise ValueError("OPENROUTER_MODEL must not be empty.")
        if not openrouter_base_url:
            raise ValueError("OPENROUTER_BASE_URL must not be empty.")

        try:
            openrouter_timeout_seconds = float(timeout_raw)
            if openrouter_timeout_seconds <= 0:
                raise ValueError
        except ValueError:
            raise ValueError("OPENROUTER_TIMEOUT_SECONDS must be a positive number.")

        return cls(
            app_name=app_name,
            app_env=app_env,
            log_level=log_level,
            database_path=database_path,
            summarizer_provider=summarizer_provider,
            openrouter_api_key=openrouter_api_key,
            openrouter_model=openrouter_model,
            openrouter_base_url=openrouter_base_url,
            openrouter_timeout_seconds=openrouter_timeout_seconds,
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings.from_env()
