import React, { useState, useRef, useEffect } from "react";
import type { RoutineStage, RoutineConnection } from "./types";

interface CanvasViewProps {
  stages: RoutineStage[];
  connections: RoutineConnection[];
  selectedStageId: string | null;
  onSelectStage: (stageId: string | null) => void;
  onUpdateStages: (stages: RoutineStage[]) => void;
  onUpdateConnections: (connections: RoutineConnection[]) => void;
  onAddStage: () => void;
  onAddBranch: () => void;
  onDeleteStage: (stageId: string) => void;
  saveStatus: "saved" | "saving" | "unsaved";
}

const CARD_WIDTH = 220;
const CARD_HEIGHT = 88;

export const CanvasView: React.FC<CanvasViewProps> = ({
  stages,
  connections,
  selectedStageId,
  onSelectStage,
  onUpdateStages,
  onUpdateConnections,
  onAddStage,
  onAddBranch,
  onDeleteStage,
  saveStatus,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Pan & Zoom states
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  // Node Dragging states
  const [draggingStageId, setDraggingStageId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Interactive Connection Dragging (from source handle to target handle)
  const [connectingSourceId, setConnectingSourceId] = useState<string | null>(null);
  const [connectingMousePos, setConnectingMousePos] = useState<{ x: number; y: number } | null>(null);

  // Selected connection for deletion
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);

  // Keyboard Delete / Backspace key shortcut for selected stage or connection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.isContentEditable)
      ) {
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedConnectionId) {
          e.preventDefault();
          onUpdateConnections(connections.filter((c) => c.id !== selectedConnectionId));
          setSelectedConnectionId(null);
        } else if (selectedStageId) {
          e.preventDefault();
          onDeleteStage(selectedStageId);
        }
      } else if (e.key === "Escape") {
        onSelectStage(null);
        setSelectedConnectionId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedStageId, selectedConnectionId, connections, onDeleteStage, onSelectStage, onUpdateConnections]);

  // Fit workflow to viewport
  const handleFitWorkflow = () => {
    if (stages.length === 0 || !containerRef.current) return;
    const minX = Math.min(...stages.map((s) => s.position.x));
    const maxX = Math.max(...stages.map((s) => s.position.x + CARD_WIDTH));
    const minY = Math.min(...stages.map((s) => s.position.y));
    const maxY = Math.max(...stages.map((s) => s.position.y + CARD_HEIGHT));

    const contentWidth = maxX - minX + 160;
    const contentHeight = maxY - minY + 160;
    const rect = containerRef.current.getBoundingClientRect();

    const scaleX = rect.width / contentWidth;
    const scaleY = rect.height / contentHeight;
    const newZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.5), 1.3);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setZoom(newZoom);
    setPan({
      x: rect.width / 2 - centerX * newZoom,
      y: rect.height / 2 - centerY * newZoom,
    });
  };

  // Canvas Pan Handlers
  const handleMouseDownCanvas = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".rb-stage-card") || (e.target as HTMLElement).closest(".rb-handle")) {
      return;
    }
    onSelectStage(null);
    setSelectedConnectionId(null);
    setIsPanning(true);
    setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // 1. Panning canvas
    if (isPanning) {
      setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
      return;
    }

    // 2. Dragging stage card
    if (draggingStageId && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const rawX = (e.clientX - rect.left - pan.x) / zoom;
      const rawY = (e.clientY - rect.top - pan.y) / zoom;

      const newX = Math.max(20, Math.round(rawX - dragOffset.x));
      const newY = Math.max(20, Math.round(rawY - dragOffset.y));

      onUpdateStages(
        stages.map((s) => (s.id === draggingStageId ? { ...s, position: { x: newX, y: newY } } : s))
      );
      return;
    }

    // 3. Drawing connection wire
    if (connectingSourceId && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setConnectingMousePos({
        x: (e.clientX - rect.left - pan.x) / zoom,
        y: (e.clientY - rect.top - pan.y) / zoom,
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingStageId(null);
    setConnectingSourceId(null);
    setConnectingMousePos(null);
  };

  // Node Drag start
  const handleStageMouseDown = (e: React.MouseEvent, stage: RoutineStage) => {
    e.stopPropagation();
    onSelectStage(stage.id);
    setSelectedConnectionId(null);

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - pan.x) / zoom;
      const mouseY = (e.clientY - rect.top - pan.y) / zoom;
      setDragOffset({
        x: mouseX - stage.position.x,
        y: mouseY - stage.position.y,
      });
    }
    setDraggingStageId(stage.id);
  };

  // Handle connection start from bottom handle
  const handleOutputHandleMouseDown = (e: React.MouseEvent, stageId: string) => {
    e.stopPropagation();
    setConnectingSourceId(stageId);
    const stage = stages.find((s) => s.id === stageId);
    if (stage) {
      setConnectingMousePos({
        x: stage.position.x + CARD_WIDTH / 2,
        y: stage.position.y + CARD_HEIGHT,
      });
    }
  };

  // Handle connection finish on top handle of another card
  const handleInputHandleMouseUp = (e: React.MouseEvent, targetStageId: string) => {
    e.stopPropagation();
    if (connectingSourceId && connectingSourceId !== targetStageId) {
      // Avoid duplicate connection
      const exists = connections.some(
        (c) => c.sourceStageId === connectingSourceId && c.targetStageId === targetStageId
      );
      if (!exists) {
        const newConn: RoutineConnection = {
          id: `conn-${connectingSourceId}-${targetStageId}-${Date.now().toString(36)}`,
          sourceStageId: connectingSourceId,
          targetStageId,
          type: "sequence",
        };
        onUpdateConnections([...connections, newConn]);
      }
    }
    setConnectingSourceId(null);
    setConnectingMousePos(null);
  };

  // Delete a selected connection
  const handleDeleteConnection = (connId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdateConnections(connections.filter((c) => c.id !== connId));
    setSelectedConnectionId(null);
  };

  return (
    <div
      className="rb-canvas-viewport"
      ref={containerRef}
      onMouseDown={handleMouseDownCanvas}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={(e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const delta = e.deltaY < 0 ? 0.08 : -0.08;
          setZoom((prev) => Math.min(Math.max(prev + delta, 0.4), 2.0));
        }
      }}
    >
      {/* Canvas Toolbar */}
      <div className="rb-canvas-toolbar" onMouseDown={(e) => e.stopPropagation()}>
        <div className="rb-toolbar-group">
          <button className="rb-toolbar-btn primary" onClick={onAddStage} title="Add Stage">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add stage</span>
          </button>
          <button className="rb-toolbar-btn" onClick={onAddBranch} title="Add Parallel/Alternative Branch">
            <span>Add branch</span>
          </button>
          <button className="rb-toolbar-btn" onClick={handleFitWorkflow} title="Fit workflow in view">
            <span>Fit workflow</span>
          </button>
        </div>

        <div className="rb-toolbar-separator" />

        <div className="rb-toolbar-group">
          <button
            className="rb-toolbar-icon-btn"
            onClick={() => setZoom((z) => Math.max(z - 0.1, 0.4))}
            title="Zoom out"
          >
            -
          </button>
          <span className="rb-zoom-display" onClick={() => setZoom(1)} title="Reset zoom to 100%">
            {Math.round(zoom * 100)}%
          </span>
          <button
            className="rb-toolbar-icon-btn"
            onClick={() => setZoom((z) => Math.min(z + 0.1, 2.0))}
            title="Zoom in"
          >
            +
          </button>
        </div>

        <div className="rb-toolbar-status">
          <span className={`rb-status-dot ${saveStatus}`} />
          <span className="rb-status-text">
            {saveStatus === "saving" ? "Saving..." : "Saved locally"}
          </span>
        </div>
      </div>

      {/* Interactive Transform Canvas Area */}
      <div
        className="rb-canvas-surface"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {/* SVG Connector Layer */}
        <svg className="rb-connections-svg">
          <defs>
            <marker
              id="arrow-lavender"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#8B72C7" />
            </marker>
            <marker
              id="arrow-selected"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#C4B5FD" />
            </marker>
          </defs>

          {/* Render Connections */}
          {connections.map((conn) => {
            const src = stages.find((s) => s.id === conn.sourceStageId);
            const tgt = stages.find((s) => s.id === conn.targetStageId);
            if (!src || !tgt) return null;

            const x1 = src.position.x + CARD_WIDTH / 2;
            const y1 = src.position.y + CARD_HEIGHT;
            const x2 = tgt.position.x + CARD_WIDTH / 2;
            const y2 = tgt.position.y;

            // Cubic Bezier curve
            const dy = Math.max(Math.abs(y2 - y1) * 0.45, 40);
            const pathData = `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;

            const isSelected = selectedConnectionId === conn.id;

            return (
              <g key={conn.id} className="rb-connection-group">
                {/* Thick invisible click target */}
                <path
                  d={pathData}
                  className="rb-connection-hitbox"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedConnectionId(conn.id);
                  }}
                />
                {/* Visible curved connector */}
                <path
                  d={pathData}
                  className={`rb-connection-wire ${isSelected ? "selected" : ""}`}
                  markerEnd={isSelected ? "url(#arrow-selected)" : "url(#arrow-lavender)"}
                />
                {/* Delete button on selected connection */}
                {isSelected && (
                  <g
                    transform={`translate(${(x1 + x2) / 2}, ${(y1 + y2) / 2})`}
                    onClick={(e) => handleDeleteConnection(conn.id, e)}
                    className="rb-conn-delete-badge"
                  >
                    <circle r="12" fill="#ef4444" />
                    <text textAnchor="middle" dy="4" fill="#ffffff" fontSize="12" fontWeight="bold">
                      ×
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Render in-progress dragged wire */}
          {connectingSourceId && connectingMousePos && (() => {
            const src = stages.find((s) => s.id === connectingSourceId);
            if (!src) return null;
            const x1 = src.position.x + CARD_WIDTH / 2;
            const y1 = src.position.y + CARD_HEIGHT;
            const x2 = connectingMousePos.x;
            const y2 = connectingMousePos.y;
            const dy = Math.max(Math.abs(y2 - y1) * 0.4, 30);
            const pathData = `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
            return (
              <path
                d={pathData}
                className="rb-connection-wire active-connecting"
                markerEnd="url(#arrow-lavender)"
              />
            );
          })()}
        </svg>

        {/* Stage Cards */}
        {stages.map((stage, idx) => {
          const isSelected = stage.id === selectedStageId;
          const stageNumber = String(idx + 1).padStart(2, "0");

          return (
            <div
              key={stage.id}
              className={`rb-stage-card ${isSelected ? "selected" : ""}`}
              style={{
                left: `${stage.position.x}px`,
                top: `${stage.position.y}px`,
                width: `${CARD_WIDTH}px`,
                height: `${CARD_HEIGHT}px`,
              }}
              onMouseDown={(e) => handleStageMouseDown(e, stage)}
            >
              {/* Input handle (top) */}
              <div
                className="rb-handle rb-handle-top"
                title="Connect from previous stage"
                onMouseUp={(e) => handleInputHandleMouseUp(e, stage.id)}
              />

              <div className="rb-card-content">
                <div className="rb-card-header">
                  <div className="rb-card-icon-num">
                    <span className="rb-stage-icon">{stage.icon}</span>
                    <span className="rb-stage-num">{stageNumber}</span>
                  </div>
                  <span className="rb-stage-title" title={stage.name}>
                    {stage.name}
                  </span>
                  <button
                    type="button"
                    className="rb-card-quick-delete"
                    title="Delete stage (or press Delete key)"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteStage(stage.id);
                    }}
                  >
                    ×
                  </button>
                </div>

                <div className="rb-card-footer">
                  <span className="rb-card-schedule">{stage.schedule}</span>
                  {stage.duration_minutes && (
                    <span className="rb-card-duration">{stage.duration_minutes}m</span>
                  )}
                </div>
              </div>

              {/* Output handle (bottom) */}
              <div
                className="rb-handle rb-handle-bottom"
                title="Drag to connect to next stage"
                onMouseDown={(e) => handleOutputHandleMouseDown(e, stage.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
