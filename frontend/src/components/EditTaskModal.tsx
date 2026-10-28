import React, { useState, useEffect } from "react";
import "./EditTaskModal.css";

interface LifeClusterOption {
  id: number;
  name: string;
}

export interface TaskToEdit {
  id: number;
  title: string;
  cluster: string;
  duration_minutes: number | null;
  status: string;
  due_date: string;
}

interface EditTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: TaskToEdit | null;
  clusters: LifeClusterOption[];
  onTaskUpdated: () => void;
  onTaskDeleted: () => void;
  backendBaseUrl: string;
}

export const EditTaskModal: React.FC<EditTaskModalProps> = ({
  isOpen,
  onClose,
  task,
  clusters,
  onTaskUpdated,
  onTaskDeleted,
  backendBaseUrl,
}) => {
  if (!isOpen || !task) return null;

  const [title, setTitle] = useState(task.title || "");
  const [cluster, setCluster] = useState(task.cluster || "Personal Life");
  const [isCustomCluster, setIsCustomCluster] = useState(false);
  const [customCluster, setCustomCluster] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<number>(task.duration_minutes || 30);
  const [dueDate, setDueDate] = useState<string>(task.due_date || new Date().toISOString().split("T")[0]);
  const [status, setStatus] = useState<string>(task.status || "pending");

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync state if task changes
  useEffect(() => {
    if (task) {
      setTitle(task.title || "");
      const matchingCluster = clusters.find((c) => c.name.toLowerCase() === (task.cluster || "").toLowerCase());
      if (matchingCluster) {
        setCluster(matchingCluster.name);
        setIsCustomCluster(false);
      } else {
        setCluster("custom");
        setIsCustomCluster(true);
        setCustomCluster(task.cluster || "");
      }
      setDurationMinutes(task.duration_minutes || 30);
      setDueDate(task.due_date || new Date().toISOString().split("T")[0]);
      setStatus(task.status || "pending");
      setConfirmDelete(false);
      setErrorMsg(null);
    }
  }, [task, clusters]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg("Task title is required.");
      return;
    }

    const finalCluster = isCustomCluster ? (customCluster.trim() || "Personal Life") : cluster;

    setIsSaving(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`${backendBaseUrl}/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          cluster: finalCluster,
          duration_minutes: durationMinutes > 0 ? durationMinutes : null,
          due_date: dueDate,
          status,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to update task.");
      }

      onTaskUpdated();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred while saving.");
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
      const res = await fetch(`${backendBaseUrl}/api/tasks/${task.id}?delete_rule=true`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to delete task.");
      }

      onTaskDeleted();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to delete task.");
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="edit-task-backdrop" onClick={onClose}>
      <div className="edit-task-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="edit-task-header">
          <div>
            <h2 className="edit-task-title">Edit Task</h2>
            <p className="edit-task-subtitle">Update task details or remove it from your schedule</p>
          </div>
          <button className="edit-task-close-btn" onClick={onClose} aria-label="Close modal">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {errorMsg && <div className="edit-task-error">{errorMsg}</div>}

        {/* Form */}
        <form onSubmit={handleSave} className="edit-task-form">
          {/* Title */}
          <div className="edit-form-group">
            <label className="edit-form-label">Task Title</label>
            <input
              type="text"
              className="edit-form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Morning workout or review project draft"
              required
              autoFocus
            />
          </div>

          {/* Cluster & Duration in Grid */}
          <div className="edit-form-row">
            <div className="edit-form-group" style={{ flex: 1.4 }}>
              <label className="edit-form-label">Life Cluster / Area</label>
              <select
                className="edit-form-select"
                value={isCustomCluster ? "custom" : cluster}
                onChange={(e) => {
                  if (e.target.value === "custom") {
                    setIsCustomCluster(true);
                  } else {
                    setIsCustomCluster(false);
                    setCluster(e.target.value);
                  }
                }}
              >
                {clusters.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
                <option value="custom">+ Custom Category...</option>
              </select>

              {isCustomCluster && (
                <input
                  type="text"
                  className="edit-form-input"
                  style={{ marginTop: "8px" }}
                  placeholder="Enter cluster name..."
                  value={customCluster}
                  onChange={(e) => setCustomCluster(e.target.value)}
                  required
                />
              )}
            </div>

            <div className="edit-form-group" style={{ flex: 0.8 }}>
              <label className="edit-form-label">Duration (min)</label>
              <input
                type="number"
                min="1"
                max="480"
                className="edit-form-input"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Due Date & Status in Grid */}
          <div className="edit-form-row">
            <div className="edit-form-group" style={{ flex: 1 }}>
              <label className="edit-form-label">Scheduled Date</label>
              <input
                type="date"
                className="edit-form-input"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="edit-form-group" style={{ flex: 1 }}>
              <label className="edit-form-label">Status</label>
              <select
                className="edit-form-select"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="missed">Missed</option>
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="edit-task-actions">
            <div className="edit-actions-left">
              <button
                type="button"
                className={`btn-delete-task ${confirmDelete ? "confirm" : ""}`}
                onClick={handleDelete}
                disabled={isDeleting || isSaving}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span>{isDeleting ? "Deleting..." : confirmDelete ? "Click to Confirm Delete" : "Delete Task"}</span>
              </button>
            </div>

            <div className="edit-actions-right">
              <button
                type="button"
                className="btn-cancel-edit"
                onClick={onClose}
                disabled={isSaving || isDeleting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-save-task"
                disabled={isSaving || isDeleting}
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
