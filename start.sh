#!/usr/bin/env bash
# Tina Life OS - 100% Local Launcher with Phone Access
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1")

echo "🤖 1/3 Pre-warming Ollama (llama3.1:8b) in VRAM..."
curl -s http://localhost:11434/api/generate -d '{"model": "llama3.1:8b", "keep_alive": "60m"}' > /dev/null 2>&1 || true

echo "🧠 2/3 Starting FastAPI Backend (with auto-reload on :8000)..."
.venv/bin/uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

echo "⚡ 3/3 Starting React/Vite Frontend (on :5173)..."
npm --prefix frontend run dev -- --host 0.0.0.0 --port 5173 &
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
echo "=========================================================="
echo "✨ Tina Life OS is Running 100% Locally on your Mac (HTTPS)!"
echo ""
echo "💻 Mac Browser:    https://localhost:5173"
echo "📱 iPhone/Network: https://${LOCAL_IP}:5173"
echo ""
echo "🎙️  Note for iPhone: Use https:// so iOS prompts for microphone access!"
echo "=========================================================="
echo "   (Press Ctrl+C in this terminal to stop)"
echo ""

# Automatically open in default browser
(sleep 1.5 && open "https://localhost:5173") &

wait
