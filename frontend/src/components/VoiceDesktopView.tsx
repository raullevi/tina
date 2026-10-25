import React, { useState, useEffect, useRef } from "react";
import "./VoiceDesktopView.css";

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  senderName: string;
  text: string;
  timestamp: string;
  audioUrl?: string;
}

export interface VoiceDesktopViewProps {
  isRecording: boolean;
  statusText: string;
  toggleRecording: () => void;
  activeSession: {
    sessionId: number;
    originalText: string;
    editedText: string;
    audioUrl?: string;
    aiReply?: string;
  } | null;
  sessions: Array<{
    session_id: number;
    created_at: string;
    original_text?: string | null;
    edited_text?: string | null;
    audio_url?: string | null;
    duration_seconds?: number | null;
  }>;
  handleSaveTranscript: () => void;
  handleSendToAI: () => void;
  isSaving: boolean;
  isProcessing: boolean;
  setActiveSession: (session: any) => void;
  onSendMessage?: (text: string) => Promise<string | void>;
}

export const VoiceDesktopView: React.FC<VoiceDesktopViewProps> = ({
  isRecording,
  statusText,
  toggleRecording,
  activeSession,
  sessions,
  handleSaveTranscript,
  handleSendToAI,
  isSaving,
  isProcessing,
  setActiveSession,
  onSendMessage,
}) => {
  const [inputText, setInputText] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("Auto-Detect");
  const [showLangMenu, setShowLangMenu] = useState(false);

  // Notification Toast (Calendar / Action Scheduled banner)
  const [toast, setToast] = useState<{
    icon: string;
    title: string;
    date: string;
    detail: string;
    status: string;
  } | null>(null);

  // Chat messages thread
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      sender: "user",
      senderName: "John",
      text: "Hi, Thena, can you set a meeting reminder for me?",
      timestamp: "9:40 AM",
    },
    {
      id: "2",
      sender: "assistant",
      senderName: "Thena",
      text: "Of course, John. When would you like to schedule your event?",
      timestamp: "9:40 AM",
    },
    {
      id: "3",
      sender: "user",
      senderName: "John",
      text: "Let's aim for tomorrow.",
      timestamp: "9:41 AM",
    },
    {
      id: "4",
      sender: "assistant",
      senderName: "Thena",
      text: "Do you have a preferred time?",
      timestamp: "9:41 AM",
    },
    {
      id: "5",
      sender: "user",
      senderName: "John",
      text: "7 AM would be perfect.",
      timestamp: "9:41 AM",
    },
    {
      id: "6",
      sender: "assistant",
      senderName: "Thena",
      text: "Got it, John! Scheduled in your daily plan.",
      timestamp: "9:41 AM",
    },
  ]);

  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeSession && activeSession.editedText) {
      const userText = activeSession.editedText;
      const alreadyHas = messages.some((m) => m.text === userText);
      if (!alreadyHas) {
        const newMsg: ChatMessage = {
          id: `user-${activeSession.sessionId}-${Date.now()}`,
          sender: "user",
          senderName: "John",
          text: userText,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          audioUrl: activeSession.audioUrl,
        };
        setMessages((prev) => [...prev, newMsg]);
      }
    }

    if (activeSession && activeSession.aiReply) {
      const reply = activeSession.aiReply;
      const alreadyHas = messages.some((m) => m.text === reply);
      if (!alreadyHas) {
        const replyMsg: ChatMessage = {
          id: `ai-${activeSession.sessionId}-${Date.now()}`,
          sender: "assistant",
          senderName: "Thena",
          text: reply,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, replyMsg]);

        setToast({
          icon: "📅",
          title: "Calendar",
          date: `FRIDAY, ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()}`,
          detail: userTextSummary(activeSession.editedText),
          status: "Scheduled",
        });
      }
    }
  }, [activeSession]);

  const userTextSummary = (txt: string) => {
    if (!txt) return "Voice Update Logged";
    if (txt.length > 35) return txt.slice(0, 32) + "...";
    return txt;
  };

  const handleSendInput = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const userText = inputText.trim();
    setInputText("");

    const newMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      senderName: "John",
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, newMsg]);

    if (onSendMessage) {
      const res = await onSendMessage(userText);
      if (res) {
        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          sender: "assistant",
          senderName: "Thena",
          text: res,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, aiMsg]);
        setToast({
          icon: "📅",
          title: "Calendar",
          date: `FRIDAY, ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()}`,
          detail: userText,
          status: "Scheduled",
        });
      }
    }
  };

  const scrollToBottom = () => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const selectPastSession = (s: typeof sessions[0]) => {
    setActiveSession({
      sessionId: s.session_id,
      originalText: s.original_text || "",
      editedText: s.edited_text || s.original_text || "",
      audioUrl: s.audio_url ? `http://127.0.0.1:8000${s.audio_url}` : undefined,
    });
  };

  return (
    <div className="pc-voice-container">
      {/* Toast Notification */}
      {toast && (
        <div className="pc-action-toast">
          <div className="toast-left">
            <span className="toast-icon">{toast.icon}</span>
            <div>
              <div className="toast-title">{toast.title} • {toast.date}</div>
              <div className="toast-detail">{toast.detail}</div>
            </div>
          </div>
          <div className="toast-right">
            <span className="toast-status-badge"><span className="green-check">✓</span> {toast.status}</span>
            <button className="toast-close-btn" onClick={() => setToast(null)}>✕</button>
          </div>
        </div>
      )}

      {/* Main Central Hero Stage */}
      <div className="pc-voice-hero">
        <div className="listening-indicator-row">
          <span className={`pc-glow-dot ${isRecording ? "active" : ""}`} />
          <span className="pc-listening-text">
            {isRecording ? "Thena is Listening..." : isProcessing ? "Thena is Thinking..." : (statusText.toLowerCase().includes("listening") ? "Thena: Ready to Listen" : statusText)}
          </span>
        </div>

        {/* 3D Glossy Metallic & Lavender Sphere */}
        <div
          className={`pc-luxury-orb ${isRecording ? "recording" : ""}`}
          onClick={toggleRecording}
          role="button"
          tabIndex={0}
          title={isRecording ? "Click to stop recording" : "Click to speak with Thena"}
        >
          <div className="pc-orb-specular" />
          <div className="pc-soundwave-bars">
            <span className={`pc-wave-bar bar-1 ${isRecording ? "animating" : ""}`} />
            <span className={`pc-wave-bar bar-2 ${isRecording ? "animating" : ""}`} />
            <span className={`pc-wave-bar bar-3 ${isRecording ? "animating" : ""}`} />
            <span className={`pc-wave-bar bar-4 ${isRecording ? "animating" : ""}`} />
            <span className={`pc-wave-bar bar-5 ${isRecording ? "animating" : ""}`} />
            <span className={`pc-wave-bar bar-6 ${isRecording ? "animating" : ""}`} />
            <span className={`pc-wave-bar bar-7 ${isRecording ? "animating" : ""}`} />
            <span className={`pc-wave-bar bar-8 ${isRecording ? "animating" : ""}`} />
            <span className={`pc-wave-bar bar-9 ${isRecording ? "animating" : ""}`} />
          </div>
        </div>

        <div className="pc-orb-caption">
          {isRecording ? "Speaking... Click orb or mic to finish" : "Click orb or hold microphone to capture voice"}
        </div>

        {/* Language selector & Mode controls */}
        <div className="pc-hero-controls-row">
          <div className="pc-lang-container">
            <button
              className="pc-lang-btn"
              onClick={() => setShowLangMenu(!showLangMenu)}
            >
              <span className="globe-icon">🌐</span>
              <span>Main Language</span>
              <span className="lang-highlight">{selectedLanguage}</span>
              <span className="chevron-icon">↕</span>
            </button>

            {showLangMenu && (
              <div className="pc-lang-dropdown">
                {["Auto-Detect", "English (US)", "Spanish", "French", "German", "Japanese"].map((l) => (
                  <div
                    key={l}
                    className={`pc-lang-opt ${selectedLanguage === l ? "active" : ""}`}
                    onClick={() => {
                      setSelectedLanguage(l);
                      setShowLangMenu(false);
                    }}
                  >
                    {l}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Prompt Chips */}
          <div className="pc-chips-row">
            <button
              className="pc-chip"
              onClick={() => setInputText("Schedule an evening study session tomorrow")}
            >
              📅 Schedule evening session...
            </button>
            <button
              className="pc-chip"
              onClick={() => setInputText("Logged 45 min gym workout")}
            >
              🏋️ Log gym workout...
            </button>
            <button
              className="pc-chip"
              onClick={() => setInputText("Weight is 78.5 kg today")}
            >
              ⚖️ Weight check-in...
            </button>
          </div>
        </div>
      </div>

      {/* Desktop 2-Column Workspace */}
      <div className="pc-workspace-grid">
        {/* Left Column: Chat Dialogue Thread */}
        <div className="pc-card-panel chat-panel">
          <div className="panel-header">
            <div className="panel-title-row">
              <span className="panel-icon">💬</span>
              <span className="panel-title">Conversation with Thena</span>
            </div>
            <span className="badge">{messages.length} messages</span>
          </div>

          <div className="pc-chat-thread">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`pc-bubble-row ${m.sender === "user" ? "user-row" : "assistant-row"}`}
              >
                <div className="bubble-sender">{m.senderName}</div>
                <div className="bubble-text">
                  {m.sender === "user" ? `"${m.text}"` : m.text}
                </div>
                {m.audioUrl && (
                  <audio controls className="bubble-audio" src={m.audioUrl} />
                )}
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>

          <button className="pc-jump-bottom-btn" onClick={scrollToBottom} title="Scroll down">
            ↓
          </button>
        </div>

        {/* Right Column: Local Whisper Transcript & Corrections */}
        <div className="pc-card-panel transcript-panel">
          <div className="panel-header">
            <div className="panel-title-row">
              <span className="panel-icon">🎙️</span>
              <span className="panel-title">Whisper Speech Transcript</span>
            </div>

            {sessions.length > 0 && (
              <select
                className="pc-session-select"
                value={activeSession?.sessionId || ""}
                onChange={(e) => {
                  const sid = parseInt(e.target.value);
                  const match = sessions.find((s) => s.session_id === sid);
                  if (match) selectPastSession(match);
                }}
              >
                {sessions.map((s) => (
                  <option key={s.session_id} value={s.session_id}>
                    Session #{s.session_id} ({new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                  </option>
                ))}
              </select>
            )}
          </div>

          {activeSession ? (
            <div className="transcript-body">
              <div className="transcript-status-line">
                <span>Session #{activeSession.sessionId} • Local Faster-Whisper</span>
                {activeSession.editedText !== activeSession.originalText && (
                  <span className="modified-pill">Modified</span>
                )}
              </div>

              {activeSession.audioUrl && (
                <audio controls className="pc-audio-player" src={activeSession.audioUrl} />
              )}

              <textarea
                className="pc-transcript-textarea"
                value={activeSession.editedText}
                onChange={(e) =>
                  setActiveSession({ ...activeSession, editedText: e.target.value })
                }
                placeholder="Spoken transcript will appear here. Edit any words if needed..."
              />

              <div className="transcript-actions">
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
                  {isProcessing ? "Processing..." : "Confirm & Send to Thena"}
                </button>
              </div>

              {activeSession.aiReply && (
                <div className="pc-ai-reply-card">
                  <div className="ai-reply-label">Thena Response:</div>
                  <div className="ai-reply-content">{activeSession.aiReply}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="pc-empty-transcript">
              <div className="empty-icon">🎙️</div>
              <div className="empty-title">No Voice Recording Active</div>
              <div className="empty-desc">
                Click the central glowing orb above or use the microphone button below to record your voice. Faster-Whisper will transcribe it locally on your M4 chip!
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Bottom Conversation Bar */}
      <form onSubmit={handleSendInput} className="pc-bottom-input-bar">
        <input
          type="text"
          placeholder="Continue conversation with Thena... (or click microphone)"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          className="pc-input-field"
        />
        <button
          type="button"
          className={`pc-mic-action-btn ${isRecording ? "recording" : ""}`}
          onClick={toggleRecording}
          title={isRecording ? "Stop Recording" : "Speak to Thena"}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="mic-svg">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        </button>
      </form>
    </div>
  );
};
