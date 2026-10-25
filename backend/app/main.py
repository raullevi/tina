from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import Transcript, VoiceSession
from app.db.session import get_db, init_db
from app.services.ollama import OllamaService

settings = get_settings()

# Initialize database tables on load
init_db()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    init_db()
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Local-first, voice-first personal Life OS backend.",
    lifespan=lifespan,
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
    service: Optional[str] = Field(None, json_schema_extra={"example": "skim-backend"})
    version: Optional[str] = Field(None, json_schema_extra={"example": "0.1.0"})


class OllamaStatusResponse(BaseModel):
    available: bool
    base_url: str
    configured_model: str
    is_model_available: bool
    installed_models: List[str]
    error: Optional[str] = None


class VoiceStubRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Transcribed voice text input")


class VoiceStubResponse(BaseModel):
    reply: str
    session_id: int


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
        "message": "Welcome to SKIM - Personal Life OS",
        "docs_url": "/docs",
        "health_check": "/health",
    }


@app.get("/health", response_model=HealthResponse, tags=["System"])
@app.get("/api/health", response_model=HealthResponse, tags=["System"])
async def health_check() -> HealthResponse:
    """System health check endpoint."""
    return HealthResponse(
        status="healthy",
        service="skim-backend",
        version=settings.app_version,
    )


@app.get("/api/ollama/status", response_model=OllamaStatusResponse, tags=["Ollama"])
async def ollama_status() -> OllamaStatusResponse:
    """Check connectivity to local Ollama daemon."""
    status_info = await ollama_service.get_status()
    return OllamaStatusResponse(**status_info)


@app.post("/api/voice", response_model=VoiceStubResponse, tags=["Voice"])
async def process_voice_stub(
    req: VoiceStubRequest,
    db: Session = Depends(get_db),
) -> VoiceStubResponse:
    """
    Phase 1 Voice Module Stub:
    Accepts simulated transcribed text, persists the voice session and raw transcript
    to SQLite, generates an AI response via local Ollama, and returns the reply and session ID.
    """
    # 1. Create and persist VoiceSession and Transcript in SQLite
    voice_session = VoiceSession(status="completed")
    db.add(voice_session)
    db.flush()

    transcript_record = Transcript(
        session_id=voice_session.id,
        original_text=req.text,
        edited_text=None,
    )
    db.add(transcript_record)
    db.commit()
    db.refresh(voice_session)

    # 2. Call local Ollama LLM
    system_instruction = (
        "You are SKIM, a local voice-first personal life operating system assistant. "
        "Acknowledge the user's update concisely and supportively."
    )
    try:
        ollama_result = await ollama_service.generate(
            prompt=req.text,
            system_prompt=system_instruction,
        )
        reply_text = ollama_result.get("response", "Noted.")
    except Exception as exc:
        reply_text = f"Logged your update: '{req.text}'. (AI note: {str(exc)})"

    return VoiceStubResponse(reply=reply_text, session_id=voice_session.id)


@app.post("/api/ollama/generate", response_model=GenerateResponse, tags=["Ollama"])
async def ollama_generate(req: GenerateRequest) -> GenerateResponse:
    """Run local LLM text generation directly."""
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
