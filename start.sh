#!/usr/bin/env bash
# Tina Life OS - One-command local runner with hot reload
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "🤖 Warming up Ollama model (llama3.1:8b)..."
curl -s http://localhost:11434/api/generate -d '{"model": "llama3.1:8b", "keep_alive": "60m"}' > /dev/null 2>&1 || true

echo "🚀 Starting Backend (FastAPI with auto-reload on :8000)..."
.venv/bin/uvicorn app.main:app --app-dir backend --reload --port 8000 &
BACKEND_PID=$!

echo "⚡ Starting Frontend (Vite with hot-reload on :5173)..."
npm --prefix frontend run dev &
FRONTEND_PID=$!

cleanup() {
    echo ""
    echo "🛑 Shutting down Tina Life OS..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

echo ""
echo "✨ Tina Life OS is live!"
echo "   💻 Frontend: http://localhost:5173"
echo "   🧠 Backend:  http://localhost:8000"
echo "   (Press Ctrl+C to stop both)"
echo ""

wait
