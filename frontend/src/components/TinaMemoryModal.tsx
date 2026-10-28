import React, { useState } from "react";
import "./TinaMemoryModal.css";
import type { MemoryItemData } from "./EditMemoryModal";

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

interface TinaMemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  dailyLogs: DailyLogItem[];
  measurements: MeasurementItem[];
  activities: ActivityItem[];
  facts: FactItem[];
  onOpenEditModal: (item: MemoryItemData) => void;
  onDeleteMemory: (type: "daily_log" | "activity" | "measurement" | "fact", id: number, label: string) => Promise<void>;
  onNavigateToVault: () => void;
}

export const TinaMemoryModal: React.FC<TinaMemoryModalProps> = ({
  isOpen,
  onClose,
  dailyLogs,
  measurements,
  activities,
  facts,
  onOpenEditModal,
  onDeleteMemory,
  onNavigateToVault,
}) => {
  if (!isOpen) return null;

  const [activeFilter, setActiveFilter] = useState<"all" | "facts" | "logs" | "measurements" | "activities">("all");
  const [searchFilter, setSearchFilter] = useState("");

  const totalCount = facts.length + dailyLogs.length + measurements.length + activities.length;

  const query = searchFilter.toLowerCase().trim();

  // Filtered lists
  const filteredFacts = facts.filter(
    (f) => !query || f.key.toLowerCase().includes(query) || f.value.toLowerCase().includes(query) || f.category.toLowerCase().includes(query)
  );

  const filteredLogs = dailyLogs.filter(
    (l) => !query || l.summary.toLowerCase().includes(query) || l.log_date.includes(query)
  );

  const filteredMeasurements = measurements.filter(
    (m) => !query || m.metric.toLowerCase().includes(query) || `${m.value}`.includes(query) || m.unit.toLowerCase().includes(query)
  );

  const filteredActivities = activities.filter(
    (a) => !query || a.name.toLowerCase().includes(query) || a.category.toLowerCase().includes(query) || (a.notes && a.notes.toLowerCase().includes(query))
  );

  return (
    <div className="tina-memory-backdrop" onClick={onClose}>
      <div className="tina-memory-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="tina-memory-header">
          <div className="tina-memory-header-left">
            <div className="tina-memory-orb-icon">🧠</div>
            <div>
              <h2 className="tina-memory-title">Tina's Memory Bank</h2>
              <p className="tina-memory-subtitle">
                {totalCount} personal facts, metrics, and logs remembered locally
              </p>
            </div>
          </div>
          <div className="tina-memory-header-right">
            <button
              type="button"
              className="btn-add-memory-primary"
              onClick={() => {
                onOpenEditModal({ type: "fact" });
              }}
            >
              + Add Memory
            </button>
            <button className="tina-memory-close-btn" onClick={onClose} aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Filter Pills & Search */}
        <div className="tina-memory-toolbar">
          <div className="tina-memory-pills">
            <button
              className={`pill-btn ${activeFilter === "all" ? "active" : ""}`}
              onClick={() => setActiveFilter("all")}
            >
              All ({totalCount})
            </button>
            <button
              className={`pill-btn ${activeFilter === "facts" ? "active" : ""}`}
              onClick={() => setActiveFilter("facts")}
            >
              Facts & Preferences ({facts.length})
            </button>
            <button
              className={`pill-btn ${activeFilter === "logs" ? "active" : ""}`}
              onClick={() => setActiveFilter("logs")}
            >
              Daily Logs ({dailyLogs.length})
            </button>
            <button
              className={`pill-btn ${activeFilter === "measurements" ? "active" : ""}`}
              onClick={() => setActiveFilter("measurements")}
            >
              Metrics ({measurements.length})
            </button>
            <button
              className={`pill-btn ${activeFilter === "activities" ? "active" : ""}`}
              onClick={() => setActiveFilter("activities")}
            >
              Habits ({activities.length})
            </button>
          </div>

          <div className="tina-memory-search-box">
            <input
              type="text"
              className="tina-memory-search-input"
              placeholder="Filter Tina's memory..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
          </div>
        </div>

        {/* List of Memory Entries */}
        <div className="tina-memory-scroll-body">
          {/* FACTS */}
          {(activeFilter === "all" || activeFilter === "facts") && filteredFacts.length > 0 && (
            <div className="tina-mem-section">
              <div className="tina-mem-section-title">Facts, Goals & Preferences</div>
              <div className="tina-mem-items-list">
                {filteredFacts.map((f) => (
                  <div key={`f-${f.id}`} className="tina-mem-item-row">
                    <div className="tina-mem-item-content">
                      <span className="mem-category-badge">{f.category}</span>
                      <strong className="mem-item-key">{f.key}:</strong>{" "}
                      <span className="mem-item-val">{f.value}</span>
                    </div>
                    <div className="tina-mem-item-actions">
                      <button
                        type="button"
                        className="mem-action-btn edit"
                        title="Edit fact"
                        onClick={() => {
                          onOpenEditModal({
                            type: "fact",
                            id: f.id,
                            category: f.category,
                            key: f.key,
                            summary: f.value,
                          });
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="mem-action-btn delete"
                        title="Delete fact"
                        onClick={() => onDeleteMemory("fact", f.id, f.key)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DAILY LOGS */}
          {(activeFilter === "all" || activeFilter === "logs") && filteredLogs.length > 0 && (
            <div className="tina-mem-section">
              <div className="tina-mem-section-title">Daily Journal & Activity Summaries</div>
              <div className="tina-mem-items-list">
                {filteredLogs.map((l) => (
                  <div key={`l-${l.id}`} className="tina-mem-item-row">
                    <div className="tina-mem-item-content">
                      <div className="mem-item-date">{l.log_date}</div>
                      <div className="mem-item-summary">{l.summary}</div>
                    </div>
                    <div className="tina-mem-item-actions">
                      <button
                        type="button"
                        className="mem-action-btn edit"
                        title="Edit log"
                        onClick={() => {
                          onOpenEditModal({
                            type: "daily_log",
                            id: l.id,
                            log_date: l.log_date,
                            summary: l.summary,
                          });
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="mem-action-btn delete"
                        title="Delete log"
                        onClick={() => onDeleteMemory("daily_log", l.id, l.log_date)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MEASUREMENTS */}
          {(activeFilter === "all" || activeFilter === "measurements") && filteredMeasurements.length > 0 && (
            <div className="tina-mem-section">
              <div className="tina-mem-section-title">Physical Metrics & Measurements</div>
              <div className="tina-mem-items-list">
                {filteredMeasurements.map((m) => (
                  <div key={`m-${m.id}`} className="tina-mem-item-row">
                    <div className="tina-mem-item-content">
                      <div className="mem-item-metric-val">
                        <strong>{m.metric}:</strong> {m.value} {m.unit}
                        <span className={`status-pill ${m.review_status}`}>{m.review_status}</span>
                      </div>
                      <div className="mem-item-date">{m.measurement_date}</div>
                    </div>
                    <div className="tina-mem-item-actions">
                      <button
                        type="button"
                        className="mem-action-btn edit"
                        title="Edit measurement"
                        onClick={() => {
                          onOpenEditModal({
                            type: "measurement",
                            id: m.id,
                            metric: m.metric,
                            value: m.value,
                            unit: m.unit,
                            measurement_date: m.measurement_date,
                            review_status: m.review_status,
                            notes: m.notes,
                          });
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="mem-action-btn delete"
                        title="Delete measurement"
                        onClick={() => onDeleteMemory("measurement", m.id, `${m.metric}: ${m.value}${m.unit}`)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ACTIVITIES */}
          {(activeFilter === "all" || activeFilter === "activities") && filteredActivities.length > 0 && (
            <div className="tina-mem-section">
              <div className="tina-mem-section-title">Activities & Habits</div>
              <div className="tina-mem-items-list">
                {filteredActivities.map((a) => (
                  <div key={`a-${a.id}`} className="tina-mem-item-row">
                    <div className="tina-mem-item-content">
                      <div className="mem-item-act-title">
                        <strong>{a.name}</strong> <span className="category-pill">{a.category}</span>
                      </div>
                      <div className="mem-item-date">
                        {a.duration_minutes ? `${a.duration_minutes} min • ` : ""}{a.activity_date}
                      </div>
                    </div>
                    <div className="tina-mem-item-actions">
                      <button
                        type="button"
                        className="mem-action-btn edit"
                        title="Edit activity"
                        onClick={() => {
                          onOpenEditModal({
                            type: "activity",
                            id: a.id,
                            name: a.name,
                            category: a.category,
                            duration_minutes: a.duration_minutes,
                            activity_date: a.activity_date,
                            notes: a.notes,
                          });
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="mem-action-btn delete"
                        title="Delete activity"
                        onClick={() => onDeleteMemory("activity", a.id, a.name)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {totalCount === 0 && (
            <div className="tina-mem-empty">
              <div className="empty-icon">💭</div>
              <div className="empty-text">No memories recorded in Tina's bank yet.</div>
              <p className="empty-sub">
                Speak to Tina or click <strong>+ Add Memory</strong> above to add facts, goals, or metrics.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="tina-memory-footer">
          <button
            type="button"
            className="btn-vault-link"
            onClick={() => {
              onClose();
              onNavigateToVault();
            }}
          >
            Open Full Memory Vault Tab →
          </button>
          <button type="button" className="btn-close-footer" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
