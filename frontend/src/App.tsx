import { useState, useEffect, useRef } from "react";
import "./App.css";

interface VoiceSession {
  session_id: number;
  created_at: string;
  status: string;
  duration_seconds: number | null;
  original_text: string | null;
  edited_text: string | null;
  audio_url: string | null;
}

const BACKEND_BASE = "http://localhost:8000";

export function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [statusText, setStatusText] = useState("Ready to listen");
  const [backendOnline, setBackendOnline] = useState(false);
  const [ollamaOnline, setOllamaOnline] = useState(false);

  // Active session state
  const [activeSession, setActiveSession] = useState<{
    sessionId: number;
    originalText: string;
    editedText: string;
    audioUrl: string;
    aiReply?: string;
  } | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessions, setSessions] = useState<VoiceSession[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // System status check and history loader
  const checkStatus = async () => {
    try {
      const resHealth = await fetch(`${BACKEND_BASE}/health`);
      setBackendOnline(resHealth.ok);

      const resOllama = await fetch(`${BACKEND_BASE}/api/ollama/status`);
      if (resOllama.ok) {
        const data = await resOllama.json();
        setOllamaOnline(data.available);
      }
    } catch {
      setBackendOnline(false);
      setOllamaOnline(false);
    }
  };

  const loadSessions = async () => {
    try {
      const res = await fetch(`${BACKEND_BASE}/api/voice/sessions`);
      if (res.ok) {
        const data: VoiceSession[] = await res.json();
        setSessions(data);
      }
    } catch (err) {
      console.error("Error loading voice sessions:", err);
    }
  };

  useEffect(() => {
    checkStatus();
    loadSessions();
    const interval = setInterval(checkStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  // Voice Recording Handlers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        await uploadAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setStatusText("Listening... (Click again to stop)");
    } catch (err) {
      console.error("Microphone access error:", err);
      setStatusText("Microphone access denied or unavailable");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setStatusText("Transcribing locally with Whisper...");
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const uploadAudio = async (blob: Blob) => {
    try {
      const formData = new FormData();
      formData.append("file", blob, "recording.webm");

      const response = await fetch(`${BACKEND_BASE}/api/voice/audio`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed with HTTP ${response.status}`);
      }

      const data = await response.json();
      setActiveSession({
        sessionId: data.session_id,
        originalText: data.original_text,
        editedText: data.original_text,
        audioUrl: `${BACKEND_BASE}${data.audio_url}`,
      });
      setStatusText("Transcription complete! Review or send to AI.");
      await loadSessions();
    } catch (err: unknown) {
      console.error("Transcription error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setStatusText(`Transcription error: ${msg}`);
    }
  };

  // Transcript Edit Handler
  const handleSaveTranscript = async () => {
    if (!activeSession) return;
    setIsSaving(true);
    try {
      const response = await fetch(
        `${BACKEND_BASE}/api/voice/sessions/${activeSession.sessionId}/transcript`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ edited_text: activeSession.editedText }),
        }
      );
      if (response.ok) {
        setStatusText("Transcript corrections saved!");
        await loadSessions();
      }
    } catch (err) {
      console.error("Save transcript error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // AI Processing Handler
  const handleSendToAI = async () => {
    if (!activeSession) return;
    setIsProcessing(true);
    setStatusText("SKIM is thinking with local LLM...");
    try {
      // First save any edited text
      if (activeSession.editedText !== activeSession.originalText) {
        await handleSaveTranscript();
      }

      const response = await fetch(
        `${BACKEND_BASE}/api/voice/sessions/${activeSession.sessionId}/process`,
        { method: "POST" }
      );

      if (response.ok) {
        const result = await response.json();
        setActiveSession((prev) => (prev ? { ...prev, aiReply: result.reply } : null));
        setStatusText("Response received from SKIM!");
      }
    } catch (err) {
      console.error("AI processing error:", err);
      setStatusText("Failed to process with AI.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand">
          <div className="brand-logo">S</div>
          <div>
            <div className="brand-title">SKIM</div>
            <div className="brand-subtitle">Voice-First Personal Life OS</div>
          </div>
        </div>

        <div className="status-badges">
          <div className="badge">
            <span className={`badge-dot ${backendOnline ? "" : "offline"}`} />
            <span>FastAPI Backend</span>
          </div>
          <div className="badge">
            <span className={`badge-dot ${ollamaOnline ? "" : "offline"}`} />
            <span>Ollama (llama3.2:3b)</span>
          </div>
        </div>
      </header>

      {/* Voice Hero Section */}
      <main className="voice-hero">
        <div className={`orb-container ${isRecording ? "recording" : ""}`}>
          <div className="orb-ring ring-outer" />
          <div className="orb-ring ring-mid" />
          <button
            className="mic-button"
            onClick={toggleRecording}
            aria-label={isRecording ? "Stop Recording" : "Start Recording"}
            title="Click to speak"
          >
            <svg
              className="mic-icon"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </button>
        </div>

        <div className="status-label">{statusText}</div>
        <div className="sub-label">
          {isRecording
            ? "Speak your update naturally — press to finish"
            : "Push-to-talk: speak your daily updates, routines, and tasks"}
        </div>
      </main>

      {/* Active Session & Editable Transcript */}
      {activeSession && (
        <section className="session-card">
          <div className="card-header">
            <div className="card-title">
              <span style={{ color: "#38bdf8" }}>●</span> Recorded Voice Update #{activeSession.sessionId}
            </div>
          </div>

          <div className="audio-controls">
            <audio
              controls
              className="audio-player"
              src={activeSession.audioUrl}
            />
          </div>

          <div className="transcript-label">
            <span>Transcribed by Local Whisper (Editable)</span>
            {activeSession.editedText !== activeSession.originalText && (
              <span style={{ color: "#f59e0b" }}>Modified</span>
            )}
          </div>

          <textarea
            className="transcript-textarea"
            value={activeSession.editedText}
            onChange={(e) =>
              setActiveSession({ ...activeSession, editedText: e.target.value })
            }
            placeholder="Edit transcript if Whisper made any speech mistakes..."
          />

          <div className="card-actions">
            <button
              className="btn-secondary"
              onClick={handleSaveTranscript}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save Corrections"}
            </button>
            <button
              className="btn-primary"
              onClick={handleSendToAI}
              disabled={isProcessing}
            >
              {isProcessing ? "Processing..." : "Confirm & Send to SKIM"}
            </button>
          </div>

          {activeSession.aiReply && (
            <div className="ai-reply-box">
              <div className="ai-reply-header">SKIM Assistant Response</div>
              <div className="ai-reply-text">{activeSession.aiReply}</div>
            </div>
          )}
        </section>
      )}

      {/* Recent Voice Sessions History */}
      <section className="history-section">
        <div className="section-title">Recent Voice History</div>
        {sessions.length === 0 ? (
          <div style={{ color: "#64748b", fontSize: "0.9rem" }}>
            No recorded voice sessions yet. Press the microphone button above to record your first update.
          </div>
        ) : (
          <div className="history-list">
            {sessions.map((s) => (
              <div key={s.session_id} className="history-item">
                <div className="history-item-top">
                  <span>Session #{s.session_id} • {new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <span>{s.duration_seconds ? `${s.duration_seconds}s` : ""}</span>
                </div>
                <div className="history-text">
                  {s.edited_text || s.original_text || "(No transcript)"}
                </div>
                {s.audio_url && (
                  <audio
                    controls
                    className="history-audio"
                    src={`${BACKEND_BASE}${s.audio_url}`}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default App;
