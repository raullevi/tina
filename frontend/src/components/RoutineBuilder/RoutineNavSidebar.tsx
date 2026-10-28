import React, { useState } from "react";
import type { RoutineWorkflow } from "./types";

interface RoutineNavSidebarProps {
  routines: RoutineWorkflow[];
  selectedRoutineId: number | null;
  onSelectRoutine: (id: number) => void;
  onCreateRoutine: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const RoutineNavSidebar: React.FC<RoutineNavSidebarProps> = ({
  routines,
  selectedRoutineId,
  onSelectRoutine,
  onCreateRoutine,
  isCollapsed,
  onToggleCollapse,
}) => {
  const [search, setSearch] = useState("");

  const filtered = routines.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.description.toLowerCase().includes(search.toLowerCase())
  );

  if (isCollapsed) {
    return (
      <div className="rb-nav-collapsed" onClick={onToggleCollapse} title="Expand routine list">
        <button className="rb-nav-expand-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <aside className="rb-nav-sidebar">
      <div className="rb-nav-header">
        <div className="rb-nav-title-row">
          <span className="rb-nav-title">All Routines</span>
          <button
            className="rb-nav-collapse-btn"
            onClick={onToggleCollapse}
            title="Collapse sidebar to maximize canvas"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>

        <input
          type="text"
          className="rb-nav-search"
          placeholder="Filter routines..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="rb-nav-list">
        {filtered.length === 0 ? (
          <div className="rb-nav-empty">
            <p>No routines match "{search}".</p>
            <button className="rb-btn-create-small" onClick={onCreateRoutine}>
              + Create Routine
            </button>
          </div>
        ) : (
          filtered.map((r) => {
            const isSelected = r.id === selectedRoutineId;
            const stageCount = r.stages?.length || 0;
            const progress = r.active_cycle?.progress?.percentage ?? 0;

            return (
              <div
                key={r.id}
                className={`rb-nav-item ${isSelected ? "selected" : ""}`}
                onClick={() => onSelectRoutine(r.id)}
              >
                <div className="rb-nav-item-top">
                  <span className="rb-nav-item-name">{r.name}</span>
                  <span className={`rb-nav-status-badge ${r.status}`}>
                    {r.status}
                  </span>
                </div>
                <div className="rb-nav-item-meta">
                  <span className="rb-nav-recurrence">⟳ {r.recurrence}</span>
                  <span className="rb-nav-stages-count">{stageCount} stages</span>
                </div>
                {r.status === "active" && (
                  <div className="rb-nav-progress-bar">
                    <div
                      className="rb-nav-progress-fill"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="rb-nav-footer">
        <button className="rb-btn-new-routine" onClick={onCreateRoutine}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>New routine</span>
        </button>
      </div>
    </aside>
  );
};
