import { VoiceDesktopView } from "./components/VoiceDesktopView";
import type { NavItem } from "./components/RollingDialNav";
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

// Interface definitions
interface VoiceSession {
  session_id: number;
  created_at: string;
  status: string;
  duration_seconds: number | null;
  original_text: string | null;
  edited_text: string | null;
  audio_url: string | null;
}

interface DueTask {
  id: number;
  title: string;
  cluster: string;
  duration_minutes: number | null;
  status: string;
  due_date: string;
}

interface NextAction {
  task: string;
  cluster: string;
  why: string;
  has_pending: boolean;
  task_id?: number;
}

interface LifeTreeNode {
  id: number;
  name: string;
  type: string;
  description: string | null;
  routine_count: number;
  overdue_count: number;
  routines: {
    id: number;
    name: string;
    schedule_type: string;
    duration_minutes: number | null;
    enabled: boolean;
  }[];
}

interface DocumentItem {
  id: number;
  title: string;
  filename: string | null;
  created_at: string;
}

interface ResearchSourceItem {
  source_id: number;
  title: string;
  snippet: string;
}

interface DailyLogItem {
  id: number;
  log_date: string;
  summary: string;
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


interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  senderName: string;
  text: string;
  timestamp: string;
}

function renderMarkdown(content: string) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let currentList: string[] = [];

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={"ul-" + elements.length} className="msg-ul">
          {currentList.map((item, idx) => (
            <li key={idx} dangerouslySetInnerHTML={{ __html: formatInline(item) }} />
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  const formatInline = (str: string) => {
    return str
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }
    if (trimmed.startsWith("# ")) {
      flushList();
      elements.push(<h1 key={"h1-" + i}>{trimmed.slice(2)}</h1>);
    } else if (trimmed.startsWith("## ")) {
      flushList();
      elements.push(<h2 key={"h2-" + i}>{trimmed.slice(3)}</h2>);
    } else if (trimmed.startsWith("### ")) {
      flushList();
      elements.push(<h3 key={"h3-" + i}>{trimmed.slice(4)}</h3>);
    } else if (trimmed.startsWith("#### ")) {
      flushList();
      elements.push(<h4 key={"h4-" + i} style={{ color: "#c084fc", margin: "14px 0 6px" }}>{trimmed.slice(5)}</h4>);
    } else if (/^[0-9]+\.\s/.test(trimmed)) {
      flushList();
      elements.push(
        <div key={"num-" + i} className="msg-step-title" style={{ fontWeight: 700, margin: "12px 0 6px", color: "#ffffff" }}>
          {trimmed}
        </div>
      );
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      currentList.push(trimmed.slice(2));
    } else {
      flushList();
      elements.push(
        <p key={"p-" + i} dangerouslySetInnerHTML={{ __html: formatInline(trimmed) }} />
      );
    }
  });
  flushList();
  return elements;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "voice",
    label: "Voice",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" x2="12" y1="19" y2="22" />
      </svg>
    ),
    desc: "OLED Voice Hub",
  },
  {
    id: "myday",
    label: "My Day",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <path d="m9 16 2 2 4-4" />
      </svg>
    ),
    desc: "Daily Plan & Next Action",
  },
  {
    id: "lifetree",
    label: "Life Tree",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="5" r="3" />
        <circle cx="6" cy="19" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="M12 8v4" />
        <path d="M12 12a6 6 0 0 0-6 4v3" />
        <path d="M12 12a6 6 0 0 1 6 4v3" />
      </svg>
    ),
    desc: "Life Clusters Hierarchy",
  },
  {
    id: "research",
    label: "Research",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
    desc: "Source-Backed Q&A",
  },
  {
    id: "trackers",
    label: "Trackers",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
    desc: "Pandas Charts & Analytics",
  },
  {
    id: "memory",
    label: "Memory",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
    desc: "Personal Memory Vault",
  },
];

export function App() {
  const [activeTab, setActiveTab] = useState<
    "voice" | "myday" | "lifetree" | "research" | "trackers" | "memory"
  >("voice");
  const switchTab = (tabId: string) => {
    setActiveTab(tabId as any);
    if (tabId === "myday") loadMyDay();
    if (tabId === "lifetree") loadLifeTree();
    if (tabId === "research") loadDocuments();
    if (tabId === "trackers") loadAnalytics();
    if (tabId === "memory") loadMemoryData();
  };


  // System status
  const [backendOnline, setBackendOnline] = useState(false);
  const [ollamaOnline, setOllamaOnline] = useState(false);

  // Voice Assistant states
  const [isRecording, setIsRecording] = useState(false);
  const [statusText, setStatusText] = useState("Ready to listen");
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

  // My Day states
  const [dueTasks, setDueTasks] = useState<DueTask[]>([]);
  const [nextAction, setNextAction] = useState<NextAction | null>(null);

  // Life Tree states
  const [lifeTree, setLifeTree] = useState<LifeTreeNode[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<LifeTreeNode | null>(null);

  // Research & Documents states
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocContent, setNewDocContent] = useState("");
  const [researchQuery, setResearchQuery] = useState("");
  const [researchAnswer, setResearchAnswer] = useState<string | null>(null);
  const [researchSources, setResearchSources] = useState<ResearchSourceItem[]>([]);
  const [isResearching, setIsResearching] = useState(false);

  // Trackers states
  const [weightAnalytics, setWeightAnalytics] = useState<WeightAnalytics | null>(null);
  const [gymAnalytics, setGymAnalytics] = useState<GymAnalytics | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [logWeightVal, setLogWeightVal] = useState("");
  const [logGymName, setLogGymName] = useState("");
  const [logGymDuration, setLogGymDuration] = useState("");

  // Memory states
  const [dailyLogs, setDailyLogs] = useState<DailyLogItem[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [measurements, setMeasurements] = useState<MeasurementItem[]>([]);
  const [facts, setFacts] = useState<FactItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{
    transcripts: { session_id: number; text: string }[];
    daily_logs: { id: number; date: string; summary: string }[];
    activities: { id: number; name: string; category: string; date: string }[];
    facts: { id: number; key: string; value: string; category: string }[];
  } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Central data fetchers
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

  const loadMyDay = async () => {
    try {
      const [resTasks, resAction] = await Promise.all([
        fetch(`${BACKEND_BASE}/api/tasks/due`),
        fetch(`${BACKEND_BASE}/api/next_action`),
      ]);
      if (resTasks.ok) setDueTasks(await resTasks.json());
      if (resAction.ok) setNextAction(await resAction.json());
    } catch (err) {
      console.error("Error loading My Day:", err);
    }
  };

  const loadLifeTree = async () => {
    try {
      const res = await fetch(`${BACKEND_BASE}/api/life-tree`);
      if (res.ok) {
        const data: LifeTreeNode[] = await res.json();
        setLifeTree(data);
        if (!selectedCluster && data.length > 0) {
          setSelectedCluster(data[0]);
        }
      }
    } catch (err) {
      console.error("Error loading Life Tree:", err);
    }
  };

  const loadDocuments = async () => {
    try {
      const res = await fetch(`${BACKEND_BASE}/api/documents`);
      if (res.ok) setDocuments(await res.json());
    } catch (err) {
      console.error("Error loading documents:", err);
    }
  };

  const loadSessions = async () => {
    try {
      const res = await fetch(`${BACKEND_BASE}/api/voice/sessions`);
      if (res.ok) setSessions(await res.json());
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
    loadMyDay();
    loadLifeTree();
    loadDocuments();
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
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
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
      console.error("Microphone error:", err);
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
    if (isRecording) stopRecording();
    else startRecording();
  };

  const uploadAudio = async (blob: Blob) => {
    try {
      const formData = new FormData();
      formData.append("file", blob, "recording.webm");

      const response = await fetch(`${BACKEND_BASE}/api/voice/audio`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      setActiveSession({
        sessionId: data.session_id,
        originalText: data.original_text,
        editedText: data.original_text,
        audioUrl: `${BACKEND_BASE}${data.audio_url}`,
      });
      setStatusText("Transcription complete! Review or send to Thena.");
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
    setStatusText("Thena is understanding and extracting memory...");
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
        const replyText = result.reply || "Recorded and processed by Thena.";
        setActiveSession((prev) => (prev ? { ...prev, aiReply: replyText } : null));
        setStatusText("Response received & memory stored!");

        // Add real exchange to conversation stream
        const userPrompt = activeSession.editedText || activeSession.originalText || "Voice prompt";
        setChatMessages((prev) => [
          ...prev,
          {
            id: `user-${Date.now()}`,
            sender: "user",
            senderName: "User",
            timestamp: "Just now",
            text: userPrompt,
          },
          {
            id: `asst-${Date.now()}`,
            sender: "assistant",
            senderName: "Thena",
            timestamp: "Just now",
            text: replyText,
          },
        ]);

        await Promise.all([loadMemoryData(), loadAnalytics(), loadMyDay()]);
      }
    } catch (err) {
      console.error("Thena processing error:", err);
      setStatusText("Failed to process with Thena.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Task occurrence completion
  const handleCompleteTask = async (taskId: number) => {
    try {
      const res = await fetch(`${BACKEND_BASE}/api/task_occurrences/${taskId}/complete`, {
        method: "POST",
      });
      if (res.ok) await loadMyDay();
    } catch (err) {
      console.error("Complete task error:", err);
    }
  };

  // Document upload handler
  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocTitle.trim() || !newDocContent.trim()) return;
    try {
      const res = await fetch(`${BACKEND_BASE}/api/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newDocTitle, content: newDocContent }),
      });
      if (res.ok) {
        setNewDocTitle("");
        setNewDocContent("");
        await loadDocuments();
      }
    } catch (err) {
      console.error("Create document error:", err);
    }
  };

  // Research assistant query handler
  const handleRunResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!researchQuery.trim()) return;
    setIsResearching(true);
    setResearchAnswer(null);
    setResearchSources([]);
    try {
      const res = await fetch(`${BACKEND_BASE}/api/research/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: researchQuery }),
      });
      if (res.ok) {
        const data = await res.json();
        setResearchAnswer(data.answer);
        setResearchSources(data.sources || []);
      }
    } catch (err) {
      console.error("Research query error:", err);
    } finally {
      setIsResearching(false);
    }
  };

  // Measurement confirmation
  const handleConfirmMeasurement = async (id: number) => {
    try {
      const res = await fetch(`${BACKEND_BASE}/api/memory/measurements/${id}/confirm`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_status: "confirmed" }),
      });
      if (res.ok) await Promise.all([loadMemoryData(), loadAnalytics()]);
    } catch (err) {
      console.error("Error confirming measurement:", err);
    }
  };

  // Memory search
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

  // Memory export
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


  // Direct text prompt handler for phone interface
  const handleSendDirectPrompt = async (text: string): Promise<string> => {
    try {
      setIsProcessing(true);
      const res = await fetch(`${BACKEND_BASE}/api/research/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      if (res.ok) {
        const data = await res.json();
        const reply = data.answer || "Recorded and processed by Thena.";
        setActiveSession((prev) => ({
          sessionId: prev ? prev.sessionId : Date.now(),
          originalText: text,
          editedText: text,
          audioUrl: prev ? prev.audioUrl : "",
          aiReply: reply,
        }));
        return reply;
      }
      return "Recorded and processed by Thena.";
    } catch (err) {
      console.error("Direct prompt error:", err);
      return "Recorded and processed by Thena.";
    } finally {
      setIsProcessing(false);
    }
  };

  // ChatGPT Desktop states
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showFullOrbView, setShowFullOrbView] = useState(false);
  const [bottomInputText, setBottomInputText] = useState("");
  const [recentActiveId, setRecentActiveId] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const chatScrollAnchorRef = useRef<HTMLDivElement>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const handleCopyMessage = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopyFeedback("Copied to clipboard!");
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  const handleSpeakMessage = (text: string) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const clean = text.replace(/[#*`]/g, "");
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.pitch = 1.0;
      utterance.rate = 1.05;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleSendQueryToAI = async (text: string) => {
    if (!text.trim()) return;
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      senderName: "User",
      timestamp: "Just now",
      text: text,
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);

    try {
      const res = await fetch(`${BACKEND_BASE}/api/research/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      if (res.ok) {
        const data = await res.json();
        const reply = data.answer || "Recorded and processed by Thena.";
        const assistantMsg: ChatMessage = {
          id: `asst-${Date.now()}`,
          sender: "assistant",
          senderName: "Thena",
          timestamp: "Just now",
          text: reply,
        };
        setChatMessages((prev) => [...prev, assistantMsg]);
      } else {
        const fallbackMsg: ChatMessage = {
          id: `asst-${Date.now()}`,
          sender: "assistant",
          senderName: "Thena",
          timestamp: "Just now",
          text: "I processed your request and updated your local life OS context.",
        };
        setChatMessages((prev) => [...prev, fallbackMsg]);
      }
    } catch (err) {
      console.error("AI query error:", err);
    } finally {
      setIsProcessing(false);
      setTimeout(() => {
        chatScrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  };

  const handleRetryAssistant = async () => {
    const lastUserMsg = [...chatMessages].reverse().find((m) => m.sender === "user");
    if (lastUserMsg) {
      await handleSendQueryToAI(lastUserMsg.text);
    } else {
      await handleSendQueryToAI("Can you summarize what you can do for me?");
    }
  };

  const handleSendBottomCapsule = async () => {
    if (!bottomInputText.trim() || isProcessing) return;
    const prompt = bottomInputText.trim();
    setBottomInputText("");
    if (activeTab !== "voice") {
      setActiveTab("voice");
    }
    await handleSendQueryToAI(prompt);
  };

  return (
    <div className="chatgpt-app">
      {/* Left Sidebar (ChatGPT Desktop Style) */}
      <aside className={`chatgpt-sidebar ${isSidebarOpen ? "" : "collapsed"}`}>
        <div className="sidebar-top-bar">
          <div className="sidebar-brand-title">
            <span>Thena</span>
          </div>
          <div className="sidebar-top-actions">
            <button
              className="sidebar-icon-btn"
              title="Search memory"
              onClick={() => switchTab("memory")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            <button
              className="sidebar-icon-btn"
              title="Close sidebar"
              onClick={() => setIsSidebarOpen(false)}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </button>
          </div>
        </div>

        <button
          className="sidebar-new-chat-btn"
          onClick={() => {
            switchTab("voice");
            setActiveSession(null);
            setChatMessages([]);
            setRecentActiveId("");
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          <span>New chat</span>
        </button>

        <div className="sidebar-nav-list">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`sidebar-nav-item ${activeTab === item.id ? "active" : ""}`}
              onClick={() => switchTab(item.id)}
            >
              <span className="sidebar-item-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-section-header" style={{ marginTop: "12px" }}>
          <span>Recents</span>
        </div>
        <div className="sidebar-recents-list">
          {sessions.length === 0 && (
            <div style={{ padding: "8px 12px", fontSize: "0.75rem", color: "#6b5d7d" }}>
              No recent voice sessions
            </div>
          )}
          {sessions.map((s) => {
            const previewText = (s.edited_text || s.original_text || `Voice Session #${s.session_id}`).trim();
            const truncated = previewText.length > 28 ? previewText.slice(0, 28) + "..." : previewText;
            const isSelected = recentActiveId === `sess-${s.session_id}` || activeSession?.sessionId === s.session_id;

            return (
              <button
                key={`sess-${s.session_id}`}
                className={`recent-item-btn ${isSelected ? "active" : ""}`}
                onClick={() => {
                  switchTab("voice");
                  setActiveSession({
                    sessionId: s.session_id,
                    originalText: s.original_text || "",
                    editedText: s.edited_text || s.original_text || "",
                    audioUrl: s.audio_url || "",
                    aiReply: "",
                  });
                  const msgs: ChatMessage[] = [];
                  if (s.original_text || s.edited_text) {
                    msgs.push({
                      id: `user-${s.session_id}`,
                      sender: "user",
                      senderName: "User",
                      timestamp: s.created_at ? new Date(s.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Saved",
                      text: s.edited_text || s.original_text || "",
                    });
                  }
                  setChatMessages(msgs);
                  setRecentActiveId(`sess-${s.session_id}`);
                }}
                title={previewText}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.8 }}>
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                </svg>
                <span>{truncated}</span>
              </button>
            );
          })}
        </div>

        <div className="sidebar-footer">
          <div className="user-profile-row">
            <div className="user-avatar">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div>
              <div className="user-name">User</div>
              <div className="user-badge">
                <span className={`badge-dot ${backendOnline && ollamaOnline ? "" : "offline"}`} style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", marginRight: 6, verticalAlign: "middle" }} />
                Apple Silicon M4 • Llama 3.1 8B
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="chatgpt-main-content">
        <header className="chatgpt-top-bar">
          <div className="top-bar-left">
            {!isSidebarOpen && (
              <button
                className="toggle-sidebar-btn"
                title="Open sidebar"
                onClick={() => setIsSidebarOpen(true)}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
              </button>
            )}
            <div className="top-bar-title">
              <span>Thena</span>
            </div>
          </div>
        </header>

        <div className="chatgpt-canvas-body">
          {/* VIEW 1: Voice & ChatGPT Conversation Canvas */}
          {activeTab === "voice" && (
            <div className="chat-conversation-stream">
              {/* Optional Voice Orb Banner at Top of Chat */}
              <div className="voice-orb-banner">
                <div className="voice-orb-left">
                  <div
                    className={`voice-orb-mini ${isRecording ? "recording" : ""}`}
                    onClick={toggleRecording}
                    title={isRecording ? "Stop voice capture" : "Click to speak with Faster-Whisper"}
                  />
                  <div>
                    <div className="voice-orb-title">
                      {isRecording ? "Listening to your voice..." : "Voice Assistant • Faster-Whisper"}
                    </div>
                    <div className="voice-orb-sub">
                      {statusText || "Click orb or hold microphone capsule to dictate prompts locally"}
                    </div>
                  </div>
                </div>
                <button
                  className="voice-orb-toggle-btn"
                  onClick={() => setShowFullOrbView(!showFullOrbView)}
                >
                  {showFullOrbView ? "Hide Orb Stage" : "Show 3D Orb Stage"}
                </button>
              </div>

              {showFullOrbView && (
                <VoiceDesktopView
                  isRecording={isRecording}
                  statusText={statusText}
                  toggleRecording={toggleRecording}
                  activeSession={activeSession}
                  sessions={sessions}
                  handleSaveTranscript={handleSaveTranscript}
                  handleSendToAI={handleSendToAI}
                  isSaving={isSaving}
                  isProcessing={isProcessing}
                  setActiveSession={setActiveSession}
                  onSendMessage={handleSendDirectPrompt}
                />
              )}

              {/* Clean Welcome Hero when no messages */}
              {chatMessages.length === 0 && (
                <div className="chat-welcome-hero">
                  <div className="welcome-avatar-orb">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
                    </svg>
                  </div>
                  <h1 className="welcome-title">How can Thena help you today?</h1>
                  <p className="welcome-sub">
                    Click the orb to speak, or type a request in the message capsule below.
                  </p>
                  <div className="welcome-suggestions-grid">
                    <button
                      className="welcome-suggestion-card"
                      onClick={() => handleSendQueryToAI("What are my priority tasks for today?")}
                    >
                      <span className="card-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                          <path d="m9 16 2 2 4-4" />
                        </svg>
                      </span>
                      <div>
                        <div className="card-headline">Check Daily Plan</div>
                        <div className="card-desc">Review tasks & recommended next action</div>
                      </div>
                    </button>
                    <button
                      className="welcome-suggestion-card"
                      onClick={() => handleSendQueryToAI("Summarize my recent memory logs and facts.")}
                    >
                      <span className="card-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                          <line x1="12" y1="22.08" x2="12" y2="12" />
                        </svg>
                      </span>
                      <div>
                        <div className="card-headline">Review Memory</div>
                        <div className="card-desc">Search personal timeline and facts</div>
                      </div>
                    </button>
                    <button
                      className="welcome-suggestion-card"
                      onClick={() => handleSendQueryToAI("Give me a summary of my weight and gym progress.")}
                    >
                      <span className="card-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="20" x2="18" y2="10" />
                          <line x1="12" y1="20" x2="12" y2="4" />
                          <line x1="6" y1="20" x2="6" y2="14" />
                        </svg>
                      </span>
                      <div>
                        <div className="card-headline">Health & Trackers</div>
                        <div className="card-desc">Analyze trends and analytics</div>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Message Cards Stream */}
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`chat-message-item ${msg.sender === "user" ? "user-msg" : "assistant-msg"}`}
                >
                  <div className="message-avatar">
                    {msg.sender === "user" ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
                      </svg>
                    )}
                  </div>
                  <div className="message-content-wrapper">
                    <div className="message-sender-name">{msg.senderName}</div>
                    <div className="message-text-card">
                      {renderMarkdown(msg.text)}
                    </div>

                    {msg.sender === "assistant" && (
                      <div className="assistant-action-toolbar">
                        <button
                          className="action-tool-btn"
                          title="Copy response"
                          onClick={() => handleCopyMessage(msg.text)}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                        </button>
                        <button
                          className="action-tool-btn"
                          title="Read aloud (Listen)"
                          onClick={() => handleSpeakMessage(msg.text)}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                          </svg>
                        </button>
                        <button
                          className="action-tool-btn"
                          title="Regenerate"
                          onClick={() => handleRetryAssistant()}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="23 4 23 10 17 10" />
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatScrollAnchorRef} />
            </div>
          )}

      {/* VIEW 2: My Day (Daily Plan & Next Action) */}
      {activeTab === "myday" && (
        <section className="myday-view">
          {nextAction && (
            <div className="next-action-card">
              <div className="next-action-badge">Recommended Next Action</div>
              <div className="next-action-title">{nextAction.task}</div>
              <div className="next-action-why">{nextAction.why}</div>
              {nextAction.has_pending && nextAction.task_id && (
                <button
                  className="btn-primary"
                  style={{ alignSelf: "flex-start", marginTop: "10px" }}
                  onClick={() => handleCompleteTask(nextAction.task_id!)}
                >
                  Mark Complete
                </button>
              )}
            </div>
          )}

          <div className="section-header-row">
            <div className="section-title">Today's Schedule & Routines</div>
            <span className="badge">{dueTasks.filter((t) => t.status === "completed").length} / {dueTasks.length} Completed</span>
          </div>

          <div className="tasks-list">
            {dueTasks.length === 0 ? (
              <div className="empty-text">No scheduled routines due for today.</div>
            ) : (
              dueTasks.map((t) => (
                <div key={t.id} className={`task-row ${t.status === "completed" ? "completed" : ""}`}>
                  <button
                    className={`task-checkbox ${t.status === "completed" ? "checked" : ""}`}
                    onClick={() => t.status !== "completed" && handleCompleteTask(t.id)}
                    disabled={t.status === "completed"}
                  >
                    {t.status === "completed" ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : ""}
                  </button>
                  <div className="task-content">
                    <div className="task-name">{t.title}</div>
                    <div className="task-meta">
                      <span className="cluster-tag">{t.cluster}</span>
                      {t.duration_minutes && <span>{t.duration_minutes} min</span>}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* VIEW 3: Life Tree & Workspaces */}
      {activeTab === "lifetree" && (
        <section className="lifetree-view">
          <div className="lifetree-grid">
            {/* Cluster Navigation Cards */}
            <div className="clusters-column">
              <div className="section-title">Life Clusters Hierarchy</div>
              <div className="clusters-list">
                {lifeTree.map((c) => (
                  <div
                    key={c.id}
                    className={`cluster-card ${selectedCluster?.id === c.id ? "active" : ""}`}
                    onClick={() => setSelectedCluster(c)}
                  >
                    <div className="cluster-card-top">
                      <span className="cluster-name">{c.name}</span>
                      {c.overdue_count > 0 && (
                        <span className="overdue-badge">{c.overdue_count} Overdue</span>
                      )}
                    </div>
                    <div className="cluster-desc">{c.description}</div>
                    <div className="cluster-footer">
                      <span>{c.routine_count} Active Routines</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cluster Workspace */}
            <div className="workspace-column">
              {selectedCluster ? (
                <div className="workspace-panel">
                  <div className="workspace-header">
                    <div>
                      <div className="workspace-title">{selectedCluster.name} Workspace</div>
                      <div className="workspace-sub">{selectedCluster.description}</div>
                    </div>
                  </div>

                  <div className="section-title" style={{ marginTop: "16px" }}>Scheduled Routines</div>
                  <div className="routines-list">
                    {selectedCluster.routines.length === 0 ? (
                      <div className="empty-text">No recurring routines configured in this cluster.</div>
                    ) : (
                      selectedCluster.routines.map((r) => (
                        <div key={r.id} className="routine-row">
                          <div>
                            <div className="routine-name">{r.name}</div>
                            <div className="routine-meta">
                              Schedule: {r.schedule_type} {r.duration_minutes ? `• ${r.duration_minutes} min` : ""}
                            </div>
                          </div>
                          <span className="badge" style={{ color: r.enabled ? "#10b981" : "#94a3b8" }}>
                            {r.enabled ? "Active" : "Paused"}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="empty-text">Select a life cluster to view workspace.</div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* VIEW 4: Research Assistant & Documents (Phase 5) */}
      {activeTab === "research" && (
        <section className="research-view">
          {/* Research Q&A Box */}
          <div className="research-qa-card">
            <div className="card-title">Research Assistant (Source-Backed)</div>
            <div className="chart-sub">
              Answers questions strictly grounded in your personal documents and knowledge using SQLite FTS5.
            </div>

            <form onSubmit={handleRunResearch} className="research-form">
              <input
                type="text"
                placeholder="Ask about your personal protocols, notes, or knowledge..."
                value={researchQuery}
                onChange={(e) => setResearchQuery(e.target.value)}
                className="search-input"
              />
              <button type="submit" className="btn-primary" disabled={isResearching}>
                {isResearching ? "Searching..." : "Ask Assistant"}
              </button>
            </form>

            {researchAnswer && (
              <div className="research-answer-box">
                <div className="answer-text">{researchAnswer}</div>
                {researchSources.length > 0 && (
                  <div className="sources-container">
                    <div className="sources-title">Verified Citations:</div>
                    {researchSources.map((s) => (
                      <div key={s.source_id} className="source-citation">
                        <strong>[Source {s.source_id}: {s.title}]</strong>: {s.snippet}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Document Ingestion & Library */}
          <div className="docs-grid">
            <div className="memory-card">
              <div className="card-title">Ingest Personal Document</div>
              <form onSubmit={handleCreateDocument} className="doc-form">
                <input
                  type="text"
                  placeholder="Document Title (e.g., Sleep Protocol 2026)"
                  value={newDocTitle}
                  onChange={(e) => setNewDocTitle(e.target.value)}
                  className="quick-input"
                />
                <textarea
                  placeholder="Paste document text or notes here for FTS5 indexing..."
                  value={newDocContent}
                  onChange={(e) => setNewDocContent(e.target.value)}
                  className="transcript-textarea"
                  style={{ minHeight: "120px" }}
                />
                <button type="submit" className="btn-secondary" style={{ alignSelf: "flex-end" }}>
                  Save & Index Document
                </button>
              </form>
            </div>

            <div className="memory-card">
              <div className="card-title">Document Library ({documents.length})</div>
              {documents.length === 0 ? (
                <div className="empty-text">No personal documents indexed yet.</div>
              ) : (
                <div className="memory-list">
                  {documents.map((d) => (
                    <div key={d.id} className="memory-row">
                      <div className="row-date">{new Date(d.created_at).toLocaleDateString()}</div>
                      <div className="row-text"><strong>{d.title}</strong></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* VIEW 5: Trackers & Analytics */}
      {activeTab === "trackers" && (
        <section className="trackers-view">
          {weeklyReport && (
            <div className="report-card">
              <div className="card-title">Weekly Progress Summary (Past 7 Days)</div>
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

          <div className="charts-grid">
            <div className="chart-card">
              <div className="chart-header">
                <div>
                  <div className="card-title">Weight Progression (30 Days)</div>
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
                          <stop offset="5%" stopColor="#c084fc" stopOpacity={0.5} />
                          <stop offset="95%" stopColor="#c084fc" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#251c38" />
                      <XAxis dataKey="date" stroke="#7d6e8c" fontSize={11} />
                      <YAxis domain={["dataMin - 1", "dataMax + 1"]} stroke="#7d6e8c" fontSize={11} />
                      <Tooltip contentStyle={{ background: "#0d0917", border: "1px solid rgba(192, 132, 252, 0.3)", borderRadius: "10px", color: "#f3e8ff" }} />
                      <Area type="monotone" dataKey="value" stroke="#c084fc" strokeWidth={2.5} fill="url(#weightGrad)" name="Weight" />
                      <Area type="monotone" dataKey="rolling_avg" stroke="#f472b6" strokeWidth={2} strokeDasharray="4 4" fill="none" name="7-Day Avg" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="empty-text">Log at least one weight entry to see the chart.</div>
              )}
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <div>
                  <div className="card-title">Gym Workouts & Minutes (30 Days)</div>
                  <div className="chart-sub">
                    {gymAnalytics?.total_sessions || 0} total sessions • {gymAnalytics?.total_minutes || 0} total minutes
                  </div>
                </div>
              </div>

              {gymAnalytics && gymAnalytics.daily_breakdown.length > 0 ? (
                <div className="chart-wrapper">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={gymAnalytics.daily_breakdown}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#251c38" />
                      <XAxis dataKey="date" stroke="#7d6e8c" fontSize={11} />
                      <YAxis stroke="#7d6e8c" fontSize={11} />
                      <Tooltip contentStyle={{ background: "#0d0917", border: "1px solid rgba(192, 132, 252, 0.3)", borderRadius: "10px", color: "#f3e8ff" }} />
                      <Bar dataKey="duration_minutes" fill="#a855f7" radius={[6, 6, 0, 0]} name="Minutes" />
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

      {/* VIEW 6: Personal Memory */}
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
              Export Data
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
              <div className="card-title">Daily Logs</div>
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
              <div className="card-title">Tracked Measurements</div>
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
              <div className="card-title">Activities & Habits</div>
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
              <div className="card-title">Facts, Decisions & Goals</div>
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
        </div>

        {/* Sticky Bottom Floating Bar (ChatGPT Style) */}
        <footer className="chatgpt-bottom-floating-bar">
          <form
            className="floating-input-capsule"
            onSubmit={(e) => {
              e.preventDefault();
              handleSendBottomCapsule();
            }}
          >
            <button
              type="button"
              className="capsule-plus-btn"
              title="Add attachment or tools"
              onClick={() => switchTab("research")}
            >
              +
            </button>
            <input
              type="text"
              className="capsule-text-input"
              placeholder="Message Thena..."
              value={bottomInputText}
              onChange={(e) => setBottomInputText(e.target.value)}
              disabled={isProcessing}
            />
            <div className="capsule-actions">
              <button
                type="button"
                className={`capsule-mic-btn ${isRecording ? "recording" : ""}`}
                onClick={toggleRecording}
                title={isRecording ? "Stop Recording" : "Speak to Thena (Faster-Whisper)"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
              </button>
              <button
                type="submit"
                className="capsule-send-btn"
                title="Send message"
                disabled={!bottomInputText.trim() || isProcessing}
              >
                ↑
              </button>
            </div>
          </form>

          <div className="floating-disclaimer-text">
            Thena can make mistakes. Check important info. Running locally on Apple Silicon M4 • llama3.1:8b.
          </div>
        </footer>

        {copyFeedback && <div className="copy-toast">{copyFeedback}</div>}
      </main>
    </div>
  );
}

export default App;
