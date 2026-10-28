from contextlib import asynccontextmanager
from datetime import date, datetime
import json
import os
import re
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
    Document,
    ResearchSource,
    Goal,
    LifeNode,
    RoutineRule,
    TaskOccurrence,
    RoutineWorkflow,
    RoutineCycle,
)
from app.db.session import get_db, init_db
from app.services.extractor import ExtractionService
from app.services.ollama import OllamaService
from app.services.transcription import TranscriptionService
from app.services.analytics import AnalyticsEngine
from app.services.research import ResearchService
from app.services.scheduler import LifeOSService

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

# CORS setup for local React + Vite frontend, local network Wi-Fi devices, and Vercel
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ],
    allow_origin_regex=r"^(https://.*\.vercel\.app|https://.*\.ts\.net|http://.*\.ts\.net|http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|100\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?)$",
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


class CreateDailyLogRequest(BaseModel):
    log_date: Optional[str] = None
    summary: str = Field(..., min_length=1)


class UpdateDailyLogRequest(BaseModel):
    log_date: Optional[str] = None
    summary: Optional[str] = None


class CreateActivityRequest(BaseModel):
    category: str = Field(default="general")
    name: str = Field(..., min_length=1)
    duration_minutes: Optional[float] = None
    activity_date: Optional[str] = None
    notes: Optional[str] = None


class UpdateActivityRequest(BaseModel):
    category: Optional[str] = None
    name: Optional[str] = None
    duration_minutes: Optional[float] = None
    activity_date: Optional[str] = None
    notes: Optional[str] = None


class CreateMeasurementRequest(BaseModel):
    metric: str = Field(..., min_length=1)
    value: float
    unit: str = Field(default="count")
    measurement_date: Optional[str] = None
    review_status: str = Field(default="confirmed")
    notes: Optional[str] = None


class UpdateMeasurementRequest(BaseModel):
    metric: Optional[str] = None
    value: Optional[float] = None
    unit: Optional[str] = None
    measurement_date: Optional[str] = None
    review_status: Optional[str] = None
    notes: Optional[str] = None


class CreatePersonalFactRequest(BaseModel):
    category: str = Field(default="fact")
    key: str = Field(..., min_length=1)
    value: str = Field(..., min_length=1)


class UpdatePersonalFactRequest(BaseModel):
    category: Optional[str] = None
    key: Optional[str] = None
    value: Optional[str] = None


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
        "message": "Welcome to Tina - Personal Life OS",
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


def try_parse_task_intent(raw_text: str) -> Optional[Dict[str, str]]:
    """Parse task and cluster intent from user voice or text input."""
    text_clean = raw_text.strip()

    # Pattern 1: (create|add|schedule|set up) (new )?task in (this cluster|cluster )?<cluster>[:\s-]+<title>
    p1 = re.compile(
        r"^(?:create|add|schedule|set up|insert)(?:\s+a)?(?:\s+new)?\s+task\s+(?:in|under)\s+(?:this\s+cluster\s+|cluster\s+)?([A-Za-z0-9\s&]+?)(?:\s*[:\-–—]\s*|\s+named\s+|\s+called\s+|\s+to\s+)(.+)$",
        re.IGNORECASE,
    )
    m1 = p1.match(text_clean)
    if m1:
        cluster = m1.group(1).strip()
        title = m1.group(2).strip()
        if cluster and title:
            return {"cluster": cluster, "title": title}

    # Pattern 2: (create|add|schedule) (new )?task[:\s]+<title>\s+(in|under)\s+(this cluster|cluster )?<cluster>
    p2 = re.compile(
        r"^(?:create|add|schedule)(?:\s+a)?(?:\s+new)?\s+task(?:\s*[:\-–—]\s*|\s+)(.+?)\s+(?:in|under)\s+(?:this\s+cluster\s+|cluster\s+)?([A-Za-z0-9\s&]+)$",
        re.IGNORECASE,
    )
    m2 = p2.match(text_clean)
    if m2:
        title = m2.group(1).strip()
        cluster = m2.group(2).strip()
        if cluster and title:
            return {"cluster": cluster, "title": title}

    # Pattern 3: in (cluster )?<cluster>[:\s]+(create|add|schedule) (new )?task[:\s]+<title>
    p3 = re.compile(
        r"^(?:in|under)\s+(?:this\s+cluster\s+|cluster\s+)?([A-Za-z0-9\s&]+?)(?:\s*[:\-–—]\s*|\s+)(?:create|add|schedule)(?:\s+a)?(?:\s+new)?\s+task(?:\s*[:\-–—]\s*|\s+)(.+)$",
        re.IGNORECASE,
    )
    m3 = p3.match(text_clean)
    if m3:
        cluster = m3.group(1).strip()
        title = m3.group(2).strip()
        if cluster and title:
            return {"cluster": cluster, "title": title}

    # Pattern 4: new task in <cluster>[:\s]+<title>
    p4 = re.compile(
        r"^new\s+task\s+(?:in|under)\s+(?:this\s+cluster\s+|cluster\s+)?([A-Za-z0-9\s&]+?)(?:\s*[:\-–—]\s*|\s+to\s+|\s+)(.+)$",
        re.IGNORECASE,
    )
    m4 = p4.match(text_clean)
    if m4:
        cluster = m4.group(1).strip()
        title = m4.group(2).strip()
        if cluster and title:
            return {"cluster": cluster, "title": title}

    return None


@app.post("/api/voice/sessions/{session_id}/process", response_model=ProcessSessionResponse, tags=["Voice"])
async def process_session_with_ai(
    session_id: int,
    db: Session = Depends(get_db),
) -> ProcessSessionResponse:
    """Send confirmed transcript to Ollama LLM and auto-trigger memory & task extraction."""
    transcript = db.query(Transcript).filter(Transcript.session_id == session_id).first()
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found for session")

    active_text = transcript.edited_text or transcript.original_text

    system_prompt = (
        "You are Tina, a private local voice-first personal life operating system assistant for Raul. "
        "The primary language is always English. Always respond strictly in clear, natural English. "
        "Acknowledge Raul's spoken update concisely, identify any routines or tasks mentioned, "
        "and keep your response encouraging and brief."
    )

    ollama_res = await ollama_service.generate(
        prompt=active_text,
        system_prompt=system_prompt,
    )

    created_task_confirmations = []

    # 1. Direct regex check for fast task creation intent
    direct_task = try_parse_task_intent(active_text)
    if direct_task:
        try:
            task_info = LifeOSService.create_task_in_cluster(
                db=db,
                title=direct_task["title"],
                cluster_name=direct_task["cluster"],
            )
            created_task_confirmations.append(
                f"• Created task **{task_info['title']}** in cluster **{task_info['cluster']}**"
            )
        except Exception as exc:
            print(f"Direct task creation error: {exc}")

    # 2. Automatically extract structured memory entities and AI-detected tasks
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

        # Process any AI-extracted tasks not already created
        for t in extraction.tasks:
            if not any(t.title.lower() in c.lower() for c in created_task_confirmations):
                try:
                    task_info = LifeOSService.create_task_in_cluster(
                        db=db,
                        title=t.title,
                        cluster_name=t.cluster,
                        schedule_type=t.schedule_type or "daily",
                        duration_minutes=t.duration_minutes,
                        details=t.notes,
                    )
                    created_task_confirmations.append(
                        f"• Created task **{task_info['title']}** in cluster **{task_info['cluster']}**"
                    )
                except Exception as t_err:
                    print(f"AI task creation error: {t_err}")

        db.commit()
    except Exception as exc:
        print(f"Auto-extraction warning: {exc}")

    reply = ollama_res.get("response", "Noted.").strip()
    if created_task_confirmations:
        reply += "\n\n" + "\n".join(created_task_confirmations) + "\n\n*(Scheduled in Life Tree & active in My Day)*"

    return ProcessSessionResponse(
        session_id=session_id,
        processed_text=active_text,
        reply=reply,
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


# --- Daily Log Create / Update / Delete ---
@app.post("/api/memory/daily-logs", response_model=DailyLogResponse, tags=["Memory"])
async def create_daily_log(req: CreateDailyLogRequest, db: Session = Depends(get_db)) -> DailyLogResponse:
    d = date.fromisoformat(req.log_date) if req.log_date else date.today()
    log = DailyLog(log_date=d, summary=req.summary.strip())
    db.add(log)
    db.commit()
    db.refresh(log)
    db.add(AuditLog(action="created", entity="daily_logs", entity_id=log.id, description=f"Created daily log for {d}"))
    db.commit()
    return DailyLogResponse(id=log.id, log_date=log.log_date.isoformat(), summary=log.summary, created_at=log.created_at.isoformat())


@app.put("/api/memory/daily-logs/{log_id}", response_model=DailyLogResponse, tags=["Memory"])
async def update_daily_log(log_id: int, req: UpdateDailyLogRequest, db: Session = Depends(get_db)) -> DailyLogResponse:
    log = db.query(DailyLog).filter(DailyLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Daily log not found")
    if req.log_date:
        try:
            log.log_date = date.fromisoformat(req.log_date)
        except ValueError:
            pass
    if req.summary is not None and req.summary.strip():
        log.summary = req.summary.strip()
    db.add(AuditLog(action="updated", entity="daily_logs", entity_id=log.id, description=f"Updated daily log id {log.id}"))
    db.commit()
    db.refresh(log)
    return DailyLogResponse(id=log.id, log_date=log.log_date.isoformat(), summary=log.summary, created_at=log.created_at.isoformat())


@app.delete("/api/memory/daily-logs/{log_id}", tags=["Memory"])
async def delete_daily_log(log_id: int, db: Session = Depends(get_db)) -> Dict[str, Any]:
    log = db.query(DailyLog).filter(DailyLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Daily log not found")
    db.delete(log)
    db.add(AuditLog(action="deleted", entity="daily_logs", entity_id=log_id, description=f"Deleted daily log id {log_id}"))
    db.commit()
    return {"status": "deleted", "id": log_id}


# --- Activity Create / Update / Delete ---
@app.post("/api/memory/activities", response_model=ActivityResponse, tags=["Memory"])
async def create_activity(req: CreateActivityRequest, db: Session = Depends(get_db)) -> ActivityResponse:
    d = date.fromisoformat(req.activity_date) if req.activity_date else date.today()
    act = Activity(category=req.category.strip(), name=req.name.strip(), duration_minutes=req.duration_minutes, activity_date=d, notes=req.notes)
    db.add(act)
    db.commit()
    db.refresh(act)
    db.add(AuditLog(action="created", entity="activities", entity_id=act.id, description=f"Created activity {act.name}"))
    db.commit()
    return ActivityResponse(id=act.id, category=act.category, name=act.name, duration_minutes=act.duration_minutes, activity_date=act.activity_date.isoformat(), notes=act.notes)


@app.put("/api/memory/activities/{activity_id}", response_model=ActivityResponse, tags=["Memory"])
async def update_activity(activity_id: int, req: UpdateActivityRequest, db: Session = Depends(get_db)) -> ActivityResponse:
    act = db.query(Activity).filter(Activity.id == activity_id).first()
    if not act:
        raise HTTPException(status_code=404, detail="Activity not found")
    if req.category is not None and req.category.strip():
        act.category = req.category.strip()
    if req.name is not None and req.name.strip():
        act.name = req.name.strip()
    if req.duration_minutes is not None:
        act.duration_minutes = req.duration_minutes
    if req.activity_date:
        try:
            act.activity_date = date.fromisoformat(req.activity_date)
        except ValueError:
            pass
    if req.notes is not None:
        act.notes = req.notes
    db.add(AuditLog(action="updated", entity="activities", entity_id=act.id, description=f"Updated activity id {act.id}"))
    db.commit()
    db.refresh(act)
    return ActivityResponse(id=act.id, category=act.category, name=act.name, duration_minutes=act.duration_minutes, activity_date=act.activity_date.isoformat(), notes=act.notes)


@app.delete("/api/memory/activities/{activity_id}", tags=["Memory"])
async def delete_activity(activity_id: int, db: Session = Depends(get_db)) -> Dict[str, Any]:
    act = db.query(Activity).filter(Activity.id == activity_id).first()
    if not act:
        raise HTTPException(status_code=404, detail="Activity not found")
    name = act.name
    db.delete(act)
    db.add(AuditLog(action="deleted", entity="activities", entity_id=activity_id, description=f"Deleted activity id {activity_id} ({name})"))
    db.commit()
    return {"status": "deleted", "id": activity_id, "name": name}


# --- Measurement Create / Update / Delete ---
@app.post("/api/memory/measurements", response_model=MeasurementResponse, tags=["Memory"])
async def create_measurement(req: CreateMeasurementRequest, db: Session = Depends(get_db)) -> MeasurementResponse:
    d = date.fromisoformat(req.measurement_date) if req.measurement_date else date.today()
    meas = Measurement(metric=req.metric.strip(), value=req.value, unit=req.unit.strip(), measurement_date=d, review_status=req.review_status, notes=req.notes)
    db.add(meas)
    db.commit()
    db.refresh(meas)
    db.add(AuditLog(action="created", entity="measurements", entity_id=meas.id, description=f"Created measurement {meas.metric}"))
    db.commit()
    return MeasurementResponse(id=meas.id, metric=meas.metric, value=meas.value, unit=meas.unit, measurement_date=meas.measurement_date.isoformat(), review_status=meas.review_status, notes=meas.notes)


@app.put("/api/memory/measurements/{measurement_id}", response_model=MeasurementResponse, tags=["Memory"])
async def update_measurement(measurement_id: int, req: UpdateMeasurementRequest, db: Session = Depends(get_db)) -> MeasurementResponse:
    meas = db.query(Measurement).filter(Measurement.id == measurement_id).first()
    if not meas:
        raise HTTPException(status_code=404, detail="Measurement not found")
    if req.metric is not None and req.metric.strip():
        meas.metric = req.metric.strip()
    if req.value is not None:
        meas.value = req.value
    if req.unit is not None and req.unit.strip():
        meas.unit = req.unit.strip()
    if req.measurement_date:
        try:
            meas.measurement_date = date.fromisoformat(req.measurement_date)
        except ValueError:
            pass
    if req.review_status is not None:
        meas.review_status = req.review_status
    if req.notes is not None:
        meas.notes = req.notes
    db.add(AuditLog(action="updated", entity="measurements", entity_id=meas.id, description=f"Updated measurement id {meas.id}"))
    db.commit()
    db.refresh(meas)
    return MeasurementResponse(id=meas.id, metric=meas.metric, value=meas.value, unit=meas.unit, measurement_date=meas.measurement_date.isoformat(), review_status=meas.review_status, notes=meas.notes)


@app.delete("/api/memory/measurements/{measurement_id}", tags=["Memory"])
async def delete_measurement(measurement_id: int, db: Session = Depends(get_db)) -> Dict[str, Any]:
    meas = db.query(Measurement).filter(Measurement.id == measurement_id).first()
    if not meas:
        raise HTTPException(status_code=404, detail="Measurement not found")
    metric = meas.metric
    db.delete(meas)
    db.add(AuditLog(action="deleted", entity="measurements", entity_id=measurement_id, description=f"Deleted measurement id {measurement_id} ({metric})"))
    db.commit()
    return {"status": "deleted", "id": measurement_id, "metric": metric}


# --- Personal Fact Create / Update / Delete ---
@app.post("/api/memory/facts", response_model=PersonalFactResponse, tags=["Memory"])
async def create_personal_fact(req: CreatePersonalFactRequest, db: Session = Depends(get_db)) -> PersonalFactResponse:
    fact = PersonalFact(category=req.category.strip(), key=req.key.strip(), value=req.value.strip())
    db.add(fact)
    db.commit()
    db.refresh(fact)
    db.add(AuditLog(action="created", entity="facts", entity_id=fact.id, description=f"Created fact {fact.key}"))
    db.commit()
    return PersonalFactResponse(id=fact.id, category=fact.category, key=fact.key, value=fact.value)


@app.put("/api/memory/facts/{fact_id}", response_model=PersonalFactResponse, tags=["Memory"])
async def update_personal_fact(fact_id: int, req: UpdatePersonalFactRequest, db: Session = Depends(get_db)) -> PersonalFactResponse:
    fact = db.query(PersonalFact).filter(PersonalFact.id == fact_id).first()
    if not fact:
        raise HTTPException(status_code=404, detail="Fact not found")
    if req.category is not None and req.category.strip():
        fact.category = req.category.strip()
    if req.key is not None and req.key.strip():
        fact.key = req.key.strip()
    if req.value is not None and req.value.strip():
        fact.value = req.value.strip()
    db.add(AuditLog(action="updated", entity="facts", entity_id=fact.id, description=f"Updated fact id {fact.id}"))
    db.commit()
    db.refresh(fact)
    return PersonalFactResponse(id=fact.id, category=fact.category, key=fact.key, value=fact.value)


@app.delete("/api/memory/facts/{fact_id}", tags=["Memory"])
async def delete_personal_fact(fact_id: int, db: Session = Depends(get_db)) -> Dict[str, Any]:
    fact = db.query(PersonalFact).filter(PersonalFact.id == fact_id).first()
    if not fact:
        raise HTTPException(status_code=404, detail="Fact not found")
    key = fact.key
    db.delete(fact)
    db.add(AuditLog(action="deleted", entity="facts", entity_id=fact_id, description=f"Deleted fact id {fact_id} ({key})"))
    db.commit()
    return {"status": "deleted", "id": fact_id, "key": key}


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
        "You are Tina, a private local voice-first personal life operating system assistant. "
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


# ---------------------------------------------------------
# Phase 4: Life Trackers & Analytics Endpoints (pandas)
# ---------------------------------------------------------

class LogWeightRequest(BaseModel):
    value: float = Field(..., gt=0, description="Weight measurement value")
    unit: str = Field(default="kg", description="Unit of measurement (kg, lbs)")
    date: Optional[str] = Field(None, description="YYYY-MM-DD or defaults to today")
    notes: Optional[str] = None


class LogGymRequest(BaseModel):
    name: str = Field(..., min_length=1, description="Exercise or workout name (e.g., 'Bench Press')")
    duration_minutes: float = Field(..., gt=0, description="Duration in minutes")
    category: str = Field(default="gym", description="gym, fitness, workout")
    date: Optional[str] = Field(None, description="YYYY-MM-DD or defaults to today")
    notes: Optional[str] = None


@app.get("/api/analytics/weight", tags=["Analytics"])
async def get_weight_analytics(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Calculate deterministic weight trends using pandas."""
    return AnalyticsEngine.get_weight_analytics(db, days=days)


@app.get("/api/analytics/gym", tags=["Analytics"])
async def get_gym_analytics(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Calculate deterministic gym and workout analytics using pandas."""
    return AnalyticsEngine.get_gym_analytics(db, days=days)


@app.get("/api/analytics/weekly-report", tags=["Analytics"])
async def get_weekly_report(
    target_date: Optional[str] = Query(None, description="Reference end date YYYY-MM-DD"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Phase 4 Weekly Progress Report:
    Calculates deterministic weekly statistics for weight, fitness, and daily logs.
    """
    ref_d = date.fromisoformat(target_date) if target_date else date.today()
    return AnalyticsEngine.generate_weekly_report(db, target_date=ref_d)


@app.post("/api/trackers/weight", response_model=MeasurementResponse, tags=["Trackers"])
async def log_weight_manual(
    req: LogWeightRequest,
    db: Session = Depends(get_db),
) -> MeasurementResponse:
    """Manually log a weight measurement."""
    m_date = date.fromisoformat(req.date) if req.date else date.today()
    meas = Measurement(
        metric="weight",
        value=req.value,
        unit=req.unit,
        measurement_date=m_date,
        review_status="confirmed",
        notes=req.notes,
    )
    db.add(meas)
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


@app.post("/api/trackers/gym", response_model=ActivityResponse, tags=["Trackers"])
async def log_gym_manual(
    req: LogGymRequest,
    db: Session = Depends(get_db),
) -> ActivityResponse:
    """Manually log a gym workout activity."""
    a_date = date.fromisoformat(req.date) if req.date else date.today()
    act = Activity(
        name=req.name,
        category=req.category,
        duration_minutes=req.duration_minutes,
        activity_date=a_date,
        notes=req.notes,
    )
    db.add(act)
    db.commit()
    db.refresh(act)
    return ActivityResponse(
        id=act.id,
        name=act.name,
        category=act.category,
        duration_minutes=act.duration_minutes,
        activity_date=act.activity_date.isoformat(),
        notes=act.notes,
        source_transcript_id=act.source_transcript_id,
    )


# ---------------------------------------------------------
# Phase 5: Documents & Research Assistant (FTS5) Endpoints
# ---------------------------------------------------------

research_service = ResearchService(ollama_service=ollama_service)


class CreateDocumentRequest(BaseModel):
    title: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1)
    filename: Optional[str] = None


class ResearchQueryRequest(BaseModel):
    question: str = Field(..., min_length=1)


@app.post("/api/documents", tags=["Research"])
async def create_document(
    req: CreateDocumentRequest,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Import a personal document and index with SQLite FTS5."""
    doc = Document(
        title=req.title,
        content=req.content,
        filename=req.filename,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    ResearchService.index_document(db, doc.id, doc.title, doc.content)
    return {"id": doc.id, "title": doc.title, "status": "indexed"}


@app.get("/api/documents", tags=["Research"])
async def list_documents(db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    """List imported personal documents."""
    docs = db.query(Document).order_by(Document.id.desc()).all()
    return [{"id": d.id, "title": d.title, "filename": d.filename, "created_at": d.created_at.isoformat()} for d in docs]


@app.get("/api/documents/search", tags=["Research"])
async def search_documents_fts(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """Search personal documents using SQLite FTS5."""
    return ResearchService.search_documents(db, q)


@app.post("/api/research/query", tags=["Research"])
async def query_research_assistant(
    req: ResearchQueryRequest,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Ask a question grounded in personal documents with source citations, or create tasks in life clusters."""
    text_clean = req.question.strip()

    # 1. Fast regex match for task creation in cluster
    direct_task = try_parse_task_intent(text_clean)
    if direct_task:
        try:
            task_info = LifeOSService.create_task_in_cluster(
                db=db,
                title=direct_task["title"],
                cluster_name=direct_task["cluster"],
            )
            return {
                "question": req.question,
                "answer": (
                    f"Created new task **{task_info['title']}** under cluster **{task_info['cluster']}**.\n\n"
                    f"It has been saved to your **Life Tree** and is now active in **My Day**."
                ),
                "sources": [],
                "created_task": task_info,
            }
        except Exception as exc:
            print(f"Error creating task from query intent: {exc}")

    # 2. Check for task creation keywords that LLM extraction should handle
    lower_q = text_clean.lower()
    if ("task" in lower_q or "routine" in lower_q) and (
        "create" in lower_q
        or "add" in lower_q
        or "new" in lower_q
        or "schedule" in lower_q
        or "cluster" in lower_q
    ):
        try:
            extraction = await extraction_service.extract_from_text(text_clean)
            if extraction.tasks:
                created = []
                for t in extraction.tasks:
                    info = LifeOSService.create_task_in_cluster(
                        db=db,
                        title=t.title,
                        cluster_name=t.cluster,
                        schedule_type=t.schedule_type or "daily",
                        duration_minutes=t.duration_minutes,
                        details=t.notes,
                    )
                    created.append(f"• **{info['title']}** in cluster **{info['cluster']}**")
                return {
                    "question": req.question,
                    "answer": (
                        "Created the following task(s):\n\n"
                        + "\n".join(created)
                        + "\n\nSaved to your **Life Tree** and active in **My Day**."
                    ),
                    "sources": [],
                    "created_tasks": created,
                }
        except Exception as exc:
            print(f"Extraction error for task query: {exc}")

    return await research_service.answer_with_research(req.question, db)


# ---------------------------------------------------------
# Phase 6: Life Tree, Routines, My Day, Next Action Endpoints
# ---------------------------------------------------------

class CreateLifeNodeRequest(BaseModel):
    name: str = Field(..., min_length=1)
    type: str = Field(default="cluster")
    description: Optional[str] = None
    parent_id: Optional[int] = None


class CreateRoutineRequest(BaseModel):
    node_id: int
    name: str = Field(..., min_length=1)
    schedule_type: str = Field(default="daily", description="daily, weekly, interval")
    interval_days: Optional[int] = None
    weekday: Optional[int] = None
    duration_minutes: Optional[int] = None
    details: Optional[str] = None


@app.get("/api/life-tree", tags=["Life OS"])
async def get_life_tree(db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    """Retrieve full hierarchical Life Tree with cluster stats and active routines."""
    return LifeOSService.get_life_tree(db)


@app.post("/api/life-tree/nodes", tags=["Life OS"])
async def create_life_node(
    req: CreateLifeNodeRequest,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Create a new cluster or life tree node."""
    node = LifeNode(
        name=req.name,
        type=req.type,
        description=req.description,
        parent_id=req.parent_id,
    )
    db.add(node)
    db.commit()
    db.refresh(node)
    return {"id": node.id, "name": node.name, "type": node.type}


@app.post("/api/routines", tags=["Life OS"])
async def create_routine(
    req: CreateRoutineRequest,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Create a recurring routine rule under a life cluster."""
    routine = RoutineRule(
        node_id=req.node_id,
        name=req.name,
        schedule_type=req.schedule_type,
        interval_days=req.interval_days,
        weekday=req.weekday,
        duration_minutes=req.duration_minutes,
        details=req.details,
    )
    db.add(routine)
    db.commit()
    db.refresh(routine)
    return {"id": routine.id, "name": routine.name, "status": "created"}


@app.get("/api/routines", tags=["Life OS"])
async def list_routines(db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    """List all scheduled routine rules."""
    routines = db.query(RoutineRule).all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "schedule_type": r.schedule_type,
            "duration_minutes": r.duration_minutes,
            "cluster": r.node.name if r.node else None,
            "enabled": r.enabled,
        }
        for r in routines
    ]


@app.get("/api/tasks/due", tags=["Life OS"])
async def get_due_tasks_today(db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    """Retrieve all tasks due today for 'My Day' plan."""
    return LifeOSService.get_or_generate_due_tasks(db)


@app.post("/api/task_occurrences/{occurrence_id}/complete", tags=["Life OS"])
async def complete_task_occurrence(
    occurrence_id: int,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Mark a task occurrence as completed."""
    occ = db.query(TaskOccurrence).filter(TaskOccurrence.id == occurrence_id).first()
    if not occ:
        raise HTTPException(status_code=404, detail="Task occurrence not found")

    occ.status = "completed"
    occ.completed_at = datetime.utcnow()
    db.commit()
    return {"status": "completed", "task_id": occ.id, "title": occ.title}


class UpdateTaskRequest(BaseModel):
    title: Optional[str] = None
    cluster: Optional[str] = None
    duration_minutes: Optional[int] = None
    status: Optional[str] = None
    due_date: Optional[str] = None
    notes: Optional[str] = None


@app.put("/api/tasks/{task_id}", tags=["Life OS"])
async def update_task(
    task_id: int,
    req: UpdateTaskRequest,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Update an existing task occurrence and its associated routine rule."""
    occ = db.query(TaskOccurrence).filter(TaskOccurrence.id == task_id).first()
    if not occ:
        raise HTTPException(status_code=404, detail="Task not found")

    if req.title is not None and req.title.strip():
        occ.title = req.title.strip()
    if req.status is not None:
        occ.status = req.status
        if req.status == "completed" and not occ.completed_at:
            occ.completed_at = datetime.utcnow()
        elif req.status == "pending":
            occ.completed_at = None
    if req.notes is not None:
        occ.notes = req.notes
    if req.due_date is not None:
        try:
            occ.due_date = date.fromisoformat(req.due_date)
        except ValueError:
            pass

    # Update linked routine if present
    if occ.routine_id:
        routine = db.query(RoutineRule).filter(RoutineRule.id == occ.routine_id).first()
        if routine:
            if req.title is not None and req.title.strip():
                routine.name = req.title.strip()
            if req.duration_minutes is not None:
                routine.duration_minutes = req.duration_minutes
            if req.cluster is not None and req.cluster.strip():
                node = db.query(LifeNode).filter(LifeNode.name.ilike(req.cluster.strip())).first()
                if not node:
                    node = LifeNode(name=req.cluster.strip(), type="cluster")
                    db.add(node)
                    db.flush()
                routine.node_id = node.id

    db.commit()
    db.refresh(occ)

    cluster_name = occ.routine.node.name if (occ.routine and occ.routine.node) else (req.cluster or "Personal")
    duration = occ.routine.duration_minutes if occ.routine else req.duration_minutes

    return {
        "id": occ.id,
        "title": occ.title,
        "cluster": cluster_name,
        "duration_minutes": duration,
        "status": occ.status,
        "due_date": occ.due_date.isoformat(),
        "completed_at": occ.completed_at.isoformat() if occ.completed_at else None,
        "notes": occ.notes,
    }


@app.delete("/api/tasks/{task_id}", tags=["Life OS"])
async def delete_task(
    task_id: int,
    delete_rule: bool = True,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Delete a task occurrence, and optionally its routine rule so it doesn't reappear."""
    occ = db.query(TaskOccurrence).filter(TaskOccurrence.id == task_id).first()
    if not occ:
        raise HTTPException(status_code=404, detail="Task not found")

    title = occ.title
    routine_id = occ.routine_id
    db.delete(occ)

    if delete_rule and routine_id:
        rule = db.query(RoutineRule).filter(RoutineRule.id == routine_id).first()
        if rule:
            db.delete(rule)

    db.commit()
    return {"status": "deleted", "task_id": task_id, "title": title}


class UpdateRoutineRequest(BaseModel):
    name: Optional[str] = None
    schedule_type: Optional[str] = None
    duration_minutes: Optional[int] = None
    enabled: Optional[bool] = None
    cluster: Optional[str] = None


@app.put("/api/routines/{routine_id}", tags=["Life OS"])
async def update_routine(
    routine_id: int,
    req: UpdateRoutineRequest,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Update a routine rule."""
    routine = db.query(RoutineRule).filter(RoutineRule.id == routine_id).first()
    if not routine:
        raise HTTPException(status_code=404, detail="Routine not found")

    if req.name is not None and req.name.strip():
        routine.name = req.name.strip()
    if req.schedule_type is not None:
        routine.schedule_type = req.schedule_type
    if req.duration_minutes is not None:
        routine.duration_minutes = req.duration_minutes
    if req.enabled is not None:
        routine.enabled = req.enabled
    if req.cluster is not None and req.cluster.strip():
        node = db.query(LifeNode).filter(LifeNode.name.ilike(req.cluster.strip())).first()
        if node:
            routine.node_id = node.id

    db.commit()
    db.refresh(routine)
    return {
        "id": routine.id,
        "name": routine.name,
        "schedule_type": routine.schedule_type,
        "duration_minutes": routine.duration_minutes,
        "enabled": routine.enabled,
        "cluster": routine.node.name if routine.node else None,
    }


@app.delete("/api/routines/{routine_id}", tags=["Life OS"])
async def delete_routine(
    routine_id: int,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Delete a routine rule and all its occurrences."""
    routine = db.query(RoutineRule).filter(RoutineRule.id == routine_id).first()
    if not routine:
        raise HTTPException(status_code=404, detail="Routine not found")

    name = routine.name
    db.delete(routine)
    db.commit()
    return {"status": "deleted", "routine_id": routine_id, "name": name}


@app.get("/api/next_action", tags=["Life OS"])
async def get_next_action(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Get the next recommended action based on today's schedule."""
    return LifeOSService.get_next_best_action(db)


class CreateTaskInClusterRequest(BaseModel):
    title: str = Field(..., min_length=1)
    cluster: str = Field(default="Personal Life")
    schedule_type: str = Field(default="daily")
    duration_minutes: Optional[int] = None
    details: Optional[str] = None


@app.post("/api/tasks/create", tags=["Life OS"])
async def create_task_in_cluster_endpoint(
    req: CreateTaskInClusterRequest,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Explicitly create a task and routine under a life cluster."""
    return LifeOSService.create_task_in_cluster(
        db=db,
        title=req.title,
        cluster_name=req.cluster,
        schedule_type=req.schedule_type,
        duration_minutes=req.duration_minutes,
        details=req.details,
    )


class CreateManualTaskRequest(BaseModel):
    title: str = Field(..., min_length=1)
    description: Optional[str] = None
    type: str = Field(default="flexible", description="one-time, recurring, event, deadline, project, flexible")
    primaryClusterId: Optional[int] = None
    primaryCluster: Optional[str] = "Health & Fitness"
    priority: str = Field(default="medium", description="low, medium, high")
    dueDate: Optional[str] = None
    estimatedDurationMinutes: Optional[int] = None
    schedule: Optional[Dict[str, Any]] = None
    linkedGoalIds: List[int] = Field(default_factory=list)
    dependencies: List[str] = Field(default_factory=list)
    subtasks: List[str] = Field(default_factory=list)
    triggerEvent: Optional[str] = None


@app.post("/api/tasks/manual", tags=["Life OS"])
async def create_manual_task_endpoint(
    req: CreateManualTaskRequest,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Manually creates a task with type-specific configuration. Deterministic, zero LLM calls."""
    return LifeOSService.create_manual_task(
        db=db,
        title=req.title,
        task_type=req.type,
        primary_cluster_id=req.primaryClusterId,
        primary_cluster_name=req.primaryCluster,
        description=req.description,
        priority=req.priority,
        due_date=req.dueDate,
        estimated_duration_minutes=req.estimatedDurationMinutes,
        schedule=req.schedule,
        linked_goal_ids=req.linkedGoalIds,
        dependencies=req.dependencies,
        subtasks=req.subtasks,
        trigger_event=req.triggerEvent,
    )


# ---------------------------------------------------------
# TINA — Routine Builder & Workflow Engine Endpoints
# ---------------------------------------------------------

DEFAULT_LAUNDRY_ROUTINE = {
    "name": "Laundry",
    "description": "Keep clothes clean, dry, ironed, and stored every week.",
    "recurrence": "weekly",
    "status": "active",
    "stages": [
        {
            "id": "stage-1",
            "name": "Collect clothes",
            "icon": "🧺",
            "description": "Put worn clothes in the laundry bin daily.",
            "schedule": "Daily",
            "trigger": "scheduled",
            "duration_minutes": 5,
            "dependency": None,
            "completion_rule": "manual",
            "missed_behavior": "reschedule",
            "position": {"x": 260, "y": 60}
        },
        {
            "id": "stage-2",
            "name": "Wash clothes",
            "icon": "🧼",
            "description": "Run washing machine with detergent and softener.",
            "schedule": "Friday or Saturday",
            "trigger": "after_stage",
            "duration_minutes": 45,
            "dependency": "stage-1",
            "completion_rule": "manual",
            "missed_behavior": "delayed",
            "position": {"x": 260, "y": 210}
        },
        {
            "id": "stage-3",
            "name": "Dry clothes",
            "icon": "☀️",
            "description": "Hang clothes on drying rack or transfer to dryer.",
            "schedule": "After washing",
            "trigger": "after_stage",
            "duration_minutes": 60,
            "dependency": "stage-2",
            "completion_rule": "manual",
            "missed_behavior": "delayed",
            "position": {"x": 260, "y": 360}
        },
        {
            "id": "stage-4",
            "name": "Iron clothes",
            "icon": "👔",
            "description": "Iron work shirts and clean garments.",
            "schedule": "Sunday",
            "trigger": "after_stage",
            "duration_minutes": 30,
            "dependency": "stage-3",
            "completion_rule": "manual",
            "missed_behavior": "wait_dependency",
            "position": {"x": 260, "y": 510}
        },
        {
            "id": "stage-5",
            "name": "Store clothes",
            "icon": "🗄️",
            "description": "Fold and put clean clothes away in closets and drawers.",
            "schedule": "After ironing",
            "trigger": "after_stage",
            "duration_minutes": 15,
            "dependency": "stage-4",
            "completion_rule": "manual",
            "missed_behavior": "delayed",
            "position": {"x": 260, "y": 660}
        }
    ],
    "connections": [
        {"id": "conn-1-2", "sourceStageId": "stage-1", "targetStageId": "stage-2", "type": "sequence"},
        {"id": "conn-2-3", "sourceStageId": "stage-2", "targetStageId": "stage-3", "type": "sequence"},
        {"id": "conn-3-4", "sourceStageId": "stage-3", "targetStageId": "stage-4", "type": "sequence"},
        {"id": "conn-4-5", "sourceStageId": "stage-4", "targetStageId": "stage-5", "type": "sequence"}
    ],
    "branch_rules": []
}


def ensure_seed_routines(db: Session):
    existing = db.query(RoutineWorkflow).first()
    if not existing:
        seed = RoutineWorkflow(
            name=DEFAULT_LAUNDRY_ROUTINE["name"],
            description=DEFAULT_LAUNDRY_ROUTINE["description"],
            recurrence=DEFAULT_LAUNDRY_ROUTINE["recurrence"],
            status=DEFAULT_LAUNDRY_ROUTINE["status"],
            stages_json=json.dumps(DEFAULT_LAUNDRY_ROUTINE["stages"]),
            connections_json=json.dumps(DEFAULT_LAUNDRY_ROUTINE["connections"]),
            branch_rules_json=json.dumps(DEFAULT_LAUNDRY_ROUTINE["branch_rules"]),
        )
        db.add(seed)
        db.flush()
        initial_occurrences = {
            "stage-1": {"status": "ready", "completed_at": None, "notes": None},
            "stage-2": {"status": "waiting", "completed_at": None, "notes": None},
            "stage-3": {"status": "waiting", "completed_at": None, "notes": None},
            "stage-4": {"status": "waiting", "completed_at": None, "notes": None},
            "stage-5": {"status": "waiting", "completed_at": None, "notes": None},
        }
        cycle = RoutineCycle(
            routine_id=seed.id,
            cycle_start=datetime.utcnow(),
            status="in_progress",
            occurrences_json=json.dumps(initial_occurrences),
        )
        db.add(cycle)
        db.commit()


def format_routine_dict(r: RoutineWorkflow, db: Session, include_history: bool = False) -> Dict[str, Any]:
    stages = json.loads(r.stages_json or "[]")
    connections = json.loads(r.connections_json or "[]")
    branch_rules = json.loads(r.branch_rules_json or "[]")

    active_cycle_row = (
        db.query(RoutineCycle)
        .filter(RoutineCycle.routine_id == r.id)
        .order_by(RoutineCycle.id.desc())
        .first()
    )
    if not active_cycle_row:
        initial_occ = {
            s.get("id"): {"status": "ready" if i == 0 else "waiting", "completed_at": None, "notes": None}
            for i, s in enumerate(stages)
        }
        active_cycle_row = RoutineCycle(
            routine_id=r.id,
            cycle_start=datetime.utcnow(),
            status="in_progress",
            occurrences_json=json.dumps(initial_occ),
        )
        db.add(active_cycle_row)
        db.commit()
        db.refresh(active_cycle_row)

    occurrences = json.loads(active_cycle_row.occurrences_json or "{}")

    # Update dependencies state for any uncompleted stage
    for s in stages:
        sid = s.get("id")
        if sid not in occurrences:
            occurrences[sid] = {"status": "waiting", "completed_at": None, "notes": None}
        elif occurrences[sid].get("status") == "waiting":
            deps = [c["sourceStageId"] for c in connections if c.get("targetStageId") == sid]
            if not deps or all(occurrences.get(d, {}).get("status") in ("completed", "skipped") for d in deps):
                occurrences[sid]["status"] = "ready"

    total_stages = len(stages)
    completed_count = sum(1 for sid, occ in occurrences.items() if occ.get("status") in ("completed", "skipped"))
    pct = int((completed_count / total_stages * 100)) if total_stages > 0 else 0

    next_actionable = None
    for s in stages:
        sid = s.get("id")
        occ = occurrences.get(sid, {})
        st = occ.get("status", "waiting")
        if st in ("ready", "in_progress", "delayed"):
            next_actionable = sid
            break

    cycle_data = {
        "id": active_cycle_row.id,
        "cycle_start": active_cycle_row.cycle_start.isoformat(),
        "cycle_end": active_cycle_row.cycle_end.isoformat() if active_cycle_row.cycle_end else None,
        "status": active_cycle_row.status,
        "completed_at": active_cycle_row.completed_at.isoformat() if active_cycle_row.completed_at else None,
        "occurrences": occurrences,
        "progress": {
            "completed": completed_count,
            "total": total_stages,
            "percentage": pct,
        },
        "next_actionable_stage_id": next_actionable,
    }

    history = []
    if include_history:
        past_cycles = (
            db.query(RoutineCycle)
            .filter(RoutineCycle.routine_id == r.id)
            .order_by(RoutineCycle.id.desc())
            .limit(10)
            .all()
        )
        for c in past_cycles:
            occ_c = json.loads(c.occurrences_json or "{}")
            comp_c = sum(1 for sid, occ in occ_c.items() if occ.get("status") in ("completed", "skipped"))
            history.append({
                "id": c.id,
                "cycle_start": c.cycle_start.isoformat(),
                "cycle_end": c.cycle_end.isoformat() if c.cycle_end else None,
                "status": c.status,
                "completed_at": c.completed_at.isoformat() if c.completed_at else None,
                "completed_stages": comp_c,
                "total_stages": total_stages,
            })

    return {
        "id": r.id,
        "name": r.name,
        "description": r.description or "",
        "recurrence": r.recurrence,
        "status": r.status,
        "created_at": r.created_at.isoformat(),
        "updated_at": r.updated_at.isoformat(),
        "stages": stages,
        "connections": connections,
        "branch_rules": branch_rules,
        "active_cycle": cycle_data,
        "history": history,
    }


class CreateRoutineRequest(BaseModel):
    name: str = Field(..., min_length=1)
    description: Optional[str] = None
    recurrence: str = Field(default="weekly")
    status: str = Field(default="active")
    stages: List[Dict[str, Any]] = Field(default_factory=list)
    connections: List[Dict[str, Any]] = Field(default_factory=list)
    branch_rules: List[Dict[str, Any]] = Field(default_factory=list)


class UpdateRoutineRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    recurrence: Optional[str] = None
    status: Optional[str] = None


class UpdateWorkflowRequest(BaseModel):
    stages: List[Dict[str, Any]]
    connections: List[Dict[str, Any]]
    branch_rules: Optional[List[Dict[str, Any]]] = None


class AdvanceCycleRequest(BaseModel):
    stage_id: str
    status: str = Field(..., description="completed, delayed, skipped, in_progress, ready, waiting")
    notes: Optional[str] = None


@app.get("/api/routine-workflows", tags=["Routine Builder"])
async def list_routines(db: Session = Depends(get_db)):
    """Lists all routines with stages, connections, and active cycle summaries."""
    ensure_seed_routines(db)
    routines = db.query(RoutineWorkflow).order_by(RoutineWorkflow.id.asc()).all()
    return [format_routine_dict(r, db, include_history=False) for r in routines]


@app.post("/api/routine-workflows", tags=["Routine Builder"])
async def create_routine(req: CreateRoutineRequest, db: Session = Depends(get_db)):
    """Creates a new routine workflow and initializes its first cycle."""
    # If no stages provided, provide a starter stage
    stages = req.stages
    if not stages:
        stages = [
            {
                "id": "stage-1",
                "name": "First Step",
                "icon": "✨",
                "description": "Initial stage of this routine.",
                "schedule": "Daily",
                "trigger": "scheduled",
                "duration_minutes": 15,
                "dependency": None,
                "completion_rule": "manual",
                "missed_behavior": "reschedule",
                "position": {"x": 260, "y": 80},
            }
        ]

    routine = RoutineWorkflow(
        name=req.name,
        description=req.description,
        recurrence=req.recurrence,
        status=req.status,
        stages_json=json.dumps(stages),
        connections_json=json.dumps(req.connections),
        branch_rules_json=json.dumps(req.branch_rules),
    )
    db.add(routine)
    db.flush()

    initial_occ = {
        s.get("id"): {"status": "ready" if i == 0 else "waiting", "completed_at": None, "notes": None}
        for i, s in enumerate(stages)
    }
    cycle = RoutineCycle(
        routine_id=routine.id,
        cycle_start=datetime.utcnow(),
        status="in_progress",
        occurrences_json=json.dumps(initial_occ),
    )
    db.add(cycle)
    db.commit()
    db.refresh(routine)

    return format_routine_dict(routine, db, include_history=True)


@app.get("/api/routine-workflows/{routine_id}", tags=["Routine Builder"])
async def get_routine(routine_id: int, db: Session = Depends(get_db)):
    """Retrieves full details for a routine, including workflow canvas and cycle history."""
    routine = db.query(RoutineWorkflow).filter(RoutineWorkflow.id == routine_id).first()
    if not routine:
        raise HTTPException(status_code=404, detail="Routine not found")
    return format_routine_dict(routine, db, include_history=True)


@app.put("/api/routine-workflows/{routine_id}", tags=["Routine Builder"])
async def update_routine(routine_id: int, req: UpdateRoutineRequest, db: Session = Depends(get_db)):
    """Updates high-level metadata (name, description, recurrence, status) for a routine."""
    routine = db.query(RoutineWorkflow).filter(RoutineWorkflow.id == routine_id).first()
    if not routine:
        raise HTTPException(status_code=404, detail="Routine not found")

    if req.name is not None:
        routine.name = req.name.strip()
    if req.description is not None:
        routine.description = req.description.strip()
    if req.recurrence is not None:
        routine.recurrence = req.recurrence
    if req.status is not None:
        routine.status = req.status
    routine.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(routine)
    return format_routine_dict(routine, db, include_history=True)


@app.delete("/api/routine-workflows/{routine_id}", tags=["Routine Builder"])
async def delete_routine(routine_id: int, db: Session = Depends(get_db)):
    """Deletes a routine workflow and all associated cycle records."""
    routine = db.query(RoutineWorkflow).filter(RoutineWorkflow.id == routine_id).first()
    if not routine:
        raise HTTPException(status_code=404, detail="Routine not found")
    db.delete(routine)
    db.commit()
    return {"status": "deleted", "id": routine_id}


@app.put("/api/routine-workflows/{routine_id}/workflow", tags=["Routine Builder"])
async def update_workflow(routine_id: int, req: UpdateWorkflowRequest, db: Session = Depends(get_db)):
    """Saves workflow stages (positions, triggers, schedules) and connection links."""
    routine = db.query(RoutineWorkflow).filter(RoutineWorkflow.id == routine_id).first()
    if not routine:
        raise HTTPException(status_code=404, detail="Routine not found")

    routine.stages_json = json.dumps(req.stages)
    routine.connections_json = json.dumps(req.connections)
    if req.branch_rules is not None:
        routine.branch_rules_json = json.dumps(req.branch_rules)
    routine.updated_at = datetime.utcnow()

    # Sync active cycle occurrences for any newly added stages and prune removed stages
    active_cycle_row = (
        db.query(RoutineCycle)
        .filter(RoutineCycle.routine_id == routine.id)
        .order_by(RoutineCycle.id.desc())
        .first()
    )
    if active_cycle_row:
        occ = json.loads(active_cycle_row.occurrences_json or "{}")
        valid_stage_ids = {s.get("id") for s in req.stages if s.get("id")}
        # Remove occurrences for stages that were deleted
        occ = {k: v for k, v in occ.items() if k in valid_stage_ids}
        for s in req.stages:
            sid = s.get("id")
            if sid and sid not in occ:
                occ[sid] = {"status": "waiting", "completed_at": None, "notes": None}
        active_cycle_row.occurrences_json = json.dumps(occ)

    db.commit()
    db.refresh(routine)
    return format_routine_dict(routine, db, include_history=False)


@app.post("/api/routine-workflows/{routine_id}/cycle/advance", tags=["Routine Builder"])
async def advance_routine_cycle(routine_id: int, req: AdvanceCycleRequest, db: Session = Depends(get_db)):
    """Advances stage status in the active cycle (e.g. marked complete or delayed)."""
    routine = db.query(RoutineWorkflow).filter(RoutineWorkflow.id == routine_id).first()
    if not routine:
        raise HTTPException(status_code=404, detail="Routine not found")

    cycle = (
        db.query(RoutineCycle)
        .filter(RoutineCycle.routine_id == routine.id)
        .order_by(RoutineCycle.id.desc())
        .first()
    )
    if not cycle:
        cycle = RoutineCycle(
            routine_id=routine.id,
            cycle_start=datetime.utcnow(),
            status="in_progress",
            occurrences_json="{}",
        )
        db.add(cycle)
        db.flush()

    occurrences = json.loads(cycle.occurrences_json or "{}")
    stage_occ = occurrences.get(req.stage_id, {})
    stage_occ["status"] = req.status
    if req.status == "completed":
        stage_occ["completed_at"] = datetime.utcnow().isoformat()
    if req.notes is not None:
        stage_occ["notes"] = req.notes
    occurrences[req.stage_id] = stage_occ

    stages = json.loads(routine.stages_json or "[]")
    connections = json.loads(routine.connections_json or "[]")

    # If completed, unlock downstream dependents
    if req.status in ("completed", "skipped"):
        downstream = [c["targetStageId"] for c in connections if c.get("sourceStageId") == req.stage_id]
        for ds in downstream:
            ds_occ = occurrences.get(ds, {})
            if ds_occ.get("status") in ("waiting", None):
                # Check if all upstream sources are now complete
                upstream = [c["sourceStageId"] for c in connections if c.get("targetStageId") == ds]
                if all(occurrences.get(u, {}).get("status") in ("completed", "skipped") for u in upstream):
                    ds_occ["status"] = "ready"
                    occurrences[ds] = ds_occ

    # Check if all stages in routine are complete
    all_done = all(occurrences.get(s.get("id"), {}).get("status") in ("completed", "skipped") for s in stages)
    if all_done and len(stages) > 0:
        cycle.status = "completed"
        cycle.completed_at = datetime.utcnow()
        cycle.cycle_end = datetime.utcnow()

    cycle.occurrences_json = json.dumps(occurrences)
    db.commit()
    db.refresh(routine)

    return format_routine_dict(routine, db, include_history=True)


@app.post("/api/routine-workflows/{routine_id}/cycle/reset", tags=["Routine Builder"])

async def reset_routine_cycle(routine_id: int, db: Session = Depends(get_db)):
    """Archives current cycle and initializes a fresh cycle run."""
    routine = db.query(RoutineWorkflow).filter(RoutineWorkflow.id == routine_id).first()
    if not routine:
        raise HTTPException(status_code=404, detail="Routine not found")

    # Mark active cycle ended
    prev_cycle = (
        db.query(RoutineCycle)
        .filter(RoutineCycle.routine_id == routine.id)
        .order_by(RoutineCycle.id.desc())
        .first()
    )
    if prev_cycle and not prev_cycle.cycle_end:
        prev_cycle.cycle_end = datetime.utcnow()

    stages = json.loads(routine.stages_json or "[]")
    initial_occ = {
        s.get("id"): {"status": "ready" if i == 0 else "waiting", "completed_at": None, "notes": None}
        for i, s in enumerate(stages)
    }
    new_cycle = RoutineCycle(
        routine_id=routine.id,
        cycle_start=datetime.utcnow(),
        status="in_progress",
        occurrences_json=json.dumps(initial_occ),
    )
    db.add(new_cycle)
    db.commit()

    return format_routine_dict(routine, db, include_history=True)



