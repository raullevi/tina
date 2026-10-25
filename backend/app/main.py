from contextlib import asynccontextmanager
import os
import shutil
from typing import Any, Dict, List, Optional
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import Transcript, VoiceSession
from app.db.session import get_db, init_db
from app.services.ollama import OllamaService
from app.services.transcription import TranscriptionService

settings = get_settings()

# Initialize database tables on load
init_db()

# Ensure recordings directory exists
os.makedirs(settings.recordings_dir, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    init_db()
    os.makedirs(settings.recordings_dir, exist_ok=True)
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
transcription_service = TranscriptionService(settings=settings)


# ---------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------

class HealthResponse(BaseModel):
    status: str = Field(..., json_schema_extra={"example": "healthy"})
    service: Optional[str] = Field(None, json_schema_extra={"example": "skim-backend"})
    version: Optional[str] = Field(None, json_schema_extra={"example": "0.2.0"})


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


class VoiceAudioResponse(BaseModel):
    session_id: int
    original_text: str
    duration_seconds: Optional[float] = None
    language: Optional[str] = None
    audio_url: str


class TranscriptEditRequest(BaseModel):
    edited_text: str = Field(..., min_length=1, description="Corrected transcript text")


class TranscriptResponse(BaseModel):
    session_id: int
    original_text: str
    edited_text: Optional[str] = None
    created_at: str
    updated_at: str


class VoiceSessionSummary(BaseModel):
    session_id: int
    created_at: str
    status: str
    duration_seconds: Optional[float] = None
    original_text: Optional[str] = None
    edited_text: Optional[str] = None
    audio_url: Optional[str] = None


class ProcessSessionResponse(BaseModel):
    session_id: int
    processed_text: str
    reply: str


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, description="User prompt to process")
    system_prompt: Optional[str] = Field(None, description="Optional system instruction")
    model: Optional[str] = Field(None, description="Model override")


class GenerateResponse(BaseModel):
    model: str
    response: str
    done: bool
    total_duration_ms: Optional[int] = None


# ---------------------------------------------------------
# Core System Endpoints
# ---------------------------------------------------------

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


# ---------------------------------------------------------
# Phase 2 Voice Capture & Transcription Endpoints
# ---------------------------------------------------------

@app.post("/api/voice/audio", response_model=VoiceAudioResponse, tags=["Voice"])
async def upload_and_transcribe_audio(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> VoiceAudioResponse:
    """
    Phase 2 Core Voice Endpoint:
    Accepts recorded voice audio (WAV/WebM/MP3), saves it locally, runs local Whisper
    transcription, persists the original transcript, and returns the transcription.
    """
    # 1. Create a session record
    session_record = VoiceSession(status="recording")
    db.add(session_record)
    db.flush()

    # 2. Save uploaded audio to recordings directory
    ext = os.path.splitext(file.filename or "")[1] or ".wav"
    saved_filename = f"session_{session_record.id}{ext}"
    saved_path = os.path.join(settings.recordings_dir, saved_filename)

    with open(saved_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    session_record.file_path = saved_path

    # 3. Transcribe audio with local Faster-Whisper
    try:
        transcription_result = await transcription_service.transcribe_file(saved_path)
        transcribed_text = transcription_result.get("text", "").strip()
        duration_sec = transcription_result.get("duration_seconds")
        language = transcription_result.get("language")

        session_record.status = "transcribed"
        session_record.duration_seconds = duration_sec

        # 4. Save raw immutable transcript linked to session
        transcript_record = Transcript(
            session_id=session_record.id,
            original_text=transcribed_text or "(No speech detected)",
            edited_text=None,
        )
        db.add(transcript_record)
        db.commit()
        db.refresh(session_record)

        return VoiceAudioResponse(
            session_id=session_record.id,
            original_text=transcript_record.original_text,
            duration_seconds=duration_sec,
            language=language,
            audio_url=f"/api/voice/sessions/{session_record.id}/audio",
        )
    except Exception as exc:
        session_record.status = "failed"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Speech transcription failed: {str(exc)}",
        ) from exc


@app.get("/api/voice/sessions", response_model=List[VoiceSessionSummary], tags=["Voice"])
async def list_voice_sessions(db: Session = Depends(get_db)) -> List[VoiceSessionSummary]:
    """List recent voice sessions with transcript and audio replay links."""
    sessions = db.query(VoiceSession).order_by(VoiceSession.id.desc()).limit(50).all()
    results = []
    for s in sessions:
        t = s.transcripts[0] if s.transcripts else None
        results.append(
            VoiceSessionSummary(
                session_id=s.id,
                created_at=s.created_at.isoformat(),
                status=s.status,
                duration_seconds=s.duration_seconds,
                original_text=t.original_text if t else None,
                edited_text=t.edited_text if t else None,
                audio_url=f"/api/voice/sessions/{s.id}/audio" if s.file_path else None,
            )
        )
    return results


@app.get("/api/voice/sessions/{session_id}/audio", tags=["Voice"])
async def get_session_audio(session_id: int, db: Session = Depends(get_db)):
    """Replay/stream the recorded audio file for a session."""
    session_record = db.query(VoiceSession).filter(VoiceSession.id == session_id).first()
    if not session_record or not session_record.file_path:
        raise HTTPException(status_code=404, detail="Audio file not found for session")
    if not os.path.exists(session_record.file_path):
        raise HTTPException(status_code=404, detail="Audio file missing on disk")

    return FileResponse(
        path=session_record.file_path,
        media_type="audio/wav",
        filename=os.path.basename(session_record.file_path),
    )


@app.get("/api/voice/sessions/{session_id}/transcript", response_model=TranscriptResponse, tags=["Voice"])
async def get_session_transcript(session_id: int, db: Session = Depends(get_db)) -> TranscriptResponse:
    """Retrieve original and edited transcript for a session."""
    transcript = db.query(Transcript).filter(Transcript.session_id == session_id).first()
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found for session")
    return TranscriptResponse(
        session_id=transcript.session_id,
        original_text=transcript.original_text,
        edited_text=transcript.edited_text,
        created_at=transcript.created_at.isoformat(),
        updated_at=transcript.updated_at.isoformat(),
    )


@app.put("/api/voice/sessions/{session_id}/transcript", response_model=TranscriptResponse, tags=["Voice"])
async def update_session_transcript(
    session_id: int,
    req: TranscriptEditRequest,
    db: Session = Depends(get_db),
) -> TranscriptResponse:
    """
    Edit transcript while preserving original text.
    Fulfills Blueprint rule #5: 'Preserve original transcripts and link extracted records'.
    """
    transcript = db.query(Transcript).filter(Transcript.session_id == session_id).first()
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found for session")

    transcript.edited_text = req.edited_text.strip()
    db.commit()
    db.refresh(transcript)

    return TranscriptResponse(
        session_id=transcript.session_id,
        original_text=transcript.original_text,
        edited_text=transcript.edited_text,
        created_at=transcript.created_at.isoformat(),
        updated_at=transcript.updated_at.isoformat(),
    )


@app.post("/api/voice/sessions/{session_id}/process", response_model=ProcessSessionResponse, tags=["Voice"])
async def process_session_with_ai(
    session_id: int,
    db: Session = Depends(get_db),
) -> ProcessSessionResponse:
    """Send confirmed/edited transcript to Ollama LLM to generate response and acknowledge."""
    transcript = db.query(Transcript).filter(Transcript.session_id == session_id).first()
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found for session")

    active_text = transcript.edited_text or transcript.original_text

    system_prompt = (
        "You are SKIM, a local voice-first personal life operating system assistant. "
        "Acknowledge the user's spoken update concisely, identify any routines or tasks mentioned, "
        "and keep your response encouraging and brief."
    )

    ollama_res = await ollama_service.generate(
        prompt=active_text,
        system_prompt=system_prompt,
    )

    return ProcessSessionResponse(
        session_id=session_id,
        processed_text=active_text,
        reply=ollama_res.get("response", "Noted."),
    )


# ---------------------------------------------------------
# Backward Compatibility & Direct Ollama Endpoints
# ---------------------------------------------------------

@app.post("/api/voice", response_model=VoiceStubResponse, tags=["Voice"])
async def process_voice_stub(
    req: VoiceStubRequest,
    db: Session = Depends(get_db),
) -> VoiceStubResponse:
    """Simulated voice text stub for tests and text input."""
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
