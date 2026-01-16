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
  agentId: string;
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
  | { type: 'task.updated'; taskId: string; ts: number }
  | { type: 'intent.posted'; intentId: string; taskId: string; ts: number }
  | { type: 'claim.created'; agentId: string; files: string[]; expiresAt: number; ts: number }
  | { type: 'claim.extended'; agentId: string; files: string[]; expiresAt: number; ts: number }
  | { type: 'claim.released'; agentId: string; files: string[]; ts: number }
  | { type: 'claim.conflict'; agentId: string; files: string[]; conflictsWith: string[]; ts: number }
  | { type: 'evidence.attached'; evidenceId: string; taskId: string; ts: number }
  | { type: 'changelog.logged'; entryId: string; taskId?: string; agentId: string; filePath: string; ts: number }
  | { type: 'gate.result'; ok: boolean; summary: string; ts: number }
  | { type: 'gate.run'; gateId: string; taskId: string; passed: boolean; ts: number }
  | { type: 'comment.added'; commentId: string; taskId: string; ts: number }
  | { type: 'blocker.added'; blockerId: string; taskId: string; ts: number }
  | { type: 'blocker.resolved'; blockerId: string; taskId: string; ts: number }
  | { type: 'dependency.added'; dependencyId: string; taskId: string; ts: number }
  | { type: 'dependency.removed'; dependencyId: string; taskId: string; ts: number }
  | { type: 'agent.registered'; agentId: string; ts: number }
  | { type: 'agent.heartbeat'; agentId: string; ts: number };

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

// ==================== AGENT REGISTRY ====================

export type AgentStatus = 'active' | 'idle' | 'offline';

export interface Agent {
  agentId: string;
  capabilities: string[];
  metadata?: Record<string, unknown>;
  lastHeartbeat: number;
  registeredAt: number;
  status: AgentStatus;
}

// ==================== DEAD WORK DETECTION ====================

export type DeadWorkReason = 'no_claims' | 'no_activity' | 'stale';

export interface DeadWork {
  taskId: TaskId;
  title: string;
  status: TaskStatus;
  assignedAgent?: string;
  startedAt?: number;
  daysStale: number;
  lastActivityAt: number;
  hasActiveClaims: boolean;
  hasRecentEvidence: boolean;
  reason: DeadWorkReason;
}

// ==================== APPROVAL GATES ====================

export type GateId = string;
export type GateType = 'lint' | 'test' | 'build' | 'review' | 'custom';

export interface Gate {
  id: GateId;
  taskId: TaskId;
  gateType: GateType;
  command: string;
  triggerStatus: TaskStatus;
  required: boolean;
  createdAt: number;
}

export interface GateRun {
  id: string;
  gateId: GateId;
  taskId: TaskId;
  agentId: string;
  passed: boolean;
  output?: string;
  durationMs?: number;
  createdAt: number;
}

export type GateResultStatus = 'pending' | 'passed' | 'failed' | 'not_run';

export interface GateResult {
  gate: Gate;
  lastRun?: GateRun;
  status: GateResultStatus;
}

export interface GateStatus {
  allPassed: boolean;
  gates: GateResult[];
  blockedBy: Gate[];
}

// ==================== TASK TEMPLATES ====================

export type TemplateId = string;

export interface GateConfig {
  gateType: GateType;
  command: string;
  triggerStatus: TaskStatus;
}

export interface TaskTemplate {
  id: TemplateId;
  name: string;
  titlePattern: string;
  descriptionTemplate?: string;
  defaultStatus: TaskStatus;
  defaultPriority: TaskPriority;
  defaultLabels: string[];
  defaultStoryPoints?: number;
  gates?: GateConfig[];
  checklist?: string[];
  createdAt: number;
  updatedAt?: number;
}

// ==================== WEBHOOKS ====================

export type WebhookId = string;

export type WebhookEventType =
  | 'task.created'
  | 'task.updated'
  | 'task.completed'
  | 'intent.posted'
  | 'claim.created'
  | 'claim.conflict'
  | 'claim.released'
  | 'evidence.attached'
  | 'gate.passed'
  | 'gate.failed';

export interface Webhook {
  id: WebhookId;
  name: string;
  url: string;
  events: WebhookEventType[];
  headers?: Record<string, string>;
  secret?: string;
  enabled: boolean;
  createdAt: number;
  updatedAt?: number;
}

export interface WebhookDelivery {
  id: string;
  webhookId: WebhookId;
  eventType: WebhookEventType;
  payload: Record<string, unknown>;
  statusCode?: number;
  response?: string;
  durationMs?: number;
  success: boolean;
  createdAt: number;
}

// ==================== SPRINT (Collaborative Space) ====================

export type SprintId = string;
export type SprintShareId = string;

export type SprintStatus = 'active' | 'completed' | 'abandoned';

/**
 * A Sprint is a collaborative space where multiple sub-agents work on the same task.
 * The goal is shared understanding, not control. Agents are incentivized to understand
 * each other's code to create better integrated systems.
 */
export interface Sprint {
  id: SprintId;
  taskId: TaskId;
  name?: string;
  goal?: string;  // What are we trying to achieve together?
  status: SprintStatus;
  createdAt: number;
  completedAt?: number;
}

/**
 * A member of a sprint. Tracks what they're working on and their focus area.
 */
export interface SprintMember {
  sprintId: SprintId;
  agentId: string;
  workingOn: string;          // What this agent is building (human readable)
  focusArea?: string;         // e.g., "backend", "frontend", "tests", "auth"
  joinedAt: number;
  leftAt?: number;
}

/**
 * Shared context within a sprint. This is how agents understand each other's work.
 * Not about control - about collaboration.
 */
export type ShareType =
  | 'context'      // Background info, codebase knowledge
  | 'decision'     // Architectural/design decisions
  | 'interface'    // API contracts, function signatures, exports
  | 'discovery'    // "I found out that X works like Y"
  | 'integration'  // "To integrate with my code, do X"
  | 'question'     // Ask the group
  | 'answer';      // Response to a question

export interface SprintShare {
  id: SprintShareId;
  sprintId: SprintId;
  agentId: string;
  shareType: ShareType;
  title: string;              // Short summary
  content: string;            // Full detail
  relatedFiles?: string[];    // Files this relates to
  replyToId?: SprintShareId;  // If this is an answer to a question
  createdAt: number;
}

/**
 * Aggregated view of a sprint with all its context
 */
export interface SprintContext {
  sprint: Sprint;
  members: SprintMember[];
  shares: SprintShare[];
  // Aggregated from member intents
  allFiles: string[];         // All files being touched by any member
  allBoundaries: string[];    // All boundaries declared by any member
}
