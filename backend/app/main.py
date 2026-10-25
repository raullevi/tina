from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.config import get_settings
from app.services.ollama import OllamaService

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Local-first, voice-first personal AI backend.",
)

# CORS setup for local React + Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ollama_service = OllamaService(settings=settings)


class HealthResponse(BaseModel):
    status: str = Field(..., json_schema_extra={"example": "healthy"})
    service: str = Field(..., json_schema_extra={"example": "skim-backend"})
    version: str = Field(..., json_schema_extra={"example": "0.1.0"})


class OllamaStatusResponse(BaseModel):
    available: bool
    base_url: str
    configured_model: str
    is_model_available: bool
    installed_models: List[str]
    error: Optional[str] = None


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, description="User prompt to process")
    system_prompt: Optional[str] = Field(None, description="Optional system instruction")
    model: Optional[str] = Field(None, description="Model override")


class GenerateResponse(BaseModel):
    model: str
    response: str
    done: bool
    total_duration_ms: Optional[int] = None


@app.get("/", tags=["Root"])
async def root() -> Dict[str, str]:
    return {
        "message": "Welcome to SKIM - Personal AI",
        "docs_url": "/docs",
        "health_check": "/api/health",
    }


@app.get("/api/health", response_model=HealthResponse, tags=["System"])
async def health_check() -> HealthResponse:
    """Basic health check endpoint."""
    return HealthResponse(
        status="healthy",
        service="skim-backend",
        version=settings.app_version,
    )


@app.get("/api/ollama/status", response_model=OllamaStatusResponse, tags=["Ollama"])
async def ollama_status() -> OllamaStatusResponse:
    """Check connectivity to the local Ollama daemon and list models."""
    status_info = await ollama_service.get_status()
    return OllamaStatusResponse(**status_info)


@app.post("/api/ollama/generate", response_model=GenerateResponse, tags=["Ollama"])
async def ollama_generate(req: GenerateRequest) -> GenerateResponse:
    """Run local LLM text generation."""
    try:
        result = await ollama_service.generate(
            prompt=req.prompt,
            system_prompt=req.system_prompt,
            model=req.model,
        )
        return GenerateResponse(**result)
    except ConnectionError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except TimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Generation failed: {str(exc)}",
        ) from exc
