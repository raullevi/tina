import pytest
from app.config import Settings, get_settings


def test_default_settings():
    """Verify that default settings conform to Phase 1 blueprint specifications."""
    settings = Settings()
    assert settings.ollama_base_url == "http://localhost:11434"
    assert settings.ollama_model == "llama3.2:3b"
    assert settings.ollama_timeout_seconds == 60.0
    assert settings.app_name == "SKIM Backend"


def test_settings_environment_override(monkeypatch):
    """Verify that settings can be customized using environment variables."""
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    monkeypatch.setenv("OLLAMA_MODEL", "mistral:7b")
    monkeypatch.setenv("OLLAMA_TIMEOUT_SECONDS", "45.0")

    custom_settings = Settings()
    assert custom_settings.ollama_base_url == "http://127.0.0.1:11434"
    assert custom_settings.ollama_model == "mistral:7b"
    assert custom_settings.ollama_timeout_seconds == 45.0


def test_get_settings_cached():
    """Verify that get_settings() returns a cached instance."""
    s1 = get_settings()
    s2 = get_settings()
    assert s1 is s2
