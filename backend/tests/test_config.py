import pytest

from app.core.config import Settings


def test_defaults_are_development_safe(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in (
        "APP_NAME",
        "APP_ENV",
        "LOG_LEVEL",
        "DATABASE_PATH",
        "SUMMARIZER_PROVIDER",
        "OPENROUTER_API_KEY",
        "ai_key",
        "OPENROUTER_MODEL",
        "OPENROUTER_BASE_URL",
        "OPENROUTER_TIMEOUT_SECONDS",
    ):
        monkeypatch.delenv(key, raising=False)

    settings = Settings.from_env()

    assert settings.app_name == "MEMOIR API"
    assert settings.app_env == "development"
    assert settings.log_level == "INFO"
    assert settings.database_path == "memoir.db"
    assert settings.summarizer_provider == "mock"
    assert settings.openrouter_api_key == ""
    assert settings.openrouter_model == "minimax/minimax-m3.1-flash:free"
    assert settings.openrouter_base_url == "https://openrouter.ai/api/v1"
    assert settings.openrouter_timeout_seconds == 30.0


def test_reads_environment_variables(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_NAME", "MEMOIR test")
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("LOG_LEVEL", "debug")
    monkeypatch.setenv("DATABASE_PATH", "custom_test.db")
    monkeypatch.setenv("SUMMARIZER_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-openrouter-key")
    monkeypatch.setenv("OPENROUTER_MODEL", "custom/model:free")
    monkeypatch.setenv("OPENROUTER_BASE_URL", "https://custom.openrouter.ai/api/v1/")
    monkeypatch.setenv("OPENROUTER_TIMEOUT_SECONDS", "45.5")

    settings = Settings.from_env()

    assert settings.app_name == "MEMOIR test"
    assert settings.app_env == "test"
    assert settings.log_level == "DEBUG"
    assert settings.database_path == "custom_test.db"
    assert settings.summarizer_provider == "openrouter"
    assert settings.openrouter_api_key == "test-openrouter-key"
    assert settings.openrouter_model == "custom/model:free"
    assert settings.openrouter_base_url == "https://custom.openrouter.ai/api/v1"
    assert settings.openrouter_timeout_seconds == 45.5


def test_falls_back_to_ai_key_when_openrouter_api_key_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.setenv("ai_key", "test-fallback-key")

    settings = Settings.from_env()
    assert settings.openrouter_api_key == "test-fallback-key"


def test_prefers_openrouter_api_key_over_ai_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "primary-key")
    monkeypatch.setenv("ai_key", "fallback-key")

    settings = Settings.from_env()
    assert settings.openrouter_api_key == "primary-key"


@pytest.mark.parametrize("app_env", ["", "staging", "prod"])
def test_rejects_unknown_environment(app_env: str, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", app_env)

    with pytest.raises(ValueError, match="APP_ENV"):
        Settings.from_env()


def test_rejects_invalid_log_level(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LOG_LEVEL", "TRACE")

    with pytest.raises(ValueError, match="LOG_LEVEL"):
        Settings.from_env()


def test_rejects_blank_app_name(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_NAME", "   ")

    with pytest.raises(ValueError, match="APP_NAME"):
        Settings.from_env()


def test_rejects_blank_database_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_PATH", "   ")

    with pytest.raises(ValueError, match="DATABASE_PATH"):
        Settings.from_env()


def test_rejects_invalid_summarizer_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUMMARIZER_PROVIDER", "unsupported_provider")

    with pytest.raises(ValueError, match="SUMMARIZER_PROVIDER"):
        Settings.from_env()


def test_rejects_blank_openrouter_model(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_MODEL", "   ")

    with pytest.raises(ValueError, match="OPENROUTER_MODEL"):
        Settings.from_env()


def test_rejects_blank_openrouter_base_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_BASE_URL", "   ")

    with pytest.raises(ValueError, match="OPENROUTER_BASE_URL"):
        Settings.from_env()


@pytest.mark.parametrize("bad_timeout", ["0", "-10", "abc"])
def test_rejects_invalid_openrouter_timeout(
    bad_timeout: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("OPENROUTER_TIMEOUT_SECONDS", bad_timeout)

    with pytest.raises(ValueError, match="OPENROUTER_TIMEOUT_SECONDS"):
        Settings.from_env()
