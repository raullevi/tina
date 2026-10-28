import React, { useState, useEffect } from "react";
import "./EditMemoryModal.css";

export type MemoryType = "daily_log" | "activity" | "measurement" | "fact";

export interface MemoryItemData {
  type: MemoryType;
  id?: number;
  // Daily Log
  log_date?: string;
  summary?: string;
  // Activity
  category?: string;
  name?: string;
  duration_minutes?: number | null;
  activity_date?: string;
  notes?: string | null;
  // Measurement
  metric?: string;
  value?: number;
  unit?: string;
  measurement_date?: string;
  review_status?: string;
  // Fact
  key?: string;
}

interface EditMemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: MemoryItemData | null;
  onSaved: () => void;
  onDeleted: () => void;
  backendBaseUrl: string;
}

export const EditMemoryModal: React.FC<EditMemoryModalProps> = ({
  isOpen,
  onClose,
  item,
  onSaved,
  onDeleted,
  backendBaseUrl,
}) => {
  if (!isOpen || !item) return null;

  const isNew = !item.id;
  const memoryType = item.type;

  // Form states
  const [summary, setSummary] = useState(item.summary || "");
  const [logDate, setLogDate] = useState(item.log_date || new Date().toISOString().split("T")[0]);

  const [actName, setActName] = useState(item.name || "");
  const [actCategory, setActCategory] = useState(item.category || "general");
  const [actDuration, setActDuration] = useState<number | string>(item.duration_minutes ?? 30);
  const [actDate, setActDate] = useState(item.activity_date || new Date().toISOString().split("T")[0]);
  const [actNotes, setActNotes] = useState(item.notes || "");

  const [measMetric, setMeasMetric] = useState(item.metric || "");
  const [measValue, setMeasValue] = useState<number | string>(item.value ?? "");
  const [measUnit, setMeasUnit] = useState(item.unit || "kg");
  const [measDate, setMeasDate] = useState(item.measurement_date || new Date().toISOString().split("T")[0]);
  const [measStatus, setMeasStatus] = useState(item.review_status || "confirmed");
  const [measNotes, setMeasNotes] = useState(item.notes || "");

  const [factCategory, setFactCategory] = useState(item.category || "fact");
  const [factKey, setFactKey] = useState(item.key || "");
  const [factValue, setFactValue] = useState(item.summary || item.notes || "");

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setSummary(item.summary || "");
      setLogDate(item.log_date || new Date().toISOString().split("T")[0]);

      setActName(item.name || "");
      setActCategory(item.category || "general");
      setActDuration(item.duration_minutes ?? 30);
      setActDate(item.activity_date || new Date().toISOString().split("T")[0]);
      setActNotes(item.notes || "");

      setMeasMetric(item.metric || "");
      setMeasValue(item.value ?? "");
      setMeasUnit(item.unit || "kg");
      setMeasDate(item.measurement_date || new Date().toISOString().split("T")[0]);
      setMeasStatus(item.review_status || "confirmed");
      setMeasNotes(item.notes || "");

      setFactCategory(item.category || "fact");
      setFactKey(item.key || "");
      setFactValue((item as any).value || item.summary || item.notes || "");

      setConfirmDelete(false);
      setErrorMsg(null);
    }
  }, [item]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg(null);

    try {
      let endpoint = "";
      let method = isNew ? "POST" : "PUT";
      let payload: any = {};

      if (memoryType === "daily_log") {
        if (!summary.trim()) throw new Error("Daily summary is required.");
        endpoint = isNew ? `${backendBaseUrl}/api/memory/daily-logs` : `${backendBaseUrl}/api/memory/daily-logs/${item.id}`;
        payload = { log_date: logDate, summary: summary.trim() };
      } else if (memoryType === "activity") {
        if (!actName.trim()) throw new Error("Activity name is required.");
        endpoint = isNew ? `${backendBaseUrl}/api/memory/activities` : `${backendBaseUrl}/api/memory/activities/${item.id}`;
        payload = {
          name: actName.trim(),
          category: actCategory.trim(),
          duration_minutes: actDuration !== "" ? Number(actDuration) : null,
          activity_date: actDate,
          notes: actNotes.trim() || null,
        };
      } else if (memoryType === "measurement") {
        if (!measMetric.trim()) throw new Error("Metric name is required.");
        if (measValue === "" || isNaN(Number(measValue))) throw new Error("Valid numeric value is required.");
        endpoint = isNew ? `${backendBaseUrl}/api/memory/measurements` : `${backendBaseUrl}/api/memory/measurements/${item.id}`;
        payload = {
          metric: measMetric.trim(),
          value: Number(measValue),
          unit: measUnit.trim(),
          measurement_date: measDate,
          review_status: measStatus,
          notes: measNotes.trim() || null,
        };
      } else if (memoryType === "fact") {
        if (!factKey.trim()) throw new Error("Fact key is required.");
        if (!factValue.trim()) throw new Error("Fact value is required.");
        endpoint = isNew ? `${backendBaseUrl}/api/memory/facts` : `${backendBaseUrl}/api/memory/facts/${item.id}`;
        payload = {
          category: factCategory.trim(),
          key: factKey.trim(),
          value: factValue.trim(),
        };
      }

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to save memory record.");
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save memory.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setIsDeleting(true);
    setErrorMsg(null);

    try {
      let endpoint = "";
      if (memoryType === "daily_log") endpoint = `${backendBaseUrl}/api/memory/daily-logs/${item.id}`;
      else if (memoryType === "activity") endpoint = `${backendBaseUrl}/api/memory/activities/${item.id}`;
      else if (memoryType === "measurement") endpoint = `${backendBaseUrl}/api/memory/measurements/${item.id}`;
      else if (memoryType === "fact") endpoint = `${backendBaseUrl}/api/memory/facts/${item.id}`;

      const res = await fetch(endpoint, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to delete record.");
      }

      onDeleted();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to delete memory.");
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  const getTitle = () => {
    const action = isNew ? "Add" : "Alter";
    switch (memoryType) {
      case "daily_log":
        return `${action} Daily Log`;
      case "activity":
        return `${action} Activity & Habit`;
      case "measurement":
        return `${action} Tracked Measurement`;
      case "fact":
        return `${action} Personal Fact / Goal`;
    }
  };

  return (
    <div className="edit-memory-backdrop" onClick={onClose}>
      <div className="edit-memory-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="edit-memory-header">
          <div>
            <h2 className="edit-memory-title">{getTitle()}</h2>
            <p className="edit-memory-subtitle">
              {isNew ? "Record a new entry directly into your memory bank" : "Update or delete this memory entry"}
            </p>
          </div>
          <button className="edit-memory-close-btn" onClick={onClose} aria-label="Close modal">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {errorMsg && <div className="edit-memory-error">{errorMsg}</div>}

        {/* Form Body */}
        <form onSubmit={handleSave} className="edit-memory-form">
          {/* DAILY LOG FIELDS */}
          {memoryType === "daily_log" && (
            <>
              <div className="edit-mem-group">
                <label className="edit-mem-label">Log Date</label>
                <input
                  type="date"
                  className="edit-mem-input"
                  value={logDate}
                  onChange={(e) => setLogDate(e.target.value)}
                  required
                />
              </div>
              <div className="edit-mem-group">
                <label className="edit-mem-label">Summary / Journal Content</label>
                <textarea
                  className="edit-mem-textarea"
                  rows={4}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Summarize the day's events, reflections, and progress..."
                  required
                  autoFocus
                />
              </div>
            </>
          )}

          {/* ACTIVITY FIELDS */}
          {memoryType === "activity" && (
            <>
              <div className="edit-mem-row">
                <div className="edit-mem-group" style={{ flex: 1.5 }}>
                  <label className="edit-mem-label">Activity Name</label>
                  <input
                    type="text"
                    className="edit-mem-input"
                    value={actName}
                    onChange={(e) => setActName(e.target.value)}
                    placeholder="e.g., Morning 5km run or deep study"
                    required
                    autoFocus
                  />
                </div>
                <div className="edit-mem-group" style={{ flex: 1 }}>
                  <label className="edit-mem-label">Category</label>
                  <select
                    className="edit-mem-select"
                    value={actCategory}
                    onChange={(e) => setActCategory(e.target.value)}
                  >
                    <option value="gym">Gym / Fitness</option>
                    <option value="study">Study / Learning</option>
                    <option value="work">Work / Projects</option>
                    <option value="chore">Chore / Home</option>
                    <option value="general">General</option>
                  </select>
                </div>
              </div>

              <div className="edit-mem-row">
                <div className="edit-mem-group" style={{ flex: 1 }}>
                  <label className="edit-mem-label">Duration (minutes)</label>
                  <input
                    type="number"
                    min="1"
                    max="1440"
                    className="edit-mem-input"
                    value={actDuration}
                    onChange={(e) => setActDuration(e.target.value)}
                    placeholder="30"
                  />
                </div>
                <div className="edit-mem-group" style={{ flex: 1 }}>
                  <label className="edit-mem-label">Activity Date</label>
                  <input
                    type="date"
                    className="edit-mem-input"
                    value={actDate}
                    onChange={(e) => setActDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="edit-mem-group">
                <label className="edit-mem-label">Notes (Optional)</label>
                <input
                  type="text"
                  className="edit-mem-input"
                  value={actNotes}
                  onChange={(e) => setActNotes(e.target.value)}
                  placeholder="Additional context or thoughts..."
                />
              </div>
            </>
          )}

          {/* MEASUREMENT FIELDS */}
          {memoryType === "measurement" && (
            <>
              <div className="edit-mem-row">
                <div className="edit-mem-group" style={{ flex: 1.4 }}>
                  <label className="edit-mem-label">Metric Name</label>
                  <input
                    type="text"
                    className="edit-mem-input"
                    value={measMetric}
                    onChange={(e) => setMeasMetric(e.target.value)}
                    placeholder="e.g., weight, sleep_hours, water_liters"
                    required
                    autoFocus
                  />
                </div>
                <div className="edit-mem-group" style={{ flex: 0.9 }}>
                  <label className="edit-mem-label">Value</label>
                  <input
                    type="number"
                    step="any"
                    className="edit-mem-input"
                    value={measValue}
                    onChange={(e) => setMeasValue(e.target.value)}
                    placeholder="75.2"
                    required
                  />
                </div>
                <div className="edit-mem-group" style={{ flex: 0.7 }}>
                  <label className="edit-mem-label">Unit</label>
                  <input
                    type="text"
                    className="edit-mem-input"
                    value={measUnit}
                    onChange={(e) => setMeasUnit(e.target.value)}
                    placeholder="kg"
                    required
                  />
                </div>
              </div>

              <div className="edit-mem-row">
                <div className="edit-mem-group" style={{ flex: 1 }}>
                  <label className="edit-mem-label">Measurement Date</label>
                  <input
                    type="date"
                    className="edit-mem-input"
                    value={measDate}
                    onChange={(e) => setMeasDate(e.target.value)}
                    required
                  />
                </div>
                <div className="edit-mem-group" style={{ flex: 1 }}>
                  <label className="edit-mem-label">Status</label>
                  <select
                    className="edit-mem-select"
                    value={measStatus}
                    onChange={(e) => setMeasStatus(e.target.value)}
                  >
                    <option value="confirmed">Confirmed</option>
                    <option value="uncertain">Uncertain</option>
                  </select>
                </div>
              </div>

              <div className="edit-mem-group">
                <label className="edit-mem-label">Notes (Optional)</label>
                <input
                  type="text"
                  className="edit-mem-input"
                  value={measNotes}
                  onChange={(e) => setMeasNotes(e.target.value)}
                  placeholder="Notes, calibration or conditions..."
                />
              </div>
            </>
          )}

          {/* FACT FIELDS */}
          {memoryType === "fact" && (
            <>
              <div className="edit-mem-row">
                <div className="edit-mem-group" style={{ flex: 1.4 }}>
                  <label className="edit-mem-label">Key / Subject</label>
                  <input
                    type="text"
                    className="edit-mem-input"
                    value={factKey}
                    onChange={(e) => setFactKey(e.target.value)}
                    placeholder="e.g., Favorite coffee, Goal deadline, Policy"
                    required
                    autoFocus
                  />
                </div>
                <div className="edit-mem-group" style={{ flex: 1 }}>
                  <label className="edit-mem-label">Category</label>
                  <select
                    className="edit-mem-select"
                    value={factCategory}
                    onChange={(e) => setFactCategory(e.target.value)}
                  >
                    <option value="fact">Fact</option>
                    <option value="preference">Preference</option>
                    <option value="decision">Decision</option>
                    <option value="goal">Goal</option>
                  </select>
                </div>
              </div>

              <div className="edit-mem-group">
                <label className="edit-mem-label">Value / Detail</label>
                <textarea
                  className="edit-mem-textarea"
                  rows={3}
                  value={factValue}
                  onChange={(e) => setFactValue(e.target.value)}
                  placeholder="e.g., Double espresso with oat milk every morning"
                  required
                />
              </div>
            </>
          )}

          {/* Action Buttons */}
          <div className="edit-memory-actions">
            <div className="edit-actions-left">
              {!isNew && (
                <button
                  type="button"
                  className={`btn-delete-memory ${confirmDelete ? "confirm" : ""}`}
                  onClick={handleDelete}
                  disabled={isDeleting || isSaving}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  <span>{isDeleting ? "Deleting..." : confirmDelete ? "Click to Confirm Delete" : "Delete Memory"}</span>
                </button>
              )}
            </div>

            <div className="edit-actions-right">
              <button
                type="button"
                className="btn-cancel-mem"
                onClick={onClose}
                disabled={isSaving || isDeleting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-save-mem"
                disabled={isSaving || isDeleting}
              >
                {isSaving ? "Saving..." : isNew ? "Create Memory" : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
