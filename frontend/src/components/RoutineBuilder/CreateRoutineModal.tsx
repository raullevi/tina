import React, { useState, useEffect, useRef } from "react";
import "./CreateRoutineModal.css";
import type { RoutineRecurrence } from "./types";

interface CreateRoutineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (routineData: {
    name: string;
    description: string;
    recurrence: RoutineRecurrence;
  }) => Promise<void>;
}

const PRESETS = [
  { name: "Morning Routine", recurrence: "daily" as RoutineRecurrence, desc: "Wake up, hydrate, stretch, and plan the day." },
  { name: "Evening Wind-Down", recurrence: "daily" as RoutineRecurrence, desc: "Digital sunset, reflection, reading, and sleep prep." },
  { name: "Gym Workout Split", recurrence: "weekly" as RoutineRecurrence, desc: "Warm-up, heavy compound lifts, cardio, and protein shake." },
  { name: "Deep Work Sprint", recurrence: "daily" as RoutineRecurrence, desc: "Focus blocks, zero distractions, and review outputs." },
  { name: "Weekly Life Review", recurrence: "weekly" as RoutineRecurrence, desc: "Inbox zero, budget check, and align upcoming goals." },
];

export const CreateRoutineModal: React.FC<CreateRoutineModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState("Morning Routine");
  const [description, setDescription] = useState("Daily flow to start the day with clarity and energy.");
  const [recurrence, setRecurrence] = useState<RoutineRecurrence>("daily");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName("Morning Routine");
      setDescription("Daily flow to start the day with clarity and energy.");
      setRecurrence("daily");
      setErrorMsg(null);
      setTimeout(() => inputRef.current?.select(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg("Please enter a routine name.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        recurrence,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to create routine.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApplyPreset = (p: typeof PRESETS[0]) => {
    setName(p.name);
    setRecurrence(p.recurrence);
    setDescription(p.desc);
    setErrorMsg(null);
  };

  return (
    <div className="rb-modal-backdrop" onClick={onClose}>
      <div className="rb-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="rb-modal-header">
          <div className="rb-modal-header-left">
            <div className="rb-modal-icon-orb">✨</div>
            <div>
              <h2 className="rb-modal-title">Create New Routine</h2>
              <p className="rb-modal-subtitle">
                Design a visual, reusable workflow connected by stages.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="rb-modal-close-btn"
            onClick={onClose}
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="rb-modal-form">
          {errorMsg && <div className="rb-modal-error">{errorMsg}</div>}

          {/* Quick Presets */}
          <div className="rb-modal-group">
            <label className="rb-modal-label">Quick Templates</label>
            <div className="rb-modal-presets">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className={`rb-preset-pill ${name === p.name ? "selected" : ""}`}
                  onClick={() => handleApplyPreset(p)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Routine Name */}
          <div className="rb-modal-group">
            <label className="rb-modal-label">
              Routine Name <span className="rb-req">*</span>
            </label>
            <input
              ref={inputRef}
              type="text"
              className="rb-modal-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Laundry Protocol, Gym Split, Morning Focus"
              required
              autoFocus
            />
          </div>

          {/* Recurrence Cadence */}
          <div className="rb-modal-group">
            <label className="rb-modal-label">Recurrence Cadence</label>
            <div className="rb-recurrence-grid">
              <button
                type="button"
                className={`rb-recurrence-card ${recurrence === "daily" ? "selected" : ""}`}
                onClick={() => setRecurrence("daily")}
              >
                <div className="rb-rec-title">Daily</div>
                <div className="rb-rec-desc">Repeats every day (morning, night routines)</div>
              </button>

              <button
                type="button"
                className={`rb-recurrence-card ${recurrence === "weekly" ? "selected" : ""}`}
                onClick={() => setRecurrence("weekly")}
              >
                <div className="rb-rec-title">Weekly</div>
                <div className="rb-rec-desc">Runs once per week (laundry, review, planning)</div>
              </button>

              <button
                type="button"
                className={`rb-recurrence-card ${recurrence === "custom" ? "selected" : ""}`}
                onClick={() => setRecurrence("custom")}
              >
                <div className="rb-rec-title">Custom</div>
                <div className="rb-rec-desc">Event-driven, bi-weekly, or flexible cycles</div>
              </button>
            </div>
          </div>

          {/* Description */}
          <div className="rb-modal-group">
            <label className="rb-modal-label">Purpose & Overview</label>
            <textarea
              className="rb-modal-textarea"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is the goal of this routine? (e.g. Keep living space clean, build strength, focus deeply)"
            />
          </div>

          {/* Actions Footer */}
          <div className="rb-modal-footer">
            <button
              type="button"
              className="rb-btn-modal-cancel"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rb-btn-modal-submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span className="rb-spinner" />
                  Creating...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Create Routine
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
