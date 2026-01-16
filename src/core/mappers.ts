/**
 * Row-to-type mappers for converting database rows to domain types.
 *
 * This module centralizes the snake_case to camelCase conversion logic
 * between SQLite database rows and TypeScript domain types. All mappers
 * follow the same pattern:
 * - Accept a strongly-typed row interface (e.g., TaskRow)
 * - Return the corresponding domain type (e.g., Task)
 * - Handle null-to-undefined conversions
 * - Parse JSON columns into typed arrays/objects
 *
 * @module mappers
 *
 * @example
 * ```typescript
 * import { mapRowToTask, TaskRow } from './mappers.js';
 *
 * const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRow;
 * const task = mapRowToTask(row);
 * ```
 */
import type {
  Agent,
  AgentStatus,
  Blocker,
  ChangelogEntry,
  ChangeType,
  Claim,
  Comment,
  Evidence,
  Gate,
  GateRun,
  GateType,
  Intent,
  Task,
  TaskDependency,
  TaskPriority,
  TaskStatus,
  TaskTemplate,
  Webhook,
  WebhookDelivery,
  WebhookEventType
} from './types.js';

// ==================== DATABASE ROW TYPES ====================

/**
 * Database row type for the `tasks` table.
 * Uses snake_case column names as stored in SQLite.
 */
export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  priority: string | null;
  assigned_agent: string | null;
  due_date: number | null;
  started_at: number | null;
  completed_at: number | null;
  updated_at: number | null;
  labels_json: string | null;
  story_points: number | null;
  created_at: number;
}

/**
 * Database row type for the `intents` table.
 * Intents declare an agent's intent to modify specific files before claiming them.
 */
export interface IntentRow {
  id: string;
  task_id: string;
  agent_id: string;
  files_json: string;
  boundaries: string | null;
  acceptance_criteria: string | null;
  created_at: number;
}

/**
 * Database row type for the `claims` table.
 * Each row represents a single file claim; multiple rows per agent are aggregated.
 */
export interface ClaimRow {
  agent_id: string;
  file_path: string;
  expires_at: number;
  created_at: number;
}

/**
 * Database row type for the `evidence` table.
 * Evidence records contain command execution results for task verification.
 */
export interface EvidenceRow {
  id: string;
  task_id: string;
  agent_id: string;
  command: string;
  output: string;
  created_at: number;
}

/**
 * Database row type for the `changelog` table.
 * Tracks file modifications made by agents with optional diff snippets.
 */
export interface ChangelogRow {
  id: string;
  task_id: string | null;
  agent_id: string;
  file_path: string;
  change_type: string;
  summary: string;
  diff_snippet: string | null;
  commit_hash: string | null;
  created_at: number;
}

/**
 * Database row type for the `comments` table.
 * Comments are discussion threads attached to tasks.
 */
export interface CommentRow {
  id: string;
  task_id: string;
  agent_id: string;
  content: string;
  created_at: number;
  updated_at: number | null;
}

/**
 * Database row type for the `blockers` table.
 * Blockers represent issues preventing task progress.
 */
export interface BlockerRow {
  id: string;
  task_id: string;
  description: string;
  blocking_task_id: string | null;
  resolved_at: number | null;
  created_at: number;
  created_by: string;
}

/**
 * Database row type for the `task_dependencies` table.
 * Defines ordering requirements between tasks.
 */
export interface DependencyRow {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  created_at: number;
}

/**
 * Database row type for the `gates` table.
 * Gates define approval checkpoints (lint, test, build, review) for task transitions.
 */
export interface GateRow {
  id: string;
  task_id: string;
  gate_type: string;
  command: string;
  trigger_status: string;
  required: number;
  created_at: number;
}

/**
 * Database row type for the `gate_runs` table.
 * Records execution history of gates with pass/fail status.
 */
export interface GateRunRow {
  id: string;
  gate_id: string;
  task_id: string;
  agent_id: string;
  passed: number;
  output: string | null;
  duration_ms: number | null;
  created_at: number;
}

/**
 * Database row type for the `agents` table.
 * Tracks registered agents, their capabilities, and heartbeat status.
 */
export interface AgentRow {
  agent_id: string;
  capabilities_json: string;
  metadata_json: string | null;
  last_heartbeat: number;
  registered_at: number;
  status: string;
}

/**
 * Database row type for the `webhooks` table.
 * Webhook subscriptions for external event notifications.
 */
export interface WebhookRow {
  id: string;
  name: string;
  url: string;
  events_json: string;
  headers_json: string | null;
  secret: string | null;
  enabled: number;
  created_at: number;
  updated_at: number | null;
}

/**
 * Database row type for the `webhook_deliveries` table.
 * Tracks webhook delivery attempts with status codes and responses.
 */
export interface WebhookDeliveryRow {
  id: string;
  webhook_id: string;
  event_type: string;
  payload_json: string;
  status_code: number | null;
  response: string | null;
  duration_ms: number | null;
  success: number;
  created_at: number;
}

/**
 * Database row type for the `task_templates` table.
 * Templates for creating tasks with predefined settings and gates.
 */
export interface TaskTemplateRow {
  id: string;
  name: string;
  title_pattern: string;
  description_template: string | null;
  default_status: string;
  default_priority: string;
  default_labels_json: string;
  default_story_points: number | null;
  gates_json: string | null;
  checklist_json: string | null;
  created_at: number;
  updated_at: number | null;
}

// ==================== MAPPERS ====================

/**
 * Maps a database task row to a Task domain type.
 *
 * Converts snake_case columns to camelCase properties and handles:
 * - Null-to-undefined conversions for optional fields
 * - JSON parsing for labels array
 * - Type casting for status and priority enums
 *
 * @param row - The database row from the tasks table
 * @returns A Task domain object
 *
 * @example
 * ```typescript
 * const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRow;
 * const task = mapRowToTask(row);
 * console.log(task.status); // 'in_progress'
 * ```
 */
export function mapRowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    status: (row.status as TaskStatus) ?? 'backlog',
    priority: (row.priority as TaskPriority) ?? 'medium',
    assignedAgent: row.assigned_agent ?? undefined,
    dueDate: row.due_date ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    labels: row.labels_json ? JSON.parse(row.labels_json) : [],
    storyPoints: row.story_points ?? undefined,
    createdAt: row.created_at
  };
}

/**
 * Maps a database intent row to an Intent domain type.
 *
 * Parses the JSON-encoded files array and converts snake_case to camelCase.
 *
 * @param row - The database row from the intents table
 * @returns An Intent domain object
 *
 * @example
 * ```typescript
 * const row = db.prepare('SELECT * FROM intents WHERE task_id = ?').get(taskId) as IntentRow;
 * const intent = mapRowToIntent(row);
 * console.log(intent.files); // ['src/index.ts', 'src/utils.ts']
 * ```
 */
export function mapRowToIntent(row: IntentRow): Intent {
  return {
    id: row.id,
    taskId: row.task_id,
    agentId: row.agent_id,
    files: JSON.parse(row.files_json) as string[],
    boundaries: row.boundaries ?? undefined,
    acceptanceCriteria: row.acceptance_criteria ?? undefined,
    createdAt: row.created_at
  };
}

/**
 * Maps a single database claim row to an intermediate claim object.
 *
 * Note: Claims are stored per-file in the database, so this returns
 * a single file claim. Use {@link aggregateClaimRows} to combine
 * multiple rows into Claim domain types grouped by agent.
 *
 * @param row - A single row from the claims table
 * @returns An intermediate claim object with a single file path
 *
 * @see {@link aggregateClaimRows} for grouping claims by agent
 */
export function mapRowToClaim(row: ClaimRow): { agentId: string; filePath: string; expiresAt: number; createdAt: number } {
  return {
    agentId: row.agent_id,
    filePath: row.file_path,
    expiresAt: row.expires_at,
    createdAt: row.created_at
  };
}

/**
 * Aggregates multiple claim rows by agent into Claim domain types.
 *
 * Since claims are stored per-file in the database, this function groups
 * them by agent ID, collecting all claimed files into a single Claim object.
 * The expiresAt timestamp is the latest expiry, and createdAt is the earliest.
 *
 * @param rows - Array of claim rows from the database
 * @returns Array of Claim domain objects, one per agent
 *
 * @example
 * ```typescript
 * const rows = db.prepare('SELECT * FROM claims WHERE expires_at > ?').all(now) as ClaimRow[];
 * const claims = aggregateClaimRows(rows);
 * // [{ agentId: 'claude-code-abc', files: ['a.ts', 'b.ts'], expiresAt: 1234567890, createdAt: 1234567800 }]
 * ```
 */
export function aggregateClaimRows(rows: ClaimRow[]): Claim[] {
  const byAgent = new Map<string, { files: string[]; expiresAt: number; createdAt: number }>();

  for (const r of rows) {
    let entry = byAgent.get(r.agent_id);
    if (!entry) {
      entry = { files: [], expiresAt: r.expires_at, createdAt: r.created_at };
      byAgent.set(r.agent_id, entry);
    }
    entry.files.push(r.file_path);
    entry.expiresAt = Math.max(entry.expiresAt, r.expires_at);
    entry.createdAt = Math.min(entry.createdAt, r.created_at);
  }

  return [...byAgent.entries()].map(([agentId, v]) => ({
    agentId,
    files: v.files,
    expiresAt: v.expiresAt,
    createdAt: v.createdAt
  }));
}

/**
 * Maps a database evidence row to an Evidence domain type.
 *
 * Evidence records capture command execution results used to verify
 * that tasks were completed correctly.
 *
 * @param row - The database row from the evidence table
 * @returns An Evidence domain object
 *
 * @example
 * ```typescript
 * const evidence = mapRowToEvidence(row);
 * console.log(evidence.command); // 'npm test'
 * console.log(evidence.output);  // 'All tests passed'
 * ```
 */
export function mapRowToEvidence(row: EvidenceRow): Evidence {
  return {
    id: row.id,
    taskId: row.task_id,
    agentId: row.agent_id,
    command: row.command,
    output: row.output,
    createdAt: row.created_at
  };
}

/**
 * Maps a database changelog row to a ChangelogEntry domain type.
 *
 * Changelog entries track file modifications made by agents,
 * with optional diff snippets and commit hashes for traceability.
 *
 * @param row - The database row from the changelog table
 * @returns A ChangelogEntry domain object
 *
 * @example
 * ```typescript
 * const entry = mapRowToChangelogEntry(row);
 * console.log(entry.changeType); // 'modify'
 * console.log(entry.summary);    // 'Fixed null pointer exception'
 * ```
 */
export function mapRowToChangelogEntry(row: ChangelogRow): ChangelogEntry {
  return {
    id: row.id,
    taskId: row.task_id ?? undefined,
    agentId: row.agent_id,
    filePath: row.file_path,
    changeType: row.change_type as ChangeType,
    summary: row.summary,
    diffSnippet: row.diff_snippet ?? undefined,
    commitHash: row.commit_hash ?? undefined,
    createdAt: row.created_at
  };
}

/**
 * Maps a database comment row to a Comment domain type.
 *
 * Comments are discussion threads attached to tasks for
 * agent-to-agent or agent-to-human communication.
 *
 * @param row - The database row from the comments table
 * @returns A Comment domain object
 */
export function mapRowToComment(row: CommentRow): Comment {
  return {
    id: row.id,
    taskId: row.task_id,
    agentId: row.agent_id,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined
  };
}

/**
 * Maps a database blocker row to a Blocker domain type.
 *
 * Blockers represent issues preventing task progress. They can
 * optionally reference another blocking task.
 *
 * @param row - The database row from the blockers table
 * @returns A Blocker domain object
 */
export function mapRowToBlocker(row: BlockerRow): Blocker {
  return {
    id: row.id,
    taskId: row.task_id,
    description: row.description,
    blockingTaskId: row.blocking_task_id ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
    createdAt: row.created_at,
    agentId: row.created_by
  };
}

/**
 * Maps a database dependency row to a TaskDependency domain type.
 *
 * Dependencies define task ordering - a task cannot start until
 * all its dependencies are completed.
 *
 * @param row - The database row from the task_dependencies table
 * @returns A TaskDependency domain object
 */
export function mapRowToTaskDependency(row: DependencyRow): TaskDependency {
  return {
    id: row.id,
    taskId: row.task_id,
    dependsOnTaskId: row.depends_on_task_id,
    createdAt: row.created_at
  };
}

/**
 * Maps a database gate row to a Gate domain type.
 *
 * Gates define approval checkpoints for task status transitions.
 * The required field is stored as INTEGER (0/1) and converted to boolean.
 *
 * @param row - The database row from the gates table
 * @returns A Gate domain object
 *
 * @example
 * ```typescript
 * const gate = mapRowToGate(row);
 * console.log(gate.gateType);      // 'test'
 * console.log(gate.command);       // 'npm test'
 * console.log(gate.triggerStatus); // 'review'
 * ```
 */
export function mapRowToGate(row: GateRow): Gate {
  return {
    id: row.id,
    taskId: row.task_id,
    gateType: row.gate_type as GateType,
    command: row.command,
    triggerStatus: row.trigger_status as TaskStatus,
    required: !!row.required,
    createdAt: row.created_at
  };
}

/**
 * Maps a database gate run row to a GateRun domain type.
 *
 * Gate runs record the execution history of gates, including
 * pass/fail status, output, and duration.
 *
 * @param row - The database row from the gate_runs table
 * @returns A GateRun domain object
 */
export function mapRowToGateRun(row: GateRunRow): GateRun {
  return {
    id: row.id,
    gateId: row.gate_id,
    taskId: row.task_id,
    agentId: row.agent_id,
    passed: !!row.passed,
    output: row.output ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    createdAt: row.created_at
  };
}

/**
 * Maps a database agent row to an Agent domain type.
 *
 * Parses JSON-encoded capabilities and metadata, and converts
 * the status string to the AgentStatus type.
 *
 * @param row - The database row from the agents table
 * @returns An Agent domain object
 *
 * @example
 * ```typescript
 * const agent = mapRowToAgent(row);
 * console.log(agent.capabilities); // ['code', 'test', 'review']
 * console.log(agent.status);       // 'active'
 * ```
 */
export function mapRowToAgent(row: AgentRow): Agent {
  return {
    agentId: row.agent_id,
    capabilities: JSON.parse(row.capabilities_json),
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    lastHeartbeat: row.last_heartbeat,
    registeredAt: row.registered_at,
    status: row.status as AgentStatus
  };
}

/**
 * Maps a database webhook row to a Webhook domain type.
 *
 * Parses JSON-encoded events and headers arrays, and converts
 * the enabled field from INTEGER to boolean.
 *
 * @param row - The database row from the webhooks table
 * @returns A Webhook domain object
 *
 * @example
 * ```typescript
 * const webhook = mapRowToWebhook(row);
 * console.log(webhook.events); // ['task.created', 'task.completed']
 * console.log(webhook.enabled); // true
 * ```
 */
export function mapRowToWebhook(row: WebhookRow): Webhook {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    events: JSON.parse(row.events_json) as WebhookEventType[],
    headers: row.headers_json ? JSON.parse(row.headers_json) : undefined,
    secret: row.secret ?? undefined,
    enabled: !!row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined
  };
}

/**
 * Maps a database webhook delivery row to a WebhookDelivery domain type.
 *
 * Tracks the result of webhook delivery attempts including HTTP status,
 * response body, and timing information.
 *
 * @param row - The database row from the webhook_deliveries table
 * @returns A WebhookDelivery domain object
 */
export function mapRowToWebhookDelivery(row: WebhookDeliveryRow): WebhookDelivery {
  return {
    id: row.id,
    webhookId: row.webhook_id,
    eventType: row.event_type as WebhookEventType,
    payload: JSON.parse(row.payload_json),
    statusCode: row.status_code ?? undefined,
    response: row.response ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    success: !!row.success,
    createdAt: row.created_at
  };
}

/**
 * Maps a database task template row to a TaskTemplate domain type.
 *
 * Task templates define reusable patterns for creating tasks with
 * predefined settings, labels, gates, and checklists.
 *
 * @param row - The database row from the task_templates table
 * @returns A TaskTemplate domain object
 *
 * @example
 * ```typescript
 * const template = mapRowToTaskTemplate(row);
 * console.log(template.titlePattern); // 'Fix: {{issue}}'
 * console.log(template.gates);        // [{ gateType: 'test', command: 'npm test', triggerStatus: 'review' }]
 * ```
 */
export function mapRowToTaskTemplate(row: TaskTemplateRow): TaskTemplate {
  return {
    id: row.id,
    name: row.name,
    titlePattern: row.title_pattern,
    descriptionTemplate: row.description_template ?? undefined,
    defaultStatus: row.default_status as TaskStatus,
    defaultPriority: row.default_priority as TaskPriority,
    defaultLabels: JSON.parse(row.default_labels_json),
    defaultStoryPoints: row.default_story_points ?? undefined,
    gates: row.gates_json ? JSON.parse(row.gates_json) : undefined,
    checklist: row.checklist_json ? JSON.parse(row.checklist_json) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined
  };
}
