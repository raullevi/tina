from typing import Any, Dict, List, Optional
import httpx
from app.config import Settings, get_settings


class OllamaService:
    """Service to communicate with the local Ollama daemon."""

    def __init__(self, settings: Optional[Settings] = None):
        self.settings = settings or get_settings()
        self.base_url = self.settings.ollama_base_url.rstrip("/")
        self.default_model = self.settings.ollama_model
        self.timeout = self.settings.ollama_timeout_seconds

    async def get_status(self) -> Dict[str, Any]:
        """Check if Ollama is running and list available models."""
        url = f"{self.base_url}/api/tags"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url)
                response.raise_for_status()
                data = response.json()

            models: List[Dict[str, Any]] = data.get("models", [])
            model_names = [m.get("name") for m in models]
            is_default_model_available = any(
                name == self.default_model or name.startswith(f"{self.default_model}:")
                for name in model_names
                if name
            )

            return {
                "available": True,
                "base_url": self.base_url,
                "configured_model": self.default_model,
                "is_model_available": is_default_model_available,
                "installed_models": model_names,
            }
        except (httpx.ConnectError, httpx.ConnectTimeout):
            return {
                "available": False,
                "base_url": self.base_url,
                "configured_model": self.default_model,
                "is_model_available": False,
                "installed_models": [],
                "error": "Cannot connect to Ollama. Ensure Ollama daemon is running.",
            }
        except Exception as exc:
            return {
                "available": False,
                "base_url": self.base_url,
                "configured_model": self.default_model,
                "is_model_available": False,
                "installed_models": [],
                "error": str(exc),
            }

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate text completion from local Ollama model."""
        target_model = model or self.default_model
        url = f"{self.base_url}/api/generate"

        payload: Dict[str, Any] = {
            "model": target_model,
            "prompt": prompt,
            "stream": False,
        }
        if system_prompt:
            payload["system"] = system_prompt

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()

            return {
                "model": data.get("model", target_model),
                "response": data.get("response", ""),
                "done": data.get("done", True),
                "total_duration_ms": (
                    data.get("total_duration", 0) // 1_000_000
                    if data.get("total_duration")
                    else None
                ),
            }
        except httpx.HTTPStatusError as exc:
            raise RuntimeError(
                f"Ollama returned HTTP error {exc.response.status_code}: {exc.response.text}"
            ) from exc
        except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
            raise ConnectionError(
                f"Failed to connect to Ollama at {self.base_url}. Is Ollama running?"
            ) from exc
        except httpx.TimeoutException as exc:
            raise TimeoutError(
                f"Ollama generation timed out after {self.timeout}s."
            ) from exc
