export type TaskId = string;
export type IntentId = string;
export type EvidenceId = string;
export type ChangelogId = string;
export type CommentId = string;
export type BlockerId = string;
export type DependencyId = string;

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export interface Task {
  id: TaskId;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedAgent?: string;
  dueDate?: number;
  startedAt?: number;
  completedAt?: number;
  updatedAt?: number;
  labels: string[];
  storyPoints?: number;
  createdAt: number;
}

export interface Intent {
  id: IntentId;
  taskId: TaskId;
  agentId: string;
  files: string[];
  boundaries?: string;
  acceptanceCriteria?: string;
  createdAt: number;
}

export interface Claim {
  agentId: string;
  files: string[];
  expiresAt: number;
  createdAt: number;
}

export interface Evidence {
  id: EvidenceId;
  taskId: TaskId;
  agentId: string;
  command: string;
  output: string;
  createdAt: number;
}

export type ChangeType =
  // File changes
  | 'create'
  | 'modify'
  | 'delete'
  // Task events
  | 'task_created'
  | 'task_status_change'
  | 'task_assigned'
  | 'task_priority_change'
  | 'task_completed'
  | 'blocker_added'
  | 'blocker_resolved'
  | 'dependency_added'
  | 'dependency_removed'
  | 'comment_added';

export interface ChangelogEntry {
  id: ChangelogId;
  taskId?: TaskId;
  agentId: string;
  filePath: string;
  changeType: ChangeType;
  summary: string;
  diffSnippet?: string;
  commitHash?: string;
  createdAt: number;
}

export interface Comment {
  id: CommentId;
  taskId: TaskId;
  agentId: string;
  content: string;
  createdAt: number;
  updatedAt?: number;
}

export interface Blocker {
  id: BlockerId;
  taskId: TaskId;
  description: string;
  blockingTaskId?: TaskId;  // Task that is blocking this task
  resolvedAt?: number;
  createdAt: number;
  createdBy: string;
}

export interface TaskDependency {
  id: DependencyId;
  taskId: TaskId;
  dependsOnTaskId: TaskId;
  createdAt: number;
}

export interface WipLimits {
  backlog?: number;
  todo?: number;
  in_progress?: number;
  review?: number;
  done?: number;
}

export interface WipStatus {
  status: TaskStatus;
  count: number;
  limit?: number;
  exceeded: boolean;
}

export type ScrumEvent =
  | { type: 'file.changed'; path: string; ts: number }
  | { type: 'file.added'; path: string; ts: number }
  | { type: 'file.deleted'; path: string; ts: number }
  | { type: 'task.created'; taskId: string; ts: number }
  | { type: 'intent.posted'; intentId: string; taskId: string; ts: number }
  | { type: 'claim.created'; agentId: string; files: string[]; expiresAt: number; ts: number }
  | { type: 'claim.conflict'; agentId: string; files: string[]; conflictsWith: string[]; ts: number }
  | { type: 'evidence.attached'; evidenceId: string; taskId: string; ts: number }
  | { type: 'gate.result'; ok: boolean; summary: string; ts: number };

// ==================== METRICS ====================

export interface TaskMetrics {
  taskId: TaskId;
  leadTimeMs?: number;   // createdAt to completedAt
  cycleTimeMs?: number;  // startedAt to completedAt
  storyPoints?: number;
}

export interface BoardMetrics {
  period: { since: number; until: number };
  completedCount: number;
  totalStoryPoints: number;
  avgLeadTimeMs?: number;
  avgCycleTimeMs?: number;
  p50LeadTimeMs?: number;
  p90LeadTimeMs?: number;
  p50CycleTimeMs?: number;
  p90CycleTimeMs?: number;
  throughputDaily: number[];  // Last 7 days
  velocityWeekly: number[];   // Last 4 weeks
  wipByStatus: Record<TaskStatus, number>;
  wipAging: Array<{
    taskId: TaskId;
    title: string;
    daysInProgress: number;
    assignedAgent?: string;
  }>;
}

export interface VelocityPeriod {
  periodStart: number;
  periodEnd: number;
  completedTasks: number;
  storyPoints: number;
}

export interface AgingWipTask {
  taskId: TaskId;
  title: string;
  startedAt: number;
  daysInProgress: number;
  assignedAgent?: string;
}
