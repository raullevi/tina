import pytest
from app.config import Settings, get_settings


def test_default_settings():
    """Verify default settings for Phase 1."""
    settings = Settings()
    assert settings.ollama_base_url == "http://localhost:11434"
    assert settings.ollama_model == "llama3.1:8b"
    assert settings.ollama_timeout_seconds == 60.0
    assert settings.database_url == "sqlite:///./skim.db"
    assert settings.app_name == "Thena Life OS"


def test_settings_environment_override(monkeypatch):
    """Verify settings can be overridden via environment variables."""
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./custom.db")
    monkeypatch.setenv("OLLAMA_MODEL", "gemma:2b")
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")

    custom_settings = Settings()
    assert custom_settings.database_url == "sqlite:///./custom.db"
    assert custom_settings.ollama_model == "gemma:2b"
    assert custom_settings.ollama_base_url == "http://127.0.0.1:11434"


def test_get_settings_cached():
    """Verify cached singleton behavior."""
    s1 = get_settings()
    s2 = get_settings()
    assert s1 is s2
