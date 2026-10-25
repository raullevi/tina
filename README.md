# SKIM — Voice-First Personal Life OS

> **Goal:** Zero-budget, local-first, voice-first personal life operating system.  
> **Status:** Phase 1, Phase 2 & Phase 3 Complete (Foundation, Voice Capture, Faster-Whisper Transcription, Persistent Memory, and Structured Extraction).

---

## Architecture Overview

- **Backend:** Python + FastAPI + SQLAlchemy ORM (SQLite with WAL mode and foreign keys)
- **Speech Recognition (STT):** Local Faster-Whisper (`tiny.en` / `base.en`, INT8, Apple Silicon optimized)
- **Local LLM & Extractor:** Ollama running `llama3.2:3b` with structured JSON schema extraction
- **Data Persistence:** Local SQLite database with tables for `voice_sessions`, `transcripts`, `daily_logs`, `activities`, `measurements`, `personal_facts`, and `audit_log`
- **Frontend:** React + Vite + TypeScript with animated circular voice orb, audio replay, transcript editor, and Personal Memory Dashboard
- **Testing:** 13 automated unit, integration, and restart-persistence tests passing

---

## Key Capabilities (Phase 3: Persistent Memory)

1. **Deterministic Structured Extraction:** Transcripts are automatically analyzed by local Ollama to extract daily summaries, activities, numeric measurements, and personal facts with strict Pydantic validation.
2. **Traceability to Original Source:** Every structured item in the database links directly back to its source transcript via `source_transcript_id`.
3. **Review Status for Measurements:** Measurements can be flagged as `uncertain` and confirmed/corrected by the user via API or UI.
4. **Historical Memory Search:** Instant keyword search across transcripts, daily logs, activities, and facts.
5. **Data Ownership & Export:** Full JSON database export (`/api/memory/export`) ensuring zero vendor lock-in.
6. **Restart Persistence:** Verified through automated tests that simulate engine shutdown and re-querying.

---

## API Endpoints

### System & Health
- `GET /health` or `GET /api/health` — System status (`{"status": "healthy"}`)
- `GET /api/ollama/status` — Local Ollama connectivity and installed models

### Voice & Transcription
- `POST /api/voice/audio` — Upload audio → local Whisper transcription → stores in SQLite
- `GET /api/voice/sessions` — List voice sessions with transcripts and replay links
- `GET /api/voice/sessions/{session_id}/audio` — Stream and replay recorded audio file
- `PUT /api/voice/sessions/{session_id}/transcript` — Edit transcript without modifying raw original text
- `POST /api/voice/sessions/{session_id}/process` — Send voice update to LLM and auto-extract memory entities

### Personal Memory & Historical Retrieval
- `POST /api/memory/extract/{session_id}` — Run structured extraction on a transcript
- `GET /api/memory/daily-logs` — Retrieve daily summary logs
- `GET /api/memory/activities` — Retrieve activities filtered by category (gym, study, work, chore)
- `GET /api/memory/measurements` — Retrieve numeric measurements (weight, sleep, water)
- `PUT /api/memory/measurements/{id}/confirm` — Confirm or correct measurement values
- `GET /api/memory/facts` — Retrieve saved personal facts, preferences, decisions, and goals
- `GET /api/memory/search?q=...` — Keyword search across memory history
- `GET /api/memory/export` — Full JSON export of the personal memory database

---

## Running the Application

### 1. Start the FastAPI Backend
```bash
# In ~/Desktop/askim
source .venv/bin/activate
cd backend
python -m uvicorn app.main:app --reload --port 8000
```
Interactive API documentation: [http://localhost:8000/docs](http://localhost:8000/docs)

### 2. Start the React Frontend
```bash
# In ~/Desktop/askim/frontend
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser:
- **Voice Assistant Tab:** Click the microphone orb, record your update, review the transcript, and send to SKIM.
- **Personal Memory Tab:** View your daily summaries, tracked measurements, activities, search memory, and export your data.

---

## Automated Test Suite

```bash
PYTHONPATH=backend .venv/bin/pytest backend/tests -v
```

**Results: 13/13 Passed (100% pass rate):**
- Configuration defaults and overrides
- Database persistence and hierarchical Life Tree node relations
- Health endpoints (`/health`, `/api/health`)
- Ollama connection and live local prompt test
- Real audio upload, Whisper transcription, audio replay, and transcript editing
- Structured memory extraction schema validation
- Memory extraction and retrieval flow
- **Phase 3 Completion Test:** Application restart persistence verification
