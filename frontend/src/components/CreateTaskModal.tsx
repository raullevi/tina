import React, { useState } from "react";
import "./CreateTaskModal.css";

export type TaskType =
  | "one-time"
  | "recurring"
  | "event"
  | "deadline"
  | "project"
  | "flexible";

export type Priority = "low" | "medium" | "high";

interface LifeClusterOption {
  id: number;
  name: string;
}

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  clusters: LifeClusterOption[];
  onTaskCreated: () => void;
  backendBaseUrl: string;
}

const TASK_TYPE_OPTIONS: { id: TaskType; label: string; desc: string }[] = [
  { id: "one-time", label: "One-time task", desc: "Single specific task with planned date" },
  { id: "recurring", label: "Recurring routine", desc: "Repeats daily, weekly, or on fixed interval" },
  { id: "deadline", label: "Deadline-based task", desc: "Must be completed on or before strict deadline" },
  { id: "event", label: "Event-triggered task", desc: "Triggered by an action, state, or event" },
  { id: "project", label: "Project / multi-step", desc: "Contains multiple sequential steps" },
  { id: "flexible", label: "Flexible / conditional", desc: "Available to do anytime within a loose window" },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  isOpen,
  onClose,
  clusters,
  onTaskCreated,
  backendBaseUrl,
}) => {
  if (!isOpen) return null;

  // Common Form States
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("flexible");
  const [selectedClusterId, setSelectedClusterId] = useState<number | "custom">(
    clusters.length > 0 ? clusters[0].id : "custom"
  );
  const [customClusterName, setCustomClusterName] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [durationMinutes, setDurationMinutes] = useState<number>(30);

  // Type-specific states
  // Recurring
  const [recurrenceFreq, setRecurrenceFreq] = useState<"daily" | "weekly" | "interval">("daily");
  const [recurrenceIntervalDays, setRecurrenceIntervalDays] = useState<number>(1);
  const [selectedWeekday, setSelectedWeekday] = useState<number>(0);

  // Deadline & One-time
  const [dueDate, setDueDate] = useState<string>(new Date().toISOString().split("T")[0]);

  // Event-triggered
  const [triggerEvent, setTriggerEvent] = useState("");

  // Project subtasks
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [newSubtaskInput, setNewSubtaskInput] = useState("");

  // Flexible window
  const [availableFrom, setAvailableFrom] = useState("");
  const [availableUntil, setAvailableUntil] = useState("");

  // Submitting state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAddSubtask = () => {
    if (!newSubtaskInput.trim()) return;
    setSubtasks((prev) => [...prev, newSubtaskInput.trim()]);
    setNewSubtaskInput("");
  };

  const handleRemoveSubtask = (idx: number) => {
    setSubtasks((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg("Task title is required.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      // Build type-specific schedule payload
      const schedule: Record<string, any> = {
        type: taskType,
      };

      if (taskType === "recurring") {
        schedule.frequency = recurrenceFreq;
        if (recurrenceFreq === "interval") {
          schedule.recurrenceIntervalDays = recurrenceIntervalDays;
        } else if (recurrenceFreq === "weekly") {
          schedule.weekday = selectedWeekday;
        }
      } else if (taskType === "flexible") {
        schedule.availableFrom = availableFrom || null;
        schedule.availableUntil = availableUntil || null;
      }

      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        type: taskType,
        primaryClusterId: selectedClusterId === "custom" ? null : selectedClusterId,
        primaryCluster:
          selectedClusterId === "custom"
            ? customClusterName.trim() || "Personal Life"
            : clusters.find((c) => c.id === selectedClusterId)?.name || "Personal Life",
        priority: priority,
        dueDate: taskType === "deadline" || taskType === "one-time" ? dueDate : null,
        estimatedDurationMinutes: durationMinutes || null,
        schedule: schedule,
        linkedGoalIds: [],
        dependencies: [],
        subtasks: taskType === "project" ? subtasks : [],
        triggerEvent: taskType === "event" ? triggerEvent.trim() : null,
      };

      const res = await fetch(`${backendBaseUrl}/api/tasks/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Failed to create task (${res.status})`);
      }

      onTaskCreated();
      onClose();
    } catch (err: any) {
      console.error("Manual task creation error:", err);
      setErrorMsg(err.message || "Failed to create task");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="task-modal-backdrop" onClick={onClose}>
      <div className="task-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="task-modal-header">
          <div>
            <h2 className="task-modal-title">Create New Task</h2>
            <p className="task-modal-subtitle">
              Manual creation • Deterministic scheduling • No AI required
            </p>
          </div>
          <button className="task-modal-close-btn" onClick={onClose} title="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {errorMsg && <div className="task-modal-error">{errorMsg}</div>}

        <form onSubmit={handleSubmit} className="task-modal-form">
          {/* Task Title */}
          <div className="form-group">
            <label className="form-label">
              Task title <span className="req-star">*</span>
            </label>
            <input
              type="text"
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Read 20 pages, Complete workout, Submit quarterly taxes..."
              autoFocus
              required
            />
          </div>

          {/* Task Type Selector */}
          <div className="form-group">
            <label className="form-label">Task type</label>
            <div className="task-type-grid">
              {TASK_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`task-type-btn ${taskType === opt.id ? "active" : ""}`}
                  onClick={() => setTaskType(opt.id)}
                >
                  <div className="task-type-btn-title">{opt.label}</div>
                  <div className="task-type-btn-desc">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* DYNAMIC TYPE-SPECIFIC FIELDS */}
          <div className="type-specific-container">
            {/* 1. Recurring Routine */}
            {taskType === "recurring" && (
              <div className="type-fields-box">
                <div className="type-box-title">Recurrence Settings</div>
                <div className="form-row">
                  <div className="form-col">
                    <label className="form-sublabel">Frequency</label>
                    <select
                      className="form-select"
                      value={recurrenceFreq}
                      onChange={(e) => setRecurrenceFreq(e.target.value as any)}
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly (Specific day)</option>
                      <option value="interval">Custom interval</option>
                    </select>
                  </div>

                  {recurrenceFreq === "interval" && (
                    <div className="form-col">
                      <label className="form-sublabel">Every N days</label>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        className="form-input"
                        value={recurrenceIntervalDays}
                        onChange={(e) => setRecurrenceIntervalDays(parseInt(e.target.value) || 1)}
                      />
                    </div>
                  )}
                </div>

                {recurrenceFreq === "weekly" && (
                  <div style={{ marginTop: "12px" }}>
                    <label className="form-sublabel">Day of week</label>
                    <div className="weekday-picker">
                      {WEEKDAYS.map((day, idx) => (
                        <button
                          key={day}
                          type="button"
                          className={`weekday-btn ${selectedWeekday === idx ? "active" : ""}`}
                          onClick={() => setSelectedWeekday(idx)}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 2. Deadline-based task */}
            {taskType === "deadline" && (
              <div className="type-fields-box">
                <div className="type-box-title">Deadline Settings</div>
                <div className="form-row">
                  <div className="form-col">
                    <label className="form-sublabel">
                      Required Deadline Date <span className="req-star">*</span>
                    </label>
                    <input
                      type="date"
                      className="form-input"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 3. One-time task */}
            {taskType === "one-time" && (
              <div className="type-fields-box">
                <div className="type-box-title">Planned Date</div>
                <div className="form-row">
                  <div className="form-col">
                    <label className="form-sublabel">Scheduled Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 4. Event-triggered task */}
            {taskType === "event" && (
              <div className="type-fields-box">
                <div className="type-box-title">Trigger Event</div>
                <label className="form-sublabel">Trigger Condition</label>
                <input
                  type="text"
                  className="form-input"
                  value={triggerEvent}
                  onChange={(e) => setTriggerEvent(e.target.value)}
                  placeholder="e.g. After arriving home, When sprint review completes..."
                />
              </div>
            )}

            {/* 5. Project / Multi-step task */}
            {taskType === "project" && (
              <div className="type-fields-box">
                <div className="type-box-title">Project Steps / Subtasks</div>
                <div className="subtasks-input-row">
                  <input
                    type="text"
                    className="form-input"
                    value={newSubtaskInput}
                    onChange={(e) => setNewSubtaskInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddSubtask();
                      }
                    }}
                    placeholder="Add step or prerequisite..."
                  />
                  <button
                    type="button"
                    className="btn-add-subtask"
                    onClick={handleAddSubtask}
                  >
                    + Add Step
                  </button>
                </div>

                {subtasks.length > 0 && (
                  <ul className="subtasks-list">
                    {subtasks.map((step, idx) => (
                      <li key={idx} className="subtask-item">
                        <span className="step-num">{idx + 1}.</span>
                        <span className="step-text">{step}</span>
                        <button
                          type="button"
                          className="step-remove-btn"
                          onClick={() => handleRemoveSubtask(idx)}
                          title="Remove step"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* 6. Flexible / Conditional task */}
            {taskType === "flexible" && (
              <div className="type-fields-box">
                <div className="type-box-title">Flexible Window (Optional)</div>
                <div className="form-row">
                  <div className="form-col">
                    <label className="form-sublabel">Available From</label>
                    <input
                      type="date"
                      className="form-input"
                      value={availableFrom}
                      onChange={(e) => setAvailableFrom(e.target.value)}
                    />
                  </div>
                  <div className="form-col">
                    <label className="form-sublabel">Available Until</label>
                    <input
                      type="date"
                      className="form-input"
                      value={availableUntil}
                      onChange={(e) => setAvailableUntil(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Life Cluster & Priority */}
          <div className="form-row" style={{ marginTop: "14px" }}>
            <div className="form-col">
              <label className="form-label">Primary life cluster</label>
              <select
                className="form-select"
                value={selectedClusterId}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedClusterId(val === "custom" ? "custom" : parseInt(val));
                }}
              >
                {clusters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="custom">+ New Custom Cluster...</option>
              </select>

              {selectedClusterId === "custom" && (
                <input
                  type="text"
                  className="form-input"
                  style={{ marginTop: "8px" }}
                  placeholder="Enter cluster name..."
                  value={customClusterName}
                  onChange={(e) => setCustomClusterName(e.target.value)}
                  required
                />
              )}
            </div>

            <div className="form-col">
              <label className="form-label">Priority</label>
              <div className="priority-btn-group">
                {(["low", "medium", "high"] as Priority[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`priority-pill ${priority === p ? `active-${p}` : ""}`}
                    onClick={() => setPriority(p)}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Duration & Description */}
          <div className="form-row" style={{ marginTop: "14px" }}>
            <div className="form-col">
              <label className="form-label">Estimated duration (minutes)</label>
              <input
                type="number"
                min="5"
                max="480"
                step="5"
                className="form-input"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 30)}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginTop: "14px" }}>
            <label className="form-label">Description / Instructions (optional)</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add any prerequisites, context, or links..."
            />
          </div>

          {/* Modal Actions */}
          <div className="task-modal-actions">
            <button
              type="button"
              className="btn-modal-cancel"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-modal-submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
