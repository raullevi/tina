import React, { useState, useEffect } from "react";
import type { RoutineStage, RoutineConnection, MissedBehavior } from "./types";

interface StageSettingsPanelProps {
  stage: RoutineStage | null;
  allStages: RoutineStage[];
  connections: RoutineConnection[];
  onUpdateStage: (updated: RoutineStage) => void;
  onDeleteStage: (stageId: string) => void;
  onClose: () => void;
}

const COMMON_ICONS = ["🧺", "🧼", "☀️", "👔", "🗄️", "🏃", "🥗", "💊", "📖", "💻", "🧘", "🚿", "☕", "🛌", "📝", "🧹"];

export const StageSettingsPanel: React.FC<StageSettingsPanelProps> = ({
  stage,
  allStages,
  connections,
  onUpdateStage,
  onDeleteStage,
  onClose,
}) => {
  if (!stage) return null;

  const [activeTab, setActiveTab] = useState<"details" | "schedule" | "connections" | "completion" | "missed">("details");

  // Local form state
  const [name, setName] = useState(stage.name);
  const [description, setDescription] = useState(stage.description || "");
  const [icon, setIcon] = useState(stage.icon || "🧺");
  const [duration, setDuration] = useState<string | number>(stage.duration_minutes ?? 15);
  const [schedule, setSchedule] = useState(stage.schedule);
  const [trigger, setTrigger] = useState(stage.trigger);
  const [dependency, setDependency] = useState(stage.dependency || "");
  const [completionRule, setCompletionRule] = useState(stage.completion_rule || "manual");
  const [missedBehavior, setMissedBehavior] = useState<MissedBehavior>(stage.missed_behavior || "delayed");
  const [branchCondition, setBranchCondition] = useState(stage.branch_condition || "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (stage) {
      setName(stage.name);
      setDescription(stage.description || "");
      setIcon(stage.icon || "🧺");
      setDuration(stage.duration_minutes ?? 15);
      setSchedule(stage.schedule);
      setTrigger(stage.trigger);
      setDependency(stage.dependency || "");
      setCompletionRule(stage.completion_rule || "manual");
      setMissedBehavior(stage.missed_behavior || "delayed");
      setBranchCondition(stage.branch_condition || "");
      setConfirmDelete(false);
    }
  }, [stage.id]);

  const handleSave = () => {
    onUpdateStage({
      ...stage,
      name: name.trim() || stage.name,
      description: description.trim(),
      icon,
      duration_minutes: duration !== "" ? Number(duration) : null,
      schedule: schedule.trim() || "Daily",
      trigger,
      dependency: dependency || null,
      completion_rule: completionRule,
      missed_behavior: missedBehavior,
      branch_condition: branchCondition.trim() || null,
    });
  };

  const incomingConnections = connections.filter((c) => c.targetStageId === stage.id);
  const outgoingConnections = connections.filter((c) => c.sourceStageId === stage.id);

  return (
    <aside className="rb-stage-settings-panel">
      {/* Header */}
      <div className="rb-panel-header">
        <div className="rb-panel-title-group">
          <span className="rb-panel-icon">{icon}</span>
          <div>
            <div className="rb-panel-title">{name || "Stage Settings"}</div>
            <div className="rb-panel-sub">ID: {stage.id}</div>
          </div>
        </div>
        <button className="rb-panel-close-btn" onClick={onClose} title="Close settings panel">
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="rb-panel-tabs">
        <button
          className={`rb-panel-tab ${activeTab === "details" ? "active" : ""}`}
          onClick={() => setActiveTab("details")}
        >
          Details
        </button>
        <button
          className={`rb-panel-tab ${activeTab === "schedule" ? "active" : ""}`}
          onClick={() => setActiveTab("schedule")}
        >
          Schedule
        </button>
        <button
          className={`rb-panel-tab ${activeTab === "connections" ? "active" : ""}`}
          onClick={() => setActiveTab("connections")}
        >
          Links
        </button>
        <button
          className={`rb-panel-tab ${activeTab === "completion" ? "active" : ""}`}
          onClick={() => setActiveTab("completion")}
        >
          Done
        </button>
        <button
          className={`rb-panel-tab ${activeTab === "missed" ? "active" : ""}`}
          onClick={() => setActiveTab("missed")}
        >
          Missed
        </button>
      </div>

      {/* Tab Body */}
      <div className="rb-panel-body">
        {activeTab === "details" && (
          <div className="rb-settings-section">
            <div className="rb-form-group">
              <label>Stage Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleSave}
                placeholder="e.g. Wash clothes"
              />
            </div>

            <div className="rb-form-group">
              <label>Icon / Symbol</label>
              <div className="rb-icon-picker">
                {COMMON_ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    className={`rb-icon-btn ${icon === ic ? "selected" : ""}`}
                    onClick={() => {
                      setIcon(ic);
                      onUpdateStage({ ...stage, icon: ic });
                    }}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>

            <div className="rb-form-group">
              <label>Description / Instructions</label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={handleSave}
                placeholder="What happens in this stage? Instructions or checklist notes."
              />
            </div>

            <div className="rb-form-group">
              <label>Expected Duration (minutes)</label>
              <input
                type="number"
                min="1"
                max="1440"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                onBlur={handleSave}
                placeholder="e.g. 30"
              />
            </div>
          </div>
        )}

        {activeTab === "schedule" && (
          <div className="rb-settings-section">
            <div className="rb-form-group">
              <label>Schedule / Permitted Window</label>
              <input
                type="text"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                onBlur={handleSave}
                placeholder="e.g. Daily, Friday or Saturday, Sunday"
              />
              <span className="rb-form-hint">
                Flexible windows allow alternatives (e.g. "Friday or Saturday") without multiple tasks.
              </span>
            </div>

            <div className="rb-form-group">
              <label>Trigger Type</label>
              <select
                value={trigger}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setTrigger(val);
                  onUpdateStage({ ...stage, trigger: val });
                }}
              >
                <option value="scheduled">Scheduled (Date/Time based)</option>
                <option value="after_stage">After Prior Stage Completes</option>
                <option value="manual">Manual Trigger Only</option>
              </select>
            </div>

            <div className="rb-form-group">
              <label>Predecessor Dependency</label>
              <select
                value={dependency}
                onChange={(e) => {
                  setDependency(e.target.value);
                  onUpdateStage({ ...stage, dependency: e.target.value || null });
                }}
              >
                <option value="">None (Can start immediately)</option>
                {allStages
                  .filter((s) => s.id !== stage.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.icon} {s.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        )}

        {activeTab === "connections" && (
          <div className="rb-settings-section">
            <div className="rb-form-group">
              <label>Incoming Sources ({incomingConnections.length})</label>
              {incomingConnections.length === 0 ? (
                <div className="rb-empty-sub">Root stage (No incoming connections)</div>
              ) : (
                <div className="rb-link-chips">
                  {incomingConnections.map((c) => {
                    const src = allStages.find((s) => s.id === c.sourceStageId);
                    return (
                      <span key={c.id} className="rb-link-chip">
                        ← {src?.icon} {src?.name || c.sourceStageId}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rb-form-group">
              <label>Outgoing Targets ({outgoingConnections.length})</label>
              {outgoingConnections.length === 0 ? (
                <div className="rb-empty-sub">Terminal stage (Completes workflow)</div>
              ) : (
                <div className="rb-link-chips">
                  {outgoingConnections.map((c) => {
                    const tgt = allStages.find((s) => s.id === c.targetStageId);
                    return (
                      <span key={c.id} className="rb-link-chip">
                        → {tgt?.icon} {tgt?.name || c.targetStageId}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rb-form-group">
              <label>Branch Condition (Optional)</label>
              <input
                type="text"
                value={branchCondition}
                onChange={(e) => setBranchCondition(e.target.value)}
                onBlur={handleSave}
                placeholder="e.g. IF weather == sunny OR IF clothes_dirty"
              />
              <span className="rb-form-hint">
                Used to document or evaluate conditional branching logic.
              </span>
            </div>
          </div>
        )}

        {activeTab === "completion" && (
          <div className="rb-settings-section">
            <div className="rb-form-group">
              <label>Completion Mode</label>
              <select
                value={completionRule}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setCompletionRule(val);
                  onUpdateStage({ ...stage, completion_rule: val });
                }}
              >
                <option value="manual">Manual 1-Tap Completion (Default)</option>
                <option value="checklist">Require Checklist / Notes</option>
                <option value="auto">Auto-Complete on downstream trigger</option>
              </select>
            </div>
          </div>
        )}

        {activeTab === "missed" && (
          <div className="rb-settings-section">
            <div className="rb-form-group">
              <label>When Stage Is Overdue / Missed</label>
              <select
                value={missedBehavior}
                onChange={(e) => {
                  const val = e.target.value as MissedBehavior;
                  setMissedBehavior(val);
                  onUpdateStage({ ...stage, missed_behavior: val });
                }}
              >
                <option value="delayed">Mark as Delayed (Preserve history)</option>
                <option value="reschedule">Reschedule to Next Available Slot</option>
                <option value="skip">Skip with Reason</option>
                <option value="wait_dependency">Wait for Dependency</option>
                <option value="ask">Ask User What To Do Next</option>
              </select>
              <span className="rb-form-hint">
                TINA will never silently mark an overdue stage as complete.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Footer / Danger zone */}
      <div className="rb-panel-footer">
        {confirmDelete ? (
          <div className="rb-delete-confirm-box">
            <div className="rb-delete-warn-text">Delete "{stage.name}"? Connections will be detached.</div>
            <div className="rb-delete-actions">
              <button
                type="button"
                className="rb-btn-confirm-delete"
                onClick={() => {
                  onDeleteStage(stage.id);
                  setConfirmDelete(false);
                }}
              >
                Confirm Delete
              </button>
              <button
                type="button"
                className="rb-btn-cancel-delete"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="rb-btn-delete-stage"
            onClick={() => setConfirmDelete(true)}
          >
            🗑️ Delete Stage
          </button>
        )}
      </div>
    </aside>
  );
};
