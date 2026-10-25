import pytest
import httpx
from app.main import app
from app.services.ollama import OllamaService


@pytest.mark.asyncio
async def test_health_endpoint():
    """Verify that /api/health returns HTTP 200 and healthy status."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "skim-backend"


@pytest.mark.asyncio
async def test_ollama_status():
    """Verify that Ollama status endpoint checks connectivity."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/ollama/status")
        assert response.status_code == 200
        data = response.json()
        assert "available" in data
        assert "installed_models" in data
        assert data["available"] is True


@pytest.mark.asyncio
async def test_ollama_live_prompt():
    """
    Phase 1 Completion Test:
    Verify that a local prompt executes and returns a generated response from llama3.2:3b.
    """
    service = OllamaService()
    status = await service.get_status()
    if not status["available"]:
        pytest.skip("Ollama is not running locally; skipping live generation test.")
    if not status["is_model_available"]:
        pytest.skip(f"Configured model '{service.default_model}' is not installed; skipping.")

    result = await service.generate(
        prompt="Respond in exactly one word: 'READY'.",
        system_prompt="You are a strict test evaluator. Answer with just the requested single word.",
    )
    assert result is not None
    assert "response" in result
    assert len(result["response"].strip()) > 0
    assert result["done"] is True
