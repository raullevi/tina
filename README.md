# SKIM — Voice-First Personal Life OS

> **Goal:** Zero-budget, local-first, voice-first personal life operating system.  
> **Status:** Phase 1, Phase 2, Phase 3 & Phase 4 Complete (Foundation, Voice Capture, Faster-Whisper, Persistent Memory, and Life Trackers & pandas Analytics with Recharts).

---

## Architecture Overview

- **Backend:** Python + FastAPI + SQLAlchemy ORM (SQLite with WAL mode and foreign keys)
- **Analytics Engine:** Deterministic numerical statistics with `pandas` (no LLM arithmetic hallucinations)
- **Speech Recognition (STT):** Local Faster-Whisper (`tiny.en` / `base.en`, INT8, Apple Silicon optimized)
- **Local LLM & Extractor:** Ollama running `llama3.2:3b` with structured JSON schema extraction
- **Data Persistence:** Local SQLite database with tables for `voice_sessions`, `transcripts`, `daily_logs`, `activities`, `measurements`, `personal_facts`, and `audit_log`
- **Frontend Dashboard:** React + Vite + TypeScript with animated voice orb, audio replay, Personal Memory search, and Recharts analytics
- **Testing:** 16 automated tests covering calculations, database persistence, and weekly reports

---

## Key Capabilities (Phase 4: Life Trackers & Analytics)

1. **Deterministic Weight Trends:** Calculates start, current, min, max, average weight, total delta, and a 7-day rolling average using pandas.
2. **Gym & Workout Analytics:** Computes total sessions, total workout minutes, average session duration, workouts per week, and exercise distribution.
3. **Weekly Progress Report:** Generates a grounded progress report where all statistics mathematically match the database.
4. **Interactive Charts:** Beautiful Recharts area charts for weight progression and bar charts for workout minutes.
5. **Multi-Modal Input:** Log updates via voice (transcribed and auto-extracted) or quick manual log forms.

---

## API Endpoints

### Trackers & Analytics (Phase 4)
- `GET /api/analytics/weight?days=30` — Weight statistics, delta, and daily time series with 7-day rolling average
- `GET /api/analytics/gym?days=30` — Gym session totals, minutes, and daily breakdown
- `GET /api/analytics/weekly-report` — Deterministic weekly report for the past 7 days
- `POST /api/trackers/weight` — Quick manual log for weight measurement
- `POST /api/trackers/gym` — Quick manual log for gym workout

### Voice & Personal Memory (Phase 1–3)
- `POST /api/voice/audio` — Upload audio → local Whisper transcription → stores in SQLite
- `GET /api/voice/sessions` — List voice sessions with audio replay links
- `GET /api/voice/sessions/{session_id}/audio` — Stream and replay recorded audio file
- `POST /api/voice/sessions/{session_id}/process` — Send voice update to LLM and auto-extract memory entities
- `GET /api/memory/daily-logs` — Retrieve daily summary logs
- `GET /api/memory/activities` — Retrieve logged activities
- `GET /api/memory/measurements` — Retrieve numeric measurements
- `PUT /api/memory/measurements/{id}/confirm` — Confirm or calibrate measurement values
- `GET /api/memory/search?q=...` — Keyword search across memory history
- `GET /api/memory/export` — Full JSON database export

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
- **Voice Assistant:** Record daily updates with local Whisper transcription.
- **Personal Memory:** Search daily summaries, habit records, and export data.
- **Trackers & Analytics:** View your interactive Recharts weight progression and gym duration charts, plus weekly progress report.

---

## Automated Test Suite

```bash
PYTHONPATH=backend .venv/bin/pytest backend/tests -v
```

**Results: 16/16 Passed (100% pass rate):**
- Deterministic pandas weight analytics calculations
- Deterministic pandas gym analytics calculations
- **Phase 4 Completion Test:** Weekly report values match database records
- Database persistence and hierarchical Life Tree node relations
- Real audio upload, Whisper transcription, audio replay, and transcript editing
- Structured memory extraction schema validation
- Application restart persistence verification
