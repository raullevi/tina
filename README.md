# SKIM — Voice-First Personal Life OS

> **Goal:** Zero-budget, local-first, voice-first personal life operating system on macOS Apple Silicon.  
> **Status:** Phase 1 through Phase 6 Complete (Foundation, Voice Capture, Faster-Whisper STT, Memory Extraction, Trackers & pandas Analytics, SQLite FTS5 Research Assistant, Life Tree Hierarchy & Routines Scheduler).

---

## Complete Feature Matrix

| Phase | Milestone | Status | Key Highlights |
| :--- | :--- | :---: | :--- |
| **Phase 1** | Foundation & Scaffold | ✅ Complete | FastAPI, SQLite with WAL mode, local Ollama client (`llama3.2:3b`), health checks |
| **Phase 2** | Voice Capture & Local STT | ✅ Complete | Push-to-talk microphone, Faster-Whisper (`tiny.en`), audio storage/replay, non-destructive transcript editing |
| **Phase 3** | Memory & Extraction | ✅ Complete | Structured entity extraction (`daily_logs`, `activities`, `measurements`, `personal_facts`), FTS/keyword search, JSON export |
| **Phase 4** | Life Trackers & Analytics | ✅ Complete | Deterministic pandas statistics (weight trends, 7-day rolling average, gym volume), grounded weekly progress report, Recharts |
| **Phase 5** | Research Assistant | ✅ Complete | Personal document ingestion, SQLite FTS5 full-text indexing, citation-backed LLM question answering |
| **Phase 6** | Life Tree & My Day | ✅ Complete | Hierarchical life clusters (Health, Work, Growth, Finance, Personal), automated daily routine task generation, task completion, Next Best Action recommendation |

---

## Architecture Overview

```
                      ┌────────────────────────────────────────┐
                      │    React + Vite + TypeScript UI        │
                      │  (Voice / My Day / Life Tree /         │
                      │   Research / Trackers / Memory)        │
                      └───────────────────┬────────────────────┘
                                          │ REST API
                                          ▼
                      ┌────────────────────────────────────────┐
                      │          FastAPI Backend Engine        │
                      ├────────────────────────────────────────┤
                      │ • Local Faster-Whisper STT (INT8 CPU)  │
                      │ • Local Ollama LLM (llama3.2:3b)       │
                      │ • Pandas Deterministic Analytics       │
                      │ • SQLite FTS5 Search & Document Engine │
                      │ • Routine Scheduler & Life Tree Router │
                      └───────────────────┬────────────────────┘
                                          │ SQLAlchemy ORM
                                          ▼
                      ┌────────────────────────────────────────┐
                      │       Local SQLite Database (WAL)      │
                      │  (skim.db - zero cloud transmission)   │
                      └────────────────────────────────────────┘
```

---

## API Endpoints Reference

### Life Tree & My Day (Phase 6)
- `GET /api/life-tree` — Get complete hierarchical tree of clusters, routine counts, and overdue tasks
- `GET /api/life-tree/{cluster_id}/workspace` — Get cluster detail, child nodes, routines, and active goals
- `GET /api/my-day/tasks?target_date=YYYY-MM-DD` — Get daily scheduled routine occurrences (creates on-demand)
- `POST /api/my-day/tasks/{task_id}/complete` — Complete a scheduled routine task
- `GET /api/my-day/next-action` — Get AI-prioritized Next Best Action recommendation based on overdue tasks and time of day

### Research Assistant & Documents (Phase 5)
- `POST /api/research/documents` — Ingest and index personal document into SQLite FTS5
- `GET /api/research/documents` — List all indexed documents
- `GET /api/research/search?q=...` — Full-text keyword search across documents using FTS5
- `POST /api/research/query` — Ask a question to the local Research Assistant with source citations

### Trackers & Analytics (Phase 4)
- `GET /api/analytics/weight?days=30` — Weight statistics, delta, and daily time series with 7-day rolling average
- `GET /api/analytics/gym?days=30` — Gym session totals, minutes, and daily breakdown
- `GET /api/analytics/weekly-report` — Deterministic weekly report for the past 7 days
- `POST /api/trackers/weight` — Quick manual log for weight measurement
- `POST /api/trackers/gym` — Quick manual log for gym workout

### Voice & Personal Memory (Phases 1–3)
- `POST /api/voice/audio` — Upload audio → local Faster-Whisper transcription → store in SQLite
- `GET /api/voice/sessions` — List voice sessions with audio replay links
- `GET /api/voice/sessions/{session_id}/audio` — Stream and replay recorded audio file
- `POST /api/voice/sessions/{session_id}/process` — Send voice update to LLM and auto-extract memory entities
- `GET /api/memory/daily-logs` — Retrieve daily summary logs
- `GET /api/memory/activities` — Retrieve logged activities
- `GET /api/memory/measurements` — Retrieve numeric measurements
- `PUT /api/memory/measurements/{id}/confirm` — Confirm or calibrate measurement values
- `GET /api/memory/search?q=...` — Search across memory history
- `GET /api/memory/export` — Full JSON database export

---

## Running the Application

### 1. Prerequisites
- macOS Apple Silicon (M1/M2/M3)
- Ollama running locally: `ollama run llama3.2:3b`
- Python 3.9+ with virtualenv in `.venv`
- Node.js 18+

### 2. Start the FastAPI Backend
```bash
# In ~/Desktop/askim
source .venv/bin/activate
cd backend
python -m uvicorn app.main:app --reload --port 8000
```
- Interactive Swagger API docs: [http://localhost:8000/docs](http://localhost:8000/docs)
- Health Check: [http://localhost:8000/health](http://localhost:8000/health)

### 3. Start the React Frontend Dashboard
```bash
# In ~/Desktop/askim/frontend
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser:
- 🎙️ **Voice Assistant:** Push-to-talk recording, glowing waveform orb, local STT, editable transcript, AI auto-extraction.
- ⚡ **My Day:** Daily schedule, routine completion checklist, and Recommended Next Action.
- 🌳 **Life Tree:** Hierarchical clusters (Health, Work, Growth, Finance, Personal) and cluster workspaces.
- 🔍 **Research:** Ingest personal notes/protocols, SQLite FTS5 search, and citation-backed Q&A.
- 📊 **Trackers:** Interactive Recharts area and bar charts, verified weekly report card, and quick log forms.
- 🧠 **Memory:** Searchable personal memory history, measurement reviews, and full JSON export.

---

## Automated Test Suite

Run the full automated test suite:
```bash
PYTHONPATH=backend .venv/bin/pytest backend/tests -v
```

**Results: 20/20 Passed (100% pass rate):**
- ✅ `test_config.py`: Settings, defaults, environment overrides, cached settings.
- ✅ `test_db.py`: Database models, WAL mode, foreign keys, Life Tree nodes.
- ✅ `test_ollama.py`: Local Ollama connection, health check, live inference.
- ✅ `test_voice_audio.py`: Local Faster-Whisper STT, audio replay, transcript editing.
- ✅ `test_voice_stub.py`: Voice mock pipeline endpoint flow.
- ✅ `test_memory.py`: Extraction schema validation, memory endpoints, restart persistence.
- ✅ `test_analytics.py`: Pandas deterministic calculations, 7-day rolling average, gym duration, and verified weekly report.
- ✅ `test_life_os.py`: FTS5 document indexing, source-backed Research Assistant with citations, Life Tree clusters, My Day routine scheduler, and Next Best Action recommendation.
