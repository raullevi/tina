import { useState, useEffect, useRef } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
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

interface ActivityItem {
  id: number;
  category: string;
  name: string;
  duration_minutes: number | null;
  activity_date: string;
  notes: string | null;
}

interface MeasurementItem {
  id: number;
  metric: string;
  value: number;
  unit: string;
  measurement_date: string;
  review_status: string;
  notes: string | null;
}

interface DailyLogItem {
  id: number;
  log_date: string;
  summary: string;
}

interface FactItem {
  id: number;
  category: string;
  key: string;
  value: string;
}

interface WeightAnalytics {
  count: number;
  current_weight: number | null;
  start_weight: number | null;
  weight_delta: number;
  min_weight: number | null;
  max_weight: number | null;
  average_weight: number | null;
  unit: string;
  time_series: { date: string; value: number; rolling_avg: number }[];
}

interface GymAnalytics {
  total_sessions: number;
  total_minutes: number;
  avg_session_minutes: number;
  sessions_per_week: number;
  daily_breakdown: { date: string; duration_minutes: number }[];
  exercise_counts: Record<string, number>;
}

interface WeeklyReport {
  report_period: { start_date: string; end_date: string };
  grounded_summary: string;
  weight_analysis: WeightAnalytics;
  fitness_analysis: GymAnalytics;
}

const BACKEND_BASE = "http://localhost:8000";

export function App() {
  const [activeTab, setActiveTab] = useState<"voice" | "memory" | "trackers">("voice");

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [statusText, setStatusText] = useState("Ready to listen");
  const [backendOnline, setBackendOnline] = useState(false);
  const [ollamaOnline, setOllamaOnline] = useState(false);

  // Active session
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

  // Memory tab states
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{
    transcripts: { session_id: number; text: string }[];
    daily_logs: { id: number; date: string; summary: string }[];
    activities: { id: number; name: string; category: string; date: string }[];
    facts: { id: number; key: string; value: string; category: string }[];
  } | null>(null);

  const [dailyLogs, setDailyLogs] = useState<DailyLogItem[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [measurements, setMeasurements] = useState<MeasurementItem[]>([]);
  const [facts, setFacts] = useState<FactItem[]>([]);

  // Phase 4 Analytics states
  const [weightAnalytics, setWeightAnalytics] = useState<WeightAnalytics | null>(null);
  const [gymAnalytics, setGymAnalytics] = useState<GymAnalytics | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);

  // Quick manual log form states
  const [logWeightVal, setLogWeightVal] = useState("");
  const [logGymName, setLogGymName] = useState("");
  const [logGymDuration, setLogGymDuration] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Health and data loaders
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
        setSessions(await res.json());
      }
    } catch (err) {
      console.error("Error loading voice sessions:", err);
    }
  };

  const loadMemoryData = async () => {
    try {
      const [resLogs, resAct, resMeas, resFacts] = await Promise.all([
        fetch(`${BACKEND_BASE}/api/memory/daily-logs`),
        fetch(`${BACKEND_BASE}/api/memory/activities`),
        fetch(`${BACKEND_BASE}/api/memory/measurements`),
        fetch(`${BACKEND_BASE}/api/memory/facts`),
      ]);

      if (resLogs.ok) setDailyLogs(await resLogs.json());
      if (resAct.ok) setActivities(await resAct.json());
      if (resMeas.ok) setMeasurements(await resMeas.json());
      if (resFacts.ok) setFacts(await resFacts.json());
    } catch (err) {
      console.error("Error loading memory data:", err);
    }
  };

  const loadAnalytics = async () => {
    try {
      const [resW, resG, resR] = await Promise.all([
        fetch(`${BACKEND_BASE}/api/analytics/weight?days=30`),
        fetch(`${BACKEND_BASE}/api/analytics/gym?days=30`),
        fetch(`${BACKEND_BASE}/api/analytics/weekly-report`),
      ]);

      if (resW.ok) setWeightAnalytics(await resW.json());
      if (resG.ok) setGymAnalytics(await resG.json());
      if (resR.ok) setWeeklyReport(await resR.json());
    } catch (err) {
      console.error("Error loading analytics:", err);
    }
  };

  useEffect(() => {
    checkStatus();
    loadSessions();
    loadMemoryData();
    loadAnalytics();
    const interval = setInterval(checkStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  // Voice recording handlers
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

  const handleSendToAI = async () => {
    if (!activeSession) return;
    setIsProcessing(true);
    setStatusText("SKIM is understanding and extracting memory...");
    try {
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
        setStatusText("Response received & memory stored!");
        await Promise.all([loadMemoryData(), loadAnalytics()]);
      }
    } catch (err) {
      console.error("AI processing error:", err);
      setStatusText("Failed to process with AI.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmMeasurement = async (id: number) => {
    try {
      const res = await fetch(`${BACKEND_BASE}/api/memory/measurements/${id}/confirm`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_status: "confirmed" }),
      });
      if (res.ok) {
        await Promise.all([loadMemoryData(), loadAnalytics()]);
      }
    } catch (err) {
      console.error("Error confirming measurement:", err);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    try {
      const res = await fetch(`${BACKEND_BASE}/api/memory/search?q=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results);
      }
    } catch (err) {
      console.error("Search error:", err);
    }
  };

  const handleExportData = async () => {
    try {
      const res = await fetch(`${BACKEND_BASE}/api/memory/export`);
      if (res.ok) {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `skim_memory_export_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Export error:", err);
    }
  };

  // Manual Quick Logs
  const handleQuickLogWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(logWeightVal);
    if (isNaN(val) || val <= 0) return;
    try {
      const res = await fetch(`${BACKEND_BASE}/api/trackers/weight`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: val, unit: "kg" }),
      });
      if (res.ok) {
        setLogWeightVal("");
        await Promise.all([loadMemoryData(), loadAnalytics()]);
      }
    } catch (err) {
      console.error("Log weight error:", err);
    }
  };

  const handleQuickLogGym = async (e: React.FormEvent) => {
    e.preventDefault();
    const duration = parseFloat(logGymDuration);
    if (!logGymName.trim() || isNaN(duration) || duration <= 0) return;
    try {
      const res = await fetch(`${BACKEND_BASE}/api/trackers/gym`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: logGymName, duration_minutes: duration, category: "gym" }),
      });
      if (res.ok) {
        setLogGymName("");
        setLogGymDuration("");
        await Promise.all([loadMemoryData(), loadAnalytics()]);
      }
    } catch (err) {
      console.error("Log gym error:", err);
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

        <nav className="nav-tabs">
          <button
            className={`tab-btn ${activeTab === "voice" ? "active" : ""}`}
            onClick={() => setActiveTab("voice")}
          >
            Voice Assistant
          </button>
          <button
            className={`tab-btn ${activeTab === "memory" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("memory");
              loadMemoryData();
            }}
          >
            Personal Memory
          </button>
          <button
            className={`tab-btn ${activeTab === "trackers" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("trackers");
              loadAnalytics();
            }}
          >
            Trackers & Analytics
          </button>
        </nav>

        <div className="status-badges">
          <div className="badge">
            <span className={`badge-dot ${backendOnline ? "" : "offline"}`} />
            <span>FastAPI Backend</span>
          </div>
          <div className="badge">
            <span className={`badge-dot ${ollamaOnline ? "" : "offline"}`} />
            <span>Ollama Local LLM</span>
          </div>
        </div>
      </header>

      {/* VIEW 1: Voice Assistant */}
      {activeTab === "voice" && (
        <>
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
                <svg className="mic-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                ? "Speak your update naturally — press again when finished"
                : "Push-to-talk: speak your daily updates, gym workouts, and measurements"}
            </div>
          </main>

          {activeSession && (
            <section className="session-card">
              <div className="card-header">
                <div className="card-title">
                  <span style={{ color: "#38bdf8" }}>●</span> Recorded Voice Update #{activeSession.sessionId}
                </div>
              </div>

              <div className="audio-controls">
                <audio controls className="audio-player" src={activeSession.audioUrl} />
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

          <section className="history-section">
            <div className="section-title">Recent Voice Recordings</div>
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
                      <audio controls className="history-audio" src={`${BACKEND_BASE}${s.audio_url}`} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* VIEW 2: Personal Memory */}
      {activeTab === "memory" && (
        <section className="memory-view">
          <div className="memory-header-actions">
            <form onSubmit={handleSearch} className="search-form">
              <input
                type="text"
                className="search-input"
                placeholder="Search personal memory (e.g., 'jog', '75kg', 'laundry')..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button type="submit" className="btn-secondary">Search</button>
            </form>
            <button onClick={handleExportData} className="btn-secondary" title="Export all memory to JSON">
              📥 Export Data
            </button>
          </div>

          {searchResults && (
            <div className="search-results-panel">
              <div className="panel-title">Search Results for "{searchQuery}"</div>
              {searchResults.daily_logs.length === 0 &&
               searchResults.activities.length === 0 &&
               searchResults.facts.length === 0 && (
                <div style={{ color: "#64748b" }}>No memory records matched your search query.</div>
              )}
              {searchResults.daily_logs.map((dl) => (
                <div key={`s-dl-${dl.id}`} className="memory-item">
                  <span className="memory-tag tag-log">Daily Log</span>
                  <span className="memory-text">{dl.summary}</span>
                </div>
              ))}
              {searchResults.activities.map((act) => (
                <div key={`s-act-${act.id}`} className="memory-item">
                  <span className="memory-tag tag-act">{act.category}</span>
                  <span className="memory-text"><strong>{act.name}</strong> ({act.date})</span>
                </div>
              ))}
              {searchResults.facts.map((f) => (
                <div key={`s-f-${f.id}`} className="memory-item">
                  <span className="memory-tag tag-fact">{f.category}</span>
                  <span className="memory-text"><strong>{f.key}:</strong> {f.value}</span>
                </div>
              ))}
            </div>
          )}

          <div className="memory-grid">
            <div className="memory-card">
              <div className="card-title">📅 Daily Logs</div>
              {dailyLogs.length === 0 ? (
                <div className="empty-text">No daily logs extracted yet.</div>
              ) : (
                <div className="memory-list">
                  {dailyLogs.map((log) => (
                    <div key={log.id} className="memory-row">
                      <div className="row-date">{log.log_date}</div>
                      <div className="row-text">{log.summary}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="memory-card">
              <div className="card-title">⚖️ Tracked Measurements</div>
              {measurements.length === 0 ? (
                <div className="empty-text">No measurements recorded yet.</div>
              ) : (
                <div className="memory-list">
                  {measurements.map((m) => (
                    <div key={m.id} className="memory-row measurement-row">
                      <div>
                        <strong>{m.metric}:</strong> {m.value} {m.unit}
                        <span className={`status-pill ${m.review_status}`}>{m.review_status}</span>
                      </div>
                      {m.review_status === "uncertain" && (
                        <button
                          className="btn-confirm-small"
                          onClick={() => handleConfirmMeasurement(m.id)}
                        >
                          Confirm
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="memory-card">
              <div className="card-title">🏃 Activities & Habits</div>
              {activities.length === 0 ? (
                <div className="empty-text">No activities logged yet.</div>
              ) : (
                <div className="memory-list">
                  {activities.map((a) => (
                    <div key={a.id} className="memory-row">
                      <div>
                        <strong>{a.name}</strong>{" "}
                        <span className="category-pill">{a.category}</span>
                      </div>
                      <div className="row-sub">
                        {a.duration_minutes ? `${a.duration_minutes} min • ` : ""}{a.activity_date}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="memory-card">
              <div className="card-title">💡 Facts, Decisions & Goals</div>
              {facts.length === 0 ? (
                <div className="empty-text">No facts or goals recorded yet.</div>
              ) : (
                <div className="memory-list">
                  {facts.map((f) => (
                    <div key={f.id} className="memory-row">
                      <div>
                        <strong>{f.key}:</strong> {f.value}
                      </div>
                      <div className="row-sub">{f.category}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* VIEW 3: Phase 4 Trackers & Analytics */}
      {activeTab === "trackers" && (
        <section className="trackers-view">
          {/* Weekly Report Card */}
          {weeklyReport && (
            <div className="report-card">
              <div className="card-title">📊 Weekly Progress Summary (Past 7 Days)</div>
              <p className="report-summary-text">{weeklyReport.grounded_summary}</p>
              <div className="report-stats-grid">
                <div className="report-stat">
                  <span className="stat-label">Weight Delta</span>
                  <span className={`stat-value ${weeklyReport.weight_analysis.weight_delta <= 0 ? "good" : ""}`}>
                    {weeklyReport.weight_analysis.weight_delta > 0 ? "+" : ""}
                    {weeklyReport.weight_analysis.weight_delta} {weeklyReport.weight_analysis.unit}
                  </span>
                </div>
                <div className="report-stat">
                  <span className="stat-label">Gym Sessions</span>
                  <span className="stat-value">{weeklyReport.fitness_analysis.total_sessions}</span>
                </div>
                <div className="report-stat">
                  <span className="stat-label">Total Workout Time</span>
                  <span className="stat-value">{weeklyReport.fitness_analysis.total_minutes} min</span>
                </div>
                <div className="report-stat">
                  <span className="stat-label">Avg Workout</span>
                  <span className="stat-value">{weeklyReport.fitness_analysis.avg_session_minutes} min</span>
                </div>
              </div>
            </div>
          )}

          {/* Quick Log Forms */}
          <div className="quick-logs-bar">
            <form onSubmit={handleQuickLogWeight} className="quick-form">
              <span className="form-tag">Log Weight</span>
              <input
                type="number"
                step="0.1"
                placeholder="kg (e.g. 75.2)"
                value={logWeightVal}
                onChange={(e) => setLogWeightVal(e.target.value)}
                className="quick-input"
              />
              <button type="submit" className="btn-secondary">Save</button>
            </form>

            <form onSubmit={handleQuickLogGym} className="quick-form">
              <span className="form-tag">Log Workout</span>
              <input
                type="text"
                placeholder="Exercise (e.g. Chest & Triceps)"
                value={logGymName}
                onChange={(e) => setLogGymName(e.target.value)}
                className="quick-input"
              />
              <input
                type="number"
                placeholder="Minutes"
                value={logGymDuration}
                onChange={(e) => setLogGymDuration(e.target.value)}
                className="quick-input input-short"
              />
              <button type="submit" className="btn-secondary">Save</button>
            </form>
          </div>

          {/* Charts Grid */}
          <div className="charts-grid">
            {/* Weight Progression Chart */}
            <div className="chart-card">
              <div className="chart-header">
                <div>
                  <div className="card-title">⚖️ Weight Progression (30 Days)</div>
                  <div className="chart-sub">
                    Latest: {weightAnalytics?.current_weight ? `${weightAnalytics.current_weight} ${weightAnalytics.unit}` : "No data"} • 
                    Avg: {weightAnalytics?.average_weight ? `${weightAnalytics.average_weight} ${weightAnalytics.unit}` : "No data"}
                  </div>
                </div>
              </div>

              {weightAnalytics && weightAnalytics.time_series.length > 0 ? (
                <div className="chart-wrapper">
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={weightAnalytics.time_series}>
                      <defs>
                        <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                      <YAxis domain={["dataMin - 1", "dataMax + 1"]} stroke="#64748b" fontSize={11} />
                      <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px" }} />
                      <Area type="monotone" dataKey="value" stroke="#38bdf8" strokeWidth={2} fill="url(#weightGrad)" name="Weight" />
                      <Area type="monotone" dataKey="rolling_avg" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" fill="none" name="7-Day Avg" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="empty-text">Log at least one weight entry to see the chart.</div>
              )}
            </div>

            {/* Gym Duration & Workouts Chart */}
            <div className="chart-card">
              <div className="chart-header">
                <div>
                  <div className="card-title">🏋️ Gym Workouts & Minutes (30 Days)</div>
                  <div className="chart-sub">
                    {gymAnalytics?.total_sessions || 0} total sessions • {gymAnalytics?.total_minutes || 0} total minutes
                  </div>
                </div>
              </div>

              {gymAnalytics && gymAnalytics.daily_breakdown.length > 0 ? (
                <div className="chart-wrapper">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={gymAnalytics.daily_breakdown}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} />
                      <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px" }} />
                      <Bar dataKey="duration_minutes" fill="#10b981" radius={[4, 4, 0, 0]} name="Minutes" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="empty-text">Log a gym or workout session to see workout statistics.</div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default App;
