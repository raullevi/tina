from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings for SKIM backend."""

    app_name: str = "SKIM Backend"
    app_version: str = "0.1.0"
    debug: bool = False

    # Ollama Local LLM Configuration
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2:3b"
    ollama_timeout_seconds: float = 60.0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache()
def get_settings() -> Settings:
    """Cached settings instance to avoid re-reading disk/environment on every call."""
    return Settings()
