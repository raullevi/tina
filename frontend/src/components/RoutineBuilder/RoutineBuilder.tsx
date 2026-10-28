import React, { useState, useEffect, useCallback, useRef } from "react";
import "./RoutineBuilder.css";
import type { RoutineWorkflow, RoutineStage, RoutineConnection } from "./types";
import { RoutineNavSidebar } from "./RoutineNavSidebar";
import { CanvasView } from "./CanvasView";
import { StageSettingsPanel } from "./StageSettingsPanel";
import { ExecutionView } from "./ExecutionView";
import { CreateRoutineModal } from "./CreateRoutineModal";

interface RoutineBuilderProps {
  backendBaseUrl: string;
}

export const RoutineBuilder: React.FC<RoutineBuilderProps> = ({ backendBaseUrl }) => {
  const [routines, setRoutines] = useState<RoutineWorkflow[]>([]);
  const [selectedRoutineId, setSelectedRoutineId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"builder" | "execution">("builder");

  // UI States
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCreateRoutineModalOpen, setIsCreateRoutineModalOpen] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [isLoading, setIsLoading] = useState(true);

  // Auto-save debounce timer
  const autoSaveTimerRef = useRef<any>(null);

  // Load all routines
  const loadRoutines = useCallback(async () => {
    try {
      const res = await fetch(`${backendBaseUrl}/api/routine-workflows`);
      if (res.ok) {
        const data: RoutineWorkflow[] = await res.json();
        setRoutines(data);
        if (data.length > 0 && selectedRoutineId === null) {
          setSelectedRoutineId(data[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load routines:", err);
    } finally {
      setIsLoading(false);
    }
  }, [backendBaseUrl, selectedRoutineId]);

  useEffect(() => {
    loadRoutines();
  }, [loadRoutines]);

  const currentRoutine = routines.find((r) => r.id === selectedRoutineId) || routines[0] || null;

  // Track latest workflow in a ref to avoid stale closure data during rapid edits or deletes
  const currentRoutineRef = useRef<{ id: number; stages: RoutineStage[]; connections: RoutineConnection[] } | null>(null);

  useEffect(() => {
    if (currentRoutine) {
      currentRoutineRef.current = {
        id: currentRoutine.id,
        stages: currentRoutine.stages || [],
        connections: currentRoutine.connections || [],
      };
    } else {
      currentRoutineRef.current = null;
    }
  }, [currentRoutine]);

  // Unified atomic workflow update & save
  const updateWorkflow = (
    newStages?: RoutineStage[],
    newConnections?: RoutineConnection[],
    immediate: boolean = false
  ) => {
    if (!currentRoutine) return;
    const routineId = currentRoutine.id;

    const stagesToSave =
      newStages !== undefined
        ? newStages
        : currentRoutineRef.current?.stages ?? currentRoutine.stages ?? [];
    const connsToSave =
      newConnections !== undefined
        ? newConnections
        : currentRoutineRef.current?.connections ?? currentRoutine.connections ?? [];

    // Immediately keep ref updated
    currentRoutineRef.current = {
      id: routineId,
      stages: stagesToSave,
      connections: connsToSave,
    };

    // Immediately update local state
    setRoutines((prev) =>
      prev.map((r) =>
        r.id === routineId
          ? { ...r, stages: stagesToSave, connections: connsToSave }
          : r
      )
    );

    // Cancel any pending debounced auto-save
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    const doSave = async () => {
      setSaveStatus("saving");
      try {
        const res = await fetch(`${backendBaseUrl}/api/routine-workflows/${routineId}/workflow`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stages: stagesToSave,
            connections: connsToSave,
          }),
        });
        if (res.ok) {
          const updated: RoutineWorkflow = await res.json();
          setRoutines((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
          currentRoutineRef.current = {
            id: updated.id,
            stages: updated.stages || [],
            connections: updated.connections || [],
          };
          setSaveStatus("saved");
        } else {
          setSaveStatus("unsaved");
        }
      } catch {
        setSaveStatus("unsaved");
      }
    };

    if (immediate) {
      doSave();
    } else {
      setSaveStatus("unsaved");
      autoSaveTimerRef.current = setTimeout(doSave, 600);
    }
  };

  // Stage & Connection updates
  const handleUpdateStages = (newStages: RoutineStage[]) => {
    updateWorkflow(newStages, undefined, false);
  };

  const handleUpdateConnections = (newConnections: RoutineConnection[]) => {
    updateWorkflow(undefined, newConnections, false);
  };

  // Add new stage
  const handleAddStage = () => {
    if (!currentRoutine) return;
    const stages = currentRoutineRef.current?.stages ?? currentRoutine.stages ?? [];
    const nextNum = stages.length + 1;
    const lastStage = stages[stages.length - 1];
    const newY = lastStage ? lastStage.position.y + 140 : 80;
    const newX = lastStage ? lastStage.position.x : 260;

    const newStage: RoutineStage = {
      id: `stage-${Date.now().toString(36)}`,
      name: `Step ${nextNum}`,
      icon: "✨",
      schedule: currentRoutine.recurrence === "daily" ? "Daily" : "Weekly",
      trigger: stages.length === 0 ? "scheduled" : "after_stage",
      duration_minutes: 15,
      position: { x: newX, y: newY },
    };

    const newStages = [...stages, newStage];
    let newConnections = currentRoutineRef.current?.connections ?? currentRoutine.connections ?? [];

    // Automatically link previous stage to new stage
    if (lastStage) {
      newConnections = [
        ...newConnections,
        {
          id: `conn-${lastStage.id}-${newStage.id}`,
          sourceStageId: lastStage.id,
          targetStageId: newStage.id,
          type: "sequence",
        },
      ];
    }

    updateWorkflow(newStages, newConnections, false);
    setSelectedStageId(newStage.id);
  };

  // Add parallel / alternative branch
  const handleAddBranch = () => {
    if (!currentRoutine) return;
    const stages = currentRoutineRef.current?.stages ?? currentRoutine.stages ?? [];
    const lastStage = stages[stages.length - 1];
    const newY = lastStage ? lastStage.position.y : 120;
    const newX = lastStage ? lastStage.position.x + 280 : 540;

    const branchStage: RoutineStage = {
      id: `branch-${Date.now().toString(36)}`,
      name: `Alternative Path`,
      icon: "🔀",
      schedule: "Alternative Window",
      trigger: "after_stage",
      duration_minutes: 20,
      position: { x: newX, y: newY },
      branch_condition: "Alternative option",
    };

    const newStages = [...stages, branchStage];
    updateWorkflow(newStages, undefined, false);
    setSelectedStageId(branchStage.id);
  };

  // Delete a stage immediately and permanently
  const handleDeleteStage = (stageId: string) => {
    if (!currentRoutine) return;
    const stages = currentRoutineRef.current?.stages ?? currentRoutine.stages ?? [];
    const connections = currentRoutineRef.current?.connections ?? currentRoutine.connections ?? [];

    const newStages = stages.filter((s) => s.id !== stageId);
    const newConnections = connections.filter(
      (c) => c.sourceStageId !== stageId && c.targetStageId !== stageId
    );

    setSelectedStageId((prev) => (prev === stageId ? null : prev));
    updateWorkflow(newStages, newConnections, true);
  };

  // Open custom Create Routine Modal (No window.prompt)
  const handleCreateRoutine = () => {
    setIsCreateRoutineModalOpen(true);
  };

  const handleConfirmCreateRoutine = async (data: {
    name: string;
    description: string;
    recurrence: "daily" | "weekly" | "custom";
  }) => {
    const res = await fetch(`${backendBaseUrl}/api/routine-workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name,
        description: data.description || "Visual routine workflow created in TINA.",
        recurrence: data.recurrence,
        status: "active",
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to create routine");
    }
    const created: RoutineWorkflow = await res.json();
    setRoutines((prev) => [created, ...prev]);
    setSelectedRoutineId(created.id);
    setSelectedStageId(created.stages?.[0]?.id || null);
  };

  // Advance stage in execution
  const handleAdvanceStage = async (stageId: string, status: string, notes?: string) => {
    if (!currentRoutine) return;
    try {
      const res = await fetch(
        `${backendBaseUrl}/api/routine-workflows/${currentRoutine.id}/cycle/advance`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage_id: stageId, status, notes }),
        }
      );
      if (res.ok) {
        const updated = await res.json();
        setRoutines((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      }
    } catch (err) {
      console.error("Failed to advance stage:", err);
    }
  };

  // Start fresh cycle
  const handleResetCycle = async () => {
    if (!currentRoutine) return;
    try {
      const res = await fetch(
        `${backendBaseUrl}/api/routine-workflows/${currentRoutine.id}/cycle/reset`,
        { method: "POST" }
      );
      if (res.ok) {
        const updated = await res.json();
        setRoutines((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      }
    } catch (err) {
      console.error("Failed to reset cycle:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="rb-loading-state">
        <div className="rb-loading-spinner" />
        <span>Loading Routine Workflows...</span>
      </div>
    );
  }

  const selectedStage = currentRoutine?.stages?.find((s) => s.id === selectedStageId) || null;

  return (
    <div className="routine-builder-root">
      {/* Header */}
      <header className="rb-top-header">
        <div className="rb-header-left">
          <div className="rb-header-title-group">
            <h1 className="rb-header-title">Routines</h1>
            <p className="rb-header-subtitle">Design your routines. Connect every stage.</p>
          </div>
        </div>

        {/* View Switcher: Canvas Builder vs Daily Execution */}
        <div className="rb-view-switcher">
          <button
            className={`rb-switch-btn ${viewMode === "builder" ? "active" : ""}`}
            onClick={() => setViewMode("builder")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            <span>Builder Canvas</span>
          </button>
          <button
            className={`rb-switch-btn ${viewMode === "execution" ? "active" : ""}`}
            onClick={() => setViewMode("execution")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            <span>Daily Execution</span>
          </button>
        </div>

        <div className="rb-header-right">
          <button className="rb-btn-new-header" onClick={handleCreateRoutine}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>New routine</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="rb-workspace">
        {/* Left Sidebar: Routine Navigation */}
        <RoutineNavSidebar
          routines={routines}
          selectedRoutineId={selectedRoutineId}
          onSelectRoutine={(id) => {
            setSelectedRoutineId(id);
            setSelectedStageId(null);
          }}
          onCreateRoutine={handleCreateRoutine}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        />

        {/* Center Workspace */}
        <div className="rb-center-workspace">
          {viewMode === "builder" ? (
            <CanvasView
              stages={currentRoutine?.stages || []}
              connections={currentRoutine?.connections || []}
              selectedStageId={selectedStageId}
              onSelectStage={setSelectedStageId}
              onUpdateStages={handleUpdateStages}
              onUpdateConnections={handleUpdateConnections}
              onAddStage={handleAddStage}
              onAddBranch={handleAddBranch}
              onDeleteStage={handleDeleteStage}
              saveStatus={saveStatus}
            />
          ) : currentRoutine ? (
            <ExecutionView
              routine={currentRoutine}
              onAdvanceStage={handleAdvanceStage}
              onResetCycle={handleResetCycle}
              onSwitchToBuilder={() => setViewMode("builder")}
            />
          ) : null}
        </div>

        {/* Right Sidebar: Stage Settings (Visible in builder mode when stage is selected) */}
        {viewMode === "builder" && selectedStage && (
          <StageSettingsPanel
            stage={selectedStage}
            allStages={currentRoutine?.stages || []}
            connections={currentRoutine?.connections || []}
            onUpdateStage={(updated) => {
              if (!currentRoutine) return;
              const stages = currentRoutineRef.current?.stages ?? currentRoutine.stages ?? [];
              handleUpdateStages(
                stages.map((s) => (s.id === updated.id ? updated : s))
              );
            }}
            onDeleteStage={handleDeleteStage}
            onClose={() => setSelectedStageId(null)}
          />
        )}
      </div>

      {/* Custom TINA UI Modal for Routine Creation */}
      <CreateRoutineModal
        isOpen={isCreateRoutineModalOpen}
        onClose={() => setIsCreateRoutineModalOpen(false)}
        onSubmit={handleConfirmCreateRoutine}
      />
    </div>
  );
};
