import React, { useState } from "react";
import type { RoutineWorkflow } from "./types";

interface ExecutionViewProps {
  routine: RoutineWorkflow;
  onAdvanceStage: (stageId: string, status: string, notes?: string) => Promise<void>;
  onResetCycle: () => Promise<void>;
  onSwitchToBuilder: () => void;
}

export const ExecutionView: React.FC<ExecutionViewProps> = ({
  routine,
  onAdvanceStage,
  onResetCycle,
  onSwitchToBuilder,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customNote, setCustomNote] = useState("");

  const activeCycle = routine.active_cycle;
  const stages = routine.stages || [];
  const occurrences = activeCycle?.occurrences || {};

  const totalStages = stages.length;
  const completedStages = activeCycle?.progress?.completed || 0;
  const percentage = activeCycle?.progress?.percentage || 0;
  const nextStageId = activeCycle?.next_actionable_stage_id;
  const nextStage = stages.find((s) => s.id === nextStageId);

  const handleAction = async (stageId: string, status: string) => {
    setIsSubmitting(true);
    try {
      await onAdvanceStage(stageId, status, customNote || undefined);
      setCustomNote("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <span className="rb-exec-badge completed">✓ Completed</span>;
      case "ready":
        return <span className="rb-exec-badge ready">● Ready</span>;
      case "in_progress":
        return <span className="rb-exec-badge in-progress">⏳ In Progress</span>;
      case "delayed":
        return <span className="rb-exec-badge delayed">⚠️ Delayed</span>;
      case "skipped":
        return <span className="rb-exec-badge skipped">⏭️ Skipped</span>;
      default:
        return <span className="rb-exec-badge waiting">○ Waiting</span>;
    }
  };

  return (
    <div className="rb-exec-container">
      {/* Overview Banner */}
      <div className="rb-exec-banner">
        <div className="rb-exec-banner-left">
          <div className="rb-exec-routine-title">{routine.name}</div>
          <div className="rb-exec-routine-desc">{routine.description}</div>
          <div className="rb-exec-meta-row">
            <span className="rb-exec-chip">⟳ {routine.recurrence} Cycle</span>
            <span className="rb-exec-chip">
              Started: {activeCycle?.cycle_start ? new Date(activeCycle.cycle_start).toLocaleDateString() : "Active"}
            </span>
            <span className={`rb-exec-chip status-${activeCycle?.status || "in_progress"}`}>
              {activeCycle?.status === "completed" ? "Cycle Completed" : "Cycle in Progress"}
            </span>
          </div>
        </div>

        <div className="rb-exec-banner-right">
          <div className="rb-exec-progress-num">
            {completedStages} / {totalStages}
          </div>
          <div className="rb-exec-progress-label">Stages Done ({percentage}%)</div>
          <div className="rb-exec-progress-bar-wrap">
            <div className="rb-exec-progress-bar-fill" style={{ width: `${percentage}%` }} />
          </div>
        </div>
      </div>

      {/* Next Actionable Stage Focus Hero */}
      {nextStage && activeCycle?.status !== "completed" ? (
        <div className="rb-exec-hero-card">
          <div className="rb-exec-hero-top">
            <span className="rb-exec-hero-tag">RECOMMENDED NEXT ACTION</span>
            <span className="rb-exec-hero-time">{nextStage.schedule}</span>
          </div>

          <div className="rb-exec-hero-body">
            <div className="rb-exec-hero-icon">{nextStage.icon}</div>
            <div className="rb-exec-hero-text">
              <h3 className="rb-exec-hero-title">{nextStage.name}</h3>
              <p className="rb-exec-hero-desc">
                {nextStage.description || "Take action on this stage to advance the routine workflow."}
              </p>
              {nextStage.duration_minutes && (
                <div className="rb-exec-hero-sub">
                  ⏱ Expected duration: ~{nextStage.duration_minutes} minutes
                </div>
              )}
            </div>
          </div>

          {/* Action toolbar */}
          <div className="rb-exec-hero-actions">
            <button
              className="rb-btn-exec-complete"
              disabled={isSubmitting}
              onClick={() => handleAction(nextStage.id, "completed")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Mark Complete</span>
            </button>

            <button
              className="rb-btn-exec-secondary"
              disabled={isSubmitting}
              onClick={() => handleAction(nextStage.id, "delayed")}
            >
              ⏳ Delay
            </button>

            <button
              className="rb-btn-exec-secondary"
              disabled={isSubmitting}
              onClick={() => handleAction(nextStage.id, "skipped")}
            >
              ⏭️ Skip
            </button>
          </div>
        </div>
      ) : activeCycle?.status === "completed" ? (
        <div className="rb-exec-completed-card">
          <div className="rb-exec-completed-icon">🎉</div>
          <h3>Cycle Finished!</h3>
          <p>All stages for this {routine.recurrence} cycle of {routine.name} have been executed.</p>
          <button className="rb-btn-new-cycle" onClick={onResetCycle}>
            Start New Cycle
          </button>
        </div>
      ) : null}

      {/* Stage Checklist */}
      <div className="rb-exec-stages-list-card">
        <div className="rb-exec-card-title-row">
          <h4 className="rb-exec-section-title">Current Cycle Breakdown</h4>
          <button className="rb-btn-link-builder" onClick={onSwitchToBuilder}>
            Inspect Full Workflow Graph →
          </button>
        </div>

        <div className="rb-exec-stages-list">
          {stages.map((st, idx) => {
            const occ = occurrences[st.id] || { status: "waiting" };
            const isNext = st.id === nextStageId;

            return (
              <div key={st.id} className={`rb-exec-stage-row ${isNext ? "highlight" : ""}`}>
                <div className="rb-exec-stage-num">{idx + 1}</div>
                <div className="rb-exec-stage-icon">{st.icon}</div>
                <div className="rb-exec-stage-info">
                  <div className="rb-exec-stage-name-row">
                    <span className="rb-exec-stage-name">{st.name}</span>
                    <span className="rb-exec-stage-schedule">{st.schedule}</span>
                  </div>
                  {st.description && <div className="rb-exec-stage-notes">{st.description}</div>}
                </div>

                <div className="rb-exec-stage-status">
                  {getStatusBadge(occ.status)}
                </div>

                <div className="rb-exec-stage-actions">
                  {occ.status !== "completed" && (
                    <button
                      className="rb-btn-mini-check"
                      title="Mark stage complete"
                      disabled={isSubmitting}
                      onClick={() => handleAction(st.id, "completed")}
                    >
                      ✓
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cycle History */}
      {routine.history && routine.history.length > 0 && (
        <div className="rb-exec-history-card">
          <h4 className="rb-exec-section-title">Past Cycle Runs</h4>
          <div className="rb-exec-history-table">
            {routine.history.map((h) => (
              <div key={h.id} className="rb-exec-history-row">
                <span className="rb-history-date">
                  {new Date(h.cycle_start).toLocaleDateString()}
                </span>
                <span className="rb-history-score">
                  {h.completed_stages} of {h.total_stages} completed
                </span>
                <span className={`rb-history-badge ${h.status}`}>
                  {h.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
