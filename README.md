# SKIM — Voice-First Personal Life OS

> **Goal:** Zero-budget, local-first, voice-first personal life operating system.  
> **Status:** Phase 1 (Foundation & Local AI) Complete.

---

## Architecture Overview (Phase 1)

- **Backend:** Python + FastAPI with SQLAlchemy ORM and SQLite
- **Frontend:** React + Vite + TypeScript (scaffolded in `frontend/`)
- **Local LLM:** Ollama running local model (`llama3.2:3b` default)
- **Local STT Engine:** whisper.cpp ready for audio processing in Phase 2
- **Persistence:** Local SQLite (`skim.db`) with WAL mode and foreign keys enabled
- **Testing:** Automated pytest suite covering config, database, health, and Ollama

---

## Project Structure

```text
askim/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py             # Pydantic Settings (Ollama URL, DB path, timeout)
│   │   ├── main.py               # FastAPI app, health & voice stub endpoints
│   │   ├── db/
│   │   │   ├── __init__.py
│   │   │   ├── session.py        # SQLAlchemy engine, sessionmaker, init_db
│   │   │   └── models.py         # VoiceSession, Transcript, LifeNode, RoutineRule, etc.
│   │   └── services/
│   │       ├── __init__.py
│   │       └── ollama.py         # Ollama async REST client
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── test_config.py        # Unit tests for settings & env overrides
│   │   ├── test_db.py            # SQLite table creation & persistence tests
│   │   ├── test_ollama.py        # Health check & local LLM integration test
│   │   └── test_voice_stub.py    # POST /api/voice end-to-end integration test
│   ├── requirements.txt
│   └── .env.example
├── frontend/                     # React + Vite + TypeScript web interface
├── .gitignore
└── README.md
```

---

## Setup & Running Guide

### 1. Prerequisites
- **macOS (Apple Silicon)** with 16GB RAM
- **Python 3.9+**
- **Node.js 18+** & npm
- **Ollama** running locally (`ollama --version`, `ollama pull llama3.2:3b`)

### 2. Backend Setup & Run

```bash
# Activate virtual environment
source .venv/bin/activate

# Install dependencies (if needed)
pip install -r backend/requirements.txt

# Run FastAPI backend server
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

Available endpoints:
- **Interactive Swagger Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health Check:** `GET http://localhost:8000/health` → `{"status": "healthy"}`
- **Ollama Status:** `GET http://localhost:8000/api/ollama/status`
- **Voice Stub (Simulated Voice Input):**
  ```bash
  curl -X POST http://localhost:8000/api/voice \
    -H "Content-Type: application/json" \
    -d '{"text": "I walked 15 minutes after dinner today."}'
  ```
  Returns:
  ```json
  {
    "reply": "Noted! Great job getting that walk in.",
    "session_id": 1
  }
  ```

### 3. Frontend Setup & Run

```bash
cd frontend
npm install
npm run dev
```
Accessible at [http://localhost:5173](http://localhost:5173).

---

## Automated Test Suite

Run all tests:
```bash
PYTHONPATH=backend .venv/bin/pytest backend/tests -v
```

**Test Coverage (9/9 Passed):**
1. `test_default_settings`: Validates default config and parameters.
2. `test_settings_environment_override`: Verifies environment variable overrides.
3. `test_get_settings_cached`: Verifies singleton configuration.
4. `test_voice_session_and_transcript_persistence`: Verifies SQLite schema storage.
5. `test_life_node_creation`: Verifies hierarchical Life Tree database relations.
6. `test_health_endpoints`: Verifies `/health` and `/api/health`.
7. `test_ollama_status`: Verifies Ollama connectivity.
8. `test_ollama_live_prompt`: Verifies live local text completion.
9. `test_voice_stub_endpoint_flow`: Verifies `POST /api/voice` end-to-end flow with SQLite persistence.
