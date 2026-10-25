import React, { useState, useEffect, useRef } from "react";
import "./VoicePhoneView.css";

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  senderName: string;
  text: string;
  timestamp: string;
  audioUrl?: string;
}

export interface VoicePhoneViewProps {
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
  onNavigateTab?: (tab: string) => void;
}

export const VoicePhoneView: React.FC<VoicePhoneViewProps> = ({
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
  onNavigateTab,
}) => {
  // Navigation tab inside the phone: 'main' | 'history' | 'transcript'
  const [phoneTab, setPhoneTab] = useState<"main" | "history" | "transcript">("main");
  const [activeSegment, setActiveSegment] = useState<"history" | "transcript">("history");
  const [inputText, setInputText] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("Auto-Detect");
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showExploreCard, setShowExploreCard] = useState(true);
  const [showNavDrawer, setShowNavDrawer] = useState(false);

  // Notification Toast (Screen 2: Calendar / Action Scheduled banner)
  const [toast, setToast] = useState<{
    icon: string;
    title: string;
    date: string;
    detail: string;
    status: string;
  } | null>(null);

  // Chat messages thread matching Screen 3 with Tina
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      sender: "user",
      senderName: "Raul",
      text: "Hi, Tina, can you set a meeting reminder for me?",
      timestamp: "9:40 AM",
    },
    {
      id: "2",
      sender: "assistant",
      senderName: "Tina",
      text: "Of course, Raul. When would you like to schedule your event?",
      timestamp: "9:40 AM",
    },
    {
      id: "3",
      sender: "user",
      senderName: "Raul",
      text: "Let's aim for tomorrow.",
      timestamp: "9:41 AM",
    },
    {
      id: "4",
      sender: "assistant",
      senderName: "Tina",
      text: "Do you have a preferred time?",
      timestamp: "9:41 AM",
    },
    {
      id: "5",
      sender: "user",
      senderName: "Raul",
      text: "7 AM would be perfect.",
      timestamp: "9:41 AM",
    },
    {
      id: "6",
      sender: "assistant",
      senderName: "Tina",
      text: "Got it, Raul! Scheduled in your daily plan.",
      timestamp: "9:41 AM",
    },
  ]);

  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Synchronize incoming activeSession or AI reply into chat history & toast
  useEffect(() => {
    if (activeSession && activeSession.editedText) {
      const userText = activeSession.editedText;
      const alreadyHas = messages.some((m) => m.text === userText);
      if (!alreadyHas) {
        const newMsg: ChatMessage = {
          id: `user-${activeSession.sessionId}-${Date.now()}`,
          sender: "user",
          senderName: "Raul",
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
          senderName: "Tina",
          text: reply,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, replyMsg]);

        // Trigger top floating confirmation toast card (Screen 2)
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
    if (txt.length > 28) return txt.slice(0, 26) + "...";
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
      senderName: "Raul",
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
          senderName: "Tina",
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
    } else {
      setTimeout(() => {
        const aiMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          sender: "assistant",
          senderName: "Tina",
          text: `Got it! Processed "${userText}" into your Life OS.`,
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
      }, 700);
    }
  };

  const handleChipClick = (chipText: string) => {
    setInputText(chipText);
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
    setPhoneTab("transcript");
  };

  return (
    <div className="phone-mockup-wrapper">
      <div className="phone-device">
        {/* iOS Top Status Bar */}
        <div className="phone-status-bar">
          <span className="status-time">9:41</span>
          <div className="dynamic-island-notch">
            <span className="notch-camera" />
          </div>
          <div className="status-icons">
            <svg className="icon-svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 19.4c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l1.9-1.9C9.28 19.57 10.58 20 12 20c4.97 0 9-4.03 9-9s-4.03-9-9-9z"/>
            </svg>
            <span className="wifi-bars">●●●●</span>
            <div className="battery-pill">
              <div className="battery-level" />
            </div>
          </div>
        </div>

        {/* Floating Notification Toast Card (Screen 2: Calendar / Scheduled event) */}
        {toast && (
          <div className="action-toast-card">
            <div className="toast-header">
              <div className="toast-title-row">
                <span className="toast-icon">{toast.icon}</span>
                <span className="toast-title">{toast.title}</span>
              </div>
              <button className="toast-close" onClick={() => setToast(null)}>✕</button>
            </div>
            <div className="toast-date">{toast.date}</div>
            <div className="toast-detail-box">
              <span className="toast-detail-text">{toast.detail}</span>
              <span className="toast-time">5:00 PM<br/>11:59 PM</span>
            </div>
            <div className="toast-status">
              <span className="green-check">✓</span> {toast.status}
            </div>
          </div>
        )}

        {/* Quick Drawer / Navigation inside the phone */}
        {showNavDrawer && (
          <div className="phone-nav-drawer">
            <div className="drawer-header">
              <span className="drawer-title">TINA OS Hub</span>
              <button className="drawer-close" onClick={() => setShowNavDrawer(false)}>✕</button>
            </div>
            <div className="drawer-links">
              {[
                { id: "voice", label: "🎙️ Voice Assistant" },
                { id: "myday", label: "⚡ My Day & Routines" },
                { id: "lifetree", label: "🌳 Life Tree Clusters" },
                { id: "research", label: "🔍 Research Assistant" },
                { id: "trackers", label: "📊 Life Trackers & Charts" },
                { id: "memory", label: "🧠 Memory Vault" },
              ].map((item) => (
                <button
                  key={item.id}
                  className="drawer-item"
                  onClick={() => {
                    setShowNavDrawer(false);
                    if (onNavigateTab) onNavigateTab(item.id);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* View Mode 1: Main Voice Orb & Quick Actions (Screen 1) */}
        {phoneTab === "main" && (
          <div className="phone-screen-content">
            {/* Top Navigation Bar */}
            <div className="phone-nav-bar">
              <button
                className="icon-circle-btn"
                onClick={() => setShowNavDrawer(true)}
                title="Open Navigation"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>

              <div className="listening-status-header">
                <span className={`status-glow-dot ${isRecording ? "active" : ""}`} />
                <span className="header-status-title">
                  {isRecording ? "Listening" : isProcessing ? "Processing" : (statusText.toLowerCase().includes("listening") ? "Listening" : "Listening")}
                </span>
              </div>

              <button
                className="icon-circle-btn"
                onClick={() => setPhoneTab("transcript")}
                title="Call Transcript"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </div>

            {/* Central Glossy 3D Metallic Glass Orb */}
            <div className="orb-center-stage">
              <div
                className={`luxury-glass-orb ${isRecording ? "pulsing-recording" : ""}`}
                onClick={toggleRecording}
                role="button"
                tabIndex={0}
                title={isRecording ? "Tap to stop" : "Tap to speak"}
              >
                {/* Specular curved reflection highlight */}
                <div className="orb-specular-highlight" />

                {/* Animated sound wave bars */}
                <div className="orb-soundwave-bars">
                  <span className={`wave-bar bar-1 ${isRecording ? "animating" : ""}`} />
                  <span className={`wave-bar bar-2 ${isRecording ? "animating" : ""}`} />
                  <span className={`wave-bar bar-3 ${isRecording ? "animating" : ""}`} />
                  <span className={`wave-bar bar-4 ${isRecording ? "animating" : ""}`} />
                  <span className={`wave-bar bar-5 ${isRecording ? "animating" : ""}`} />
                  <span className={`wave-bar bar-6 ${isRecording ? "animating" : ""}`} />
                  <span className={`wave-bar bar-7 ${isRecording ? "animating" : ""}`} />
                </div>
              </div>

              <div className="orb-caption">Hold for manual control</div>
            </div>

            {/* Language Selector Pill */}
            <div className="language-selector-container">
              <button
                className="lang-pill-btn"
                onClick={() => setShowLangMenu(!showLangMenu)}
              >
                <svg className="globe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                <span className="lang-label">Main Language</span>
                <span className="lang-value">{selectedLanguage}</span>
                <span className="chevron-icon">↕</span>
              </button>

              {showLangMenu && (
                <div className="lang-dropdown-menu">
                  {["Auto-Detect", "English (US)", "Spanish", "French", "German", "Japanese"].map((l) => (
                    <div
                      key={l}
                      className={`lang-option ${selectedLanguage === l ? "active" : ""}`}
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

            {/* Segmented Dual Switch: [ Chat History | Call Transcript ] */}
            <div className="segmented-capsule-switch">
              <button
                className={`switch-segment ${activeSegment === "history" ? "active" : ""}`}
                onClick={() => {
                  setActiveSegment("history");
                  setPhoneTab("history");
                }}
              >
                Chat History
              </button>
              <button
                className={`switch-segment ${activeSegment === "transcript" ? "active" : ""}`}
                onClick={() => {
                  setActiveSegment("transcript");
                  setPhoneTab("transcript");
                }}
              >
                Call Transcript
              </button>
            </div>

            {/* Quick Action Prompt Chips */}
            <div className="quick-chips-scroll">
              <button
                className="quick-chip"
                onClick={() => handleChipClick("Schedule a evening session...")}
              >
                Schedule a evening...
              </button>
              <button
                className="quick-chip"
                onClick={() => handleChipClick("Book a five star Du...")}
              >
                Book a five star Du...
              </button>
              <button
                className="quick-chip chip-more"
                onClick={() => setPhoneTab("history")}
              >
                See All
              </button>
            </div>

            {/* "Explore more" Feature Card */}
            {showExploreCard && (
              <div className="explore-feature-card">
                <div className="explore-card-top">
                  <span className="explore-tag">Explore more</span>
                  <button
                    className="explore-close-btn"
                    onClick={() => setShowExploreCard(false)}
                  >
                    ✕
                  </button>
                </div>
                <div className="explore-card-body">
                  <div className="explore-card-icon">
                    <span role="img" aria-label="calendar">📅</span>
                  </div>
                  <div className="explore-card-text">
                    <div className="explore-card-title">Schedule a Meeting</div>
                    <div className="explore-card-desc">
                      Simplify event scheduling. Add titles, dates, times, and locations effortlessly. Just talking to your assistant.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* View Mode 2: Chat History Screen (Screen 3) */}
        {phoneTab === "history" && (
          <div className="phone-screen-content history-mode">
            {/* Header: ← Chat history */}
            <div className="history-top-bar">
              <button
                className="btn-back-arrow"
                onClick={() => setPhoneTab("main")}
                title="Back to Voice"
              >
                ←
              </button>
              <span className="history-title-text">Chat history</span>
            </div>

            {/* Dialogue Bubble List */}
            <div className="chat-thread-list">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`chat-bubble-row ${m.sender === "user" ? "user-row" : "assistant-row"}`}
                >
                  <div className="chat-sender-name">{m.senderName}</div>
                  <div className="chat-bubble-text">
                    {m.sender === "user" ? `"${m.text}"` : m.text}
                  </div>
                  {m.audioUrl && (
                    <audio
                      controls
                      className="chat-bubble-audio"
                      src={m.audioUrl}
                    />
                  )}
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>

            {/* Floating Jump to Bottom Arrow Button */}
            <button className="jump-bottom-btn" onClick={scrollToBottom} title="Scroll down">
              ↓
            </button>
          </div>
        )}

        {/* View Mode 3: Call Transcript (Whisper Raw + Edit) */}
        {phoneTab === "transcript" && (
          <div className="phone-screen-content transcript-mode">
            <div className="history-top-bar">
              <button
                className="btn-back-arrow"
                onClick={() => setPhoneTab("main")}
                title="Back to Voice"
              >
                ←
              </button>
              <span className="history-title-text">Call Transcript</span>
            </div>

            {sessions.length > 0 && (
              <div className="session-picker-row">
                <span className="picker-label">Select Session:</span>
                <select
                  className="session-select-dropdown"
                  value={activeSession?.sessionId || ""}
                  onChange={(e) => {
                    const sid = parseInt(e.target.value);
                    const match = sessions.find((s) => s.session_id === sid);
                    if (match) selectPastSession(match);
                  }}
                >
                  {sessions.map((s) => (
                    <option key={s.session_id} value={s.session_id}>
                      #{s.session_id} ({new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {activeSession ? (
              <div className="transcript-panel">
                <div className="transcript-meta-row">
                  <span>Session #{activeSession.sessionId}</span>
                  {activeSession.editedText !== activeSession.originalText && (
                    <span className="badge-modified">Modified</span>
                  )}
                </div>

                {activeSession.audioUrl && (
                  <audio
                    controls
                    className="transcript-audio-player"
                    src={activeSession.audioUrl}
                  />
                )}

                <textarea
                  className="transcript-edit-area"
                  value={activeSession.editedText}
                  onChange={(e) =>
                    setActiveSession({ ...activeSession, editedText: e.target.value })
                  }
                  placeholder="Review or edit local Whisper speech transcript..."
                />

                <div className="transcript-actions-row">
                  <button
                    className="transcript-btn secondary"
                    onClick={handleSaveTranscript}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : "Save Edits"}
                  </button>
                  <button
                    className="transcript-btn primary"
                    onClick={handleSendToAI}
                    disabled={isProcessing}
                  >
                    {isProcessing ? "Processing..." : "Send to Tina"}
                  </button>
                </div>

                {activeSession.aiReply && (
                  <div className="transcript-reply-box">
                    <div className="transcript-reply-title">Tina Reply:</div>
                    <div className="transcript-reply-content">{activeSession.aiReply}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-history-text">
                No active voice call yet. Tap the microphone orb to record your first spoken update!
              </div>
            )}
          </div>
        )}

        {/* Bottom Floating Conversation Bar & Mic Button */}
        <div className="phone-bottom-bar">
          <form onSubmit={handleSendInput} className="bottom-input-capsule">
            <input
              type="text"
              placeholder="Continue conversation"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="bottom-text-input"
            />
            <button
              type="button"
              className={`bottom-mic-btn ${isRecording ? "recording" : ""}`}
              onClick={toggleRecording}
              title={isRecording ? "Stop Recording" : "Voice Input"}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="mic-icon-svg">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            </button>
          </form>

          {/* iOS Home Indicator Bar */}
          <div className="ios-home-indicator" />
        </div>
      </div>
    </div>
  );
};
