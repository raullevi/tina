from contextlib import asynccontextmanager
from datetime import date, datetime
import os
import shutil
from typing import Any, Dict, List, Optional
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import (
    Activity,
    AuditLog,
    DailyLog,
    Measurement,
    PersonalFact,
    Transcript,
    VoiceSession,
)
from app.db.session import get_db, init_db
from app.services.extractor import ExtractionService
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
extraction_service = ExtractionService(ollama_service=ollama_service)


# ---------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------

class HealthResponse(BaseModel):
    status: str = Field(..., json_schema_extra={"example": "healthy"})
    service: Optional[str] = Field(None, json_schema_extra={"example": "skim-backend"})
    version: Optional[str] = Field(None, json_schema_extra={"example": "0.3.0"})


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


# Phase 3 Memory Schemas
class DailyLogResponse(BaseModel):
    id: int
    log_date: str
    summary: str
    source_transcript_id: Optional[int] = None
    created_at: str


class ActivityResponse(BaseModel):
    id: int
    category: str
    name: str
    duration_minutes: Optional[float] = None
    activity_date: str
    notes: Optional[str] = None
    source_transcript_id: Optional[int] = None


class MeasurementResponse(BaseModel):
    id: int
    metric: str
    value: float
    unit: str
    measurement_date: str
    review_status: str
    notes: Optional[str] = None
    source_transcript_id: Optional[int] = None


class MeasurementConfirmRequest(BaseModel):
    value: Optional[float] = None
    review_status: str = Field(default="confirmed")
    notes: Optional[str] = None


class PersonalFactResponse(BaseModel):
    id: int
    category: str
    key: str
    value: str
    source_transcript_id: Optional[int] = None


class MemoryExtractResponse(BaseModel):
    session_id: int
    daily_log: Optional[DailyLogResponse] = None
    activities: List[ActivityResponse] = Field(default_factory=list)
    measurements: List[MeasurementResponse] = Field(default_factory=list)
    facts: List[PersonalFactResponse] = Field(default_factory=list)


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
        version="0.3.0",
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
    """Accepts recorded voice audio, transcribes with Whisper, and stores session."""
    session_record = VoiceSession(status="recording")
    db.add(session_record)
    db.flush()

    ext = os.path.splitext(file.filename or "")[1] or ".wav"
    saved_filename = f"session_{session_record.id}{ext}"
    saved_path = os.path.join(settings.recordings_dir, saved_filename)

    with open(saved_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    session_record.file_path = saved_path

    try:
        transcription_result = await transcription_service.transcribe_file(saved_path)
        transcribed_text = transcription_result.get("text", "").strip()
        duration_sec = transcription_result.get("duration_seconds")
        language = transcription_result.get("language")

        session_record.status = "transcribed"
        session_record.duration_seconds = duration_sec

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
    """Edit transcript while preserving original text."""
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
    """Send confirmed transcript to Ollama LLM and auto-trigger memory extraction."""
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

    # Automatically extract structured memory entities
    try:
        extraction = await extraction_service.extract_from_text(active_text)
        if extraction.daily_summary:
            db.add(DailyLog(
                log_date=date.today(),
                summary=extraction.daily_summary,
                source_transcript_id=transcript.id,
            ))
        for act in extraction.activities:
            db.add(Activity(
                category=act.category,
                name=act.name,
                duration_minutes=act.duration_minutes,
                notes=act.notes,
                source_transcript_id=transcript.id,
            ))
        for m in extraction.measurements:
            db.add(Measurement(
                metric=m.metric,
                value=m.value,
                unit=m.unit,
                review_status=m.review_status,
                notes=m.notes,
                source_transcript_id=transcript.id,
            ))
        for f in extraction.facts:
            db.add(PersonalFact(
                category=f.category,
                key=f.key,
                value=f.value,
                source_transcript_id=transcript.id,
            ))
        db.commit()
    except Exception as exc:
        print(f"Auto-extraction warning: {exc}")

    return ProcessSessionResponse(
        session_id=session_id,
        processed_text=active_text,
        reply=ollama_res.get("response", "Noted."),
    )


# ---------------------------------------------------------
# Phase 3: Persistent Memory & Historical Retrieval Endpoints
# ---------------------------------------------------------

@app.post("/api/memory/extract/{session_id}", response_model=MemoryExtractResponse, tags=["Memory"])
async def extract_structured_memory(
    session_id: int,
    db: Session = Depends(get_db),
) -> MemoryExtractResponse:
    """Extract and persist structured personal records linked to source transcript."""
    transcript = db.query(Transcript).filter(Transcript.session_id == session_id).first()
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found for session")

    active_text = transcript.edited_text or transcript.original_text
    extracted = await extraction_service.extract_from_text(active_text)

    # 1. Daily Log
    saved_daily_log = None
    if extracted.daily_summary:
        d_log = DailyLog(
            log_date=date.today(),
            summary=extracted.daily_summary,
            source_transcript_id=transcript.id,
        )
        db.add(d_log)
        db.flush()
        saved_daily_log = DailyLogResponse(
            id=d_log.id,
            log_date=d_log.log_date.isoformat(),
            summary=d_log.summary,
            source_transcript_id=d_log.source_transcript_id,
            created_at=d_log.created_at.isoformat(),
        )

    # 2. Activities
    saved_activities = []
    for act in extracted.activities:
        act_rec = Activity(
            category=act.category,
            name=act.name,
            duration_minutes=act.duration_minutes,
            activity_date=date.today(),
            notes=act.notes,
            source_transcript_id=transcript.id,
        )
        db.add(act_rec)
        db.flush()
        saved_activities.append(ActivityResponse(
            id=act_rec.id,
            category=act_rec.category,
            name=act_rec.name,
            duration_minutes=act_rec.duration_minutes,
            activity_date=act_rec.activity_date.isoformat(),
            notes=act_rec.notes,
            source_transcript_id=act_rec.source_transcript_id,
        ))

    # 3. Measurements
    saved_measurements = []
    for m in extracted.measurements:
        meas_rec = Measurement(
            metric=m.metric,
            value=m.value,
            unit=m.unit,
            measurement_date=date.today(),
            review_status=m.review_status,
            notes=m.notes,
            source_transcript_id=transcript.id,
        )
        db.add(meas_rec)
        db.flush()
        saved_measurements.append(MeasurementResponse(
            id=meas_rec.id,
            metric=meas_rec.metric,
            value=meas_rec.value,
            unit=meas_rec.unit,
            measurement_date=meas_rec.measurement_date.isoformat(),
            review_status=meas_rec.review_status,
            notes=meas_rec.notes,
            source_transcript_id=meas_rec.source_transcript_id,
        ))

    # 4. Personal Facts
    saved_facts = []
    for f in extracted.facts:
        fact_rec = PersonalFact(
            category=f.category,
            key=f.key,
            value=f.value,
            source_transcript_id=transcript.id,
        )
        db.add(fact_rec)
        db.flush()
        saved_facts.append(PersonalFactResponse(
            id=fact_rec.id,
            category=fact_rec.category,
            key=fact_rec.key,
            value=fact_rec.value,
            source_transcript_id=fact_rec.source_transcript_id,
        ))

    # 5. Audit Log
    db.add(AuditLog(
        action="extracted",
        entity="transcripts",
        entity_id=transcript.id,
        description=f"Extracted {len(saved_activities)} activities, {len(saved_measurements)} measurements, {len(saved_facts)} facts.",
    ))

    db.commit()

    return MemoryExtractResponse(
        session_id=session_id,
        daily_log=saved_daily_log,
        activities=saved_activities,
        measurements=saved_measurements,
        facts=saved_facts,
    )


@app.get("/api/memory/daily-logs", response_model=List[DailyLogResponse], tags=["Memory"])
async def list_daily_logs(
    log_date: Optional[str] = Query(None, description="Filter by YYYY-MM-DD"),
    db: Session = Depends(get_db),
) -> List[DailyLogResponse]:
    """Retrieve daily summary logs."""
    query = db.query(DailyLog)
    if log_date:
        query = query.filter(DailyLog.log_date == date.fromisoformat(log_date))
    logs = query.order_by(DailyLog.id.desc()).all()
    return [
        DailyLogResponse(
            id=l.id,
            log_date=l.log_date.isoformat(),
            summary=l.summary,
            source_transcript_id=l.source_transcript_id,
            created_at=l.created_at.isoformat(),
        )
        for l in logs
    ]


@app.get("/api/memory/activities", response_model=List[ActivityResponse], tags=["Memory"])
async def list_activities(
    category: Optional[str] = Query(None, description="gym, study, work, chore, general"),
    db: Session = Depends(get_db),
) -> List[ActivityResponse]:
    """Retrieve recorded activities filtered by category."""
    query = db.query(Activity)
    if category:
        query = query.filter(Activity.category == category)
    items = query.order_by(Activity.id.desc()).all()
    return [
        ActivityResponse(
            id=a.id,
            category=a.category,
            name=a.name,
            duration_minutes=a.duration_minutes,
            activity_date=a.activity_date.isoformat(),
            notes=a.notes,
            source_transcript_id=a.source_transcript_id,
        )
        for a in items
    ]


@app.get("/api/memory/measurements", response_model=List[MeasurementResponse], tags=["Memory"])
async def list_measurements(
    metric: Optional[str] = Query(None, description="weight, sleep_hours, water_liters, etc."),
    db: Session = Depends(get_db),
) -> List[MeasurementResponse]:
    """Retrieve numeric measurements."""
    query = db.query(Measurement)
    if metric:
        query = query.filter(Measurement.metric == metric)
    items = query.order_by(Measurement.id.desc()).all()
    return [
        MeasurementResponse(
            id=m.id,
            metric=m.metric,
            value=m.value,
            unit=m.unit,
            measurement_date=m.measurement_date.isoformat(),
            review_status=m.review_status,
            notes=m.notes,
            source_transcript_id=m.source_transcript_id,
        )
        for m in items
    ]


@app.put("/api/memory/measurements/{measurement_id}/confirm", response_model=MeasurementResponse, tags=["Memory"])
async def confirm_or_edit_measurement(
    measurement_id: int,
    req: MeasurementConfirmRequest,
    db: Session = Depends(get_db),
) -> MeasurementResponse:
    """Confirm or correct an extracted measurement."""
    meas = db.query(Measurement).filter(Measurement.id == measurement_id).first()
    if not meas:
        raise HTTPException(status_code=404, detail="Measurement not found")

    old_val = meas.value
    if req.value is not None:
        meas.value = req.value
    meas.review_status = req.review_status
    if req.notes:
        meas.notes = req.notes

    db.add(AuditLog(
        action="confirmed" if req.value is None else "corrected",
        entity="measurements",
        entity_id=meas.id,
        description=f"Confirmed measurement id {meas.id}. Value changed from {old_val} to {meas.value}.",
    ))
    db.commit()
    db.refresh(meas)

    return MeasurementResponse(
        id=meas.id,
        metric=meas.metric,
        value=meas.value,
        unit=meas.unit,
        measurement_date=meas.measurement_date.isoformat(),
        review_status=meas.review_status,
        notes=meas.notes,
        source_transcript_id=meas.source_transcript_id,
    )


@app.get("/api/memory/facts", response_model=List[PersonalFactResponse], tags=["Memory"])
async def list_personal_facts(
    category: Optional[str] = None,
    db: Session = Depends(get_db),
) -> List[PersonalFactResponse]:
    """Retrieve saved personal facts, preferences, decisions, and goals."""
    query = db.query(PersonalFact)
    if category:
        query = query.filter(PersonalFact.category == category)
    items = query.order_by(PersonalFact.id.desc()).all()
    return [
        PersonalFactResponse(
            id=f.id,
            category=f.category,
            key=f.key,
            value=f.value,
            source_transcript_id=f.source_transcript_id,
        )
        for f in items
    ]


@app.get("/api/memory/search", tags=["Memory"])
async def search_memory(
    q: str = Query(..., min_length=1, description="Keyword search query"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Search across transcripts, daily logs, activities, and facts."""
    search_term = f"%{q}%"
    
    transcripts = (
        db.query(Transcript)
        .filter(or_(Transcript.original_text.like(search_term), Transcript.edited_text.like(search_term)))
        .limit(10)
        .all()
    )
    daily_logs = (
        db.query(DailyLog)
        .filter(DailyLog.summary.like(search_term))
        .limit(10)
        .all()
    )
    activities = (
        db.query(Activity)
        .filter(or_(Activity.name.like(search_term), Activity.notes.like(search_term)))
        .limit(10)
        .all()
    )
    facts = (
        db.query(PersonalFact)
        .filter(or_(PersonalFact.key.like(search_term), PersonalFact.value.like(search_term)))
        .limit(10)
        .all()
    )

    return {
        "query": q,
        "results": {
            "transcripts": [{"session_id": t.session_id, "text": t.edited_text or t.original_text} for t in transcripts],
            "daily_logs": [{"id": l.id, "date": l.log_date.isoformat(), "summary": l.summary} for l in daily_logs],
            "activities": [{"id": a.id, "name": a.name, "category": a.category, "date": a.activity_date.isoformat()} for a in activities],
            "facts": [{"id": f.id, "key": f.key, "value": f.value, "category": f.category} for f in facts],
        }
    }


@app.get("/api/memory/export", tags=["Memory"])
async def export_memory(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Export complete persistent memory database as structured JSON."""
    return {
        "export_date": datetime.utcnow().isoformat(),
        "transcripts": [
            {"id": t.id, "session_id": t.session_id, "text": t.edited_text or t.original_text, "created_at": t.created_at.isoformat()}
            for t in db.query(Transcript).all()
        ],
        "daily_logs": [
            {"id": l.id, "date": l.log_date.isoformat(), "summary": l.summary, "source_transcript_id": l.source_transcript_id}
            for l in db.query(DailyLog).all()
        ],
        "activities": [
            {"id": a.id, "category": a.category, "name": a.name, "duration": a.duration_minutes, "date": a.activity_date.isoformat()}
            for a in db.query(Activity).all()
        ],
        "measurements": [
            {"id": m.id, "metric": m.metric, "value": m.value, "unit": m.unit, "date": m.measurement_date.isoformat(), "status": m.review_status}
            for m in db.query(Measurement).all()
        ],
        "facts": [
            {"id": f.id, "category": f.category, "key": f.key, "value": f.value}
            for f in db.query(PersonalFact).all()
        ],
    }


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
