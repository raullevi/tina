# SKIM — Voice-First Personal Life OS

> **Goal:** Zero-budget, local-first, voice-first personal life operating system.  
> **Status:** Phase 1 & Phase 2 Complete (Foundation, Local AI, Voice Capture, Whisper Transcription, and Audio Replay).

---

## Architecture Overview

- **Backend:** Python + FastAPI + SQLAlchemy ORM (SQLite with WAL mode)
- **Speech Recognition (STT):** Local Faster-Whisper (`tiny.en` / `base.en`, INT8, Apple Silicon optimized)
- **Local LLM:** Ollama running `llama3.2:3b`
- **Audio Storage:** Local `recordings/` directory with streaming audio playback
- **Frontend:** React + Vite + TypeScript with animated circular voice orb, live push-to-talk microphone, and transcript editor
- **Testing:** 10 automated unit and integration tests passing

---

## Key Voice Capabilities (Phase 2)

1. **Push-to-Talk Recording:** In-browser WebAudio microphone recording with pulsing waveform visualizer.
2. **Local Speech Transcription:** High-performance local transcription with Faster-Whisper (zero external API calls).
3. **Immutable History & Traceability:** Original raw transcript is permanently stored in SQLite alongside any user edits.
4. **Audio Replay:** Stream and replay recorded audio sessions directly in the browser.
5. **AI Processing:** Send confirmed/edited voice updates to Ollama (`llama3.2:3b`) for structured understanding and acknowledgement.

---

## API Endpoints

### System & Health
- `GET /health` or `GET /api/health` — System status (`{"status": "healthy"}`)
- `GET /api/ollama/status` — Local Ollama connectivity and installed models

### Voice & Transcription
- `POST /api/voice/audio` — Upload audio file (WAV/WebM/MP3) → transcribes with Whisper → stores in SQLite → returns session ID, transcript, and audio URL
- `GET /api/voice/sessions` — List recent voice recording sessions with transcripts and timestamps
- `GET /api/voice/sessions/{session_id}/audio` — Stream and replay recorded audio file
- `GET /api/voice/sessions/{session_id}/transcript` — Retrieve original and edited transcript
- `PUT /api/voice/sessions/{session_id}/transcript` — Edit transcript text without modifying original text
- `POST /api/voice/sessions/{session_id}/process` — Send voice update to local Ollama LLM
- `POST /api/voice` — Simulated voice text stub (for automated testing and text inputs)

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
- Click the microphone orb to record your voice.
- See the transcript populate automatically via local Whisper.
- Review and edit the transcript.
- Click **"Confirm & Send to SKIM"** to have your local LLM respond!

---

## Automated Test Suite

```bash
PYTHONPATH=backend .venv/bin/pytest backend/tests -v
```

**Results: 10/10 Passed:**
- Configuration defaults and overrides
- Database persistence and hierarchical Life Tree node relations
- Health endpoints (`/health`, `/api/health`)
- Ollama connection and live local prompt test
- Real audio upload, Whisper transcription, audio replay, and transcript editing
