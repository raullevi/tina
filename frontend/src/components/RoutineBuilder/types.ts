export type RoutineRecurrence = "daily" | "weekly" | "custom";
export type RoutineStatus = "active" | "draft" | "archived";

export interface RoutinePosition {
  x: number;
  y: number;
}

export type MissedBehavior = "reschedule" | "delayed" | "skip" | "wait_dependency" | "ask";

export interface RoutineStage {
  id: string;
  name: string;
  icon: string;
  description?: string;
  schedule: string; // e.g. "Daily", "Friday or Saturday", "Sunday"
  trigger: "scheduled" | "after_stage" | "manual";
  duration_minutes?: number | null;
  dependency?: string | null;
  completion_rule?: "manual" | "checklist" | "auto";
  missed_behavior?: MissedBehavior;
  position: RoutinePosition;
  branch_condition?: string | null;
}

export interface RoutineConnection {
  id: string;
  sourceStageId: string;
  targetStageId: string;
  type: "sequence" | "alternative" | "conditional" | "merge";
  condition?: string | null;
}

export type StageRunStatus =
  | "not_started"
  | "ready"
  | "in_progress"
  | "waiting"
  | "delayed"
  | "completed"
  | "skipped";

export interface StageOccurrence {
  status: StageRunStatus;
  completed_at?: string | null;
  notes?: string | null;
  scheduled_at?: string | null;
}

export interface ActiveCycle {
  id: number;
  cycle_start: string;
  cycle_end?: string | null;
  status: "in_progress" | "completed" | "delayed";
  completed_at?: string | null;
  occurrences: Record<string, StageOccurrence>;
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
  next_actionable_stage_id?: string | null;
}

export interface CycleHistoryItem {
  id: number;
  cycle_start: string;
  cycle_end?: string | null;
  status: string;
  completed_at?: string | null;
  completed_stages: number;
  total_stages: number;
}

export interface RoutineWorkflow {
  id: number;
  name: string;
  description: string;
  recurrence: RoutineRecurrence;
  status: RoutineStatus;
  created_at: string;
  updated_at: string;
  stages: RoutineStage[];
  connections: RoutineConnection[];
  branch_rules: any[];
  active_cycle?: ActiveCycle;
  history?: CycleHistoryItem[];
}
