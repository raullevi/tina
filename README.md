# SKIM — Personal AI Assistant

> **Goal:** Zero-budget, local-first, voice-first personal AI assistant.  
> **Status:** Phase 1 Complete (Foundation & Local AI).

---

## Current Architecture (Phase 1)

- **Backend:** FastAPI (Python 3.9+)
- **Local LLM:** Ollama running `llama3.2:3b` on Apple Silicon Metal acceleration
- **Configuration:** Pydantic Settings with `.env` support
- **Testing:** Pytest with async unit & integration tests

---

## Getting Started (Beginner Guide)

### 1. Prerequisites

Ensure you have the following installed on your Mac:
- **Python 3.9+** (comes standard on macOS or install via Homebrew/python.org)
- **Ollama** ([ollama.com](https://ollama.com))

To verify Ollama and download the recommended model:
```bash
# Check Ollama version
ollama --version

# Pull the lightweight model optimized for 16GB Macs
ollama pull llama3.2:3b
```

### 2. Activate Virtual Environment

The project uses an isolated virtual environment (`.venv`):

```bash
# From the project root (~/Desktop/askim)
source .venv/bin/activate
```

*(To install or update dependencies in the future: `pip install -r backend/requirements.txt`)*

### 3. Run the Backend Server

Start the local FastAPI development server:

```bash
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

Once started:
- **Interactive API Documentation (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)
- **System Health Check:** [http://localhost:8000/api/health](http://localhost:8000/api/health)
- **Ollama Status:** [http://localhost:8000/api/ollama/status](http://localhost:8000/api/ollama/status)

### 4. Test a Local LLM Prompt

You can test local text generation using `curl`:

```bash
curl -X POST http://localhost:8000/api/ollama/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Give me a one-sentence tip for productive personal journaling."}'
```

---

## Running the Automated Test Suite

Run the full unit and integration test suite:

```bash
# From the project root (~/Desktop/askim)
PYTHONPATH=backend .venv/bin/pytest backend/tests -v
```

This verifies:
1. Default configuration handling and environment overrides.
2. FastAPI `/api/health` endpoint.
3. Ollama daemon connectivity and model availability.
4. An actual live prompt execution through local `llama3.2:3b`.

---

## Roadmap

- [x] **Phase 1: Foundation & Local AI** (FastAPI, Ollama connection, config, health tests)
- [ ] **Phase 2: Voice Capture** (Push-to-talk, local `whisper.cpp` transcription, editable transcript)
- [ ] **Phase 3: Persistent Memory** (SQLite schemas, daily logs, structured extraction)
- [ ] **Phase 4: First Tracker** (Weight, gym, activity analytics with pandas)
- [ ] **Phase 5: Research Assistant** (Document search, FTS5, source attribution)
- [ ] **Phase 6: Expansion & UI Dashboard** (React + Vite + Recharts frontend)
